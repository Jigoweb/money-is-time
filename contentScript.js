// contentScript.js

const BADGE_CLASS = 'money-is-time-badge';
const PROCESSED_ATTR = 'data-money-is-time-processed';
const MONTHLY_WEEKS = 52 / 12;
const OBSERVER_DEBOUNCE_MS = 200;

const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CHF: 'CHF',
  CAD: 'CAD',
  AUD: 'AUD',
  INR: '₹',
  BRL: 'R$',
  SEK: 'kr',
  NOK: 'kr',
  PLN: 'zł',
  CNY: '¥',
  KRW: '₩',
};

const PRICE_SELECTORS = [
  '.a-price .a-offscreen',
  '.a-price[data-a-color="price"] .a-offscreen',
  '#priceblock_ourprice',
  '#priceblock_dealprice',
  '.price-item--regular',
  '.price-item--sale',
  '.price__regular .price-item',
  '.price__sale .price-item',
  '[data-product-price]',
  '.product-price',
  '.woocommerce-Price-amount',
  '.price .amount',
  '[itemprop="price"]',
  '.x-price-primary',
  '.notranslate[data-testid="x-price-primary"]',
  '.sales-price',
  '.current-price',
  '.product__price',
  '.money',
];

const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'OBJECT',
  'CODE',
  'PRE',
  'INPUT',
  'TEXTAREA',
  'SVG',
]);

let hourlyIncome = null;
let localizedMessages = loadLocalizedMessages('en');
let userCurrency = 'EUR';
let extensionEnabled = true;
let priceRegex = null;
let observer = null;
let observerTimer = null;
let processedNodes = new WeakSet();
let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) {
    return;
  }

  const style = document.createElement('style');
  style.textContent = `
    .${BADGE_CLASS} {
      font-size: 0.85em;
      opacity: 0.85;
      white-space: nowrap;
    }
  `;
  document.documentElement.appendChild(style);
  stylesInjected = true;
}

function queryPriceElements(root = document) {
  const elements = new Set();

  PRICE_SELECTORS.forEach((selector) => {
    try {
      root.querySelectorAll(selector).forEach((element) => elements.add(element));
    } catch (_error) {
      // Ignore invalid selectors on some documents.
    }
  });

  root.querySelectorAll('*').forEach((element) => {
    if (element.shadowRoot) {
      queryPriceElements(element.shadowRoot).forEach((shadowElement) => elements.add(shadowElement));
    }
  });

  return elements;
}

