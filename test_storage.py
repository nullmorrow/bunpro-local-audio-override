"""Isolated backup/storage regression in fresh headless Firefox/Chrome profiles.

Run: python -B test_storage.py firefox
     python -B test_storage.py chrome --driver PATH_TO_CHROMEDRIVER
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


def validate_backup(text):
    payload = json.loads(text)
    assert payload['format'] == 'bunpro-local-audio-override', 'Unexpected backup format'
    assert payload['formatVersion'] == 1, 'Unexpected backup version'
    entries = payload['entries']
    assert isinstance(entries, list) and len(entries) == 4, 'Expected four valid entries'
    assert payload['entryCount'] == len(entries), 'Backup entry count does not match'
    for entry in entries:
        raw = base64.b64decode(entry['dataBase64'], validate=True)
        assert len(raw) == entry['size'], 'Backup size does not match audio bytes'
        assert hashlib.sha256(raw).hexdigest() == entry['sha256'], 'Backup checksum does not match audio bytes'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('browser', choices=['firefox', 'chrome'])
    parser.add_argument('--driver')
    parser.add_argument('--script', default='bunpro_local_audio_override.user.js')
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
        driver.get((root / 'tests/storage_fixture.html').as_uri())
        driver.set_window_size(1300, 900)
        script = (root / args.script).read_text(encoding='utf-8')
        assert script.count('    installObserver();') == 1
        # Only the injected copy exposes internals and disables automatic observation.
        assert script.count('DB_BLOCKED_TIMEOUT_MS: 10000,') == 1
        script = script.replace('DB_BLOCKED_TIMEOUT_MS: 10000,', 'DB_BLOCKED_TIMEOUT_MS: 100,')
        script = script.replace('    installObserver();', '''
            window.__storageTest = {state, CONFIG, openAudioDb, dbGet, dbPut, dbGetAll, dbClear, sha256Hex,
                serializeBackupEntry, parseBackupFile, handleExport, createPanel, renderPanel,
                setRecordingEnabled, setUiLanguage, t, formatBytes, JSON, IDBFactory, indexedDB};
        ''')
        driver.execute_script(script)
        driver.execute_script((root / 'tests/storage_regression.js').read_text(encoding='utf-8'))
        driver.execute_script('''document.querySelector('#run').onclick = () => {
            runStorageRegression().then(result => window.testResult = {ok:true, ...result})
                .catch(error => window.testResult = {ok:false,
                    error:String(error) + '\\n' + (error.stack || '')});
        };''')
        driver.find_element(By.ID, 'run').click()
        result = WebDriverWait(driver, 60).until(lambda d: d.execute_script('return window.testResult || null'))
        if result.get('ok'):
            validate_backup(driver.execute_script('return window.storageBackupForValidation'))
            result['checks'].append('Python independently validates v1 JSON, entry count, Base64 sizes and SHA-256 checksums')
        print(json.dumps({'browser': args.browser, 'version': driver.capabilities.get('browserVersion'),
                          **result}, ensure_ascii=False, indent=2))
        assert result['ok'], result.get('error')
    finally:
        driver.quit()


if __name__ == '__main__':
    main()
