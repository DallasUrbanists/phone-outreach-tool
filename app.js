// Storage Key
const STORAGE_KEY = 'sms_outreach_tool_state';
const EXPAND_TOOLTIP_SESSION_KEY = 'sms_outreach_expand_tooltip_shown';

// Core State Variables
let rawCsvLines = [];
let rawCsvHeader = [];
let rawCsvRows = [];
let contactMap = new Map(); // Key: normalized phone, Value: { first_name, last_name, email, phone, rawPhone, sent: bool, ignored: bool }
let selectedContacts = new Set(); // Key: normalized phone
let currentStep = 1;
let showUnsentOnly = false;
let isExpanded = false;
let isPlainListMode = false;
let isTooltipDismissListenerActive = false;
let fileName = '';
let fileSize = '';

// Default Message Template
const DEFAULT_MESSAGE_TEMPLATE = `Hi {first_name}! Just letting you know about our event tomorrow!`;
let messageTemplate = DEFAULT_MESSAGE_TEMPLATE;

// Initialize textarea with default template
document.getElementById('message-template-input').value = messageTemplate;

// Manual Contacts Input Event Listeners
const manualInputEl = document.getElementById('manual-contacts-input');
if (manualInputEl) {
    manualInputEl.addEventListener('paste', handleManualInputPaste);
}

// File Input Event Listener
document.getElementById('csv-file-input').addEventListener('change', handleFileSelect);

// Drop Zone Drag & Drop Event Listeners
const dropZoneEl = document.getElementById('drop-zone');
if (dropZoneEl) {
    dropZoneEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZoneEl.classList.add('border-primary');
    });
    ['dragleave', 'dragend'].forEach(type => {
        dropZoneEl.addEventListener(type, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZoneEl.classList.remove('border-primary');
        });
    });
    dropZoneEl.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZoneEl.classList.remove('border-primary');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processUploadedFile(e.dataTransfer.files[0]);
        }
    });
}

// Scroll tracking elements
const mainContentEl = document.getElementById('main-content');
const contactsScrollEl = document.getElementById('contacts-scroll-container');

if (mainContentEl) {
    mainContentEl.addEventListener('scroll', saveScrollPositions, { passive: true });
}
if (contactsScrollEl) {
    contactsScrollEl.addEventListener('scroll', saveScrollPositions, { passive: true });
}
window.addEventListener('beforeunload', saveStateToLocalStorage);

// --- Local Storage Management ---

function saveScrollPositions() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const state = JSON.parse(raw);
        state.scrollTopMain = mainContentEl ? mainContentEl.scrollTop : 0;
        state.scrollTopContacts = contactsScrollEl ? contactsScrollEl.scrollTop : 0;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
}

function saveStateToLocalStorage() {
    try {
        const manualInput = document.getElementById('manual-contacts-input')?.value || '';
        if (rawCsvLines.length === 0 && contactMap.size === 0 && currentStep === 1 && !fileName && !manualInput) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        const state = {
            currentStep,
            rawCsvLines,
            rawCsvHeader,
            rawCsvRows,
            fileName,
            fileSize,
            manualContactsInput: manualInput,
            isPlainListMode,
            inputFormatMode: document.getElementById('mode-plain-phone-list')?.checked ? 'plain-phone-list' : 'row-per-contact',
            headerRowChecked: document.getElementById('header-row-checkbox')?.checked,
            mapFirstName: document.getElementById('map-first-name')?.value,
            mapLastName: document.getElementById('map-last-name')?.value,
            mapPhone: document.getElementById('map-phone')?.value,
            mapEmail: document.getElementById('map-email')?.value,
            messageTemplate: document.getElementById('message-template-input')?.value,
            contactMap: Array.from(contactMap.entries()),
            selectedContacts: Array.from(selectedContacts),
            searchQuery: document.getElementById('contact-search')?.value,
            showUnsentOnly,
            isExpanded: isExpanded && currentStep === 4,
            scrollTopMain: mainContentEl ? mainContentEl.scrollTop : 0,
            scrollTopContacts: contactsScrollEl ? contactsScrollEl.scrollTop : 0
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Error saving state to localStorage', e);
    }
}

function loadStateFromLocalStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        document.getElementById('message-template-input').value = DEFAULT_MESSAGE_TEMPLATE;
        return;
    }

    try {
        const state = JSON.parse(raw);
        rawCsvLines = state.rawCsvLines || [];
        rawCsvHeader = state.rawCsvHeader || [];
        rawCsvRows = state.rawCsvRows || [];
        fileName = state.fileName || '';
        fileSize = state.fileSize || '';
        currentStep = state.currentStep || 1;
        showUnsentOnly = !!state.showUnsentOnly;

        if (state.manualContactsInput) {
            const manualInputEl = document.getElementById('manual-contacts-input');
            if (manualInputEl) manualInputEl.value = state.manualContactsInput;
        }

        isPlainListMode = !!state.isPlainListMode;
        if (state.inputFormatMode === 'plain-phone-list') {
            const plainRadio = document.getElementById('mode-plain-phone-list');
            if (plainRadio) plainRadio.checked = true;
        } else {
            const rowRadio = document.getElementById('mode-row-per-contact');
            if (rowRadio) rowRadio.checked = true;
        }
        handleInputModeChange();
        updateStep1NextButton();

        if (fileName) {
            document.getElementById('file-name-display').textContent = fileName;
            document.getElementById('file-size-display').textContent = fileSize;
            const step1Actions = document.getElementById('step-1-actions');
            if (step1Actions) step1Actions.classList.remove('d-none');
        }

        document.getElementById('header-row-checkbox').checked = state.headerRowChecked ?? true;

        if (rawCsvLines.length > 0) {
            populateColumnDropdowns();
            if (state.mapFirstName !== undefined) document.getElementById('map-first-name').value = state.mapFirstName;
            if (state.mapLastName !== undefined) document.getElementById('map-last-name').value = state.mapLastName;
            if (state.mapPhone !== undefined) document.getElementById('map-phone').value = state.mapPhone;
            if (state.mapEmail !== undefined) document.getElementById('map-email').value = state.mapEmail;
            validateStep2();
        }

        messageTemplate = state.messageTemplate || DEFAULT_MESSAGE_TEMPLATE;
        document.getElementById('message-template-input').value = messageTemplate;

        if (Array.isArray(state.contactMap)) {
            contactMap = new Map(state.contactMap);
        }
        if (Array.isArray(state.selectedContacts)) {
            selectedContacts = new Set(state.selectedContacts);
        }

        document.getElementById('contact-search').value = state.searchQuery || '';

        const filterBtn = document.getElementById('btn-filter-sent');
        filterBtn.textContent = showUnsentOnly ? 'Unsent' : 'All';
        filterBtn.className = showUnsentOnly ? 'btn btn-sm btn-success' : 'btn btn-sm btn-outline-secondary';

        goToStep(currentStep);

        isExpanded = (currentStep === 4) && !!state.isExpanded;
        updateExpandState();

        // Restore scroll positions after render
        requestAnimationFrame(() => {
            if (mainContentEl && state.scrollTopMain) {
                mainContentEl.scrollTop = state.scrollTopMain;
            }
            if (contactsScrollEl && state.scrollTopContacts) {
                contactsScrollEl.scrollTop = state.scrollTopContacts;
            }
        });
    } catch (e) {
        console.error('Error loading state from localStorage', e);
    }
}