function loadLocalizedMessages(language) {
  const messages = {
    en: {
      minutes: 'min',
      hours: 'h',
      and: 'and',
      ofWork: 'of work',
    },
    it: {
      minutes: 'min',
      hours: 'ore',
      and: 'e',
      ofWork: 'di lavoro',
    },
  };

  return messages[language] || messages.en;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCurrencyPattern() {
  const codes = Object.keys(CURRENCY_SYMBOLS);
  const symbols = Object.values(CURRENCY_SYMBOLS).map(escapeRegex);
  return `(?:${symbols.join('|')}|${codes.join('|')})`;
}

function buildPriceRegex() {
  const currencyPattern = buildCurrencyPattern();
  const numberPattern = '\\d+(?:[\\s.,]\\d+)*';
  return new RegExp(
    `(?:(${currencyPattern})\\s*(${numberPattern})|(${numberPattern})\\s*(${currencyPattern}))`,
    'gi'
  );
}

function normalizeCurrencyToken(token) {
  if (!token) {
    return null;
  }

  const trimmed = token.trim().toUpperCase();
  if (CURRENCY_SYMBOLS[trimmed]) {
    return trimmed;
  }

  const bySymbol = Object.entries(CURRENCY_SYMBOLS).find(
    ([, symbol]) => symbol.toUpperCase() === trimmed || symbol === token.trim()
  );

  return bySymbol ? bySymbol[0] : null;
}

function parsePrice(amount) {
  if (!amount) {
    return null;
  }

  let sanitizedAmount = amount.replace(/\s+/g, '').replace(/[^\d.,-]/g, '');

  let isNegative = false;
  if (sanitizedAmount.startsWith('-')) {
    isNegative = true;
    sanitizedAmount = sanitizedAmount.substring(1);
  }

  if (!sanitizedAmount) {
    return null;
  }

  const lastComma = sanitizedAmount.lastIndexOf(',');
  const lastDot = sanitizedAmount.lastIndexOf('.');
  let price = null;

  if (lastComma > -1 && lastDot > -1) {
    if (lastDot > lastComma) {
      sanitizedAmount = sanitizedAmount.replace(/,/g, '');
      price = parseFloat(sanitizedAmount);
    } else {
      sanitizedAmount = sanitizedAmount.replace(/\./g, '').replace(',', '.');
      price = parseFloat(sanitizedAmount);
    }
  } else if (lastDot > -1) {
    const parts = sanitizedAmount.split('.');
    if (parts[parts.length - 1].length === 3 && parts.length > 1) {
      sanitizedAmount = sanitizedAmount.replace(/\./g, '');
      price = parseFloat(sanitizedAmount);
    } else {
      price = parseFloat(sanitizedAmount);
    }
  } else if (lastComma > -1) {
    const parts = sanitizedAmount.split(',');
    if (parts[parts.length - 1].length === 3 && parts.length > 1) {
      sanitizedAmount = sanitizedAmount.replace(/,/g, '');
      price = parseFloat(sanitizedAmount);
    } else {
      price = parseFloat(sanitizedAmount.replace(',', '.'));
    }
  } else {
    price = parseFloat(sanitizedAmount);
  }

  if (Number.isNaN(price)) {
    return null;
  }

  return isNegative ? -price : price;
}

function convertPriceToWorkHours(price, income) {
  if (!income || income <= 0 || price <= 0) {
    return null;
  }

  return price / income;
}

function formatWorkTime(workHours, messages) {
  const totalMinutes = Math.round(workHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let timeString = '';

  if (hours > 0) {
    timeString += `${hours} ${messages.hours}`;
  }

  if (minutes > 0) {
    if (hours > 0) {
      timeString += ` ${messages.and} `;
    }
    timeString += `${minutes} ${messages.minutes}`;
  }

  if (!timeString) {
    timeString = `1 ${messages.minutes}`;
  }

  return `${timeString} ${messages.ofWork}`;
}

function stripAnnotation(text) {
  if (!text) {
    return '';
  }

  return text.replace(/\s+\([^)]*(?:of work|di lavoro)\)\s*$/, '').trim();
}

function textMightContainPrice(text) {
  if (!text || text.length > 500) {
    return false;
  }

  return /(?:USD|EUR|GBP|JPY|CHF|CAD|AUD|INR|BRL|SEK|NOK|PLN|CNY|KRW|\$|€|£|¥|₹|₩|zł|kr|R\$)/i.test(text);
}

function isCrossedOut(node) {
  let currentNode = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

  while (currentNode && currentNode !== document.body) {
    const style = window.getComputedStyle(currentNode);
    if (style.textDecorationLine.includes('line-through')) {
      return true;
    }
    currentNode = currentNode.parentElement;
  }

  return false;
}

function isNodeHidden(node) {
  let currentNode = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

  while (currentNode && currentNode !== document.body) {
    const style = window.getComputedStyle(currentNode);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return true;
    }
    currentNode = currentNode.parentElement;
  }

  return false;
}

function isEditableNode(node) {
  let currentNode = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

  while (currentNode && currentNode !== document.body) {
    if (
      currentNode.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(currentNode.tagName)
    ) {
      return true;
    }
    currentNode = currentNode.parentElement;
  }

  return false;
}

function shouldProcessPrice(currencyCode, price) {
  if (!currencyCode || price === null || price <= 0) {
    return false;
  }

  return currencyCode === userCurrency;
}

