"""Native media regression in isolated Firefox/Chrome profiles; no real microphone.

python -B test_recording_gain.py firefox
python -B test_recording_gain.py chrome --driver PATH_TO_CHROMEDRIVER
"""
import argparse
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
    parser.add_argument('--screenshot-dir')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    variants = {'browser': 'bunpro_local_audio_override.user.js'}
    for edition, filename in variants.items():
        if args.edition not in ('both', edition):
            continue
        if args.browser == 'firefox':
            options = webdriver.FirefoxOptions(); options.add_argument('-headless')
            driver = webdriver.Firefox(options=options, service=FirefoxService(args.driver) if args.driver else FirefoxService())
        else:
            options = webdriver.ChromeOptions(); options.add_argument('--headless=new')
            driver = webdriver.Chrome(options=options, service=ChromeService(args.driver) if args.driver else ChromeService())
        try:
            driver.get((root / 'tests/recording_gain_fixture.html').as_uri())
            driver.set_window_size(1300, 900)
            driver.execute_script('''
                window.GM_getValue = (key, fallback) => JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
                window.GM_setValue = (key, value) => localStorage.setItem(key, JSON.stringify(value));
                window.GM_addStyle = css => { const style = document.createElement('style'); style.textContent = css; document.head.append(style); };
                window.GM_xmlhttpRequest = options => { queueMicrotask(() => options.onload?.({status:200, responseText:JSON.stringify({ok:true,found:false,language:'en'})})); return {abort(){}}; };
            ''')
            script = (root / filename).read_text(encoding='utf-8')
            assert script.count('    installObserver();') == 1
            script = script.replace('    installObserver();', '''
                window.__gainTest = {state, CONFIG, getRecordingGain, setRecordingGain,
                    restartVoiceRecording, stopVoiceRecording, releaseRecordingResources,
                    setMicProcessingMode, setRecordingEnabled, setUiLanguage, renderPanel,
                    ensureStateMatchesPage, positionPanel, detectPlaybackRate, getSilentPlaybackDataUrl,
                    releaseLocalOverrideUi,
                    useLocalFixture: () => {
                        clearNativePIntent();
                        ensureLookupStarted = () => {};
                        prepareLocalAudioElement = async () => getSilentPlaybackDataUrl();
                        ensureAudioElement().loop = true;
                        state.lookupStatus = 'ready'; state.overrideFound = true;
                        state.entry = {filename:'silent-reference.wav', size:1644};
                    }};
            ''').replace('    void syncServerLanguage();', '')
            driver.execute_script(script)
            driver.execute_script((root / 'tests/recording_gain_regression.js').read_text(encoding='utf-8'))
            driver.execute_script('''document.querySelector('#run').onclick = () => {
                runRecordingGainRegression().then(result => window.gainResult = {ok:true,...result})
                    .catch(error => window.gainResult = {ok:false,error:String(error) + '\\n' + (error.stack || '')});
            };''')
            driver.find_element(By.ID, 'run').click()
            result = WebDriverWait(driver, 55).until(lambda d: d.execute_script('return window.gainResult || null'))
            if result.get('ok'):
                # Reload the same isolated origin/profile to verify real preference persistence.
                if args.screenshot_dir:
                    target = Path(args.screenshot_dir)
                    target.mkdir(parents=True, exist_ok=True)
                    driver.save_screenshot(str(target / f'gain-{args.browser}-{edition}.png'))
                gain_key = 'bpLocalAudioServerlessRecordingGain'
                driver.refresh()
                assert driver.execute_script('return JSON.parse(localStorage.getItem(arguments[0]))', gain_key) == 2
                result['checks'].append('Gain preference survives a page reload')
            print(json.dumps({'browser':args.browser,'version':driver.capabilities.get('browserVersion'), 'edition':edition,
                'checkCount':len(result.get('checks', [])), **result}, ensure_ascii=False), flush=True)
            assert result['ok'], result.get('error')
        finally:
            driver.quit()


if __name__ == '__main__':
    main()
