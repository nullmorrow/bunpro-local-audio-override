// Injected into a new WebDriver profile, never a real BunPro tab or database.
window.runCompressionRegression = async function () {
    const api = window.__compressionTest;
    const { state, dbPut, dbGet, dbClear, sha256Hex, handleCompressAudio } = api;
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    async function parseBackup(file) {
        const { descriptors } = await api.scanBackupFile(file);
        return Promise.all(descriptors.map(item => api.readBackupEntry(file, item.range, item.sha256)));
    }
    const checks = [];
    const check = (condition, message) => { assert(condition, message); checks.push(message); };
    window.confirm = () => true;
    let microphoneRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { microphoneRequests++; throw new Error('No mic allowed'); };
    let speakerConnections = 0;
    const originalConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination, ...args) {
        if (destination instanceof AudioDestinationNode) speakerConnections++;
        return originalConnect.call(this, destination, ...args);
    };
    // Deterministic two-tone, 16-bit stereo PCM with non-silent beginning and end.
    function wav(seconds = 0.8) {
        const count = Math.floor(48000 * seconds);
        const bytes = new ArrayBuffer(44 + count * 4);
        const view = new DataView(bytes);
        const word = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
        word(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
        view.setUint32(24, 48000, true); view.setUint32(28, 192000, true);
        view.setUint16(32, 4, true); view.setUint16(34, 16, true); word(36, 'data');
        view.setUint32(40, count * 4, true);
        for (let i = 0; i < count; i++) {
            view.setInt16(44 + i * 4, Math.round(12000 * Math.sin(i * 2 * Math.PI * 440 / 48000)), true);
            view.setInt16(46 + i * 4, Math.round(8000 * Math.sin(i * 2 * Math.PI * 660 / 48000)), true);
        }
        return new Blob([bytes], { type: 'audio/wav' });
    }
    async function record(key, blob = wav()) {
        return { sentenceKey: key, sentence: key, fileName: key + '.wav', mimeType: blob.type,
            blob, size: blob.size, updatedAt: new Date().toISOString(), sha256: await sha256Hex(blob) };
    }
    async function run() {
        await handleCompressAudio();
        assert(!state.adminBusy && !state.compressionJob, 'Job/UI did not return to idle');
        return state.refs.message.textContent;
    }
    api.setRecordingEnabled(false);
    document.body.append(api.createPanel());
    state.eligible = true;
    state.adminMode = true;
    api.renderPanel();
    check(!api.isAutoCompressionEnabled() && !state.refs.autoCompressInput.checked, 'Auto-compression defaults to off');
    await dbClear();
    const original = await record('compressible');
    // A stalled AudioContext startup must still accept Cancel, close its own
    // context, and leave the original library untouched. No native output here.
    const OriginalContext = window.AudioContext;
    let resolveStartup;
    let closedStartupContexts = 0;
    class StalledCompressionContext {
        resume() { return new Promise(resolve => { resolveStartup = resolve; }); }
        close() { closedStartupContexts++; return Promise.resolve(); }
    }
    try {
        window.AudioContext = StalledCompressionContext;
        await dbPut(original);
        const cancelledStartup = handleCompressAudio();
        await handleCompressAudio();
        const finishedPromptly = await Promise.race([
            cancelledStartup.then(() => true),
            new Promise(resolve => setTimeout(() => resolve(false), 300)),
        ]);
        resolveStartup(); // Also release an unfixed baseline after reproducing it.
        await cancelledStartup;
        check(finishedPromptly && !state.adminBusy && !state.compressionJob,
            'Cancel interrupts a stalled manual compression startup');
        check(closedStartupContexts === 1 && (await dbGet(original.sentenceKey)).sha256 === original.sha256,
            'Cancelled startup closes its context and preserves original database bytes');

        const started = performance.now();
        await handleCompressAudio();
        check(api.CONFIG.COMPRESSION_START_TIMEOUT_MS === 10000
            && performance.now() - started >= 9900 && performance.now() - started < 12000
            && closedStartupContexts === 2 && !state.adminBusy && !state.compressionJob,
            'Stalled manual compression times out and returns the controls to idle');
    } finally {
        window.AudioContext = OriginalContext;
    }
    const bad = await record('corrupt', new Blob(['not audio'], {type:'audio/wav'}));
    await dbPut(original); await dbPut(bad);
    const summary = await run();
    const compressed = await dbGet(original.sentenceKey);
    check(compressed.blob.size < original.blob.size * .9, 'Real native output is at least 10% smaller');
    check(/\.(ogg|webm)$/.test(compressed.fileName) && /opus/.test(compressed.mimeType), 'Container filename and MIME updated');
    check(compressed.sha256 === await sha256Hex(compressed.blob), 'Compressed SHA-256 matches bytes');
    check((await dbGet('corrupt')).sha256 === bad.sha256, 'Corrupt input keeps original');
    const verify = new AudioContext();
    const decoded = await verify.decodeAudioData(await compressed.blob.arrayBuffer());
    const samples = decoded.getChannelData(0);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    check(decoded.numberOfChannels === 1 && decoded.duration > .72 && decoded.duration < 1.45 && rms > .03,
        'Output decodes as mono with sensible duration and audible content');
    await verify.close();
    await run();
    check((await dbGet(original.sentenceKey)).sha256 === compressed.sha256, 'Second batch does not recompress marked audio');

    const item = await api.serializeBackupEntry(compressed);
    window.compressedBackupForMigration = JSON.stringify({format:api.CONFIG.BACKUP_FORMAT, formatVersion:1, entryCount:1, entries:[item]});
    const backup = new File([JSON.stringify({format:api.CONFIG.BACKUP_FORMAT, formatVersion:1, entries:[item]})], 'test.bpao');
    // Exercise the former rejection branch without allocating a >512 MiB fixture.
    Object.defineProperty(backup, 'size', { value: 512 * 1024 * 1024 + 1 });
    const restored = await parseBackup(backup);
    check(restored[0].sha256 === compressed.sha256 && restored[0].compression.sha256 === compressed.sha256,
        'Backup round-trip retains bytes/marker and no longer rejects the old 512 MiB boundary');
    item.sha256 = '0'.repeat(64);
    let checksumRejected = false;
    try { await parseBackup(new File([JSON.stringify({format:api.CONFIG.BACKUP_FORMAT,formatVersion:1,entries:[item]})], 'bad.bpao')); }
    catch (_) { checksumRejected = true; }
    check(checksumRejected, 'Backup checksum rejection still works');

    const stale = await dbGet(original.sentenceKey);
    await dbPut({...stale, updatedAt:'concurrent edit'});
    check(!await api.dbReplaceCompressed(stale, compressed), 'Atomic compare-and-write preserves another tab edit');
    await dbClear();
    check(!await api.dbReplaceCompressed(stale, compressed), 'Atomic compare-and-write does not resurrect deleted entries');

    const cancelOriginal = await record('cancel', wav(2));
    await dbPut(cancelOriginal);
    let visibleWithoutAnchor = false;
    let recordingStatusDidNotOverwrite = false;
    const pending = handleCompressAudio();
    setTimeout(() => {
        const progress = state.refs.message.textContent;
        api.showRecordingStatus('recordingActive');
        api.showRecordingError('recordingStartFailed', {error: 'Fixture failure'});
        recordingStatusDidNotOverwrite = state.refs.message.textContent === progress;
        document.querySelector('#js-tour-quiz-pam').remove();
        state.eligible = false;
        api.ensurePanelPlacement(false);
        api.renderPanel();
        api.positionPanel();
        visibleWithoutAnchor = !state.panel.hidden && !state.refs.compressButton.disabled;
        state.refs.compressButton.click();
    }, 200);
    await pending;
    check(visibleWithoutAnchor, 'Cancel stays available after leaving the question layout');
    check(recordingStatusDidNotOverwrite, 'Recording callbacks do not hide compression progress');
    check((await dbGet('cancel')).sha256 === cancelOriginal.sha256 && !state.compressionJob && !state.adminBusy,
        'Mid-clip cancellation keeps original and clears busy state');
    check(/cancel|取消/i.test(state.refs.message.textContent), 'Cancellation result is reported');
    state.eligible = true;
    // Once a completed clip has committed, cancelling the next clip keeps it.
    await dbClear();
    const first = await record('a-first');
    const second = await record('b-second', wav(2));
    await dbPut(first); await dbPut(second);
    let sawCommitted = false;
    const partial = handleCompressAudio();
    const poll = setInterval(() => {
        if (state.compressionJob?.changed === 1 && !state.compressionJob.cancelled) {
            sawCommitted = true;
            state.refs.compressButton.click();
        }
    }, 30);
    try { await partial; } finally { clearInterval(poll); }
    check(sawCommitted && (await dbGet('a-first')).blob.size < first.blob.size
        && (await dbGet('b-second')).sha256 === second.sha256, 'Cancel preserves completed work and the unprocessed original');

    await dbClear();
    const quotaOriginal = await record('quota');
    await dbPut(quotaOriginal);
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
        if (value?.compression) throw new DOMException('Simulated quota exhaustion', 'QuotaExceededError');
        return originalPut.call(this, value, ...args);
    };
    let quotaMessage;
    try { quotaMessage = await run(); }
    finally { IDBObjectStore.prototype.put = originalPut; }
    check((await dbGet('quota')).sha256 === quotaOriginal.sha256 && /stopped/i.test(quotaMessage),
        'Storage failure aborts replacement, keeps original, and reports stopped batch');
    check(microphoneRequests === 0 && speakerConnections === 0, 'No microphone request or speaker output');
    check(state.refs.compressButton.textContent === 'Compress Audio' && !state.refs.compressButton.disabled,
        'Button returns to reusable Compress Audio state');

    await dbClear();
    const incoming = wav();
    const incomingFile = new File([incoming], 'incoming.wav', {type:'audio/wav'});
    const incomingHash = await sha256Hex(incoming);
    const unchangedSave = await api.saveOverride('auto-off', incomingFile);
    check(unchangedSave.entry.sha256 === incomingHash, 'Save with auto-compression off preserves exact bytes');
    state.refs.autoCompressInput.click();
    check(api.isAutoCompressionEnabled() && JSON.parse(localStorage.getItem('bpLocalAudioServerlessAutoCompress')) === true,
        'Checkbox enables and persists auto-compression');
    const autoSaved = await api.saveOverride('auto-on', incomingFile);
    check(autoSaved.entry.blob.size < incoming.size * .9 && /opus/.test(autoSaved.entry.mimeType),
        'Save with auto-compression on stores verified smaller Opus');
    check(await sha256Hex(incomingFile) === incomingHash, 'Auto-compression never changes the selected source File');
    const brokenFile = new File(['broken incoming audio'], 'broken.wav', {type:'audio/wav'});
    const failedSave = await api.saveOverride('auto-broken', brokenFile);
    check(failedSave.entry.sha256 === await sha256Hex(brokenFile), 'Auto Save keeps incoming original when decoding fails');
    const originalMediaRecorder = window.MediaRecorder;
    let unavailableSave;
    try {
        window.MediaRecorder = undefined;
        unavailableSave = await api.saveOverride('auto-unavailable', incomingFile);
    } finally { window.MediaRecorder = originalMediaRecorder; }
    check(unavailableSave.entry.sha256 === incomingHash && /unavailable/i.test(api.renderMessage(unavailableSave.compressionMessage)),
        'Unavailable encoder falls back to normal Save and reports it');

    async function backupOf(records) {
        const entries = await Promise.all(records.map(api.serializeBackupEntry));
        return new File([JSON.stringify({format:api.CONFIG.BACKUP_FORMAT,formatVersion:1,entryCount:entries.length,entries})], 'incoming.bpao');
    }
    await dbClear();
    const existingAuto = await record('existing-auto');
    await dbPut(existingAuto);
    const newAuto = await record('new-auto');
    const importBad = await record('import-bad', new Blob(['invalid'], {type:'audio/wav'}));
    const importFile = await backupOf([existingAuto, newAuto, importBad]);
    Object.defineProperty(importFile, 'size', {value:512 * 1024 * 1024 + 1});
    await api.handleImport(importFile, 'keep');
    check((await dbGet('existing-auto')).sha256 === existingAuto.sha256,
        'Auto Import does not compress or replace skipped existing sentences');
    check((await dbGet('new-auto')).blob.size < newAuto.blob.size * .9,
        'Import accepts a reported >512 MiB backup and auto-compresses new entries');
    check((await dbGet('import-bad')).sha256 === importBad.sha256, 'Auto Import preserves incoming original on codec failure');
    api.setAutoCompressionEnabled(false);
    await api.handleImport(importFile, 'replace');
    check((await dbGet('new-auto')).sha256 === newAuto.sha256, 'Turning auto off restores backup bytes exactly');
    api.setAutoCompressionEnabled(true);
    await api.handleImport(importFile, 'replace');
    check((await dbGet('existing-auto')).blob.size < existingAuto.blob.size * .9,
        'Import and Replace also compresses incoming replacement audio');

    const previousSave = await dbGet('existing-auto');
    const pendingSave = api.saveOverride('existing-auto', new File([wav(2)], 'replacement.wav', {type:'audio/wav'}));
    setTimeout(() => state.refs.compressButton.click(), 150);
    let saveCancelled = false;
    try { await pendingSave; } catch (error) { saveCancelled = error.name === 'AbortError'; }
    check(saveCancelled && (await dbGet('existing-auto')).sha256 === previousSave.sha256,
        'Cancelling automatic Save keeps the previous mapping unchanged');

    await dbClear();
    const cancelImportFile = await backupOf([await record('import-first'), await record('import-second', wav(2))]);
    const pendingImport = api.handleImport(cancelImportFile, 'keep');
    const cancelImportPoll = setInterval(() => {
        if (state.compressionJob?.changed === 1 && !state.compressionJob.cancelled) state.refs.compressButton.click();
    }, 30);
    try { await pendingImport; } finally { clearInterval(cancelImportPoll); }
    check(!await dbGet('import-first') && !await dbGet('import-second') && /cancel/i.test(state.refs.message.textContent),
        'Cancelling automatic Import before commit writes none of its records');
    const concurrent = await record('concurrent');
    await dbPut(concurrent);
    const kept = await api.dbPutMany([{...concurrent, updatedAt:'later'}], {keepExisting:true});
    check(kept.skipped === 1 && (await dbGet('concurrent')).updatedAt === concurrent.updatedAt,
        'Import commit rechecks existing keys transactionally');
    await dbClear();
    const raceSource = await record('race-import');
    const raceOther = await record('race-import', wav(.25));
    const raceBackup = await backupOf([raceSource]);
    const racingImport = api.handleImport(raceBackup, 'keep');
    let raceWrite;
    setTimeout(() => { raceWrite = dbPut(raceOther); }, 150);
    await racingImport;
    await raceWrite;
    check((await dbGet('race-import')).sha256 === raceOther.sha256
        && /saved 0 B/i.test(state.refs.message.textContent),
        'Auto Import preserves concurrent saves and does not claim uncommitted space savings');
    api.setAutoCompressionEnabled(false);
    check(!api.isAutoCompressionEnabled() && !state.refs.autoCompressInput.checked,
        'Auto-compression can be disabled and UI stays in sync');
    check(microphoneRequests === 0 && speakerConnections === 0, 'Automatic compression also stays silent and never requests a microphone');
    for (const language of ['en','zh-CN','zh-TW','es','id','fr','ja']) {
        api.setUiLanguage(language);
        check(state.refs.compressButton.textContent !== 'compressAudio', 'Compression button translated: ' + language);
    }
    await dbClear();
    return { checks, summary, inputBytes:original.blob.size, outputBytes:compressed.blob.size,
        mime:compressed.mimeType, duration:decoded.duration, rms };
};