function convertMatchToWorkTime(match, currency1, amount1, amount2, currency2) {
  const currencyToken = currency1 || currency2;
  const amountToken = amount1 || amount2;
  const currencyCode = normalizeCurrencyToken(currencyToken);
  const price = parsePrice(amountToken);

  if (!shouldProcessPrice(currencyCode, price)) {
    return null;
  }

  const workHours = convertPriceToWorkHours(price, hourlyIncome);
  if (workHours === null) {
    return null;
  }

  return formatWorkTime(workHours, localizedMessages);
}

function replacePricesInText(text) {
  if (!textMightContainPrice(text)) {
    return text;
  }

  return text.replace(priceRegex, (match, currency1, amount1, amount2, currency2) => {
    const formattedTime = convertMatchToWorkTime(match, currency1, amount1, amount2, currency2);
    if (!formattedTime) {
      return match;
    }

    return `${match} (${formattedTime})`;
  });
}

function removeBadges(root = document.body) {
  root.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
  root.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((element) => {
    element.removeAttribute(PROCESSED_ATTR);
  });
}

function restoreOriginalText(element) {
  removeBadges(element);

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let node;

  while ((node = walker.nextNode())) {
    if (node.originalText) {
      node.nodeValue = node.originalText;
      delete node.originalText;
    } else {
      node.nodeValue = stripAnnotation(node.nodeValue);
    }
    processedNodes.delete(node);
  }
}

function upsertBadge(element, formattedTime) {
  let badge = element.querySelector(`:scope > .${BADGE_CLASS}`);

  if (!badge) {
    badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.setAttribute('aria-label', formattedTime);
    element.appendChild(badge);
  }

  badge.textContent = ` (${formattedTime})`;
  element.setAttribute(PROCESSED_ATTR, 'true');
}

function processPriceElement(element) {
  if (!extensionEnabled || !hourlyIncome) {
    return;
  }

  if (!element || EXCLUDED_TAGS.has(element.tagName) || element.closest(`.${BADGE_CLASS}`)) {
    return;
  }

  if (isEditableNode(element) || isCrossedOut(element) || isNodeHidden(element)) {
    return;
  }

  const sourceText =
    element.getAttribute('content') ||
    element.getAttribute('data-product-price') ||
    element.textContent;

  if (!textMightContainPrice(sourceText)) {
    return;
  }

  const plainText = stripAnnotation(sourceText.replace(/\s+/g, ' ').trim());
  priceRegex.lastIndex = 0;
  const regexMatch = priceRegex.exec(plainText);
  priceRegex.lastIndex = 0;

  if (!regexMatch) {
    return;
  }

  const [, currency1, amount1, amount2, currency2] = regexMatch;
  const formattedTime = convertMatchToWorkTime(
    regexMatch[0],
    currency1,
    amount1,
    amount2,
    currency2
  );

  if (!formattedTime) {
    return;
  }

  if (element.hasAttribute('content') || element.children.length === 0) {
    upsertBadge(element, formattedTime);
    return;
  }

  upsertBadge(element, formattedTime);
}

function processStructuredPrices() {
  document.querySelectorAll('[itemprop="price"]').forEach((element) => {
    processPriceElement(element);
  });

  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data];

      items.forEach((item) => {
        const offers = item.offers;
        const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];
        offerList.forEach((offer) => {
          if (!offer || !offer.price) {
            return;
          }

          const currencyCode = normalizeCurrencyToken(offer.priceCurrency || userCurrency);
          const price = parsePrice(String(offer.price));

          if (!shouldProcessPrice(currencyCode, price)) {
            return;
          }

          const formattedTime = formatWorkTime(
            convertPriceToWorkHours(price, hourlyIncome),
            localizedMessages
          );

          if (!formattedTime) {
            return;
          }

          const linkedPrice = document.querySelector('[itemprop="price"]');
          if (linkedPrice) {
            upsertBadge(linkedPrice, formattedTime);
          }
        });
      });
    } catch (_error) {
      // Ignore invalid JSON-LD blocks.
    }
  });
}

