// Synthetic markup and a real isolated IndexedDB; only our own media is doubled.
window.runLookupRegression = async function (negative) {
    const api = window.__lookupTest;
    const { state, lookupCache, Blob, File, URL } = api;
    const checks = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const check = (condition, message) => { assert(condition, message); checks.push(message); };
    const root = document.querySelector('.text-center');
    let dispatchedP = null;
    let nativeEvents = [];
    let extraEvents = [];
    const observe = event => {
        if (event.type === 'keydown' && event === dispatchedP) nativeEvents.push(event);
        else if (!event.isTrusted && (event.type === 'keydown' || event.type === 'keyup' || event.type === 'click')) {
            extraEvents.push(event);
        }
    };
    document.addEventListener('keydown', observe);
    document.addEventListener('keyup', observe);
    document.addEventListener('click', observe);
    api.setRecordingEnabled(false);
    const audio = api.ensureAudioElement();
    let paused = true;
    let playCount = 0;
    let playedSrc = '';
    let resolvePlayback;
    Object.defineProperty(audio, 'paused', {get: () => paused});
    audio.load = () => {};
    audio.pause = () => { paused = true; audio.dispatchEvent(new Event('pause')); };
    audio.play = () => {
        paused = false;
        playCount += 1;
        playedSrc = audio.src;
        audio.dispatchEvent(new Event('play'));
        resolvePlayback?.();
        return Promise.resolve();
    };
    function immediateP(sentence) {
        // Deliberately one task: no observer turn, lookup await or timer before P.
        root.textContent = sentence;
        dispatchedP = new KeyboardEvent('keydown', {key: 'p', code: 'KeyP', bubbles: true, cancelable: true});
        nativeEvents = [];
        extraEvents = [];
        document.dispatchEvent(dispatchedP);
        return dispatchedP;
    }
    async function settlePreloads() {
        await api.openAudioDb();
        await Promise.all(api.preloads);
    }
    async function localP(sentence, label) {
        const before = playCount;
        const playback = new Promise(resolve => { resolvePlayback = resolve; });
        const event = immediateP(sentence);
        check(event.defaultPrevented && state.pRoute.owner === 'local', label + ': immediate P belongs to local route');
        await playback;
        resolvePlayback = null;
        check(playCount === before + 1 && playedSrc === state.objectUrl && playedSrc.startsWith('blob:'),
            label + ': own audio.play starts the selected Blob URL');
        check(await (await fetch(playedSrc)).text() === await state.entry.blob.text(),
            label + ': played URL contains the saved clip bytes');
    }
    async function nativeP(sentence, label) {
        const before = playCount;
        const event = immediateP(sentence);
        check(!event.defaultPrevented && state.pRoute.owner === 'native' && nativeEvents.length === 1
            && nativeEvents[0] === event, label + ': unchanged P reaches the native listener exactly once');
        if (state.lookupPromise) await state.lookupPromise;
        await Promise.resolve();
        check(playCount === before && extraEvents.length === 0,
            label + ': no local playback or synthesized keyboard/click event');
    }
    function leaveSentence() {
        audio.pause();
        root.textContent = '';
        api.ensureStateMatchesPage();
    }
    function holdRead() {
        let release;
        let ready;
        const promise = new Promise(resolve => { release = resolve; });
        const snapshot = new Promise(resolve => { ready = resolve; });
        api.holdNextRead = {promise, ready};
        return {release, snapshot};
    }
    const originalCreateUrl = URL.createObjectURL;
    let urlCount = 0;
    URL.createObjectURL = function (...args) { urlCount += 1; return originalCreateUrl.apply(this, args); };
    try {
        await settlePreloads();
        if (negative) {
            check(!lookupCache.has('storedsentence'), 'Negative control: startup preload removed');
            await nativeP('storedsentence', 'Negative control with existing override');
            check(state.overrideFound, 'Negative control: ordinary lookup eventually finds the override');
            return {checks};
        }
        check(lookupCache.has('storedsentence') && !lookupCache.has('missingblob') && urlCount === 0,
            'Startup preloads valid Blob handles without creating URLs and skips invalid records');
        check(lookupCache.get('storedsentence').entry.fileName === 'seed.wav',
            'Preload uses the same normalized entry shape as dbGet');
        await localP('storedsentence', 'Startup override');
        await nativeP('absent sentence', 'No override');

        immediateP('storedsentence');
        if (state.pPlaybackStartPending) await new Promise(resolve => { resolvePlayback = resolve; });
        resolvePlayback = null;
        await api.handleDelete();
        leaveSentence();
        await nativeP('storedsentence', 'Delete button');
        leaveSentence();
        api.invalidateLookupAfterDatabaseChange();
        await settlePreloads();
        await nativeP('storedsentence', 'Delete plus cache invalidation');

        leaveSentence();
        root.textContent = 'newsentence';
        api.ensureStateMatchesPage();
        if (state.lookupPromise) await state.lookupPromise;
        state.selectedFile = new File(['new clip'], 'new.wav', {type: 'audio/wav'});
        await api.handleSave();
        leaveSentence();
        api.invalidateLookupAfterDatabaseChange();
        await settlePreloads();
        await localP('newsentence', 'Save plus cache invalidation');

        leaveSentence();
        lookupCache.clear();
        const stale = holdRead();
        const stalePreload = api.preloadLookupCache();
        await stale.snapshot;
        await api.dbDelete('newsentence');
        api.invalidateLookupAfterDatabaseChange();
        await api.preloads[api.preloads.length - 1];
        stale.release();
        await stalePreload;
        check(!lookupCache.has('newsentence'), 'Invalidation discards an in-flight deleted-record snapshot');
        await nativeP('newsentence', 'Deleted during preload');

        leaveSentence();
        await api.dbPut({sentenceKey: 'livesentence', blob: new Blob(['older'], {type: 'audio/wav'})});
        root.textContent = 'livesentence';
        api.ensureStateMatchesPage();
        await state.lookupPromise;
        lookupCache.clear();
        const old = holdRead();
        const oldPreload = api.preloadLookupCache();
        await old.snapshot;
        api.setLookupResult('livesentence', {found: false, entry: null});
        const live = lookupCache.get('livesentence');
        old.release();
        await oldPreload;
        check(lookupCache.get('livesentence') === live, 'Preload preserves an existing live lookup result');
        leaveSentence();
        api.failNextRead = true;
        await api.preloadLookupCache();
        check(lookupCache.get('livesentence') === live, 'Preload failure resolves without damaging live cache results');
        await nativeP('absentafterfailure', 'Lookup after preload failure');
        return {checks};
    } finally {
        URL.createObjectURL = originalCreateUrl;
        leaveSentence();
        api.releaseLocalOverrideUi();
        api.releaseObjectUrl();
        document.removeEventListener('keydown', observe);
        document.removeEventListener('keyup', observe);
        document.removeEventListener('click', observe);
        (await api.openAudioDb()).close();
        state.dbPromise = null;
    }
};
