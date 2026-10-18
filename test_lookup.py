"""Immediate-P/cache regressions in fresh headless profiles on synthetic markup.

Only the userscript's own audio playback is doubled; native key routing is real.
"""
import argparse
import json
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


SEED = """
const done = arguments[0];
const request = indexedDB.open('BunProLocalAudioOverrideCommunity', 1);
request.onupgradeneeded = () => request.result.createObjectStore('audioOverrides', {keyPath: 'sentenceKey'});
request.onerror = () => done({error: String(request.error)});
request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction('audioOverrides', 'readwrite');
    const store = tx.objectStore('audioOverrides');
    store.clear();
    store.put({sentenceKey: 'storedsentence', file_name: 'seed.wav',
        blob: new Blob(['synthetic clip'], {type: 'audio/wav'})});
    store.put({sentenceKey: 'missingblob', blob: null});
    tx.oncomplete = () => { db.close(); done({ok: true}); };
    tx.onabort = () => { db.close(); done({error: String(tx.error)}); };
};
"""

INJECTION = """
    const testApi = {state, CONFIG, lookupCache, openAudioDb, dbGet, dbPut, dbDelete,
        preloadLookupCache, invalidateLookupAfterDatabaseChange, handleSave, handleDelete,
        ensureAudioElement, ensureStateMatchesPage, resetForSentence, setRecordingEnabled,
        setLookupResult, releaseObjectUrl, releaseLocalOverrideUi, Blob, File, URL};
    testApi.preloads = [];
    const originalPreload = preloadLookupCache;
    preloadLookupCache = () => {
        const promise = originalPreload();
        testApi.preloads.push(promise);
        return promise;
    };
    testApi.preloadLookupCache = preloadLookupCache;
    const originalGetAll = dbGetAll;
    dbGetAll = async () => {
        if (testApi.failNextRead) {
            testApi.failNextRead = false;
            throw new Error('Synthetic preload read failure');
        }
        const hold = testApi.holdNextRead;
        testApi.holdNextRead = null;
        const entries = await originalGetAll();
        if (hold) {
            hold.ready(entries);
            await hold.promise;
        }
        return entries;
    };
    window.__lookupTest = testApi;
"""


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
        script = (root / args.script).read_text(encoding='utf-8')
        assert script.count('    installObserver();') == 1
        startup = 'openAudioDb().then(() => preloadLookupCache())'
        assert script.count(startup) == 1
        results = []
        for negative in (False, True):
            driver.get((root / 'tests/lookup_fixture.html').as_uri())
            driver.set_window_size(1300, 900)
            seeded = driver.execute_async_script(SEED)
            assert seeded.get('ok'), seeded
            injected = script.replace('    installObserver();', INJECTION)
            if negative:
                injected = injected.replace(startup, 'openAudioDb()')
            driver.execute_script(injected)
            driver.execute_script((root / 'tests/lookup_regression.js').read_text(encoding='utf-8'))
            driver.execute_script('''document.querySelector('#run').onclick = () => {
                runLookupRegression(arguments[0]).then(result => window.testResult = {ok:true, ...result})
                    .catch(error => window.testResult = {ok:false,
                        error: String(error) + '\\n' + (error.stack || ''),
                        state: {sentence: __lookupTest.state.normalizedSentence,
                            eligible: __lookupTest.state.eligible, status: __lookupTest.state.lookupStatus,
                            owner: __lookupTest.state.pRouteOwner}});
            };''', negative)
            driver.find_element(By.ID, 'run').click()
            result = WebDriverWait(driver, 60).until(lambda d: d.execute_script('return window.testResult || null'))
            results.append({'negativeControl': negative, **result})
            if not result['ok']:
                print(json.dumps({'browser': args.browser, 'version': driver.capabilities.get('browserVersion'),
                                  **result}, ensure_ascii=False, indent=2))
            assert result['ok'], result.get('error')
        print(json.dumps({'browser': args.browser, 'version': driver.capabilities.get('browserVersion'),
                          'ok': True, 'results': results,
                          'checkCount': sum(len(result['checks']) for result in results)}, ensure_ascii=False, indent=2))
    finally:
        driver.quit()


if __name__ == '__main__':
    main()
