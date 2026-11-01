// Real event propagation and detached media; only capture/playback boundaries are doubled.
window.runHotkeyRegression = async () => {
    const api = window.__hotkeyTest;
    const { state, timings } = api;
    const checks = window.hotkeyChecks = [];
    const findings = [];
    const check = (condition, label) => {
        if (!condition) throw new Error(label);
        checks.push(label);
    };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function until(predicate, label) {
        const deadline = performance.now() + 3000;
        while (!predicate()) {
            if (performance.now() > deadline) throw new Error('Timed out: ' + label);
            await sleep(5);
        }
    }
    const sentence = document.querySelector('.text-center');
    const nativeButton = document.querySelector('#native-play');
    const nativeIcon = nativeButton.querySelector('svg');
    const entry = {sentenceKey: 'hotkeysentence', blob: new Blob(['synthetic clip'], {type: 'audio/wav'})};
    const local = api.ensureAudioElement();
    let localPlaying = false;
    let localPlays = 0;
    Object.defineProperties(local, {
        paused: {get: () => !localPlaying}, ended: {get: () => false},
        src: {value: '', writable: true},
    });
    local.load = () => {};
    local.pause = () => { localPlaying = false; local.dispatchEvent(new Event('pause')); };
    local.testPlay = () => {
        localPlaying = true;
        localPlays += 1;
        local.dispatchEvent(new Event('play'));
        return Promise.resolve();
    };
    const native = new Audio();
    let nativePlaying = false;
    Object.defineProperties(native, {
        paused: {get: () => !nativePlaying}, ended: {get: () => false},
        src: {value: 'https://bunpro.invalid/audio.wav'},
    });
    native.testPlay = () => { nativePlaying = true; return Promise.resolve(); };
    native.pause = () => { nativePlaying = false; };
    function key(letter = 'p') {
        const event = new KeyboardEvent('keydown', {
            key: letter, code: 'Key' + letter.toUpperCase(), bubbles: true, cancelable: true,
        });
        document.body.dispatchEvent(event);
        return event;
    }
    function reset(found = false) {
        nativePlaying = false;
        nativeIcon.setAttribute('data-name', 'PLAY_ARROW');
        api.resetForSentence(sentence.textContent);
        api.setLookupResult(state.normalizedSentence, {found, entry: found ? entry : null});
        state.eligible = true;
        window.nativeKeys.length = 0;
        window.capturedKeys.length = 0;
        window.nativeClicks.length = 0;
    }
    function matureIntent() {
        api.markNativePIntent();
        state.pRoute.intentStartedAt = performance.now() - timings.ended - 10;
    }
    window.cleanupHotkeyTest = () => {
        nativePlaying = false;
        api.clearNativePClickPassthrough();
        api.resetForSentence('');
        api.releaseRecordingResources();
        api.releaseObjectUrl();
        if (state.dbPromise) state.dbPromise.then(db => db.close());
    };
    try {
        await api.openAudioDb();
        api.ensureStateMatchesPage();
        if (state.lookupPromise) await state.lookupPromise;
        api.setRecordingEnabled(true);
        api.setRecordingGain(1);

        reset(true);
        let starts = api.recordingStarts;
        const localP = key();
        check(localP.defaultPrevented && state.pRoute.owner === 'local' && !nativeKeys.length,
            '1.local-start: ready override blocks P and owns the local route');
        await until(() => localPlaying && !state.pPlaybackStartPending, 'local playback');
        check(api.recordingStarts === starts + 1 && api.recordingActive && localPlays === 1,
            '1.local-sidecar: local playback and recording start together');
        local.currentTime = 7;
        const stops = api.recordingStops;
        const stopLocalP = key();
        check(stopLocalP.defaultPrevented && !localPlaying && local.currentTime === 0 &&
            !api.recordingActive && api.recordingStops === stops + 1 && state.pRoute.owner === '',
            '1.local-stop: second P stops playback and recording and releases route');

        reset(true);
        let releasePreparation;
        api.holdPreparation = new Promise(resolve => { releasePreparation = resolve; });
        const beforePlays = localPlays;
        key();
        check(state.pPlaybackStartPending && state.pRoute.owner === 'local',
            '1.local-pending: delayed preparation retains local ownership');
        const stopPending = key();
        check(stopPending.defaultPrevented && !state.pPlaybackStartPending && state.pRoute.owner === '' && !api.recordingActive,
            '1.pending-stop: second P releases pending playback and recording');
        releasePreparation();
        api.holdPreparation = null;
        await sleep(5);
        check(localPlays === beforePlays && !localPlaying && state.pRoute.owner === '',
            '1.pending-stale: old preparation cannot restart playback');

        reset();
        starts = api.recordingStarts;
        const original = key();
        check(!original.defaultPrevented && nativeKeys.length === 1 && nativeKeys[0] === original &&
            capturedKeys.length === 1 && capturedKeys[0] === original,
            '2.native-event: same P reaches BunPro once without synthesis or prevention');
        check(state.pRoute.owner === 'native' && state.pRoute.intentActive && state.pRoute.intentStartedAt > 0 &&
            api.recordingStarts === starts + 1 && api.recordingActive,
            '2.native-start: idle P records intent timestamp and starts recording sidecar');

        await native.play();
        check(!native.isConnected && api.isPageMediaPlaying(),
            '3.detached-media: document-start play hook observes detached Audio');
        const stopNative = key();
        check(!stopNative.defaultPrevented && nativeKeys[1] === stopNative && state.pRoute.owner === 'native-stopping' &&
            !api.recordingActive && !state.pRoute.intentActive,
            '3.native-stop: P passes through while recording stops and route becomes native-stopping');
        // An override arriving mid-cycle must not steal BunPro's follow-up click.
        api.setLookupResult(state.normalizedSentence, {found: true, entry});
        const nativeClick = new MouseEvent('click', {bubbles: true, cancelable: true});
        nativeButton.dispatchEvent(nativeClick);
        check(!nativeClick.defaultPrevented && nativeClicks.includes(nativeClick) && state.pRoute.owner === 'native-stopping',
            '3.click-window: native audio click passes through despite ready override');
        check(!api.isNativePIntentActive(), '3.stop-guard: playing media cannot re-bootstrap intent during stop guard');
        await until(() => !state.pRoute.clickPassthroughTimer, 'click passthrough expires');
        check(state.pRoute.owner === '' && !state.pRoute.clickPassthroughGeneration,
            '3.window-expiry: passthrough expiry releases stopping route');
        check(!api.isNativePIntentActive(), '3.released-stop-guard: still-playing media stays guarded after route release');
        await until(() => performance.now() >= state.pRoute.stopGuardUntil, 'stop guard expires');
        check(api.isNativePIntentActive() && state.pRoute.owner === 'native',
            '3.stop-guard-expiry: playing detached media can bootstrap after guard');

        reset();
        key();
        check(api.isNativePIntentActive() && !api.isPageMediaPlaying() && !api.isNativeBunproAudioPlaying(),
            '4.intent-grace: fresh intent survives without media or PAUSE UI');
        state.pRoute.intentStartedAt = performance.now() - timings.grace - 1;
        check(!api.isNativePIntentActive() && !state.pRoute.intentActive && state.pRoute.owner === '',
            '4.grace-expiry: intent and route clear after grace');

        for (const eventName of ['ended', 'error', 'abort', 'emptied']) {
            reset();
            matureIntent();
            native.dispatchEvent(new Event(eventName));
            check(state.pRoute.intentActive, '5.' + eventName + ': terminal event does not clear synchronously');
            await sleep(5);
            check(!state.pRoute.intentActive && state.pRoute.owner === '',
                '5.' + eventName + ': terminal event clears intent one task later');
            for (const protection of ['newer-intent', 'local-route', 'still-playing', 'ended-guard', 'new-generation']) {
                reset();
                matureIntent();
                if (protection === 'ended-guard') state.pRoute.intentStartedAt = performance.now();
                native.dispatchEvent(new Event(eventName));
                if (protection === 'newer-intent') {
                    api.markNativePIntent();
                    // Keep the new intent outside the ended guard to isolate timestamp ownership.
                    state.pRoute.intentStartedAt = performance.now() - timings.ended - 1;
                }
                if (protection === 'local-route') state.pRoute.owner = 'local';
                if (protection === 'still-playing') nativePlaying = true;
                if (protection === 'new-generation') state.pHotkeyGeneration += 1;
                await sleep(5);
                check(state.pRoute.intentActive && (protection !== 'local-route' || state.pRoute.owner === 'local'),
                    '5.' + eventName + ': ' + protection + ' protects intent');
            }
        }

        reset();
        key();
        state.recordingBlob = entry.blob;
        const reviewO = key('o');
        await until(() => state.recordingPlaybackAudio && state.panelMessage?.key === 'recordingPlaybackActive', 'O review');
        state.recordingPlaybackAudio.dispatchEvent(new Event('ended'));
        check(reviewO.defaultPrevented && !state.recordingPlaybackAudio && state.pRoute.owner === '' &&
            state.panelMessage?.key === 'recordingPlaybackEnded',
            '6.o-review: O replay ends with route released');
        nativeIcon.setAttribute('data-name', 'PAUSE');
        check(api.isNativeBunproAudioPlaying() && !api.isNativePIntentActive(),
            '6.stale-pause: PAUSE icon after O alone cannot bootstrap a native cycle');
        starts = api.recordingStarts;
        const afterO = key();
        check(!afterO.defaultPrevented && state.pRoute.owner === 'native' && api.recordingStarts === starts + 1,
            '6.p-after-o: stale PAUSE permits a new native recording cycle');
        api.releaseRecordingResources();

        for (const enabled of [true, false]) {
            reset();
            api.setRecordingEnabled(enabled);
            key();
            state.pRoute.stopGuardUntil = performance.now() + timings.stop;
            const generation = state.pHotkeyGeneration;
            const o = key('o');
            check(o.defaultPrevented && state.pHotkeyGeneration === generation + 1 && state.pRoute.owner === '' &&
                !state.pRoute.intentActive && !state.pRoute.stopGuardUntil && !state.pRoute.clickPassthroughTimer &&
                !state.pRoute.clickPassthroughGeneration && !state.pPlaybackStartPending &&
                state.panelMessage?.key === (enabled ? 'recordingEmpty' : 'recordingDisabled'),
                '7.o-' + enabled + ': O blocks event, increments generation, clears route/guards and reports empty/disabled');
        }
        api.setRecordingEnabled(true);

        reset(true);
        key();
        await until(() => localPlaying && !state.pPlaybackStartPending, 'local before ended');
        localPlaying = false;
        local.dispatchEvent(new Event('ended'));
        check(state.pRoute.owner === '', '8.local-ended: local ended releases route');
        for (const owner of ['local', 'native', 'native-stopping']) {
            reset();
            key();
            state.pRoute.owner = owner;
            state.pRoute.stopGuardUntil = performance.now() + timings.stop;
            const generation = state.pHotkeyGeneration;
            api.resetForSentence('changed sentence');
            check(state.pRoute.owner === '' && !state.pRoute.intentActive && !state.pRoute.stopGuardUntil &&
                !state.pRoute.clickPassthroughTimer && state.pHotkeyGeneration === generation + 1,
                '8.sentence-reset-' + owner + ': sentence reset releases route and guards');
        }
        reset(true);
        await api.dbPut(entry);
        key();
        await until(() => localPlaying && !state.pPlaybackStartPending, 'local before delete');
        await api.handleDelete();
        check(state.pRoute.owner === '' && !state.overrideFound && !localPlaying && !(await api.dbGet(entry.sentenceKey)),
            '8.delete: deleting override releases route and removes saved entry');

        for (const owner of ['native', 'native-stopping']) {
            reset(true);
            api.syncAnswerAudioControl();
            check(Boolean(state.controlledAnswerButton), '9.' + owner + ': positive local answer-control baseline');
            state.pRoute.owner = owner;
            api.syncAnswerAudioControl();
            check(!state.controlledAnswerButton && !document.querySelector('[data-bp-local-audio-controlled="true"]'),
                '9.' + owner + ': answer-control gate restores native control');
            state.playerOpen = true;
            const wrapper = state.playerWrapper;
            api.updateLocalPlayerControls();
            check(state.playerWrapper === wrapper, '9.' + owner + ': controls gate does not create or replace local player');
            api.syncLocalOverrideUi();
            check(!state.playerOpen && !state.playerWrapper && !state.controlledAnswerButton && !state.syntheticPlayButton,
                '9.' + owner + ': override UI gate releases local controls');
        }

        reset();
        let releaseLookup;
        state.lookupStatus = 'loading';
        state.lookupPromise = new Promise(resolve => { releaseLookup = resolve; });
        const loadingP = key();
        // Current behavior: a loading override lookup routes P to BunPro immediately.
        check(!loadingP.defaultPrevented && nativeKeys.length === 1 && nativeKeys[0] === loadingP &&
            state.pRoute.owner === 'native' && state.lookupStatus === 'loading',
            '10.lookup-loading: P passes immediately to BunPro and owns native route');
        const oldLocalPlays = localPlays;
        api.setLookupResult(state.normalizedSentence, {found: true, entry});
        releaseLookup({found: true, entry});
        state.lookupPromise = null;
        await sleep(5);
        check(state.pRoute.owner === 'native' && localPlays === oldLocalPlays && capturedKeys.length === 1,
            '10.lookup-completion: late override does not replay or synthesize P');
        findings.push('P during lookup loading passes to BunPro immediately; a late override does not take over that cycle.');
        window.prepareTrustedNativeP = () => { reset(); document.body.focus(); };
        window.finishTrustedNativeP = () => {
            const event = nativeKeys[0];
            const ok = nativeKeys.length === 1 && capturedKeys.length === 1 && event === capturedKeys[0] &&
                event.isTrusted && !event.defaultPrevented && state.pRoute.owner === 'native';
            return {ok, checks: [ok ? '2.trusted-native: original trusted WebDriver P reaches BunPro exactly once' :
                'FAILED: trusted native P propagation']};
        };
        return {ok: true, checks, findings};
    } finally {
        api.holdPreparation = null;
        nativePlaying = false;
        api.clearNativePClickPassthrough();
        api.resetForSentence(sentence.textContent);
        (await api.openAudioDb()).close();
        state.dbPromise = null;
    }
};
