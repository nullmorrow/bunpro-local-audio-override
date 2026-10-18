"""Panel focus, native hotkeys, translations and layout in fresh headless profiles.

Generated Web Audio feeds the real MediaRecorder; no physical microphone is used.
"""
import argparse
import json
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


INJECTION = """
    window.__panelTest = {state, CONFIG, t, setUiLanguage, setPanelMessage, clearPanelMessage,
        renderMessage, translatedError, setUiBusy, renderPanel, ensureStateMatchesPage,
        isEditableTarget, setRecordingEnabled, stopVoiceRecording, cancelRecordedAudioPlayback,
        releaseRecordingResources, releaseLocalOverrideUi, openAudioDb, handleExport,
        setLookupResult, showRecordingStatus, positionPanel, detectPlaybackRate, rateToPercent};
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('browser', choices=['firefox', 'chrome'])
    parser.add_argument('--driver')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    if args.browser == 'firefox':
        options = webdriver.FirefoxOptions()
        options.add_argument('-headless')
        driver = webdriver.Firefox(options=options, service=FirefoxService(args.driver) if args.driver else FirefoxService())
    else:
        options = webdriver.ChromeOptions()
        options.add_argument('--headless=new')
        driver = webdriver.Chrome(options=options, service=ChromeService(args.driver) if args.driver else ChromeService())
    try:
        driver.get((root / 'tests/lookup_fixture.html').as_uri())
        driver.set_window_size(1300, 900)
        driver.execute_script("document.querySelector('.text-center').textContent = 'panel test sentence';")
        script = (root / 'bunpro_local_audio_override.user.js').read_text(encoding='utf-8')
        assert script.count('    installObserver();') == 1
        assert script.count('RECORDING_MAX_DURATION_MS: 120000,') == 1
        script = script.replace('    installObserver();', INJECTION)
        script = script.replace('RECORDING_MAX_DURATION_MS: 120000,', 'RECORDING_MAX_DURATION_MS: 1500,')
        driver.execute_script(script)
        driver.execute_script((root / 'tests/panel_regression.js').read_text(encoding='utf-8'))
        driver.execute_script('''document.querySelector('#run').onclick = () => {
            runPanelRegression().then(result => window.testResult = {ok: true, ...result})
                .catch(error => window.testResult = {ok: false,
                    error: String(error) + '\\n' + (error.stack || '')});
        };''')
        driver.find_element(By.ID, 'run').click()
        result = WebDriverWait(driver, 60).until(lambda d: d.execute_script('return window.testResult || null'))
        if result['ok']:
            result['layoutMeasurements'] = []
            for width in (1300, 800):
                driver.set_window_size(width, 900)
                # WebDriver sizes the outer window; Firefox may reserve side borders.
                difference = width - driver.execute_script('return window.innerWidth')
                if difference:
                    driver.set_window_size(width + difference, 900)
                layout = driver.execute_script('return runPanelLayoutRegression(arguments[0])', width)
                result['checks'].extend(layout['checks'])
                result['layoutMeasurements'].extend(layout['measurements'])
        print(json.dumps({'browser': args.browser, 'version': driver.capabilities.get('browserVersion'),
                          'checkCount': len(result.get('checks', [])), **result}, ensure_ascii=False, indent=2), flush=True)
        assert result['ok'], result.get('error')
    finally:
        driver.quit()


if __name__ == '__main__':
    main()
