"""Pure reading helpers in fresh headless profiles, using recorded engine kana."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


INJECTION = """
    window.__voicevoxTest = {extractVoicevoxReading, splitReadingMoras,
        canonicalizeReadingMoras, parseVoicevoxKana, alignVoicevoxReading,
        buildVoicevoxText, buildVoicevoxKana, state, t, handleVoicevox, cancelVoicevox,
        ensureStateMatchesPage, handleSave, handleTest, renderPanel, markNativePIntent, isNativePRoute, validateVoicevoxUrl, getSetting, setSetting, STORAGE_KEYS,
        getVoicevoxSpeed, resetForSentence, getRecentVoicevoxVoices, rememberVoicevoxVoice,
        shortVoicevoxLabel, ensureLocalPlayerWrapper, releaseLocalPlayerWrapper, positionPanel,
        close: async () => { cancelVoicevox(false); releaseRecordingResources();
            releaseLocalOverrideUi(); releaseObjectUrl(); releasePreviewObjectUrl();
            if (state.dbPromise) (await state.dbPromise).close(); }};
"""


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('browser', choices=['firefox', 'chrome'])
    parser.add_argument('--driver')
    parser.add_argument('--script', default='bunpro_local_audio_override.user.js')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    source = (root / args.script).read_bytes()
    script = source.decode('utf-8')
    assert script.count('    installObserver();') == 1
    script = script.replace('    installObserver();', INJECTION)
    script = script.replace('VOICEVOX_QUERY_TIMEOUT_MS: 15000,', 'VOICEVOX_QUERY_TIMEOUT_MS: 150,')
    cases = json.loads((root / 'tests/fixtures/voicevox/reading_cases.json').read_text(encoding='utf-8'))
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
        driver.set_script_timeout(60)
        driver.get((root / 'tests/voicevox_fixture.html').as_uri())
        driver.execute_script(script)
        driver.execute_script((root / 'tests/voicevox_regression.js').read_text(encoding='utf-8'))
        driver.execute_script('''const fixtures = arguments[0];
            document.querySelector('#run').onclick = () => {
                runVoicevoxRegression(fixtures).then(result => window.testResult = result);
            };''', cases)
        driver.find_element(By.ID, 'run').click()
        result = WebDriverWait(driver, 60).until(lambda d: d.execute_script('return window.testResult || null'))
        print(json.dumps({'browser': args.browser, 'version': driver.capabilities.get('browserVersion'),
                          'sourceSha256': hashlib.sha256(source).hexdigest(),
                          'seconds': round(time.perf_counter() - started, 2),
                          'caseCount': len(cases['cases']), 'checkCount': len(result['checks']),
                          **result}, ensure_ascii=False, indent=2), flush=True)
        assert result['ok'], result.get('error', result)
    finally:
        try:
            driver.execute_async_script("""
                const done = arguments[0];
                Promise.resolve(window.__voicevoxTest?.close()).then(() => done(), () => done());
            """)
        finally:
            driver.quit()


if __name__ == '__main__':
    main()
