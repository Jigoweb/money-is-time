// popup.js

const MONTHLY_WEEKS = 52 / 12;

document.addEventListener('DOMContentLoaded', () => {
    const languageSelect = document.getElementById('language');
    const currencySelect = document.getElementById('currency');
    const incomeTypeSelect = document.getElementById('incomeType');
    const hourlyIncomeInput = document.getElementById('hourlyIncome');
    const otherIncomeInput = document.getElementById('otherIncome');
    const workingHoursInput = document.getElementById('workingHours');
    const saveBtn = document.getElementById('saveBtn');
    const messageDiv = document.getElementById('message');
    const calculatedIncomeDiv = document.getElementById('calculatedIncomeDiv');
    const calculatedIncomeSpan = document.getElementById('calculatedIncome');
    const extensionToggle = document.getElementById('extensionToggle');

    const hourlyIncomeDiv = document.getElementById('hourlyIncomeDiv');
    const otherIncomeDiv = document.getElementById('otherIncomeDiv');

    const localizedContent = {
        en: {
            setHourlyIncome: 'Set your hourly income',
            incomeType: 'Income type:',
            hourlyIncomeLabel: 'Hourly income',
            incomeLabel: 'Income',
            workingHoursLabel: 'Weekly working hours',
            calculatedHourlyIncome: 'Calculated hourly income:',
            save: 'Save',
            saving: 'Saving...',
            savedSuccess: 'Hourly income saved successfully!',
            savedError: 'An error occurred. Please try again.',
            settings: 'Settings',
            selectLanguage: 'Select language:',
            selectCurrency: 'Select currency:',
            placeholders: {
                hourlyIncome: 'E.g., 15.50',
                income: 'Enter your income',
                workingHours: 'Weekly working hours (e.g., 40)',
            },
            incomeTypes: {
                hourly: 'Hourly',
                weekly: 'Weekly',
                monthly: 'Monthly',
                annual: 'Annual',
            },
            messages: {
                invalidValues: 'Please enter valid values.',
            },
            enableExtension: 'Enable Extension:',
        },
        it: {
            setHourlyIncome: 'Imposta il tuo reddito orario',
            incomeType: 'Tipo di reddito:',
            hourlyIncomeLabel: 'Reddito orario',
            incomeLabel: 'Reddito',
            workingHoursLabel: 'Ore lavorative settimanali',
            calculatedHourlyIncome: 'Reddito orario calcolato:',
            save: 'Salva',
            saving: 'Salvataggio...',
            savedSuccess: 'Reddito orario salvato con successo!',
            savedError: 'Si è verificato un errore. Riprova.',
            settings: 'Impostazioni',
            selectLanguage: 'Seleziona la lingua:',
            selectCurrency: 'Seleziona la valuta:',
            placeholders: {
                hourlyIncome: 'Es: 15.50',
                income: 'Inserisci il tuo reddito',
                workingHours: 'Ore lavorative settimanali (es. 40)',
            },
            incomeTypes: {
                hourly: 'Orario',
                weekly: 'Settimanale',
                monthly: 'Mensile',
                annual: 'Annuale',
            },
            messages: {
                invalidValues: 'Per favore, inserisci valori validi.',
            },
            enableExtension: 'Attiva Estensione:',
        },
    };

    function updateLocalizedContent() {
        const selectedLanguage = languageSelect.value;
        const content = localizedContent[selectedLanguage];

        document.getElementById('title').textContent = content.setHourlyIncome;
        document.getElementById('incomeTypeLabel').textContent = content.incomeType;
        document.getElementById('hourlyIncomeLabel').textContent = `${content.hourlyIncomeLabel} (${currencySelect.value}):`;
        document.getElementById('otherIncomeLabel').textContent = `${content.incomeLabel} (${currencySelect.value}):`;
        document.getElementById('workingHoursLabel').textContent = content.workingHoursLabel + ':';
        document.getElementById('calculatedIncomeLabel').textContent = `${content.calculatedHourlyIncome} `;
        saveBtn.textContent = content.save;
        document.getElementById('settingsTitle').textContent = content.settings;
        document.getElementById('languageLabel').textContent = content.selectLanguage;
        document.getElementById('currencyLabel').textContent = content.selectCurrency;
        document.getElementById('extensionToggleLabel').textContent = content.enableExtension;

        hourlyIncomeInput.placeholder = content.placeholders.hourlyIncome;
        otherIncomeInput.placeholder = content.placeholders.income;
        workingHoursInput.placeholder = content.placeholders.workingHours;

        incomeTypeSelect.options[0].textContent = content.incomeTypes.hourly;
        incomeTypeSelect.options[1].textContent = content.incomeTypes.weekly;
        incomeTypeSelect.options[2].textContent = content.incomeTypes.monthly;
        incomeTypeSelect.options[3].textContent = content.incomeTypes.annual;

        calculatedIncomeSpan.nextSibling.textContent = ` ${currencySelect.value}/h`;

        if (messageDiv.className.includes('success')) {
            messageDiv.textContent = content.savedSuccess;
        } else if (messageDiv.className.includes('error')) {
            messageDiv.textContent = content.savedError;
        }
    }

    function calculateHourlyIncomeFromOther(otherIncome, workingHours, incomeType) {
        if (incomeType === 'weekly') {
            return otherIncome / workingHours;
        }

        if (incomeType === 'monthly') {
            return otherIncome / (workingHours * MONTHLY_WEEKS);
        }

        if (incomeType === 'annual') {
            return otherIncome / (workingHours * 52);
        }

        return 0;
    }

    chrome.storage.sync.get(['preferredLanguage', 'preferredCurrency', 'extensionEnabled'], (result) => {
        if (result.preferredLanguage) {
            languageSelect.value = result.preferredLanguage;
        }
        if (result.preferredCurrency) {
            currencySelect.value = result.preferredCurrency;
        }
        extensionToggle.checked = result.extensionEnabled !== false;
        updateLocalizedContent();
    });

    languageSelect.addEventListener('change', () => {
        chrome.storage.sync.set({ preferredLanguage: languageSelect.value }, () => {
            updateLocalizedContent();
        });
    });

    currencySelect.addEventListener('change', () => {
        chrome.storage.sync.set({ preferredCurrency: currencySelect.value }, () => {
            updateLocalizedContent();
        });
    });

    extensionToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ extensionEnabled: extensionToggle.checked });
    });

    function updateIncomeFields() {
        const incomeType = incomeTypeSelect.value;
        if (incomeType === 'hourly') {
            hourlyIncomeDiv.style.display = 'block';
            otherIncomeDiv.style.display = 'none';
            calculatedIncomeDiv.style.display = 'none';
            workingHoursInput.value = '';
            otherIncomeInput.value = '';
        } else {
            hourlyIncomeDiv.style.display = 'none';
            otherIncomeDiv.style.display = 'block';
            calculatedIncomeDiv.style.display = 'block';

            if (!workingHoursInput.value) {
                workingHoursInput.value = '40';
            }

            hourlyIncomeInput.value = '';
        }
        validateInputs();
    }

    chrome.storage.sync.get(['hourlyIncome', 'incomeType', 'otherIncome', 'workingHours'], (result) => {
        if (result.incomeType) {
            incomeTypeSelect.value = result.incomeType;
        }
        if (result.hourlyIncome) {
            hourlyIncomeInput.value = result.hourlyIncome;
            saveBtn.disabled = false;
        }
        if (result.otherIncome) {
            otherIncomeInput.value = result.otherIncome;
        }
        if (result.workingHours) {
            workingHoursInput.value = result.workingHours;
        }
        updateIncomeFields();
        calculateHourlyIncome();
    });

    incomeTypeSelect.addEventListener('change', () => {
        updateIncomeFields();
        chrome.storage.sync.set({ incomeType: incomeTypeSelect.value });
    });

    function validateInputs() {
        const incomeType = incomeTypeSelect.value;
        let isValid = false;

        if (incomeType === 'hourly') {
            isValid = parseFloat(hourlyIncomeInput.value) > 0;
        } else {
            isValid = parseFloat(otherIncomeInput.value) > 0 && parseFloat(workingHoursInput.value) > 0;
        }

        saveBtn.disabled = !isValid;
        messageDiv.textContent = '';

        if (isValid && incomeType !== 'hourly') {
            calculateHourlyIncome();
        } else {
            calculatedIncomeDiv.style.display = 'none';
        }
    }

    hourlyIncomeInput.addEventListener('input', validateInputs);
    otherIncomeInput.addEventListener('input', validateInputs);
    workingHoursInput.addEventListener('input', validateInputs);

    function calculateHourlyIncome() {
        const incomeType = incomeTypeSelect.value;
        const otherIncome = parseFloat(otherIncomeInput.value);
        const workingHours = parseFloat(workingHoursInput.value);

        if (otherIncome > 0 && workingHours > 0) {
            const hourlyIncome = parseFloat(
                calculateHourlyIncomeFromOther(otherIncome, workingHours, incomeType).toFixed(2)
            );
            calculatedIncomeSpan.textContent = hourlyIncome;
            calculatedIncomeSpan.nextSibling.textContent = ` ${currencySelect.value}/h`;
            calculatedIncomeDiv.style.display = 'block';
            hourlyIncomeInput.value = hourlyIncome;
        } else {
            calculatedIncomeDiv.style.display = 'none';
        }
    }

    saveBtn.addEventListener('click', () => {
        const selectedLanguage = languageSelect.value;
        const content = localizedContent[selectedLanguage];
        const incomeType = incomeTypeSelect.value;
        let hourlyIncome = 0;

        if (incomeType === 'hourly') {
            hourlyIncome = parseFloat(hourlyIncomeInput.value);
        } else {
            hourlyIncome = parseFloat(
                calculateHourlyIncomeFromOther(
                    parseFloat(otherIncomeInput.value),
                    parseFloat(workingHoursInput.value),
                    incomeType
                ).toFixed(2)
            );
            hourlyIncomeInput.value = hourlyIncome;
        }

        if (!hourlyIncome || Number.isNaN(hourlyIncome) || hourlyIncome <= 0) {
            messageDiv.textContent = content.messages.invalidValues;
            messageDiv.className = 'message error';
            return;
        }

        saveBtn.textContent = content.saving;
        saveBtn.disabled = true;

        chrome.storage.sync.set(
            {
                hourlyIncome,
                incomeType: incomeTypeSelect.value,
                otherIncome: otherIncomeInput.value,
                workingHours: workingHoursInput.value,
                preferredLanguage: selectedLanguage,
                preferredCurrency: currencySelect.value,
            },
            () => {
                if (chrome.runtime.lastError) {
                    messageDiv.textContent = content.savedError;
                    messageDiv.className = 'message error';
                } else {
                    messageDiv.textContent = content.savedSuccess;
                    messageDiv.className = 'message success';
                }
                saveBtn.textContent = content.save;
                saveBtn.disabled = false;
            }
        );
    });

    updateIncomeFields();
    updateLocalizedContent();
});
