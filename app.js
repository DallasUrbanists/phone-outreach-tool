// Core State Variables
let rawCsvLines = [];
let rawCsvHeader = [];
let rawCsvRows = [];
let contactMap = new Map(); // Key: normalized phone, Value: { first_name, last_name, email, phone, rawPhone, sent: bool, ignored: bool }
let selectedContacts = new Set(); // Key: normalized phone
let currentStep = 1;
let showUnsentOnly = false;

// Default Message Template
let messageTemplate = `Hi {first_name}! Tonight the Uptown/Oak Lawn Hyperlocal Conversation will meet at Mike's Chicken at 6:30pm, *not Whole Foods*. Call/text this number for help finding us. RSVP: https://www.meetup.com/dallasurbanists/events/316375035/`;

// Initialize textarea with default template
document.getElementById('message-template-input').value = messageTemplate;

// File Input Event Listener
document.getElementById('csv-file-input').addEventListener('change', handleFileSelect);

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('file-name-display').textContent = file.name;
    document.getElementById('file-size-display').textContent = `${(file.size / 1024).toFixed(1)} KB`;

    const reader = new FileReader();
    reader.onload = function (evt) {
        parseCSVContent(evt.target.result);
    };
    reader.readAsText(file);
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
}

function handleHeaderRowToggle() {
    if (rawCsvLines.length > 0) {
        populateColumnDropdowns();
    }
}

function goToStep(step) {
    currentStep = step;

    // Hide all steps
    for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`step-${i}`);
        if (stepEl) {
            stepEl.classList.toggle('d-none', i !== step);
        }
    }

    // Update Header UI & Pills
    const subtitles = {
        1: 'Step 1: Upload CSV Data',
        2: 'Step 2: Map Columns',
        3: 'Step 3: Message Template',
        4: 'Step 4: Outreach List'
    };
    document.getElementById('step-subtitle').textContent = subtitles[step] || '';

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
        updateTemplatePreview();
    } else if (step === 4) {
        renderContactsList();
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

        if (!firstName) firstName = 'Friend';

        // Normalize email
        const rawEmail = emailIdx !== "" ? (row[emailIdx] || '') : '';
        const normalizedEmail = normalizeEmail(rawEmail);

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
    let sampleContact = { first_name: 'Alex', last_name: 'Morgan', email: 'alex@example.com', phone: '+12145550123' };
    for (const contact of contactMap.values()) {
        if (!contact.ignored) {
            sampleContact = contact;
            break;
        }
    }

    const previewText = formatMessageForContact(messageTemplate, sampleContact);
    document.getElementById('template-preview-text').textContent = previewText || '(Empty message)';
}

function formatMessageForContact(template, contact) {
    const fullName = `${contact.first_name} ${contact.last_name}`.trim();
    let msg = template;
    msg = msg.replace(/\{first_name\}/g, contact.first_name || 'Friend');
    msg = msg.replace(/\{last_name\}/g, contact.last_name || '');
    msg = msg.replace(/\{full_name\}/g, fullName || 'Friend');
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

        const fullName = `${contact.first_name} ${contact.last_name}`.trim();
        if (searchQuery) {
            const matchName = fullName.toLowerCase().includes(searchQuery);
            const matchPhone = contact.phone.includes(searchQuery);
            if (!matchName && !matchPhone) return;
        }

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
                    <div class="contact-item d-flex align-items-center justify-content-between p-2 px-3 bg-white ${contact.sent ? 'bg-success-subtle bg-opacity-25' : ''} ${isSelected ? 'bg-primary-subtle bg-opacity-25' : ''}">
                        <div class="form-check me-2 mb-0 d-flex align-items-center">
                            <input type="checkbox" class="form-check-input contact-checkbox mt-0" ${isSelected ? 'checked' : ''} 
                                   onchange="toggleContactSelection('${phoneKey}', event)">
                        </div>
                        <div class="flex-grow-1 min-w-0 pe-2 text-truncate">
                            <div class="d-flex align-items-center gap-2">
                                <span class="fw-bold text-dark small text-truncate contact-name">${escapeHtml(fullName)}</span>
                                ${contact.sent ? `<span class="badge bg-success-subtle text-success border border-success-subtle py-0 px-1" style="font-size: 0.65rem;">Sent</span>` : ''}
                            </div>
                            <div class="text-secondary font-monospace small" style="font-size: 0.75rem;">${escapeHtml(contact.phone)}</div>
                            ${contact.email ? `<div class="text-muted small text-truncate" style="font-size: 0.7rem;">${escapeHtml(contact.email)}</div>` : ''}
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
        attachSwipeListeners(wrapper.querySelector('.contact-item'), phoneKey, fullName);

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