function startOver() {
    const confirmed = confirm('Are you sure you want to start over? This will delete all records from your device.');
    if (!confirmed) return;

    localStorage.removeItem(STORAGE_KEY);
    dismissExpandTooltip();

    rawCsvLines = [];
    rawCsvHeader = [];
    rawCsvRows = [];
    contactMap.clear();
    selectedContacts.clear();
    showUnsentOnly = false;
    isExpanded = false;
    isPlainListMode = false;
    fileName = '';
    fileSize = '';
    updateExpandState();

    document.getElementById('csv-file-input').value = '';
    document.getElementById('file-name-display').textContent = 'Select a CSV or Excel contact list from your phone or device to generate custom SMS links.';
    document.getElementById('file-size-display').textContent = '';
    const step1Actions = document.getElementById('step-1-actions');
    if (step1Actions) step1Actions.classList.add('d-none');
    const manualInputEl = document.getElementById('manual-contacts-input');
    if (manualInputEl) manualInputEl.value = '';
    const rowRadio = document.getElementById('mode-row-per-contact');
    if (rowRadio) rowRadio.checked = true;
    handleInputModeChange();
    updateStep1NextButton();

    document.getElementById('detected-column-count').textContent = '0';
    document.getElementById('header-row-checkbox').checked = false;
    document.getElementById('map-first-name').innerHTML = '<option value="">-- First / Full Name --</option>';
    document.getElementById('map-last-name').innerHTML = '<option value="">-- Last Name (Optional) --</option>';
    document.getElementById('map-phone').innerHTML = '<option value="">-- Select Phone Column --</option>';
    document.getElementById('map-email').innerHTML = '<option value="">-- Select Email Column --</option>';
    document.getElementById('btn-process-contacts').disabled = true;

    messageTemplate = DEFAULT_MESSAGE_TEMPLATE;
    document.getElementById('message-template-input').value = DEFAULT_MESSAGE_TEMPLATE;
    document.getElementById('contact-search').value = '';

    const varTagsContainer = document.getElementById('variable-tags-container');
    if (varTagsContainer) varTagsContainer.classList.remove('d-none');

    const filterBtn = document.getElementById('btn-filter-sent');
    filterBtn.textContent = 'All';
    filterBtn.className = 'btn btn-sm btn-outline-secondary';

    goToStep(1);
    showToast('All stored records and settings have been cleared.');
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    processUploadedFile(file);
}

