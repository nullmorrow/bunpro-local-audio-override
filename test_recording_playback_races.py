"""Recording replay ownership checks in isolated profiles, without real audio.

Delayed playback/recorder promises are injected to make superseded O operations
finish after a newer replay. These checks do not claim audible playback coverage.
"""

import argparse
import hashlib
import json
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.firefox.service import Service as FirefoxService


CHECKS = r"""
const done = arguments[0];
(async () => {
    const api = window.__replayRaceTest;
    const state = api.state;
    const checks = [];
    const check = (condition, message) => checks.push({ok: Boolean(condition), message});
    const fakeAudio = (play) => ({
        pauseCount: 0, removed: false,
        play, pause() { this.pauseCount += 1; },
        load() {}, removeAttribute() {}, addEventListener() {},
        remove() { this.removed = true; },
    });
    const blob = new Blob(['fixture'], {type: 'audio/webm'});

    let resolvePlay;
    const oldAudio = fakeAudio(() => new Promise(resolve => { resolvePlay = resolve; }));
    const newAudio = fakeAudio(() => Promise.resolve());
    const firstGeneration = ++state.recordingPlaybackGeneration;
    const oldPlay = api.playRecordingWithAudioElement(blob, oldAudio, firstGeneration);
    check(typeof resolvePlay === 'function', 'Delayed playback entered the original audio.play boundary');
    state.recordingPlaybackGeneration += 1;
    state.recordingPlaybackAudio = newAudio;
    resolvePlay();
    await oldPlay;
    check(state.recordingPlaybackAudio === newAudio && newAudio.pauseCount === 0,
        'A superseded audio.play completion cannot stop a newer O replay');
    check(oldAudio.removed, 'Superseded audio element is released');
    api.stopRecordedAudioPlayback();

    let resolveStop;
    const stopPromise = new Promise(resolve => { resolveStop = resolve; });
    const session = {recorder: {state: 'inactive'}, settled: false, stopTimer: 0, stopPromise};
    state.recordingSession = session;
    const primedAudio = fakeAudio(() => Promise.resolve());
    state.recordingPlaybackAudio = primedAudio;
    const oldReview = api.stopAndPlayLatestRecording(null, primedAudio);
    check(session.stopTimer !== 0, 'Delayed recording stop entered the original settle boundary');
    state.recordingPlaybackGeneration += 1;
    const latestAudio = fakeAudio(() => Promise.resolve());
    state.recordingPlaybackAudio = latestAudio;
    clearTimeout(session.stopTimer);
    session.stopTimer = 0;
    state.recordingSession = null;
    resolveStop(blob);
    await oldReview;
    check(state.recordingPlaybackAudio === latestAudio && latestAudio.pauseCount === 0,
        'A superseded recording-stop completion cannot stop a newer O replay');
    check(primedAudio.removed, 'Superseded primed audio element is released');
    api.stopRecordedAudioPlayback();

    const failedSource = {
        disconnected: false, connect() {}, stop() {},
        disconnect() { this.disconnected = true; },
        start() { throw new Error('Fixture source startup failure'); },
    };
    const failedContext = {
        state: 'running', decodeAudioData: async () => ({}),
        createBufferSource: () => failedSource, destination: {},
    };
    const played = await api.playRecordingWithAudioContext(blob, failedContext, state.recordingPlaybackGeneration);
    check(!played && failedSource.disconnected && !state.recordingPlaybackSource,
        'Failed Web Audio source startup releases its own node and state');

    let rejectResume;
    const staleContext = {state: 'suspended', resume: () => new Promise((_, reject) => { rejectResume = reject; })};
    const staleFallback = api.playRecordingWithAudioContext(blob, staleContext, state.recordingPlaybackGeneration);
    state.recordingPlaybackGeneration += 1;
    state.recordingPlaybackLastError = 'Latest replay error';
    rejectResume(new Error('Stale replay error'));
    check(await staleFallback, 'Superseded Web Audio failure does not request another playback fallback');
    check(state.recordingPlaybackLastError === 'Latest replay error',
        'Superseded Web Audio failure cannot overwrite the latest replay status');
    api.releaseRecordingResources();
    return {ok: checks.every(check => check.ok), checks, checkCount: checks.length};
})().then(done, error => done({ok: false, error: error.stack || String(error)}));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('browser', choices=['firefox', 'chrome'])
    parser.add_argument('--driver')
    parser.add_argument('--edition', choices=['browser'], default='browser')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    variants = {
        'browser': 'bunpro_local_audio_override.user.js',
    }
    all_ok = True
    for edition, filename in variants.items():
        if args.edition not in ('both', edition):
            continue
        if args.browser == 'firefox':
            options = webdriver.FirefoxOptions()
            options.add_argument('-headless')
            driver = webdriver.Firefox(options=options, service=FirefoxService(args.driver) if args.driver else FirefoxService())
        else:
            options = webdriver.ChromeOptions()
            options.add_argument('--headless=new')
            driver = webdriver.Chrome(options=options, service=ChromeService(args.driver) if args.driver else ChromeService())
        try:
            driver.get((root / 'tests/recording_gain_fixture.html').as_uri())
            driver.execute_script('''
                window.GM_getValue = (key, fallback) => fallback;
                window.GM_setValue = () => {};
                window.GM_addStyle = () => {};
                window.GM_xmlhttpRequest = () => ({abort() {}});
                navigator.mediaDevices.getUserMedia = async () => { throw new Error('No real microphone in this test'); };
            ''')
            source = (root / filename).read_bytes()
            script = source.decode('utf-8')
            assert script.count('    installObserver();') == 1
            script = script.replace('    installObserver();', '''
                window.__replayRaceTest = {state, playRecordingWithAudioElement, playRecordingWithAudioContext,
                    stopAndPlayLatestRecording, stopRecordedAudioPlayback, releaseRecordingResources};
            ''').replace('    void syncServerLanguage();', '')
            driver.execute_script(script)
            driver.set_script_timeout(15)
            result = driver.execute_async_script(CHECKS)
            print(json.dumps({
                'browser': args.browser, 'browserVersion': driver.capabilities.get('browserVersion'),
                'edition': edition, 'source': filename, 'sha256': hashlib.sha256(source).hexdigest(), **result,
            }), flush=True)
            all_ok = all_ok and result['ok']
        finally:
            driver.quit()
    if not all_ok:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