// Exercise the accelerated path separately so the existing real-time race checks
// keep their original scheduling and remain portable to the private test copy.
window.runWebCodecsRegression = async function () {
    const api = window.__compressionTest;
    const checks = [];
    const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
    const NativeEncoder = window.AudioEncoder;
    const NativeRecorder = window.MediaRecorder;
    const nativeDataClose = window.AudioData?.prototype.close;
    const supported = typeof NativeEncoder === 'function' && typeof AudioData === 'function' && (await NativeEncoder.isConfigSupported({
        codec:'opus', sampleRate:48000, numberOfChannels:1, bitrate:64000 })).supported;
    const context = api.createCompressionContext();
    await context.resume();
    function wav(sampleCount) {
        const bytes = new ArrayBuffer(44 + sampleCount * 2);
        const view = new DataView(bytes);
        const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
        text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, 48000, true); view.setUint32(28, 96000, true);
        view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data');
        view.setUint32(40, sampleCount * 2, true);
        for (let i = 0; i < sampleCount; i++) view.setInt16(44 + i * 2, 12000 * Math.sin(i * 2 * Math.PI * 440 / 48000), true);
        return new Blob([bytes], {type:'audio/wav'});
    }
    async function inspectOgg(blob, count) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const view = new DataView(bytes.buffer);
        let offset = 0;
        let sequence = 0;
        let serial;
        let preSkip;
        let finalGranule;
        let previousGranule = 0;
        const crcTable = Array.from({length:256}, (_, byte) => {
            let remainder = BigInt(byte) << 24n;
            for (let bit = 0; bit < 8; bit++) {
                remainder = ((remainder << 1n) ^ ((remainder & 0x80000000n) ? 0x04c11db7n : 0n)) & 0xffffffffn;
            }
            return Number(remainder);
        });
        while (offset < bytes.length) {
            const segments = bytes[offset + 26];
            let payload = 0;
            for (let i = 0; i < segments; i++) payload += bytes[offset + 27 + i];
            const length = 27 + segments + payload;
            if (offset + length > bytes.length) throw new Error('Ogg page overrun');
            const page = bytes.slice(offset, offset + length);
            const pageView = new DataView(page.buffer);
            if (new TextDecoder().decode(page.subarray(0, 4)) !== 'OggS' || page[4] !== 0) throw new Error('Bad Ogg capture/version');
            if (pageView.getUint32(18, true) !== sequence) throw new Error('Bad Ogg sequence');
            if (sequence === 0) serial = pageView.getUint32(14, true);
            if (serial !== pageView.getUint32(14, true)) throw new Error('Ogg serial changed');
            const expectedCrc = pageView.getUint32(22, true);
            page.fill(0, 22, 26);
            // Verify with a BigInt-derived byte lookup rather than the muxer's bit loop.
            let crc = 0;
            for (const byte of page) crc = ((crc << 8) ^ crcTable[(crc >>> 24) ^ byte]) >>> 0;
            if (crc !== expectedCrc) throw new Error('Bad Ogg CRC');
            const granule = view.getUint32(offset + 6, true) + view.getUint32(offset + 10, true) * 4294967296;
            if (granule < previousGranule) throw new Error('Non-monotonic Ogg granule');
            previousGranule = granule;
            if (sequence === 0) {
                if (page[5] !== 2 || payload !== 19 || page[27 + segments + 9] !== 1) throw new Error('Bad OpusHead/BOS');
                preSkip = view.getUint16(offset + 27 + segments + 10, true);
            } else if (sequence === 1 && new TextDecoder().decode(page.subarray(27 + segments, 35 + segments)) !== 'OpusTags') {
                throw new Error('Missing OpusTags');
            }
            if ((page[5] & 4) !== 0) {
                if (offset + length !== bytes.length) throw new Error('Early EOS');
                finalGranule = granule;
            }
            if (page[27 + segments - 1] === 255) throw new Error('Unterminated packet');
            offset += length;
            sequence++;
        }
        check(sequence >= 3 && finalGranule === preSkip + count, 'Ogg CRC, sequence, BOS/EOS and exact final granule: ' + count + ' samples');
        return {preSkip, finalGranule, pages:sequence};
    }
    let ratio = null;
    let ogg = null;
    try {
        api.setUiLanguage('en');
        if (supported) {
            // Successful encoding with MediaRecorder absent proves path selection.
            window.MediaRecorder = undefined;
            const onlyWebCodecsContext = api.createCompressionContext();
            await onlyWebCodecsContext.close();
            const count = 198577;
            let submitted = 0;
            let closedData = 0;
            let closedEncoders = 0;
            AudioData.prototype.close = function () { closedData++; return nativeDataClose.call(this); };
            window.AudioEncoder = class extends NativeEncoder {
                encode(data) { submitted++; super.encode(data); }
                close() { closedEncoders++; super.close(); }
            };
            const started = performance.now();
            const encoded = await api.encodeSpeechOpus(wav(count), context, {cancelled:false});
            ratio = (performance.now() - started) / (count / 48);
            AudioData.prototype.close = nativeDataClose;
            window.AudioEncoder = NativeEncoder;
            check(submitted > 0 && submitted === closedData && closedEncoders === 1,
                'Successful WebCodecs encoding closes every AudioData and its AudioEncoder');
            check(encoded.mimeType === 'audio/ogg;codecs=opus' && encoded.extension === '.ogg', 'WebCodecs produces Ogg Opus without MediaRecorder');
            const decoded = await context.decodeAudioData(await encoded.blob.arrayBuffer());
            const samples = decoded.getChannelData(0);
            const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
            check(decoded.numberOfChannels === 1 && Math.abs(decoded.duration - count / 48000) < .02 && rms > .03,
                'WebCodecs output decodes as audible mono with exact duration');
            check(ratio < .5, 'WebCodecs several-second encoding is clearly faster than real time');
            ogg = await inspectOgg(encoded.blob, count);
            for (const sampleCount of [1, 647, 648, 649, 959, 960, 961, 1921]) {
                const boundary = await api.encodeSpeechOpus(wav(sampleCount), context, {cancelled:false});
                await inspectOgg(boundary.blob, sampleCount);
            }
            // Packet lacing includes >255 bytes and exact multiples of 255.
            for (const size of [255, 256, 510, 65024]) {
                const packet = new Uint8Array(size);
                packet[0] = 0x98; // One 20 ms frame; payload bytes are structural test doubles.
                await inspectOgg(api.muxOggOpus([packet], 648, 312), 648);
            }
            window.MediaRecorder = NativeRecorder;
            let closed = 0;
            window.AudioEncoder = class extends NativeEncoder {
                configure() { throw new Error('Injected encoder failure'); }
                close() { closed++; super.close(); }
            };
            const failed = await api.encodeSpeechOpus(wav(12000), context, {cancelled:false});
            check(closed === 1 && failed.blob.size > 0, 'WebCodecs failure closes encoder and falls back to MediaRecorder');

            window.AudioEncoder = NativeEncoder;
            const nativeDecode = context.decodeAudioData;
            let decodeCalls = 0;
            context.decodeAudioData = function (bytes) {
                if (++decodeCalls === 2) return Promise.resolve(context.createBuffer(2, 12000, 48000));
                return nativeDecode.call(this, bytes);
            };
            try {
                const verifiedFallback = await api.encodeSpeechOpus(wav(12000), context, {cancelled:false});
                check(decodeCalls === 3 && verifiedFallback.blob.size > 0,
                    'Failed WebCodecs decode validation falls back without loosening validation');
            } finally { context.decodeAudioData = nativeDecode; }

            let flushEntered = false;
            let flushClosed = 0;
            const flushJob = {cancelled:false};
            window.AudioEncoder = class extends NativeEncoder {
                flush() {
                    flushEntered = true;
                    setTimeout(() => flushJob.abortCurrent(), 0);
                    return new Promise(() => {});
                }
                close() { flushClosed++; super.close(); }
            };
            const flushStarted = performance.now();
            let flushAborted = false;
            try { await api.encodeSpeechOpus(wav(12000), context, flushJob); }
            catch (error) { flushAborted = error.name === 'AbortError'; }
            check(flushEntered && flushAborted && flushClosed === 1 && !flushJob.abortCurrent
                && performance.now() - flushStarted < 1000,
                'Cancel interrupts stalled WebCodecs flush and closes encoder without fallback');

            await api.dbClear();
            const blob = wav(198577);
            const original = {sentenceKey:'webcodecs-cancel', sentence:'cancel', fileName:'cancel.wav', mimeType:blob.type,
                blob, size:blob.size, updatedAt:new Date().toISOString(), sha256:await api.sha256Hex(blob)};
            await api.dbPut(original);
            closed = 0;
            let scheduled = false;
            window.AudioEncoder = class extends NativeEncoder {
                encode(data) {
                    super.encode(data);
                    if (!scheduled) {
                        scheduled = true;
                        setTimeout(() => api.handleCompressAudio(), 0);
                    }
                }
                close() { closed++; super.close(); }
            };
            const cancelStarted = performance.now();
            await api.handleCompressAudio();
            check(scheduled && closed === 1 && performance.now() - cancelStarted < 1000
                && (await api.dbGet(original.sentenceKey)).sha256 === original.sha256
                && !api.state.compressionJob && !api.state.adminBusy,
                'WebCodecs cancellation promptly closes encoder, preserves library and clears UI');
        }
        window.MediaRecorder = NativeRecorder;
        window.AudioEncoder = undefined;
        const fallback = await api.encodeSpeechOpus(wav(12000), context, {cancelled:false});
        check(fallback.blob.size > 0 && /opus/.test(fallback.mimeType), 'Missing WebCodecs still compresses through native MediaRecorder');
        window.AudioEncoder = class { static async isConfigSupported() { return {supported:false}; } };
        const unsupported = await api.encodeSpeechOpus(wav(12000), context, {cancelled:false});
        check(unsupported.blob.size > 0, 'Unsupported WebCodecs config falls back to native MediaRecorder');
        return {checks, supported, path:supported ? 'WebCodecs Ogg + MediaRecorder fallback' : 'MediaRecorder fallback', ratio, ogg};
    } finally {
        window.AudioEncoder = NativeEncoder;
        window.MediaRecorder = NativeRecorder;
        if (nativeDataClose) AudioData.prototype.close = nativeDataClose;
        await context.close();
        await api.dbClear();
    }
};
