chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') {
    return;
  }

  chrome.storage.sync.set(
    {
      hourlyIncome: 0,
      extensionEnabled: true,
      preferredCurrency: 'EUR',
      preferredLanguage: 'en',
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to set default settings:', chrome.runtime.lastError);
      }
    }
  );
});
