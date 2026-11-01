"""P/O routing characterization with real DOM events and isolated browser profiles.

Playback and recording boundaries are doubled; no physical microphone is used.
"""
import argparse
import hashlib
import json
from pathlib import Path
import time

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By


INJECTION = """
    const testApi = {state, lookupCache, openAudioDb, dbPut, dbGet, setLookupResult,
        ensureAudioElement, ensureStateMatchesPage, resetForSentence, handleDelete,
        markNativePIntent, clearNativePIntent, clearNativePClickPassthrough,
        isNativePIntentActive, isPageMediaPlaying, isNativeBunproAudioPlaying,
        syncAnswerAudioControl, updateLocalPlayerControls, syncLocalOverrideUi,
        releaseLocalOverrideUi, releaseObjectUrl, releaseRecordingResources,
        setRecordingEnabled, setRecordingGain, cancelRecordedAudioPlayback,
        timings: {grace: NATIVE_P_INTENT_GRACE_MS, ended: NATIVE_P_ENDED_GUARD_MS,
            stop: NATIVE_P_STOP_GUARD_MS, click: NATIVE_P_CLICK_PASSTHROUGH_MS},
        recordingStarts: 0, recordingStops: 0, recordingActive: false};
    // These seams observe routing decisions without device permissions or encoding.
    restartVoiceRecording = async () => {
        testApi.recordingStarts += 1;
        testApi.recordingActive = true;
    };
    stopVoiceRecording = async () => {
        testApi.recordingStops += 1;
        testApi.recordingActive = false;
        return null;
    };
    const originalPrepare = prepareLocalAudioElement;
    prepareLocalAudioElement = async (...args) => {
        const result = await originalPrepare(...args);
        if (testApi.holdPreparation) await testApi.holdPreparation;
        return result;
    };
    window.__hotkeyTest = testApi;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('browser', choices=['firefox', 'chrome'])
    parser.add_argument('--driver')
    parser.add_argument('--script', default='bunpro_local_audio_override.user.js')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    source = (root / args.script).read_bytes()
    script = source.decode('utf-8')
    assert script.count('    installObserver();') == 1
    for name, shipped, shortened in (
        ('INTENT_GRACE', 2000, 400), ('ENDED_GUARD', 150, 80),
        ('STOP_GUARD', 500, 300), ('CLICK_PASSTHROUGH', 250, 120),
    ):
        declaration = f'const NATIVE_P_{name}_MS = {shipped};'
        assert script.count(declaration) == 1, declaration
        script = script.replace(declaration, f'const NATIVE_P_{name}_MS = {shortened};')
    script = script.replace('    installObserver();', INJECTION)
    if args.browser == 'firefox':
        options = webdriver.FirefoxOptions()
        options.add_argument('-headless')
        driver = webdriver.Firefox(options=options, service=FirefoxService(args.driver) if args.driver else FirefoxService())
    else:
        options = webdriver.ChromeOptions()
        options.add_argument('--headless=new')
        driver = webdriver.Chrome(options=options, service=ChromeService(args.driver) if args.driver else ChromeService())
    started = time.perf_counter()
    try:
        driver.set_script_timeout(45)
        driver.get((root / 'tests/hotkey_fixture.html').as_uri())
        driver.set_window_size(1300, 900)
        driver.execute_script(script)
        driver.execute_script((root / 'tests/hotkey_regression.js').read_text(encoding='utf-8'))
        result = driver.execute_async_script("""
            const done = arguments[0];
            runHotkeyRegression().then(done, error => done({ok: false,
                error: String(error) + '\\n' + (error.stack || ''),
                completedChecks: window.hotkeyChecks}));
        """)
        if result['ok']:
            # WebDriver produces a trusted keydown; dispatchEvent cannot do that.
            driver.execute_script('prepareTrustedNativeP();')
            driver.find_element(By.TAG_NAME, 'body').send_keys('p')
            trusted = driver.execute_script('return finishTrustedNativeP();')
            result['checks'].extend(trusted['checks'])
            result['ok'] = trusted['ok']
        print(json.dumps({'browser': args.browser, 'version': driver.capabilities.get('browserVersion'),
                          'sourceSha256': hashlib.sha256(source).hexdigest(),
                          'seconds': round(time.perf_counter() - started, 2),
                          'checkCount': len(result.get('checks', [])), **result},
                         ensure_ascii=False, indent=2), flush=True)
        assert result['ok'], result.get('error', result)
    finally:
        try:
            driver.execute_script('if (window.cleanupHotkeyTest) cleanupHotkeyTest();')
        finally:
            driver.quit()


if __name__ == '__main__':
    main()
