// Uses a deterministic Web Audio microphone substitute, never physical hardware.
window.runRecordingGainRegression = async () => {
    const api = window.__gainTest;
    const { state } = api;
    const checks = [];
    const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    async function until(predicate, label, timeout = 4000) {
        const end = performance.now() + timeout;
        while (!predicate()) {
            if (performance.now() > end) throw new Error('Timed out: ' + label);
            await delay(20);
        }
    }
    let microphoneRequests = 0;
    const contexts = [];
    let voiceContext, oscillator, voiceGain, voiceDestination;
    async function newMicrophone() {
        voiceContext = new AudioContext(); contexts.push(voiceContext);
        await voiceContext.resume();
        oscillator = voiceContext.createOscillator();
        oscillator.frequency.value = 440;
        voiceGain = voiceContext.createGain(); voiceGain.gain.value = .02;
        voiceDestination = voiceContext.createMediaStreamDestination();
        voiceDestination.channelCount = 1;
        voiceDestination.channelCountMode = 'explicit';
        oscillator.connect(voiceGain).connect(voiceDestination);
        oscillator.start();
        return voiceDestination.stream;
    }
    navigator.mediaDevices.getUserMedia = async () => { microphoneRequests++; return newMicrophone(); };
    let speakerConnections = 0;
    let playbackPhase = false;
    const sinks = new Map();
    const originalConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination, ...args) {
        if (destination instanceof AudioDestinationNode) {
            if (!playbackPhase) speakerConnections++;
            // Let real playback/ended timing run while keeping the headless test silent.
            if (!sinks.has(this.context)) sinks.set(this.context, this.context.createMediaStreamDestination());
            return originalConnect.call(this, sinks.get(this.context), ...args);
        }
        return originalConnect.call(this, destination, ...args);
    };
    const originalPlay = HTMLMediaElement.prototype.play;
    const originalRecorderStart = MediaRecorder.prototype.start;
    const startedRecorders = new WeakSet();
    MediaRecorder.prototype.start = function (...args) {
        this.addEventListener('start', () => startedRecorders.add(this), {once: true});
        return originalRecorderStart.apply(this, args);
    };
    HTMLMediaElement.prototype.play = function (...args) {
        this.muted = true;
        return originalPlay.apply(this, args);
    };
    const decodeContext = new AudioContext(); contexts.push(decodeContext);
    async function analyze(blob) {
        if (!blob?.size) throw new Error('No recorded blob');
        const buffer = await decodeContext.decodeAudioData(await blob.arrayBuffer());
        const samples = buffer.getChannelData(0);
        const begin = Math.round(.15 * buffer.sampleRate);
        const end = samples.length - Math.round(.15 * buffer.sampleRate);
        let energy = 0, peak = 0;
        for (let i = begin; i < end; i++) { energy += samples[i] ** 2; peak = Math.max(peak, Math.abs(samples[i])); }
        return { rms: Math.sqrt(energy / Math.max(1, end - begin)), peak, duration:buffer.duration, bytes:blob.size };
    }
    async function take(gain, during = null) {
        api.setRecordingGain(gain);
        await api.restartVoiceRecording();
        const session = state.recordingSession;
        if (!session) throw new Error('Recording did not start: ' + state.refs.message.textContent);
        // Native encoders can start late when several isolated profiles are
        // running. Measure a full take after their real start event, rather
        // than treating encoder scheduling time as recorded samples.
        await until(() => startedRecorders.has(session.recorder), 'Native recorder start');
        if (during) during(session);
        await delay(800);
        const blob = await api.stopVoiceRecording({discard:false});
        check(!state.recordingSession && !state.recordingStartPending, 'Take ' + gain + 'x releases recording session');
        if (gain > 1) check(session.gainInput.stream.getTracks().every(track => track.readyState === 'ended'),
            'Take ' + gain + 'x releases processed output tracks');
        return { session, blob, metrics:await analyze(blob) };
    }
    try {
        api.ensureStateMatchesPage();
        check(api.getRecordingGain() === 1, 'Default microphone gain is 1x');
        check([...state.refs.micGainSelect.options].map(o => o.value).join(',') === '1,1.5,2,3,4', 'Five gain levels are available');
        api.setRecordingGain(99);
        check(api.getRecordingGain() === 1, 'Invalid stored gain cannot create excessive amplification');
        state.refs.micGainSelect.value = '2';
        state.refs.micGainSelect.dispatchEvent(new Event('change', {bubbles:true}));
        check(api.getRecordingGain() === 2, 'Selector saves the requested gain');
        check(api.detectPlaybackRate().rate === 1, 'Mic gain selection is not mistaken for a playback speed');
        const nativeAudio = new Audio(api.getSilentPlaybackDataUrl());
        nativeAudio.playbackRate = .75;
        check(api.detectPlaybackRate().rate === .75, 'Detached native 75% playback speed is still observed');
        nativeAudio.playbackRate = .85;
        api.setRecordingGain(1);
        const plain = await take(1);
        const sharedMic = state.micStream;
        check(plain.session.recorder.stream === sharedMic && !state.recordingCaptureContext, '1x keeps the original direct-stream recording path');
        const doubled = await take(2);
        const capture = state.recordingCaptureContext;
        const quadrupled = await take(4, session => {
            api.setRecordingGain(1);
            check(session.recordingGain === 4, 'Changing gain during a take only affects the next take');
        });
        const ratio2 = doubled.metrics.rms / plain.metrics.rms;
        const ratio4 = quadrupled.metrics.rms / plain.metrics.rms;
        check(ratio2 > 1.75 && ratio2 < 2.25, 'Quiet recorded audio is actually amplified about 2x');
        check(ratio4 > 3.5 && ratio4 < 4.5, 'Quiet recorded audio is actually amplified about 4x');
        check(api.detectPlaybackRate().rate === .85, 'Recording gain does not change native 85% playback speed');
        check(state.micStream === sharedMic && sharedMic.getTracks().every(track => track.readyState === 'live')
            && microphoneRequests === 1, 'Repeated takes reuse one live microphone without reacquiring permission');
        check(state.recordingCaptureContext === capture, 'Boosted takes reuse their AudioContext');
        check(speakerConnections === 0, 'Recording amplification has no live speaker/monitor connection');
        voiceGain.gain.value = .8;
        const loud = await take(4);
        check(loud.metrics.peak < 1.01 && loud.metrics.rms > .4, 'Soft peak guard keeps amplified loud input below full-scale after encoding');
        voiceGain.gain.value = .02;

        api.setRecordingGain(3);
        const RealRecorder = window.MediaRecorder;
        class FailingRecorder { constructor() { throw new Error('simulated recorder failure'); } }
        FailingRecorder.isTypeSupported = RealRecorder.isTypeSupported.bind(RealRecorder);
        window.MediaRecorder = FailingRecorder;
        try { await api.restartVoiceRecording(); } finally { window.MediaRecorder = RealRecorder; }
        check(!state.recordingSession && !state.recordingStartPending && state.micStream === sharedMic,
            'Encoder startup failure leaves no pending session and keeps the reusable microphone');
        await take(3);
        api.setMicProcessingMode('clean');
        check(!state.recordingCaptureContext && sharedMic.getTracks().every(track => track.readyState === 'ended'),
            'Changing mic mode releases the old capture context and microphone');
        await take(2);
        check(microphoneRequests === 2, 'Clean microphone mode can also record amplified audio');
        const lastMic = state.micStream;
        const lastTake = state.recordingBlob;
        api.setRecordingEnabled(false);
        check(state.refs.micGainSelect.disabled && !state.recordingCaptureContext && state.recordingBlob === lastTake,
            'Rec off disables gain, releases capture context and preserves the last completed take');
        check(lastMic.getTracks().every(track => track.readyState === 'ended'), 'Rec off releases the microphone');
        const beforeDisabled = microphoneRequests;
        await api.restartVoiceRecording();
        check(microphoneRequests === beforeDisabled, 'Rec off never requests the microphone');
        api.setRecordingEnabled(true);

        const normalGetUserMedia = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied by fixture', 'NotAllowedError'); };
        try { await api.restartVoiceRecording(); } finally { navigator.mediaDevices.getUserMedia = normalGetUserMedia; }
        check(!state.recordingSession && !state.recordingStartPending && !state.recordingCaptureContext,
            'Permission denial cleans up the primed gain context');
        // Explicitly retry after the newly added device-failure cooldown.
        api.setRecordingEnabled(false);
        api.setRecordingEnabled(true);
        let resolveLate;
        navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { resolveLate = resolve; });
        const pending = api.restartVoiceRecording();
        await until(() => resolveLate, 'delayed microphone request');
        api.setRecordingEnabled(false);
        const lateMic = await newMicrophone();
        resolveLate(lateMic);
        await pending;
        await until(() => lateMic.getTracks().every(track => track.readyState === 'ended'), 'late cancelled stream released');
        navigator.mediaDevices.getUserMedia = normalGetUserMedia;
        check(lateMic.getTracks().every(track => track.readyState === 'ended') && !state.recordingSession,
            'Rec off while permission is pending rejects and stops the late stream');
        api.setRecordingEnabled(true);
        api.setMicProcessingMode('raw');
        api.setRecordingGain(2);
        playbackPhase = true;
        // Drive the actual P/O handler on the Review metadata fixture. Native P
        // is passed through by the script; this fixture has no reference media.
        document.dispatchEvent(new KeyboardEvent('keydown', {key:'p',code:'KeyP',bubbles:true}));
        await until(() => state.recordingSession, 'P starts amplified recording');
        await delay(650);
        document.dispatchEvent(new KeyboardEvent('keydown', {key:'o',code:'KeyO',bubbles:true}));
        await until(() => !state.recordingSession && state.recordingBlob, 'O finalizes amplified recording');
        await until(() => state.recordingPlaybackSource || state.recordingPlaybackAudio, 'O starts recording review');
        await until(() => !state.recordingPlaybackSource && (!state.recordingPlaybackAudio || state.recordingPlaybackAudio.ended || state.recordingPlaybackAudio.paused), 'recording review naturally ends');
        document.dispatchEvent(new KeyboardEvent('keydown', {key:'p',code:'KeyP',bubbles:true}));
        await until(() => state.recordingSession, 'single P after O completion');
        check(state.recordingSession.recordingGain === 2, 'P / O / playback end / single P works with gain enabled');
        await api.stopVoiceRecording({discard:false});
        api.useLocalFixture();
        document.dispatchEvent(new KeyboardEvent('keydown', {key:'p',code:'KeyP',bubbles:true}));
        await until(() => state.recordingSession && state.audio && !state.audio.paused && !state.pPlaybackStartPending,
            'local reference and amplified recording start concurrently');
        check(state.audio.playbackRate === .85 && state.recordingSession.recordingGain === 2,
            'Actual local player starts at 85% concurrently with a 2x recording');
        await delay(650);
        document.dispatchEvent(new KeyboardEvent('keydown', {key:'o',code:'KeyO',bubbles:true}));
        await until(() => state.audio.paused && !state.recordingSession && state.recordingBlob,
            'O stops actual local reference and completes recording');
        await until(() => state.recordingPlaybackSource || state.recordingPlaybackAudio, 'local O review starts');
        await until(() => !state.recordingPlaybackSource && (!state.recordingPlaybackAudio
            || state.recordingPlaybackAudio.ended || state.recordingPlaybackAudio.paused), 'local O review ends');
        document.dispatchEvent(new KeyboardEvent('keydown', {key:'p',code:'KeyP',bubbles:true}));
        await until(() => state.recordingSession && !state.audio.paused && !state.pPlaybackStartPending,
            'one P after local O review starts both playback and recording');
        check(state.recordingSession.recordingGain === 2, 'Actual local P / O / review end / single P cycle works');
        document.dispatchEvent(new KeyboardEvent('keydown', {key:'p',code:'KeyP',bubbles:true}));
        await until(() => state.audio.paused && !state.recordingSession, 'P stops actual local playback and recording');
        check(!state.pPlaybackStartPending, 'P while reference is playing still stops normally');
        state.playerOpen = false;
        state.overrideFound = false;
        state.entry = null;
        api.releaseLocalOverrideUi();
        playbackPhase = false;

        for (const language of ['en','zh-CN','zh-TW','es','id','fr','ja']) {
            api.setUiLanguage(language);
            check(state.refs.micGainLabel.textContent !== 'micGainLabel'
                && state.refs.micGainSelect.title !== 'micGainTitle', 'Gain controls translated: ' + language);
        }
        api.setUiLanguage('zh-CN');
        api.setRecordingGain(2);
        api.renderPanel(); api.positionPanel();
        const panelBounds = state.panel.getBoundingClientRect();
        const toolbarBounds = document.querySelector('#js-tour-quiz-pam').getBoundingClientRect();
        check(panelBounds.bottom <= toolbarBounds.top, 'Additional gain selector keeps panel above native controls');
        api.releaseRecordingResources();
        check(!state.recordingCaptureContext && !state.micStream && !state.recordingSession,
            'Page teardown releases capture resources');
        return { checks, ratio2, ratio4, original:plain.metrics, amplified:quadrupled.metrics, limited:loud.metrics };
    } finally {
        api.releaseRecordingResources();
        AudioNode.prototype.connect = originalConnect;
        HTMLMediaElement.prototype.play = originalPlay;
        MediaRecorder.prototype.start = originalRecorderStart;
        for (const sink of sinks.values()) sink.stream.getTracks().forEach(track => track.stop());
        for (const context of contexts) if (context.state !== 'closed') await context.close();
    }
};
