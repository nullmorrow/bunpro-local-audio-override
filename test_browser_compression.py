"""Isolated Firefox/Chrome regression. Requires Selenium; never uses a live profile.

Run: python test_browser_compression.py firefox
     python test_browser_compression.py chrome --driver PATH_TO_CHROMEDRIVER
"""
import argparse
import json
import base64
import hashlib
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


def validate_native_opus_backup(text):
    payload = json.loads(text)
    assert payload['format'] == 'bunpro-local-audio-override', 'Unexpected backup format'
    assert payload['formatVersion'] == 1, 'Unexpected backup version'
    entries = payload['entries']
    assert isinstance(entries, list) and entries, 'Backup has no audio entries'
    assert payload['entryCount'] == len(entries), 'Backup entry count does not match'
    for entry in entries:
        raw = base64.b64decode(entry['dataBase64'], validate=True)
        assert hashlib.sha256(raw).hexdigest() == entry['sha256'], 'Backup checksum does not match audio bytes'
        assert raw.startswith((b'OggS', b'\x1a\x45\xdf\xa3')), 'Expected native Ogg or WebM audio container'


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
        driver.get((root / 'tests/compression_fixture.html').as_uri())
        driver.set_window_size(1300, 900)
        script = (root / args.script).read_text(encoding='utf-8')
        assert script.count('    installObserver();') == 1
        # Disable only automatic page observation, then expose private functions in
        # this test-only copy. The distributed userscript has no such test API.
        script = script.replace('    installObserver();', '''
            window.__compressionTest = {state, CONFIG, dbPut, dbGet, dbClear, sha256Hex,
                handleCompressAudio, createPanel, renderPanel, serializeBackupEntry,
                parseBackupFile, dbReplaceCompressed, setRecordingEnabled, setUiLanguage,
                ensurePanelPlacement, positionPanel, showRecordingError, showRecordingStatus, renderMessage,
                isAutoCompressionEnabled, setAutoCompressionEnabled, saveOverride, handleImport,
                dbPutMany, handleSave};
        ''')
        driver.execute_script(script)
        driver.execute_script((root / 'tests/compression_regression.js').read_text(encoding='utf-8'))
        driver.execute_script('''document.querySelector('#run').onclick = () => {
            runCompressionRegression().then(result => window.testResult = {ok:true, ...result})
                .catch(error => window.testResult = {ok:false, error:error.stack || String(error)});
        };''')
        driver.find_element(By.ID, 'run').click()
        result = WebDriverWait(driver, 60).until(lambda d: d.execute_script('return window.testResult || null'))
        if result.get('ok'):
            validate_native_opus_backup(driver.execute_script('return window.compressedBackupForMigration'))
            result['checks'].append('Native Opus backup has valid v1 format, SHA-256 checksums and Ogg/WebM containers')
        print(json.dumps({'browser':args.browser, 'version':driver.capabilities.get('browserVersion'), **result}, ensure_ascii=False, indent=2))
        assert result['ok'], result.get('error')
    finally:
        driver.quit()


if __name__ == '__main__':
    main()
