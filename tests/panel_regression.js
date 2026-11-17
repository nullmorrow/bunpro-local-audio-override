// Synthetic sentence markup, real isolated IndexedDB and real recording/replay.
window.runPanelRegression = async () => {
    const api = window.__panelTest;
    const { state } = api;
    const checks = [];
    const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    async function until(predicate, label, timeout = 6000) {
        const end = performance.now() + timeout;
        while (!predicate()) {
            if (performance.now() > end) throw new Error('Timed out: ' + label + ': ' + state.refs.message.textContent);
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
    const context = new AudioContext();
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = .02;
    const destination = context.createMediaStreamDestination();
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async () => destination.stream;
    let nativeEvents = [];
    let extraEvents = [];
    let originalP;
    const nativeListener = event => {
        if (event.key === 'p') nativeEvents.push(event);
        if (event.key === 'p' && event !== originalP) extraEvents.push(event);
    };
    document.addEventListener('keydown', nativeListener);
    const key = (control, letter) => {
        const event = new KeyboardEvent('keydown', {key: letter, code: 'Key' + letter.toUpperCase(), bubbles: true, cancelable: true});
        if (letter === 'p') originalP = event;
        control.dispatchEvent(event);
        return event;
    };
    const pointerDown = control => {
        control.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
        control.focus();
    };
    const click = (control, detail) => control.dispatchEvent(new MouseEvent('click', {bubbles: true, detail}));
    try {
        await api.openAudioDb();
        api.ensureStateMatchesPage();
        if (state.lookupPromise) await state.lookupPromise;
        api.setRecordingEnabled(true);
        api.setUiLanguage('en');
        const refs = state.refs;
        for (const [control, label] of [[refs.languageSelect, 'Language select'], [refs.recordingToggle, 'Rec toggle']]) {
            if (control === refs.languageSelect) {
                control.value = 'ja';
                control.dispatchEvent(new Event('change', {bubbles: true}));
            }
            control.focus();
            nativeEvents = [];
            extraEvents = [];
            const p = key(control, 'p');
            await until(() => state.recordingSession && state.panelMessage?.key === 'recordingActive', label + ' recording');
            check(!p.defaultPrevented && nativeEvents.length === 1 && nativeEvents[0] === p && !extraEvents.length,
                label + ': original native P reaches the page exactly once while recording starts');
            check(refs.message.textContent === api.t('recordingActive'), label + ': recording status is shown');
            const started = context.currentTime;
            await until(() => context.currentTime >= started + .4, 'generated microphone samples');
            const o = key(control, 'o');
            await until(() => !state.recordingSession && state.recordingBlob?.size &&
                (state.recordingPlaybackSource || state.recordingPlaybackAudio), label + ' O replay');
            check(o.defaultPrevented, label + ': O finalizes and replays the real recording');
            api.cancelRecordedAudioPlayback();
        }
        refs.languageSelect.blur();
        key(document, 'p');
        await until(() => state.recordingSession, 'auto-stop take starts');
        await until(() => !state.recordingSession && state.panelMessage?.key === 'recordingStopped', 'auto-stop completes');
        check(state.recordingBlob?.size && refs.message.textContent === api.t('recordingStopped', state.panelMessage.vars),
            'Auto-stop shows ready status with actual recorded size');
        key(document, 'o');
        await until(() => state.recordingPlaybackSource || state.recordingPlaybackAudio, 'O after auto-stop starts replay');
        check(true, 'O after auto-stop replays the retained recording');
        api.cancelRecordedAudioPlayback();

        pointerDown(refs.micProcessingButton);
        click(refs.micProcessingButton, 1);
        check(!state.panel.contains(document.activeElement), 'Pointer button click returns focus to the page');
        refs.micProcessingButton.focus();
        click(refs.micProcessingButton, 0);
        check(document.activeElement === refs.micProcessingButton, 'Keyboard button activation keeps focus');
        pointerDown(refs.languageSelect);
        refs.languageSelect.value = 'es';
        refs.languageSelect.dispatchEvent(new Event('change', {bubbles: true}));
        check(!state.panel.contains(document.activeElement) && refs.languageSelect.value === 'es',
            'Pointer select change runs its handler then returns focus to the page');
        pointerDown(refs.languageSelect);
        refs.languageSelect.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
        refs.languageSelect.value = 'en';
        refs.languageSelect.dispatchEvent(new Event('change', {bubbles: true}));
        check(document.activeElement === refs.languageSelect, 'Keyboard select change clears stale pointer intent and keeps focus');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        state.panel.append(checkbox);
        let checkboxHandled = false;
        checkbox.addEventListener('change', () => { checkboxHandled = document.activeElement === checkbox; });
        pointerDown(checkbox);
        checkbox.dispatchEvent(new Event('change', {bubbles: true}));
        check(checkboxHandled && !state.panel.contains(document.activeElement), 'Pointer checkbox blurs after its own change handler');
        pointerDown(refs.fileInput);
        refs.fileInput.dispatchEvent(new Event('change', {bubbles: true}));
        check(!state.panel.contains(document.activeElement), 'Pointer file change returns focus to the page');
        const field = document.createElement('input');
        state.panel.append(field);
        field.focus();
        api.clearPanelMessage();
        key(field, 'p');
        key(field, 'o');
        check(!state.recordingSession && !state.recordingStartPending && !state.panelMessage,
            'Panel text input suspends both P and O');
        const excluded = ['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'];
        for (const type of excluded) { field.type = type; check(!api.isEditableTarget(field), 'Panel ' + type + ' input permits hotkeys'); }
        field.type = 'text';
        field.readOnly = true;
        check(!api.isEditableTarget(field), 'Read-only panel text input permits hotkeys');
        field.readOnly = false;
        field.disabled = true;
        check(!api.isEditableTarget(field), 'Disabled panel text input permits hotkeys');
        field.disabled = false;
        document.body.append(field);
        check(api.isEditableTarget(field), 'Outside text input retains the existing editable rule');
        field.type = 'checkbox';
        check(api.isEditableTarget(field), 'Outside checkbox retains the existing editable rule');
        field.remove();
        checkbox.remove();
        const textarea = document.createElement('textarea');
        const editable = document.createElement('div');
        editable.contentEditable = 'true';
        state.panel.append(textarea, editable);
        check(api.isEditableTarget(textarea) && api.isEditableTarget(editable), 'Panel textarea and contenteditable suspend hotkeys');
        textarea.remove();
        editable.remove();
        const speedMenu = document.createElement('div');
        speedMenu.id = 'bp-local-audio-speed-menu';
        const menuSelect = document.createElement('select');
        const menuText = document.createElement('input');
        speedMenu.append(menuSelect, menuText);
        document.body.append(speedMenu);
        check(!api.isEditableTarget(menuSelect) && api.isEditableTarget(menuText), 'Local speed menu permits selects but protects text entry');
        speedMenu.remove();
        const scrub = document.createElement('button');
        document.body.append(scrub);
        scrub.focus();
        pointerDown(scrub);
        click(scrub, 1);
        check(document.activeElement === scrub, 'Player controls outside the panel retain pointer focus');
        scrub.remove();

        for (const [messageKey, vars] of [['recordingStopped', {size: '12.3 KB'}],
            ['exportFailed', {error: 'DOMException fixture'}], ['noOverridesToExport', {}]]) {
            state.adminMode = messageKey === 'noOverridesToExport';
            api.setUiLanguage('en');
            api.setPanelMessage(messageKey, vars);
            for (const language of ['zh-CN', 'zh-TW', 'ja', 'es', 'id', 'fr']) {
                api.setUiLanguage(language);
                check(refs.message.textContent === api.t(messageKey, vars) &&
                    JSON.stringify(state.panelMessage.vars) === JSON.stringify(vars),
                    messageKey + ': ' + language + ' re-renders without changing parameters');
            }
            refs.languageSelect.value = 'en';
            refs.languageSelect.dispatchEvent(new Event('change', {bubbles: true}));
            check(refs.message.textContent === api.t(messageKey, vars), messageKey + ': select changes the visible message');
        }
        state.adminMode = false;
        api.clearPanelMessage();
        api.setLookupResult(state.normalizedSentence, {found: false, reason: 'mapped_file_missing'});
        api.setUiLanguage('ja');
        check(refs.status.textContent === api.t('mappingMissingFile') && refs.message.textContent === api.t('mappingMissingFile'),
            'Lookup error and fallback message re-render together');
        state.lookupError = {key: 'preloadFailed', vars: {error: 'Browser fixture error'}};
        refs.languageSelect.value = 'fr';
        refs.languageSelect.dispatchEvent(new Event('change', {bubbles: true}));
        check(refs.status.textContent === api.t('preloadFailed', {error: 'Browser fixture error'}) &&
            refs.status.title === refs.status.textContent, 'Lookup parameters and tooltip survive select language switch');
        api.setPanelMessage('saved', {}, {key: 'autoCompressionSummary', vars: {changed: 2, skipped: 1, failed: 0, saved: '3 KB'}});
        api.setUiLanguage('es');
        check(refs.message.textContent === api.t('saved') + ' ' + api.t('autoCompressionSummary', state.panelMessage.suffix.vars),
            'Combined save and compression message translates both parts');
        api.setPanelMessage('exportFailed', {error: api.translatedError('storageBlocked').translation});
        api.setUiLanguage('ja');
        check(refs.message.textContent === api.t('exportFailed', {error: api.t('storageBlocked')}),
            'Script-generated nested errors re-render in the new language');
        const nestedError = api.translatedError('storageUnavailable', {error: api.translatedError('storageBlocked').translation});
        check(nestedError.message === api.t('storageUnavailable', {error: api.t('storageBlocked')}),
            'Nested script errors also keep their initial Error.message readable');
        const message = state.panelMessage;
        api.setUiBusy(false);
        check(state.panelMessage === message, 'Leaving busy state preserves the stored message');
        return {checks};
    } finally {
        document.removeEventListener('keydown', nativeListener);
        navigator.mediaDevices.getUserMedia = originalGetUserMedia;
        await api.stopVoiceRecording({discard: true});
        api.cancelRecordedAudioPlayback();
        api.releaseRecordingResources();
        api.releaseLocalOverrideUi();
        destination.stream.getTracks().forEach(track => track.stop());
        oscillator.stop();
        await context.close();
        (await api.openAudioDb()).close();
        state.dbPromise = null;
    }
};

window.runPanelLayoutRegression = (width) => {
    const api = window.__panelTest;
    const { state } = api;
    const refs = state.refs;
    const checks = [];
    const measurements = [];
    const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    check(window.innerWidth === width, 'Actual viewport width is ' + width + ' px');
    let toolbar = document.querySelector('#js-tour-quiz-pam');
    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = 'js-tour-quiz-pam';
        toolbar.textContent = 'Synthetic native toolbar';
        toolbar.style.cssText = 'position:fixed;bottom:40px;left:20%;width:60%;height:40px';
        document.body.append(toolbar);
    }
    const fullName = 'long-reference-audio-file-name-'.repeat(8) + '.wav';
    const files = new DataTransfer();
    files.items.add(new File(['synthetic audio fixture'], fullName, {type: 'audio/wav'}));
    const chooseLabels = {
        en: 'Choose audio…', 'zh-CN': '选择音频…', 'zh-TW': '選擇音訊…',
        ja: '音声を選択…', es: 'Elegir audio…', id: 'Pilih audio…', fr: 'Choisir un audio…',
    };
    let fileClicks = 0;
    const observeFileClick = event => { fileClicks += 1; event.preventDefault(); };
    refs.fileInput.addEventListener('click', observeFileClick);
    try {
        state.adminMode = false;
        api.setUiBusy(false);
        refs.chooseAudioButton.dispatchEvent(new MouseEvent('click', {bubbles: true, detail: 1}));
        check(fileClicks === 1 && refs.fileInput.hidden, width + ': choose button opens the hidden input once');
        refs.fileInput.files = files.files;
        refs.fileInput.dispatchEvent(new Event('change', {bubbles: true}));
        check(state.selectedFile === refs.fileInput.files[0] && refs.fileName.textContent === fullName &&
            refs.fileName.title === fullName, width + ': hidden file change preserves selection, name and full tooltip');
        api.setUiBusy(true);
        check(refs.chooseAudioButton.disabled && refs.fileInput.disabled, width + ': busy state disables file selection');
        api.setUiBusy(false);
        state.sentence = 'Long synthetic sentence for the full tooltip. '.repeat(30);
        state.overrideFound = false;
        state.lookupStatus = 'ready';
        state.lookupError = {key: 'preloadFailed', vars: {error: 'long-browser-error-'.repeat(16)}};
        state.adminStats = {loading: false, error: null, count: 123, totalBytes: 1024};
        for (const [language, label] of Object.entries(chooseLabels)) {
            api.setUiLanguage(language);
            check(refs.chooseAudioButton.textContent === label, width + ': ' + language + ' choose-audio translation');
            check(refs.voicevoxButton.textContent === 'VOICEVOX' &&
                refs.voicevoxLoad.textContent === api.t('voicevoxLoad') &&
                state.panel.querySelector('[data-role="voicevox-url-label"]').textContent === api.t('voicevoxUrl'),
                width + ': ' + language + ' VOICEVOX controls translated');
            for (const adminMode of [false, true]) {
                const prefix = width + ': ' + language + ' ' + (adminMode ? 'admin' : 'main');
                state.adminMode = adminMode;
                // An explicit empty message suppresses the file/admin fallback.
                api.setPanelMessage(null, {error: ''});
                api.renderPanel();
                const emptyHeight = state.panel.getBoundingClientRect().height;
                check(!refs.message.textContent, prefix + ': reserved message line is empty');
                api.setPanelMessage('saved');
                api.renderPanel();
                const oneLineHeight = state.panel.getBoundingClientRect().height;
                check(Math.abs(emptyHeight - oneLineHeight) <= 1,
                    prefix + ': empty and one-line messages reserve the same height (' + emptyHeight + ', ' + oneLineHeight + ')');
                const vars = {error: 'Generated recording error with long details. '.repeat(8) + 'x'.repeat(180)};
                api.setPanelMessage('recordingStartFailed', vars);
                api.renderPanel();
                api.positionPanel();
                const panelRect = state.panel.getBoundingClientRect();
                const visible = [...state.panel.querySelectorAll('*')].filter(element =>
                    element.getClientRects().length && !element.matches('option, [data-role="sentence"], [data-role="file-name"]'));
                const overflow = visible.filter(element => element.scrollWidth > element.clientWidth + 1);
                check(!overflow.length, prefix + ': no truncated panel text: ' +
                    overflow.map(element => element.dataset.role || element.className).join(', '));
                const messageStyle = getComputedStyle(refs.message);
                check(refs.message.textContent === api.t('recordingStartFailed', vars) &&
                    refs.message.scrollHeight <= refs.message.clientHeight + 1 &&
                    messageStyle.whiteSpace === 'normal' && messageStyle.overflowWrap === 'anywhere' &&
                    messageStyle.textOverflow !== 'ellipsis' && refs.message.getAttribute('role') === 'status' &&
                    refs.message.getAttribute('aria-live') === 'polite', prefix + ': full wrapping live status is visible');
                check(panelRect.bottom <= toolbar.getBoundingClientRect().top + 1,
                    prefix + ': panel stays above native toolbar');
                if (!adminMode) {
                    const groups = [...refs.mainView.querySelectorAll('.bp-local-audio__control-group')];
                    check(groups.length === 4 && groups.every(group => {
                        const rect = group.getBoundingClientRect();
                        const children = [...group.children].filter(child => child.getClientRects().length);
                        return children.every(child => {
                            const childRect = child.getBoundingClientRect();
                            return childRect.left >= rect.left - 1 && childRect.right <= rect.right + 1;
                        }) && rect.height <= Math.max(...children.map(child => child.getBoundingClientRect().height)) + 1;
                    }), prefix + ': four action groups wrap intact');
                    const speed = api.detectPlaybackRate();
                    const speedText = api.t('speedCurrent', {rate: api.rateToPercent(speed.rate), source: api.t(speed.sourceKey)});
                    check(refs.fallbackControl.title === speedText && refs.fallbackLabel.title === speedText &&
                        refs.fallbackRate.title === speedText && !state.panel.querySelector('[data-role="speed"]'),
                        prefix + ': detected speed is carried by label and select tooltips');
                    check(refs.sentence.title === state.sentence && refs.fileName.title === fullName &&
                        getComputedStyle(refs.sentence).textOverflow === 'ellipsis' &&
                        getComputedStyle(refs.fileName).textOverflow === 'ellipsis', prefix + ': only sentence and file name use ellipses');
                }
                measurements.push({width, language, view: adminMode ? 'admin' : 'main', emptyHeight, oneLineHeight,
                    longMessageHeight: refs.message.getBoundingClientRect().height, panelHeight: panelRect.height,
                    toolbarGap: toolbar.getBoundingClientRect().top - panelRect.bottom});
            }
        }
        state.adminMode = false;
        refs.fileInput.value = '';
        refs.fileInput.dispatchEvent(new Event('change', {bubbles: true}));
        check(refs.fileName.hidden && !refs.fileName.textContent && !refs.fileName.title,
            width + ': no file name is shown when selection is cleared');
        return {checks, measurements};
    } finally {
        refs.fileInput.removeEventListener('click', observeFileClick);
    }
};
