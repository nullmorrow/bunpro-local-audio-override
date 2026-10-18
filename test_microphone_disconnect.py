"""Check microphone-disconnect recovery in isolated browser profiles.

This repository runner tests the current browser edition.
It never requests a physical microphone or uses the real BunPro account/library.
Reference playback is a timestamp probe: results measure the script's call to
playback, not audible output or Windows/USB device-switch latency.

python -B test_microphone_disconnect.py firefox
python -B test_microphone_disconnect.py chrome --driver PATH_TO_CHROMEDRIVER
"""
import argparse
import hashlib
import json
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('browser', choices=['firefox', 'chrome'])
    parser.add_argument('--driver')
    parser.add_argument('--edition', choices=['browser'], default='browser')
    parser.add_argument('--fixed', action='store_true', help='Compatibility flag; this runner always tests the current recovery fix')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    variants = {
        'browser': 'bunpro_local_audio_override.user.js',
    }
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
            service = ChromeService(args.driver) if args.driver else ChromeService()
            driver = webdriver.Chrome(options=options, service=service)
        try:
            driver.get((root / 'tests/recording_gain_fixture.html').as_uri())
            driver.set_window_size(1300, 900)
            driver.execute_script('''
                window.GM_getValue = (key, fallback) => JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
                window.GM_setValue = (key, value) => localStorage.setItem(key, JSON.stringify(value));
                window.GM_addStyle = css => { const style = document.createElement('style'); style.textContent = css; document.head.append(style); };
                window.GM_xmlhttpRequest = options => { queueMicrotask(() => options.onload?.({status:200, responseText:JSON.stringify({ok:true,found:false,language:'en'})})); return {abort(){}}; };
                // Install before the userscript: even an unexpected request must
                // never reach the real microphone during this diagnostic.
                navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('No fixture microphone', 'NotFoundError'); };
            ''')
            source = (root / filename).read_bytes()
            script = source.decode('utf-8')
            assert script.count('    installObserver();') == 1
            script = script.replace('    installObserver();', '''
                // Test-only boundaries; leave P, recording startup, cancellation,
                // stream ownership and gain-resume logic unchanged.
                ensureLookupStarted = () => {};
                prepareLocalAudioElement = async () => 'diagnostic-reference-audio';
                window.__disconnectPlaybackCalls = [];
                playObjectUrl = async () => { window.__disconnectPlaybackCalls.push(performance.now()); return true; };
                window.__disconnectTest = {state, setRecordingGain, setRecordingEnabled,
                    ensureStateMatchesPage, releaseRecordingResources,
                    releaseMicrophoneStream, isMicStreamUsable, clearNativePIntent,
                    CONFIG, ensureMicrophoneStream, restartVoiceRecording, stopVoiceRecording,
                    setMicProcessingMode, setUiLanguage, t};
            ''').replace('    void syncServerLanguage();', '')
            driver.execute_script(script)
            test_file = 'microphone_recovery_regression.js'
            driver.execute_script((root / 'tests' / test_file).read_text(encoding='utf-8'))
            driver.execute_script('window.runMicrophoneDisconnectDiagnostic = window.runMicrophoneRecoveryRegression;')
            driver.execute_script('''document.querySelector('#run').onclick = () => {
                runMicrophoneDisconnectDiagnostic().then(result => window.disconnectResult = {ok:true,...result})
                    .catch(error => window.disconnectResult = {ok:false,error:String(error) + '\\n' + (error.stack || '')});
            };''')
            driver.find_element(By.ID, 'run').click()
            result = WebDriverWait(driver, 75).until(lambda d: d.execute_script('return window.disconnectResult || null'))
            print(json.dumps({
                'browser': args.browser, 'browserVersion': driver.capabilities.get('browserVersion'),
                'edition': edition, 'source': filename, 'sha256': hashlib.sha256(source).hexdigest(),
                'checkCount': len(result.get('checks', [])), **result,
            }, ensure_ascii=False), flush=True)
            assert result['ok'], result.get('error')
        finally:
            driver.quit()


if __name__ == '__main__':
    main()
