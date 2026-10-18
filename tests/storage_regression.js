// Injected into a new WebDriver profile, never a real BunPro tab or database.
window.runStorageRegression = async function () {
    const api = window.__storageTest;
    // Firefox WebDriver can give separate script injections distinct global objects.
    const { state, CONFIG, dbPut, dbGetAll, dbClear, sha256Hex, handleExport, JSON } = api;
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const checks = [];
    const check = (condition, message) => { assert(condition, message); checks.push(message); };
    const controls = () => ['exportButton', 'importButton', 'importReplaceButton', 'compressButton',
        'autoCompressInput', 'cleanButton', 'backButton'].map(key => state.refs[key]);
    function assertIdle() {
        assert(!state.adminBusy && controls().every(control => !control.disabled), 'Admin controls did not return to idle');
    }
    async function record(key, size, seed, { missingHash = false, compressed = false } = {}) {
        const bytes = new Uint8Array(size);
        for (let index = 0; index < size; index++) bytes[index] = (index * 31 + seed) % 256;
        const blob = new Blob([bytes], { type: compressed ? 'audio/webm;codecs=opus' : 'audio/wav' });
        const hash = await sha256Hex(blob);
        return { sentenceKey: key, sentence: key + ' 日本語 "quoted"\nline',
            fileName: key + (compressed ? '.webm' : '.wav'), mimeType: blob.type, blob,
            size: blob.size, updatedAt: '2026-01-02T03:04:05.000Z',
            ...(missingHash ? {} : { sha256: hash }),
            ...(compressed ? { compression: { version: 1, codec: 'opus', bitRate: 64000, sha256: hash } } : {}) };
    }
    async function seed(records) {
        await dbClear();
        for (const item of records) await dbPut(item);
    }
    async function expectedEntries() {
        const entries = [];
        for (const entry of await dbGetAll()) {
            const item = await api.serializeBackupEntry(entry);
            if (item) entries.push(item);
        }
        return entries;
    }
    async function verifyBackup(blob, longestString, label) {
        assert(blob instanceof Blob && blob.type === 'application/json;charset=utf-8', 'Expected a JSON Blob');
        const text = await blob.text();
        const payload = JSON.parse(text);
        const entries = await expectedEntries();
        const expected = JSON.stringify({
            format: CONFIG.BACKUP_FORMAT,
            formatVersion: CONFIG.BACKUP_FORMAT_VERSION,
            createdAt: payload.createdAt,
            scriptVersion: payload.scriptVersion,
            entryCount: entries.length,
            entries,
        });
        check(text === expected && payload.scriptVersion === CONFIG.SCRIPT_VERSION
            && Number.isFinite(Date.parse(payload.createdAt)), label + ': byte-identical v1 JSON in database order');
        const maxEntryLength = Math.max(...entries.map(item => JSON.stringify(item).length));
        check(longestString > 0 && longestString <= maxEntryLength && longestString < blob.size,
            label + ': JSON.stringify never produces a whole-library string');
        check(state.refs.message.textContent === api.t('exportComplete', {
            count: entries.length, size: api.formatBytes(blob.size),
        }), label + ': success message reports written count and Blob size');
        const restored = await api.parseBackupFile(new File([blob], 'round-trip.bpao', { type: blob.type }));
        assert(restored.length === entries.length, 'Round-trip count mismatch');
        for (let index = 0; index < entries.length; index++) {
            const before = entries[index];
            const after = restored[index];
            assert(after.sentenceKey === before.sentenceKey && after.sha256 === before.sha256
                && await sha256Hex(after.blob) === before.sha256, 'Round-trip key/audio mismatch');
            assert(JSON.stringify(after.compression) === JSON.stringify(before.compression), 'Round-trip compression marker mismatch');
        }
        check(true, label + ': import restores sentence keys, audio bytes and compression markers');
        assertIdle();
        return { text, entries, size: blob.size };
    }

    async function verifyConnections() {
        const db = await api.openAudioDb();
        await new Promise((resolve, reject) => {
            const request = api.indexedDB.deleteDatabase(CONFIG.DB_NAME);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        });
        check(state.dbPromise === null, 'Real deleteDatabase versionchange closes and invalidates the cached connection');
        await dbPut({ sentenceKey: 'after-delete', blob: new Blob(['reopened']) });
        const reopened = await api.openAudioDb();
        check(reopened !== db && (await api.dbGet('after-delete')).blob.size === 8,
            'dbPut/dbGet reopen a fresh database after deletion');

        // Explicit close does not emit the native close event. Simulate the browser's
        // unexpected-close notification after closing the real connection ourselves.
        reopened.close();
        reopened.dispatchEvent(new Event('close'));
        check(state.dbPromise === null, 'An unexpected-close event invalidates the cached connection');
        await dbPut({ sentenceKey: 'after-close', blob: new Blob(['close']) });
        const currentPromise = state.dbPromise;
        reopened.dispatchEvent(new Event('close'));
        check(state.dbPromise === currentPromise && (await api.dbGet('after-close')).blob.size === 5,
            'A stale close event preserves the newer connection and storage works');

        const prototype = api.IDBFactory.prototype;
        const originalOpen = prototype.open;
        const connections = [];
        let pending;
        function nativeOpen() {
            return new Promise((resolve, reject) => {
                const request = originalOpen.call(api.indexedDB, CONFIG.DB_NAME, CONFIG.DB_VERSION);
                request.onsuccess = () => {
                    connections.push(request.result);
                    resolve(request.result);
                };
                request.onerror = () => reject(request.error);
            });
        }
        async function closeCurrent() {
            const connection = await api.openAudioDb();
            connection.close();
            connection.dispatchEvent(new Event('close'));
        }
        await closeCurrent();
        try {
            prototype.open = function () {
                const request = {};
                queueMicrotask(async () => {
                    request.onblocked();
                    try {
                        request.result = await nativeOpen();
                        request.onsuccess();
                    } catch (error) {
                        request.error = error;
                        request.onerror();
                    }
                });
                return request;
            };
            const transient = api.openAudioDb();
            check(api.openAudioDb() === transient, 'Pending opens share the same cached promise');
            await transient;
            await dbPut({ sentenceKey: 'after-blocked', blob: new Blob(['transient']) });
            check((await api.dbGet('after-blocked')).blob.size === 9,
                'Stubbed blocked then real open success resolves and supports storage');
            await closeCurrent();

            prototype.open = function () {
                pending = {};
                queueMicrotask(() => {
                    pending.onblocked();
                    pending.onblocked();
                });
                return pending;
            };
            const started = performance.now();
            let error;
            try { await api.openAudioDb(); } catch (failure) { error = failure; }
            const elapsed = performance.now() - started;
            check(error?.message === api.t('storageBlocked') && elapsed >= CONFIG.DB_BLOCKED_TIMEOUT_MS - 5
                && elapsed < 3000 && state.dbPromise === null,
                'Unsettled blocked open rejects with storageBlocked after the injected 100 ms timeout and clears its cache');
            const timedOutRequest = pending;
            prototype.open = originalOpen;
            await dbPut({ sentenceKey: 'after-timeout', blob: new Blob(['retry']) });
            const replacement = state.dbPromise;
            const late = await nativeOpen();
            const originalClose = late.close;
            let lateCloses = 0;
            late.close = function () { lateCloses++; originalClose.call(this); };
            timedOutRequest.result = late;
            timedOutRequest.onsuccess();
            let lateIsClosed = false;
            try { late.transaction(CONFIG.DB_STORE_NAME); } catch (failure) {
                lateIsClosed = failure.name === 'InvalidStateError';
            }
            check(lateCloses === 1 && lateIsClosed && state.dbPromise === replacement
                && (await api.dbGet('after-timeout')).blob.size === 5,
                'Late success closes the stray real connection and preserves the successful retry');
            return elapsed;
        } finally {
            prototype.open = originalOpen;
            for (const connection of connections) connection.close();
            // Closing intentionally does not emit close; notify our cached owner.
            if (state.dbPromise) await closeCurrent();
        }
    }

    const pickerDescriptor = Object.getOwnPropertyDescriptor(window, 'showSaveFilePicker');
    const originalCreateUrl = URL.createObjectURL;
    const originalRevokeUrl = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    let downloads = [];
    function setPicker(picker) {
        Object.defineProperty(window, 'showSaveFilePicker', { value: picker, configurable: true, writable: true });
    }
    async function exportWithInstrumentation() {
        const originalStringify = JSON.stringify;
        let longestString = 0;
        JSON.stringify = function (...args) {
            const result = originalStringify.apply(this, args);
            if (typeof result === 'string') longestString = Math.max(longestString, result.length);
            return result;
        };
        try { await handleExport(); } finally { JSON.stringify = originalStringify; }
        return longestString;
    }
    function savingHandle({ failWrite = false, failClose = false, failAbort = false } = {}) {
        const capture = { operations: [], blobs: [], busyDuringWrite: false, pickerOptions: null };
        setPicker(async options => {
            capture.pickerOptions = options;
            return { createWritable: async () => {
                capture.operations.push('create');
                return {
                    write: async blob => {
                        capture.operations.push('write');
                        capture.blobs.push(blob);
                        capture.busyDuringWrite = state.adminBusy && controls().every(control => control.disabled);
                        if (failWrite) throw new Error('Simulated write failure');
                    },
                    close: async () => {
                        capture.operations.push('close');
                        if (failClose) throw new Error('Simulated close failure');
                    },
                    abort: async () => {
                        capture.operations.push('abort');
                        if (failAbort) throw new Error('Simulated abort failure');
                    },
                };
            } };
        });
        return capture;
    }

    api.setRecordingEnabled(false);
    api.setUiLanguage('en');
    document.body.append(api.createPanel());
    state.eligible = true;
    state.adminMode = true;
    api.renderPanel();
    URL.createObjectURL = blob => {
        downloads.push({ blob, clicks: 0, filename: null });
        return 'blob:isolated-storage-' + downloads.length;
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {
        const capture = downloads[downloads.length - 1];
        assert(capture && this.href.endsWith('isolated-storage-' + downloads.length), 'Unexpected anchor click');
        capture.clicks++;
        capture.filename = this.download;
    };
    try {
        const blockedTimeoutMs = await verifyConnections();
        // Insertion order differs from IndexedDB key order; include a skipped record.
        await seed([
            await record('z-fourth', 16385, 4),
            await record('a-first', 17, 1),
            await record('m-compressed', 4099, 3, { compressed: true }),
            { sentenceKey: 'c-skipped', sentence: 'Metadata with no audio' },
            await record('b-no-hash', 1025, 2, { missingHash: true }),
        ]);
        const picker = savingHandle();
        const pickerLongest = await exportWithInstrumentation();
        check(picker.operations.join(',') === 'create,write,close' && picker.blobs.length === 1
            && picker.busyDuringWrite && downloads.length === 0, 'Save picker writes and closes once with admin controls disabled');
        check(/^bunpro-local-audio-backup-\d{4}-\d{2}-\d{2}\.bpao$/.test(picker.pickerOptions.suggestedName),
            'Save picker retains the backup filename');
        const small = await verifyBackup(picker.blobs[0], pickerLongest, 'Save picker');
        check((await dbGetAll()).length === 5 && small.entries.length === 4
            && !small.entries.some(item => item.sentenceKey === 'c-skipped'), 'Skipped records do not inflate entryCount');
        check(small.entries.find(item => item.sentenceKey === 'b-no-hash').sha256.length === 64,
            'Export calculates SHA-256 when the stored checksum is missing');
        window.storageBackupForValidation = small.text;

        setPicker(undefined);
        const downloadLongest = await exportWithInstrumentation();
        check(downloads.length === 1 && downloads[0].clicks === 1
            && downloads[0].filename === picker.pickerOptions.suggestedName, 'Fallback captures one Blob download with the same filename');
        await verifyBackup(downloads[0].blob, downloadLongest, 'Download fallback');

        for (const failure of ['write', 'close']) {
            const capture = savingHandle({ failWrite: failure === 'write', failClose: failure === 'close', failAbort: true });
            await handleExport();
            const expectedOperations = failure === 'write' ? 'create,write,abort' : 'create,write,close,abort';
            check(capture.operations.join(',') === expectedOperations && capture.busyDuringWrite
                && state.refs.message.textContent === api.t('exportFailed', { error: 'Simulated ' + failure + ' failure' }),
            'Failed ' + failure + ' aborts before reporting the original error, even if abort rejects');
            assertIdle();
            check(true, 'Failed ' + failure + ' restores admin controls and clears busy state');
        }

        await dbClear();
        const emptyPicker = savingHandle();
        await handleExport();
        check(emptyPicker.operations.length === 0 && state.refs.message.textContent === api.t('noOverridesToExport'),
            'Empty library creates no writable and reports no overrides');
        assertIdle();
        setPicker(undefined);
        const previousDownloads = downloads.length;
        await handleExport();
        check(downloads.length === previousDownloads && state.refs.message.textContent === api.t('noOverridesToExport'),
            'Empty library creates no fallback download');
        assertIdle();
        await dbPut({ sentenceKey: '', blob: new Blob(['skipped'], { type: 'audio/wav' }) });
        await handleExport();
        check(downloads.length === previousDownloads && state.refs.message.textContent === api.t('noOverridesToExport'),
            'A library containing only skipped records also exports nothing');
        assertIdle();

        const started = performance.now();
        await seed([
            await record('large-c', 5 * 1024 * 1024 + 1, 7),
            await record('large-a', 3 * 1024 * 1024 + 3, 5, { missingHash: true }),
            await record('large-b', 4 * 1024 * 1024 + 2, 6, { compressed: true }),
        ]);
        const largePicker = savingHandle();
        const largeLongest = await exportWithInstrumentation();
        const large = await verifyBackup(largePicker.blobs[0], largeLongest, 'Multi-MiB export');
        check(large.size > 16 * 1024 * 1024 && performance.now() - started < 60000,
            'Three 3-5 MiB entries export and validate in under one minute');
        return { checks, blockedTimeoutMs, largeExportBytes: large.size, largestExportString: largeLongest };
    } finally {
        if (pickerDescriptor) Object.defineProperty(window, 'showSaveFilePicker', pickerDescriptor);
        else delete window.showSaveFilePicker;
        URL.createObjectURL = originalCreateUrl;
        URL.revokeObjectURL = originalRevokeUrl;
        HTMLAnchorElement.prototype.click = originalClick;
        await dbClear();
        const db = await api.openAudioDb();
        db.close();
        db.dispatchEvent(new Event('close'));
    }
};
