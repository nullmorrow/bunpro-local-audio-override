// Recovery acceptance tests. Reference playback is a timestamp probe; microphone
// failures are injected. Successful recording uses generated Web Audio input.
window.runMicrophoneRecoveryRegression = async () => {
    const api = window.__disconnectTest;
    const { state, CONFIG } = api;
    const calls = window.__disconnectPlaybackCalls;
    const checks = [], metrics = {}, contexts = [], deferred = [];
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
    const RealContext = window.AudioContext;
    const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function until(predicate, label, timeout = 4000) {
        const deadline = performance.now() + timeout;
        while (!predicate()) {
            if (performance.now() >= deadline) throw new Error('Timeout: ' + label + ' / ' + JSON.stringify({
                pending:state.recordingStartPending, session:!!state.recordingSession,
                recorder:state.recordingSession?.recorder?.state, mic:!!state.micStream,
                tracks:state.micStream?.getTracks().map(track => ({readyState:track.readyState, muted:track.muted})),
                retry:state.micRetryAfter, cleanup:!!state.micStreamCleanup, metrics,
            }));
            await delay(10);
        }
    }
    function pressP() {
        const event = new KeyboardEvent('keydown', {key:'p', code:'KeyP', bubbles:true, cancelable:true});
        document.body.dispatchEvent(event);
        return event;
    }
    function deviceChange() { navigator.mediaDevices.dispatchEvent(new Event('devicechange')); }
    function fakeStream(muted = false) {
        const track = new EventTarget();
        Object.assign(track, {readyState:'live', enabled:true, muted, stop() { this.readyState = 'ended'; }});
        return {getAudioTracks:() => [track], getTracks:() => [track], track};
    }
    function pendingRequest() {
        let resolve, reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        const request = {promise, resolve, reject};
        deferred.push(request);
        return request;
    }
    async function newMicrophone() {
        const context = new RealContext();
        contexts.push(context);
        await context.resume();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.value = .02;
        const destination = context.createMediaStreamDestination();
        // Firefox's native MediaStreamTrack ignores these injected events by
        // default in this WebDriver realm. Opt in only on fixture tracks; real
        // device events are trusted. Chrome ignores the extra argument.
        destination.stream.getTracks().forEach(track => {
            const add = track.addEventListener;
            track.addEventListener = function (type, callback, options) {
                return add.call(this, type, callback, options, true);
            };
        });
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        return destination.stream;
    }
    async function reset() {
        state.pHotkeyGeneration++;
        state.pPlaybackStartPending = false;
        state.pRouteOwner = '';
        api.clearNativePIntent();
        api.releaseRecordingResources();
        api.setRecordingEnabled(true);
        api.setRecordingGain(1);
        api.setMicProcessingMode('raw');
        api.ensureStateMatchesPage();
        state.lookupStatus = 'ready';
        state.overrideFound = true;
        state.entry = {filename:'diagnostic.wav', size:100};
        calls.length = 0;
        await delay(20);
    }
    async function localStart(label) {
        const count = calls.length;
        const started = performance.now();
        const event = pressP();
        await until(() => calls.length === count + 1 && !state.pPlaybackStartPending, label);
        const elapsed = Math.round(calls[count] - started);
        check(event.defaultPrevented && elapsed < 500, label);
        return elapsed;
    }
    try {
        check(CONFIG.MIC_REQUEST_TIMEOUT_MS === 10000 && CONFIG.MIC_FAILURE_RETRY_MS === 30000,
            'Production timeout is 10 seconds and failure cooldown is 30 seconds');
        await reset();
        let requests = 0;
        navigator.mediaDevices.getUserMedia = async () => {
            requests++;
            throw new DOMException('Simulated missing microphone', 'NotFoundError');
        };
        metrics.noDevicePlaybackCallMs = [];
        for (let i = 0; i < 3; i++) {
            metrics.noDevicePlaybackCallMs.push(await localStart('Missing microphone does not delay local P #' + (i + 1)));
            await until(() => !state.recordingStartPending, 'missing microphone settles');
        }
        check(requests === 1 && state.micRetryAfter > performance.now(), 'Repeated P in cooldown does not request the absent device again');
        let primed = 0;
        window.AudioContext = function () { primed++; throw new Error('Should not create a capture context in cooldown'); };
        api.setRecordingGain(2);
        await localStart('Higher gain also plays immediately during cooldown');
        window.AudioContext = RealContext;
        check(primed === 0 && !state.recordingCaptureContext, 'Cooldown prevents audio-engine priming, not just getUserMedia');
        state.overrideFound = false;
        state.entry = null;
        api.clearNativePIntent();
        const nativeEvent = pressP();
        await delay(20);
        check(!nativeEvent.defaultPrevented && requests === 1, 'Native BunPro P passes through while failed recording is in cooldown');
        state.overrideFound = true;
        state.entry = {filename:'diagnostic.wav', size:100};
        api.clearNativePIntent();
        api.setRecordingGain(1);
        deviceChange();
        check(requests === 1 && state.micRetryAfter === 0, 'Device change clears cooldown without automatically opening the microphone');
        await localStart('Next P retries after a device change');
        await until(() => !state.recordingStartPending, 'retry failure');
        check(requests === 2, 'Device change permits a new request on P');
        api.setRecordingEnabled(false);
        api.setRecordingEnabled(true);
        await localStart('Rec off/on permits an explicit retry');
        await until(() => !state.recordingStartPending, 'manual retry failure');
        check(requests === 3, 'Explicit retry bypasses cooldown once');
        state.micRetryAfter = performance.now() - 1; // Simulate expiry without a 30-second sleep.
        await localStart('Next P can retry when cooldown expires');
        await until(() => !state.recordingStartPending, 'expired retry failure');
        check(requests === 4, 'Cooldown expiry is not a permanent recording disable');

        await reset();
        check(!api.isMicStreamUsable(fakeStream(true)), 'Live but muted tracks are not considered usable');
        api.setRecordingGain(2);
        const stalled = {state:'suspended', resume:() => new Promise(() => {}),
            close() { this.state = 'closed'; return Promise.resolve(); }};
        const staleStream = fakeStream();
        state.micStream = staleStream;
        state.recordingCaptureContext = stalled;
        metrics.stalledGainPlaybackCallMs = await localStart('Stalled gain context cannot hold local playback pending');
        check(state.recordingStartPending && !state.pPlaybackStartPending, 'Recording may wait independently of reference playback');
        await localStart('Next idle P is not consumed as cancellation of a recording wait');
        await until(() => !state.recordingStartPending, 'stalled gain timeout');
        check(!state.micStream && !state.recordingCaptureContext && stalled.state === 'closed'
            && staleStream.track.readyState === 'ended' && state.micRetryAfter > performance.now(),
            'Gain timeout discards the broken capture context/input and backs off');
        await localStart('Playback still works after gain timeout');

        await reset();
        const oldRequest = pendingRequest();
        requests = 0;
        navigator.mediaDevices.getUserMedia = () => { requests++; return oldRequest.promise; };
        const timeoutStarted = performance.now();
        metrics.hungRequestPlaybackCallMs = await localStart('Unanswered microphone request never blocks playback');
        await until(() => state.micRequest, 'request starts');
        await localStart('Repeated idle P reuses the pending request but still plays');
        check(requests === 1, 'Overlapping recording starts share one pending device request');
        await until(() => !state.micRequest && !state.recordingStartPending, 'real production request timeout', 11000);
        metrics.requestTimeoutMs = Math.round(performance.now() - timeoutStarted);
        check(metrics.requestTimeoutMs >= 9900 && !state.micStream && state.micRetryAfter > performance.now(),
            'Unanswered request is abandoned at the production timeout and enters cooldown');
        deviceChange();
        const newRequest = pendingRequest();
        api.setRecordingGain(2);
        navigator.mediaDevices.getUserMedia = () => { requests++; return newRequest.promise; };
        await localStart('Playback continues while a replacement device request is pending');
        await until(() => state.micRequest, 'replacement request starts');
        const currentToken = state.micRequest;
        const lateStream = fakeStream();
        oldRequest.resolve(lateStream);
        await until(() => lateStream.track.readyState === 'ended', 'late timed-out input released');
        check(state.micRequest === currentToken && !state.micStream, 'Late success cannot adopt a stale stream or clear a newer request');
        const healthy = await newMicrophone();
        newRequest.resolve(healthy);
        await until(() => state.recordingSession, 'replacement device starts recording');
        check(state.micStream === healthy && !state.micRequest, 'Recording recovers on the new device');
        check(state.recordingSession.recordingGain === 2, 'Recovered input records through the gain graph');
        await delay(650);
        healthy.getTracks().forEach(track => track.stop());
        await until(() => healthy.getTracks().every(track => track.readyState === 'ended'), 'track stop state');
        healthy.getTracks().forEach(track => track.dispatchEvent(new Event('ended')));
        await until(() => !state.recordingSession && !state.micStream, 'active device ended cleanup');
        check(!state.recordingStartPending && state.micRetryAfter > performance.now(), 'Device loss ends the current take and releases pending state');
        await until(() => state.recordingBlob?.size, 'partial recording preserved on disconnect');
        check(state.recordingBlob.size > 0, 'Recorded chunks before disconnect remain available for O');
        await localStart('P still plays after an active microphone disconnect');

        await reset();
        const cancelled = pendingRequest();
        const replacement = pendingRequest();
        requests = 0;
        navigator.mediaDevices.getUserMedia = () => (++requests === 1 ? cancelled.promise : replacement.promise);
        const first = api.restartVoiceRecording();
        await until(() => requests === 1, 'first raw request');
        api.setMicProcessingMode('clean');
        api.setMicProcessingMode('raw');
        const second = api.restartVoiceRecording();
        await until(() => requests === 2, 'new raw request after mode change');
        const replacementToken = state.micRequest;
        cancelled.reject(new DOMException('Late constraint failure', 'OverconstrainedError'));
        await first;
        await delay(30);
        check(requests === 2 && state.micRequest === replacementToken,
            'Cancelled raw request cannot issue a late fallback or clear a new same-mode request');
        replacement.resolve(await newMicrophone());
        await second;
        check(Boolean(state.recordingSession), 'New same-mode request still records after an old rejection');

        await reset();
        const waiting = pendingRequest();
        navigator.mediaDevices.getUserMedia = () => waiting.promise;
        await localStart('Playback precedes a cancellable permission request');
        await until(() => state.micRequest, 'pending permission');
        // Stop directly to test the same cancellation path used by O without
        // asking the fixture to create an audible/silent playback primer.
        await api.stopVoiceRecording({discard:false});
        check(!state.micRequest && !state.recordingStartPending, 'Stopping a take promptly cancels permission/request bookkeeping');
        const afterStop = fakeStream();
        waiting.resolve(afterStop);
        await until(() => afterStop.track.readyState === 'ended', 'late stopped input released');
        check(!state.micStream && !state.recordingSession, 'A stopped take cannot start recording after late permission');

        await reset();
        const mutedStream = fakeStream();
        requests = 0;
        navigator.mediaDevices.getUserMedia = async () => { requests++; return mutedStream; };
        await api.ensureMicrophoneStream();
        mutedStream.track.muted = true;
        mutedStream.track.dispatchEvent(new Event('mute'));
        await delay(40);
        mutedStream.track.muted = false;
        mutedStream.track.dispatchEvent(new Event('unmute'));
        await delay(CONFIG.MIC_MUTE_GRACE_MS + 40);
        check(state.micStream === mutedStream && state.micRetryAfter === 0,
            'A brief mute/unmute keeps the shared input without cooldown');
        deviceChange();
        check(state.micStream === mutedStream && requests === 1, 'Unrelated device changes preserve a healthy input');
        mutedStream.track.muted = true;
        mutedStream.track.dispatchEvent(new Event('mute'));
        await localStart('A muted input cannot delay playback or trigger immediate reacquisition');
        check(requests === 1 && !state.recordingSession, 'Muted input does not produce a new recording/request');
        await until(() => !state.micStream, 'persistent mute cleanup');
        check(mutedStream.track.readyState === 'ended' && state.micRetryAfter > performance.now(),
            'Persistent mute releases the failed input and enters cooldown');
        const cooldown = state.micRetryAfter;
        mutedStream.track.dispatchEvent(new Event('unmute'));
        check(state.micRetryAfter === cooldown, 'Detached track listeners cannot change the current recovery state');

        await reset();
        requests = 0;
        navigator.mediaDevices.getUserMedia = async () => { requests++; return newMicrophone(); };
        api.setRecordingEnabled(false);
        metrics.recOffPlaybackCallMs = await localStart('Rec off still permits immediate reference playback');
        check(requests === 0 && !state.micStream, 'Rec off never opens a device');
        api.setRecordingEnabled(true);
        state.overrideFound = false;
        state.entry = null;
        api.clearNativePIntent();
        const rawNativeP = pressP();
        await until(() => state.recordingSession, 'native sidecar recording');
        check(!rawNativeP.defaultPrevented, 'Native BunPro event remains unblocked during successful sidecar recording');
        await api.stopVoiceRecording({discard:true});
        for (const language of ['en','zh-CN','zh-TW','es','id','fr','ja']) {
            api.setUiLanguage(language);
            check(api.t('micRetryWaiting', {seconds:30}) !== 'micRetryWaiting'
                && api.t('micUnavailable') !== 'micUnavailable' && api.t('micRequestTimeout') !== 'micRequestTimeout',
                'Recovery messages translated: ' + language);
        }
        api.releaseRecordingResources();
        check(!state.micStreamCleanup && !state.micRequest && !state.recordingCaptureContext,
            'Teardown releases input listeners, requests and capture context');
        return {checks, metrics};
    } finally {
        window.AudioContext = RealContext;
        api.releaseRecordingResources();
        for (const request of deferred) request.reject(new DOMException('Test teardown', 'AbortError'));
        navigator.mediaDevices.getUserMedia = originalGetUserMedia;
        for (const context of contexts) if (context.state !== 'closed') await context.close();
    }
};