function processTextNode(node) {
  if (!extensionEnabled || !hourlyIncome) {
    return;
  }

  if (isEditableNode(node) || isCrossedOut(node) || isNodeHidden(node)) {
    return;
  }

  const currentValue = node.nodeValue;
  const strippedValue = stripAnnotation(currentValue);

  if (!textMightContainPrice(strippedValue)) {
    return;
  }

  if (processedNodes.has(node)) {
    if (node.originalText !== strippedValue) {
      node.originalText = strippedValue;
      processedNodes.delete(node);
    } else {
      return;
    }
  }

  if (!node.originalText) {
    node.originalText = strippedValue;
  } else if (stripAnnotation(node.originalText) !== strippedValue) {
    node.originalText = strippedValue;
  }

  const newText = replacePricesInText(node.originalText);

  if (newText !== currentValue) {
    node.nodeValue = newText;
    processedNodes.add(node);
  }
}

function processElement(element) {
  if (!extensionEnabled || !hourlyIncome || !element || element.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  if (EXCLUDED_TAGS.has(element.tagName) || element.isContentEditable) {
    return;
  }

  if (element.matches && PRICE_SELECTORS.some((selector) => element.matches(selector))) {
    processPriceElement(element);
  }

  element.querySelectorAll(PRICE_SELECTORS.join(',')).forEach(processPriceElement);

  if (!textMightContainPrice(element.textContent)) {
    return;
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(currentNode) {
      if (currentNode.parentElement && currentNode.parentElement.closest(`.${BADGE_CLASS}`)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    processTextNode(node);
  }
}

function processPage() {
  if (!extensionEnabled || !hourlyIncome) {
    return;
  }

  injectStyles();
  queryPriceElements().forEach(processPriceElement);
  processStructuredPrices();
  processElement(document.body);
}

function scheduleProcessPage() {
  clearTimeout(observerTimer);
  observerTimer = setTimeout(processPage, OBSERVER_DEBOUNCE_MS);
}

function observeDOMChanges() {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver((mutations) => {
    let shouldProcess = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        shouldProcess = true;
        break;
      }

      if (mutation.type === 'characterData') {
        shouldProcess = true;
        break;
      }
    }

    if (shouldProcess) {
      scheduleProcessPage();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function onStorageChange(changes, area) {
  if (area !== 'sync') {
    return;
  }

  let shouldReinitialize = false;

  if ('hourlyIncome' in changes) {
    hourlyIncome = changes.hourlyIncome.newValue > 0 ? changes.hourlyIncome.newValue : null;
    shouldReinitialize = true;
  }

  if ('preferredLanguage' in changes) {
    localizedMessages = loadLocalizedMessages(
      changes.preferredLanguage.newValue || navigator.language.slice(0, 2) || 'en'
    );
    shouldReinitialize = true;
  }

  if ('preferredCurrency' in changes) {
    userCurrency = changes.preferredCurrency.newValue || 'EUR';
    priceRegex = buildPriceRegex();
    shouldReinitialize = true;
  }

  if ('extensionEnabled' in changes) {
    extensionEnabled = changes.extensionEnabled.newValue !== false;
    shouldReinitialize = true;
  }

  if (!shouldReinitialize) {
    return;
  }

  processedNodes = new WeakSet();
  restoreOriginalText(document.body);

  if (extensionEnabled && hourlyIncome) {
    processPage();
  }
}

function initializeExtension() {
  injectStyles();
  chrome.storage.onChanged.addListener(onStorageChange);

  chrome.storage.sync.get(
    ['hourlyIncome', 'preferredLanguage', 'preferredCurrency', 'extensionEnabled'],
    (result) => {
      hourlyIncome = result.hourlyIncome > 0 ? result.hourlyIncome : null;
      const language = result.preferredLanguage || navigator.language.slice(0, 2) || 'en';
      userCurrency = result.preferredCurrency || 'EUR';
      extensionEnabled = result.extensionEnabled !== false;
      localizedMessages = loadLocalizedMessages(language);
      priceRegex = buildPriceRegex();
      processedNodes = new WeakSet();

      if (extensionEnabled && hourlyIncome) {
        processPage();
      }

      observeDOMChanges();
    }
  );
}

initializeExtension();
