"""Run lint, syntax checks and isolated browser regressions from this repository."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


# Each entry is (name, Python arguments, per-browser, requires browser script).
TESTS = [
    ('microphone', ('test_microphone_disconnect.py', '--fixed'), True, False),
    ('gain', ('test_recording_gain.py',), True, False),
    ('races', ('test_recording_playback_races.py',), True, False),
    ('compression', ('test_browser_compression.py',), True, False),
    ('storage', ('test_storage.py',), True, False),
    ('lookup', ('test_lookup.py',), True, False),
    ('hotkeys', ('test_hotkeys.py',), True, False),
    ('voicevox', ('test_voicevox.py',), True, False),
    ('panel', ('test_panel.py',), True, False),
]
USER_SCRIPT = 'bunpro_local_audio_override.user.js'


def run_check(name, browser, command, root, results):
    print(f'\nRunning {name} [{browser}]', flush=True)
    started = time.perf_counter()
    try:
        completed = subprocess.run(command, cwd=root, check=False)
        code = completed.returncode
    except OSError as error:
        print(f'{name}: {error}', file=sys.stderr, flush=True)
        code = 1
    seconds = time.perf_counter() - started
    results.append((name, browser, 'passed' if code == 0 else f'failed ({code})', seconds))
    if code and browser != '-':
        print('Check Selenium and the browser installation. Configure a matching driver with '
              '--geckodriver/--chromedriver or BUNPRO_GECKODRIVER/BUNPRO_CHROMEDRIVER.',
              file=sys.stderr, flush=True)


def print_summary(results):
    print('\nSummary', flush=True)
    rows = [('Name', 'Browser', 'Result', 'Seconds')]
    rows.extend((name, browser, result, f'{seconds:.2f}')
                for name, browser, result, seconds in results)
    widths = [max(len(row[index]) for row in rows) for index in range(4)]
    for row in rows:
        print('  '.join(value.ljust(width) for value, width in zip(row, widths)), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browsers', default='firefox,chrome', help='Comma-separated firefox,chrome (default: both)')
    parser.add_argument('--geckodriver', default=os.environ.get('BUNPRO_GECKODRIVER'))
    parser.add_argument('--chromedriver', default=os.environ.get('BUNPRO_CHROMEDRIVER'))
    parser.add_argument('--skip-lint', action='store_true')
    parser.add_argument('--tests', nargs='+', choices=[test[0] for test in TESTS],
                        help='Run only these browser regressions (default: all)')
    parser.add_argument('--browser-script', default=os.environ.get('BUNPRO_BROWSER_SCRIPT'),
                        help='Browser userscript for optional cross-edition tests')
    args = parser.parse_args()
    browsers = list(dict.fromkeys(value.strip() for value in args.browsers.split(',')))
    if not browsers or any(value not in ('firefox', 'chrome') for value in browsers):
        parser.error('--browsers must contain firefox and/or chrome')
    root = Path(__file__).resolve().parent
    results = []
    node = os.environ.get('BUNPRO_NODE') or shutil.which('node')
    if args.skip_lint:
        results.append(('lint', '-', 'skipped', 0.0))
    else:
        # The .cmd shim under node_modules/.bin needs a shell on Windows; call the entry point directly.
        eslint = root / 'node_modules' / 'eslint' / 'bin' / 'eslint.js'
        if node and eslint.is_file():
            run_check('lint', '-', [node, str(eslint), USER_SCRIPT], root, results)
        else:
            print('Lint tools are missing. Run npm install --ignore-scripts (or link node_modules to an '
                  'existing install of the pinned packages) and put Node.js on PATH or set BUNPRO_NODE. '
                  'Only --skip-lint explicitly skips lint.', file=sys.stderr, flush=True)
            results.append(('lint', '-', 'failed (missing tools)', 0.0))
    if node:
        run_check('syntax', '-', [node, '--check', USER_SCRIPT], root, results)
        run_check('i18n', '-', [node, str(root / 'tools' / 'check_i18n.mjs')], root, results)
    else:
        print('Node.js is missing. Set BUNPRO_NODE or put node on PATH for node --check.',
              file=sys.stderr, flush=True)
        results.append(('syntax', '-', 'failed (missing Node.js)', 0.0))
        results.append(('i18n', '-', 'failed (missing Node.js)', 0.0))
    if any(result.startswith('failed') for _, _, result, _ in results):
        print_summary(results)
        return 1
    for name, arguments, per_browser, needs_script in TESTS:
        if args.tests is not None and name not in args.tests:
            continue
        for browser in browsers if per_browser else ['-']:
            if needs_script and not args.browser_script:
                results.append((name, browser, 'skipped(no browser script)', 0.0))
                continue
            command = [sys.executable, '-B', *arguments]
            if per_browser:
                command.append(browser)
                driver = args.geckodriver if browser == 'firefox' else args.chromedriver
                if driver:
                    command.extend(['--driver', driver])
            if needs_script:
                command.extend(['--script', args.browser_script])
            run_check(name, browser, command, root, results)
    print_summary(results)
    return int(any(result.startswith('failed') for _, _, result, _ in results))


if __name__ == '__main__':
    raise SystemExit(main())