function processUploadedFile(file) {
    fileName = file.name;
    fileSize = `${(file.size / 1024).toFixed(1)} KB`;

    document.getElementById('file-name-display').textContent = fileName;
    document.getElementById('file-size-display').textContent = fileSize;

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    if (isExcel) {
        const reader = new FileReader();
        reader.onload = function (evt) {
            try {
                if (typeof XLSX === 'undefined') {
                    throw new Error('XLSX parser library not loaded');
                }
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                if (!firstSheetName) {
                    throw new Error('Workbook contains no sheets');
                }
                const worksheet = workbook.Sheets[firstSheetName];
                const csvContent = XLSX.utils.sheet_to_csv(worksheet);

                const manualInputEl = document.getElementById('manual-contacts-input');
                if (manualInputEl) {
                    manualInputEl.value = csvContent;
                }
                updateStep1NextButton();
                parseCSVContent(csvContent);
            } catch (err) {
                console.error('Error parsing Excel file:', err);
                alert('Failed to parse Excel file. Please ensure it is a valid spreadsheet.');
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        const reader = new FileReader();
        reader.onload = function (evt) {
            const content = evt.target.result || '';
            const manualInputEl = document.getElementById('manual-contacts-input');
            if (manualInputEl) {
                manualInputEl.value = content;
            }
            updateStep1NextButton();
            parseCSVContent(content);
        };
        reader.readAsText(file);
    }
}

function handleManualInputPaste(e) {
    const isRowPerContact = document.getElementById('mode-row-per-contact')?.checked;
    const pastedData = (e.clipboardData || window.clipboardData)?.getData('text');

    // Check if tabs are present and acting as column delimiters in row-per-contact mode
    if (isRowPerContact && pastedData && pastedData.includes('\t')) {
        e.preventDefault();

        // Convert tab-delimited text to valid CSV
        const convertedData = convertTabsToCsv(pastedData);

        const textarea = e.target;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentVal = textarea.value;

        textarea.value = currentVal.substring(0, start) + convertedData + currentVal.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + convertedData.length;

        updateStep1NextButton();
    }

    // Scroll window and container to bottom upon pasting
    setTimeout(() => {
        window.scrollTo({
            top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
            behavior: 'smooth'
        });
        if (mainContentEl) {
            mainContentEl.scrollTo({
                top: mainContentEl.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, 0);
}

function convertTabsToCsv(text) {
    const lines = text.split(/\r\n|\r|\n/);
    return lines.map(line => {
        if (!line.includes('\t')) return line;
        const cells = line.split('\t');
        return cells.map(cell => {
            let val = cell.trim();
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                val = `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(',');
    }).join('\n');
}

function handleInputModeChange() {
    const isPlain = document.getElementById('mode-plain-phone-list')?.checked;
    const btnText = document.getElementById('btn-step-1-next-text');
    if (btnText) {
        btnText.textContent = isPlain ? 'Continue to message template' : 'Continue to column mapping';
    }
    saveStateToLocalStorage();
}

function updateStep1NextButton() {
    const text = (document.getElementById('manual-contacts-input')?.value || '').trim();
    const step1Actions = document.getElementById('step-1-actions');
    if (step1Actions) {
        if (text.length > 0 || fileName) {
            step1Actions.classList.remove('d-none');
        } else {
            step1Actions.classList.add('d-none');
        }
    }
    saveStateToLocalStorage();
}

function resetStep1Inputs() {
    const confirmed = confirm('Are you sure you want to reset?');
    if (!confirmed) return;

    fileName = '';
    fileSize = '';
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) fileInput.value = '';

    const nameDisplay = document.getElementById('file-name-display');
    if (nameDisplay) {
        nameDisplay.textContent = 'Select a CSV or Excel contact list from your phone or device to generate custom SMS links.';
    }

    const sizeDisplay = document.getElementById('file-size-display');
    if (sizeDisplay) sizeDisplay.textContent = '';

    const manualInputEl = document.getElementById('manual-contacts-input');
    if (manualInputEl) manualInputEl.value = '';

    rawCsvLines = [];
    rawCsvHeader = [];
    rawCsvRows = [];

    const rowRadio = document.getElementById('mode-row-per-contact');
    if (rowRadio) rowRadio.checked = true;
    handleInputModeChange();

    updateStep1NextButton();
    saveStateToLocalStorage();
}

function handleStep1Continue() {
    const text = (document.getElementById('manual-contacts-input')?.value || '').trim();
    if (!text) {
        alert('Please upload a file or enter a contact list.');
        return;
    }

    const isPlain = document.getElementById('mode-plain-phone-list')?.checked;
    if (isPlain) {
        isPlainListMode = true;
        processPlainPhoneList(text);
    } else {
        isPlainListMode = false;
        parseCSVContent(text);
    }
}

function processPlainPhoneList(text) {
    contactMap.clear();
    selectedContacts.clear();

    // Split using any potential delimiter (comma, semicolon, pipe, tab, newline)
    const tokens = text.split(/[\r\n,;|\t]+/);
    tokens.forEach(token => {
        const raw = token.trim();
        if (!raw) return;
        const normalized = normalizePhone(raw);
        if (normalized && !contactMap.has(normalized)) {
            contactMap.set(normalized, {
                phone: normalized,
                rawPhone: raw,
                first_name: '',
                last_name: '',
                email: '',
                sent: false,
                ignored: false
            });
        }
    });

    if (contactMap.size === 0) {
        alert('No valid phone numbers found in the input.');
        return;
    }

    isPlainListMode = true;
    goToStep(3);
}

function handleStep3Back() {
    if (isPlainListMode) {
        goToStep(1);
    } else {
        goToStep(2);
    }
}

// Custom Robust CSV Parser (Handles quotes, commas, newlines)
function parseCSVContent(text) {
    const lines = [];
    let row = [];
    let inQuotes = false;
    let currentToken = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentToken += '"';
                i++; // skip escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(currentToken.trim());
            currentToken = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
            row.push(currentToken.trim());
            if (row.some(cell => cell !== '')) {
                lines.push(row);
            }
            row = [];
            currentToken = '';
        } else {
            currentToken += char;
        }
    }
    if (currentToken || row.length > 0) {
        row.push(currentToken.trim());
        if (row.some(cell => cell !== '')) {
            lines.push(row);
        }
    }

    if (lines.length === 0) {
        alert('The selected CSV file appears to be empty.');
        const nextBtn = document.getElementById('btn-step-1-next');
        nextBtn.classList.add('d-none');
        return;
    }

    rawCsvLines = lines;

    // Detect header clues
    const headerKeywords = /(phone|mobile|cell|tel|number|num|name|first|last|surname|email|mail|e-mail|address|city|state|zip|neighborhood|affiliation|notes|date|rsvp)/i;
    const firstRow = lines[0] || [];
    let headerCluesFound = firstRow.some(cell => headerKeywords.test(cell.trim()));

    // If not found in keywords, check if second row exists and has numeric phone or @ email where first row is text
    if (!headerCluesFound && lines.length > 1) {
        const secondRow = lines[1] || [];
        const hasPhoneInRow2 = secondRow.some(c => c.replace(/\D/g, '').length >= 10);
        const hasEmailInRow2 = secondRow.some(c => c.includes('@') && c.includes('.'));
        if (hasPhoneInRow2 || hasEmailInRow2) {
            headerCluesFound = true;
        }
    }

    const headerCheckbox = document.getElementById('header-row-checkbox');
    headerCheckbox.checked = headerCluesFound;

    // Populate dropdowns and auto-map
    populateColumnDropdowns();

    // Make Step 1 next button visible
    const nextBtn = document.getElementById('btn-step-1-next');
    nextBtn.classList.remove('d-none');

    // Automatically advance to Step 2
    goToStep(2);
}

function handleHeaderRowToggle() {
    if (rawCsvLines.length > 0) {
        populateColumnDropdowns();
        saveStateToLocalStorage();
    }
}

function goToStep(step) {
    currentStep = step;

    if (step !== 4) {
        dismissExpandTooltip();
        if (isExpanded) {
            isExpanded = false;
            updateExpandState();
        }
    }

    // Hide all steps
    for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`step-${i}`);
        if (stepEl) {
            stepEl.classList.toggle('d-none', i !== step);
        }
    }

    // Update Header UI & Pills
    const subtitles = {
        1: 'Step 1: Upload CSV or Excel Data',
        2: 'Step 2: Map Columns',
        3: 'Step 3: Message Template',
        4: 'Step 4: Outreach List'
    };

    for (let i = 1; i <= 4; i++) {
        const pill = document.getElementById(`pill-${i}`);
        if (pill) {
            if (i <= step) {
                pill.className = 'badge rounded-pill bg-success text-white step-pill';
            } else {
                pill.className = 'badge rounded-pill bg-secondary text-white-50 step-pill';
            }
        }
    }

    // Trigger step-specific setup
    if (step === 3) {
        const varTagsContainer = document.getElementById('variable-tags-container');
        if (varTagsContainer) {
            varTagsContainer.classList.toggle('d-none', isPlainListMode);
        }
        updateTemplatePreview();
    } else if (step === 4) {
        renderContactsList();
        showExpandTooltipIfNeeded();
    }

    saveStateToLocalStorage();
}

function showExpandTooltipIfNeeded() {
    if (sessionStorage.getItem(EXPAND_TOOLTIP_SESSION_KEY)) return;
    if (isExpanded) return;

    const tooltip = document.getElementById('expand-tooltip');
    if (!tooltip) return;

    sessionStorage.setItem(EXPAND_TOOLTIP_SESSION_KEY, 'true');
    tooltip.classList.remove('d-none');

    setTimeout(() => {
        if (!isTooltipDismissListenerActive && tooltip && !tooltip.classList.contains('d-none')) {
            isTooltipDismissListenerActive = true;
            document.addEventListener('pointerdown', handleTooltipDismiss, { capture: true });
            document.addEventListener('click', handleTooltipDismiss, { capture: true });
            if (contactsScrollEl) {
                contactsScrollEl.addEventListener('scroll', handleTooltipDismiss, { passive: true });
            }
            if (mainContentEl) {
                mainContentEl.addEventListener('scroll', handleTooltipDismiss, { passive: true });
            }
            window.addEventListener('scroll', handleTooltipDismiss, { passive: true });
        }
    }, 50);
}

function handleTooltipDismiss() {
    dismissExpandTooltip();
}

function dismissExpandTooltip() {
    const tooltip = document.getElementById('expand-tooltip');
    if (tooltip) {
        tooltip.classList.add('d-none');
    }
    if (isTooltipDismissListenerActive) {
        isTooltipDismissListenerActive = false;
        document.removeEventListener('pointerdown', handleTooltipDismiss, { capture: true });
        document.removeEventListener('click', handleTooltipDismiss, { capture: true });
        if (contactsScrollEl) {
            contactsScrollEl.removeEventListener('scroll', handleTooltipDismiss);
        }
        if (mainContentEl) {
            mainContentEl.removeEventListener('scroll', handleTooltipDismiss);
        }
        window.removeEventListener('scroll', handleTooltipDismiss);
    }
}

function toggleExpandContactList() {
    dismissExpandTooltip();
    isExpanded = !isExpanded;
    updateExpandState();
    saveStateToLocalStorage();
}

function updateExpandState() {
    document.body.classList.toggle('contacts-expanded', isExpanded);
    const expandBtn = document.getElementById('btn-toggle-expand');
    if (!expandBtn) return;

    if (isExpanded) {
        expandBtn.innerHTML = '<i class="bi bi-fullscreen-exit"></i>';
        expandBtn.title = 'Collapse list';
        expandBtn.setAttribute('aria-label', 'Collapse contact list');
    } else {
        expandBtn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
        expandBtn.title = 'Expand list';
        expandBtn.setAttribute('aria-label', 'Expand contact list');
    }
}

function populateColumnDropdowns() {
    if (rawCsvLines.length === 0) return;

    const isHeader = document.getElementById('header-row-checkbox').checked;

    rawCsvHeader = rawCsvLines[0].map((col, idx) => col.trim() || `Column ${idx + 1}`);
    rawCsvRows = isHeader ? rawCsvLines.slice(1) : rawCsvLines;

    document.getElementById('detected-column-count').textContent = rawCsvHeader.length;

    const fnSelect = document.getElementById('map-first-name');
    const lnSelect = document.getElementById('map-last-name');
    const phoneSelect = document.getElementById('map-phone');
    const emailSelect = document.getElementById('map-email');

    // Reset options
    fnSelect.innerHTML = '<option value="">-- First / Full Name --</option>';
    lnSelect.innerHTML = '<option value="">-- Last Name (Optional) --</option>';
    phoneSelect.innerHTML = '<option value="">-- Select Phone Column --</option>';
    emailSelect.innerHTML = '<option value="">-- Select Email Column --</option>';

    rawCsvHeader.forEach((colName, idx) => {
        const opt = `<option value="${idx}">${escapeHtml(colName)}</option>`;
        fnSelect.innerHTML += opt;
        lnSelect.innerHTML += opt;
        phoneSelect.innerHTML += opt;
        emailSelect.innerHTML += opt;
    });

    // Smart Auto-detection
    const sampleRows = rawCsvRows.slice(0, 15);

    // 1. Detect Phone Column (if found exactly one likely match)
    const likelyPhoneIndices = [];
    rawCsvHeader.forEach((colName, idx) => {
        const lower = colName.toLowerCase();
        const headerMatch = /phone|mobile|cell|tel|number/i.test(lower);
        const dataMatch = sampleRows.some(row => {
            const digits = (row[idx] || '').replace(/\D/g, '');
            return digits.length >= 10;
        });
        if (headerMatch || (dataMatch && !/zip|postal|date|id|age|year/i.test(lower))) {
            likelyPhoneIndices.push(idx);
        }
    });
    if (likelyPhoneIndices.length === 1) {
        phoneSelect.value = likelyPhoneIndices[0];
    } else if (likelyPhoneIndices.length > 1) {
        // Check if one explicitly has 'phone' or 'mobile' in header
        const strictPhone = likelyPhoneIndices.filter(idx => /phone|mobile|cell/i.test(rawCsvHeader[idx].toLowerCase()));
        if (strictPhone.length === 1) {
            phoneSelect.value = strictPhone[0];
        }
    }

    // 2. Detect Email Column (if found exactly one likely match)
    const likelyEmailIndices = [];
    rawCsvHeader.forEach((colName, idx) => {
        const lower = colName.toLowerCase();
        const headerMatch = /email|mail|e-mail/i.test(lower);
        const dataMatch = sampleRows.some(row => {
            const val = (row[idx] || '').trim();
            return val.includes('@') && val.includes('.');
        });
        if (headerMatch || dataMatch) {
            likelyEmailIndices.push(idx);
        }
    });
    if (likelyEmailIndices.length === 1) {
        emailSelect.value = likelyEmailIndices[0];
    }

    // 3. Detect Name Columns
    // Check for explicit Last Name
    const explicitLastNameIndices = [];
    rawCsvHeader.forEach((colName, idx) => {
        const lower = colName.toLowerCase();
        if (/last(\s*name)?|surname/i.test(lower)) {
            explicitLastNameIndices.push(idx);
        }
    });
    if (explicitLastNameIndices.length === 1) {
        lnSelect.value = explicitLastNameIndices[0];
    }

    // Check for First Name / Full Name
    const explicitFirstNameIndices = [];
    const potentialNameIndices = [];
    rawCsvHeader.forEach((colName, idx) => {
        const lower = colName.toLowerCase();
        if (/^(first(\s*name)?|full(\s*name)?)$/i.test(lower) || /first\s*name|full\s*name/i.test(lower)) {
            explicitFirstNameIndices.push(idx);
        } else if (/name|contact|person|attendee/i.test(lower) && !/last|surname/i.test(lower)) {
            potentialNameIndices.push(idx);
        }
    });

    if (explicitFirstNameIndices.length === 1) {
        fnSelect.value = explicitFirstNameIndices[0];
    } else if (explicitFirstNameIndices.length === 0 && potentialNameIndices.length === 1) {
        fnSelect.value = potentialNameIndices[0];
    }

    validateStep2();
}

function validateStep2() {
    const phoneIdx = document.getElementById('map-phone').value;
    const processBtn = document.getElementById('btn-process-contacts');
    processBtn.disabled = phoneIdx === "";
    saveStateToLocalStorage();
}

function processAndNormalizeData() {
    const fnIdx = document.getElementById('map-first-name').value;
    const lnIdx = document.getElementById('map-last-name').value;
    const phoneIdx = document.getElementById('map-phone').value;
    const emailIdx = document.getElementById('map-email').value;

    if (phoneIdx === "") {
        alert("Please select the column for Phone Number.");
        return;
    }

    contactMap.clear();
    selectedContacts.clear();

    rawCsvRows.forEach(row => {
        const rawPhone = row[phoneIdx] || '';
        const normalizedPhone = normalizePhone(rawPhone);

        if (!normalizedPhone) return;

        // Normalize name
        let firstName = '';
        let lastName = '';

        if (fnIdx !== "") {
            const rawFn = row[fnIdx] || '';
            if (lnIdx !== "" && lnIdx !== fnIdx) {
                firstName = rawFn.trim();
                lastName = (row[lnIdx] || '').trim();
            } else {
                // Split full name if combined
                const nameParts = rawFn.trim().split(/\s+/);
                firstName = nameParts[0] || '';
                lastName = nameParts.slice(1).join(' ') || '';
            }
        }

        // Normalize email
        const rawEmail = emailIdx !== "" ? (row[emailIdx] || '') : '';
        const normalizedEmail = normalizeEmail(rawEmail);

        if (`${firstName ?? ''}${lastName ?? ''}`.trim() === '') {
            if (normalizedEmail !== '') {
                firstName = normalizedEmail;
            } else {
                firstName = 'Neighbor';
            }
        }

        if (!contactMap.has(normalizedPhone)) {
            contactMap.set(normalizedPhone, {
                phone: normalizedPhone,
                rawPhone: rawPhone,
                first_name: firstName,
                last_name: lastName,
                email: normalizedEmail,
                sent: false,
                ignored: false
            });
        }
    });

    if (contactMap.size === 0) {
        alert("No valid phone numbers found in the selected column.");
        return;
    }

    isPlainListMode = false;
    goToStep(3);
}

function normalizePhone(phoneStr) {
    if (!phoneStr) return '';
    const digits = phoneStr.replace(/\D/g, '');
    if (digits.length < 10) return '';
    if (digits.length === 10) {
        return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
        return `+${digits}`;
    }
    return `+${digits}`;
}

function normalizeEmail(emailStr) {
    if (!emailStr) return '';
    return emailStr.trim().toLowerCase();
}

// STEP 3: Message Template Helpers
function insertTemplateVariable(tag) {
    const textarea = document.getElementById('message-template-input');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;

    textarea.value = currentVal.substring(0, start) + tag + currentVal.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + tag.length;

    updateTemplatePreview();
}

function updateTemplatePreview() {
    const textarea = document.getElementById('message-template-input');
    messageTemplate = textarea.value;

    // Get sample contact
    let sampleContact = isPlainListMode
        ? { first_name: '', last_name: '', email: '', phone: '+12145550123' }
        : { first_name: 'Alex', last_name: 'Morgan', email: 'alex@example.com', phone: '+12145550123' };
    for (const contact of contactMap.values()) {
        if (!contact.ignored) {
            sampleContact = contact;
            break;
        }
    }

    const previewText = formatMessageForContact(messageTemplate, sampleContact);
    document.getElementById('template-preview-text').textContent = previewText || '(Empty message)';
    saveStateToLocalStorage();
}

function formatMessageForContact(template, contact) {
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    let msg = template;
    msg = msg.replace(/\{first_name\}/g, contact.first_name || 'neighbor');
    msg = msg.replace(/\{last_name\}/g, contact.last_name || '');
    msg = msg.replace(/\{full_name\}/g, fullName || 'neighbor');
    msg = msg.replace(/\{email\}/g, contact.email || '');
    return msg;
}

// STEP 4: Render Outreach List & Interactions
function renderContactsList() {
    const listContainer = document.getElementById('contacts-list');
    listContainer.innerHTML = '';

    let totalCount = 0;
    let sentCount = 0;
    let ignoredCount = 0;
    let visibleCount = 0;
    let selectedVisibleCount = 0;

    const searchQuery = (document.getElementById('contact-search').value || '').toLowerCase();

    contactMap.forEach((contact, phoneKey) => {
        if (contact.ignored) {
            ignoredCount++;
            return;
        }

        totalCount++;
        if (contact.sent) sentCount++;

        // Filter logic
        if (showUnsentOnly && contact.sent) return;

        const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        if (searchQuery) {
            const matchName = fullName.toLowerCase().includes(searchQuery);
            const matchPhone = contact.phone.includes(searchQuery);
            if (!matchName && !matchPhone) return;
        }

        const showPhoneAsName = fullName === 'Neighbor' || fullName === '';

        visibleCount++;
        const isSelected = selectedContacts.has(phoneKey);
        if (isSelected) selectedVisibleCount++;

        // Format SMS URI with custom template
        const messageText = formatMessageForContact(messageTemplate, contact);
        const smsUri = `sms:${contact.phone}?body=${encodeURIComponent(messageText)}`;

        // Create wrapper for swipe interaction
        const wrapper = document.createElement('div');
        wrapper.className = 'contact-row-wrapper list-group-item p-0 border-0 border-bottom';
        wrapper.dataset.phone = phoneKey;

        wrapper.innerHTML = `
                    <div class="swipe-bg swipe-bg--left">
                        <span>Ignore &times;</span>
                    </div>
                    <div class="swipe-bg swipe-bg--right">
                        <span>Toggle Sent &check;</span>
                    </div>
                    <div class="contact-item d-flex align-items-center justify-content-between p-2 bg-white ${contact.sent ? 'bg-success-subtle bg-opacity-25' : ''} ${isSelected ? 'bg-primary-subtle bg-opacity-25' : ''}">
                        <div class="form-check mb-0 d-flex align-items-center">
                            <input type="checkbox" class="form-check-input contact-checkbox mt-0" ${isSelected ? 'checked' : ''} 
                                   onchange="toggleContactSelection('${phoneKey}', event)">
                        </div>
                        <div class="flex-grow-1 min-w-0 pe-2 text-truncate">
                            <div class="d-flex align-items-center gap-2">
                                <span class="fw-bold text-dark small text-truncate contact-name">${!showPhoneAsName ? escapeHtml(fullName) : escapeHtml(contact.phone)}</span>
                                ${contact.sent ? `<span class="badge bg-success-subtle text-success border border-success-subtle py-0 px-1" style="font-size: 0.65rem;">Sent</span>` : ''}
                            </div>
                            ${!showPhoneAsName ? `<div class="text-secondary font-monospace small" style="font-size: 0.75rem;">${escapeHtml(contact.phone)}</div>` : ``}
                            ${contact.email && contact.email !== fullName ? `<div class="text-muted small text-truncate" style="font-size: 0.7rem;">${escapeHtml(contact.email)}</div>` : ''}
                        </div>
                        <a href="${smsUri}" 
                           onclick="markAsSent('${phoneKey}')" 
                           class="btn btn-sm ${contact.sent ? 'btn-success text-white' : 'btn-outline-primary'} d-inline-flex align-items-center gap-1 flex-shrink-0">
                           ${contact.sent
                ? `<i class="bi bi-check-lg"></i><span>Sent</span>`
                : `<i class="bi bi-chat-dots-fill"></i><span>Text</span>`
            }
                        </a>
                    </div>
                `;

        // Attach swipe gesture listeners
        attachSwipeListeners(wrapper.querySelector('.contact-item'), phoneKey, fullName || contact.phone);

        listContainer.appendChild(wrapper);
    });

    // Update Progress Bar & Text
    document.getElementById('progress-text').textContent = `${sentCount} / ${totalCount} Contacted`;
    const percentage = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;
    document.getElementById('progress-bar').style.width = `${percentage}%`;

    // Update Restore Ignored Button
    const restoreBtn = document.getElementById('btn-restore-ignored');
    document.getElementById('ignored-count-display').textContent = ignoredCount;
    restoreBtn.classList.toggle('d-none', ignoredCount === 0);

    // Update Copy Selected Button
    const copyBtn = document.getElementById('btn-copy-selected');
    const selectedCount = getSelectedValidContacts().length;
    document.getElementById('selected-count-display').textContent = selectedCount;
    copyBtn.classList.toggle('d-none', selectedCount === 0);

    // Update Select All Icon State
    const selectAllBtn = document.getElementById('btn-toggle-select-all');
    if (visibleCount > 0 && selectedVisibleCount === visibleCount) {
        selectAllBtn.className = 'btn btn-sm btn-success text-white d-flex align-items-center justify-content-center';
    } else {
        selectAllBtn.className = 'btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center';
    }

    saveStateToLocalStorage();
}

// Swipe Interaction Implementation
function attachSwipeListeners(itemEl, phoneKey, fullName) {
    let startX = 0;
    let startY = 0;
    let isSwiping = false;
    let isHorizontalSwipe = false;

    function onPointerDown(e) {
        // Don't initiate swipe if clicking checkbox, link or button
        if (e.target.closest('input, a, button')) return;
        startX = e.clientX;
        startY = e.clientY;
        isSwiping = true;
        isHorizontalSwipe = false;
        itemEl.style.transition = 'none';
        try {
            itemEl.setPointerCapture(e.pointerId);
        } catch (_) {}
    }

    function onPointerMove(e) {
        if (!isSwiping) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        if (!isHorizontalSwipe) {
            if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
                isHorizontalSwipe = true;
            } else if (Math.abs(deltaY) > 8) {
                isSwiping = false;
                return;
            }
        }

        if (isHorizontalSwipe) {
            if (e.cancelable) e.preventDefault();
            const clampedDeltaX = Math.max(-140, Math.min(140, deltaX));
            itemEl.style.transform = `translateX(${clampedDeltaX}px)`;
        }
    }

    function onPointerEnd(e) {
        if (!isSwiping) return;
        const deltaX = e.clientX - startX;
        isSwiping = false;

        if (!isHorizontalSwipe) return;

        const threshold = 70;
        itemEl.style.transition = 'transform 200ms ease';

        if (deltaX < -threshold) {
            // SWIPE LEFT: Ignore contact
            itemEl.style.transform = 'translateX(-100%)';
            setTimeout(() => {
                ignoreContact(phoneKey, fullName);
            }, 150);
        } else if (deltaX > threshold) {
            // SWIPE RIGHT: Toggle sent status without opening SMS
            itemEl.style.transform = 'translateX(0px)';
            toggleSentStatus(phoneKey);
        } else {
            itemEl.style.transform = 'translateX(0px)';
        }
    }

    itemEl.addEventListener('pointerdown', onPointerDown);
    itemEl.addEventListener('pointermove', onPointerMove);
    itemEl.addEventListener('pointerup', onPointerEnd);
    itemEl.addEventListener('pointercancel', onPointerEnd);
}

function ignoreContact(phoneKey, fullName) {
    if (contactMap.has(phoneKey)) {
        const record = contactMap.get(phoneKey);
        record.ignored = true;
        selectedContacts.delete(phoneKey);

        renderContactsList();

        showToast(`${fullName} ignored`, 'Undo', () => {
            record.ignored = false;
            renderContactsList();
        });
    }
}

function toggleSentStatus(phoneKey) {
    if (contactMap.has(phoneKey)) {
        const record = contactMap.get(phoneKey);
        record.sent = !record.sent;
        renderContactsList();
    }
}

function restoreIgnoredContacts() {
    contactMap.forEach(record => {
        record.ignored = false;
    });
    renderContactsList();
    showToast('Restored all ignored contacts');
}

// Selection & Email Copying
function toggleContactSelection(phoneKey, e) {
    if (e) e.stopPropagation();
    if (selectedContacts.has(phoneKey)) {
        selectedContacts.delete(phoneKey);
    } else {
        selectedContacts.add(phoneKey);
    }
    renderContactsList();
}

function toggleSelectAllContacts() {
    const visibleContacts = [];
    const searchQuery = (document.getElementById('contact-search').value || '').toLowerCase();

    contactMap.forEach((contact, phoneKey) => {
        if (contact.ignored) return;
        if (showUnsentOnly && contact.sent) return;
        const fullName = `${contact.first_name} ${contact.last_name}`.trim();
        if (searchQuery) {
            const matchName = fullName.toLowerCase().includes(searchQuery);
            const matchPhone = contact.phone.includes(searchQuery);
            if (!matchName && !matchPhone) return;
        }
        visibleContacts.push(phoneKey);
    });

    if (visibleContacts.length === 0) return;

    const allSelected = visibleContacts.every(k => selectedContacts.has(k));
    if (allSelected) {
        visibleContacts.forEach(k => selectedContacts.delete(k));
    } else {
        visibleContacts.forEach(k => selectedContacts.add(k));
    }
    renderContactsList();
}

function getSelectedValidContacts() {
    const list = [];
    selectedContacts.forEach(phoneKey => {
        if (contactMap.has(phoneKey)) {
            const contact = contactMap.get(phoneKey);
            if (!contact.ignored) {
                list.push(contact);
            }
        }
    });
    return list;
}

function copySelectedEmails() {
    const selected = getSelectedValidContacts();
    if (selected.length === 0) return;

    // Format: Full Name <email@domain.com>
    const formattedStrings = selected.map(c => {
        const fullName = `${c.first_name} ${c.last_name}`.trim();
        const email = c.email || '';
        if (email) {
            return `${fullName} <${email}>`;
        }
        return fullName;
    });

    const textToCopy = formattedStrings.join(', ');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast(`Copied ${selected.length} email${selected.length === 1 ? '' : 's'} to clipboard`);
        }).catch(() => {
            fallbackCopyText(textToCopy, selected.length);
        });
    } else {
        fallbackCopyText(textToCopy, selected.length);
    }
}

function fallbackCopyText(text, count) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showToast(`Copied ${count} email${count === 1 ? '' : 's'} to clipboard`);
    } catch (err) {
        alert(`Selected contacts: ${text}`);
    }
    document.body.removeChild(textarea);
}

// Toast Notification System
function showToast(message, actionLabel, actionCallback, duration = 4000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast align-items-center text-bg-dark border-0 shadow-lg show mb-2';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');

    toast.innerHTML = `
        <div class="d-flex align-items-center justify-content-between p-2">
            <div class="toast-body py-1 px-2 small flex-grow-1 text-white">
                ${escapeHtml(message)}
                ${actionLabel ? `<button type="button" class="btn btn-sm btn-link text-warning p-0 ms-2 text-decoration-none fw-bold toast-action">${escapeHtml(actionLabel)}</button>` : ''}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto toast-dismiss" aria-label="Close"></button>
        </div>
    `;

    let timeoutId = null;

    function dismissToast() {
        if (timeoutId) clearTimeout(timeoutId);
        toast.classList.remove('show');
        toast.classList.add('fade');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 150);
    }

    toast.querySelector('.toast-dismiss').addEventListener('click', dismissToast);

    if (actionLabel && actionCallback) {
        toast.querySelector('.toast-action').addEventListener('click', () => {
            actionCallback();
            dismissToast();
        });
    }

    container.appendChild(toast);

    if (duration > 0) {
        timeoutId = setTimeout(dismissToast, duration);
    }
}

function markAsSent(phoneKey) {
    if (contactMap.has(phoneKey)) {
        const record = contactMap.get(phoneKey);
        record.sent = true;
        setTimeout(() => {
            renderContactsList();
        }, 300);
    }
}

function filterContacts() {
    renderContactsList();
}

function toggleFilterSent() {
    showUnsentOnly = !showUnsentOnly;
    const btn = document.getElementById('btn-filter-sent');
    btn.textContent = showUnsentOnly ? 'Unsent' : 'All';
    if (showUnsentOnly) {
        btn.className = 'btn btn-sm btn-success';
    } else {
        btn.className = 'btn btn-sm btn-outline-secondary';
    }
    renderContactsList();
}

function resetProgress() {
    if (confirm("Reset all sent checkmarks back to uncontacted status?")) {
        contactMap.forEach((val) => {
            val.sent = false;
        });
        renderContactsList();
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Initialize state on page load
loadStateFromLocalStorage();