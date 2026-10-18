# Browser edition validation

Date: October 19, 2026 (Australia/Sydney).

## Tested source

- Userscript version: **0.6.1.5**.
- SHA-256 of the UTF-8, LF userscript:
  `01f397650c6271de90eece304d26aaa655126584180c9c93048104f96cfd68cf`.
- No playback, recording, storage, installation or backup identifiers were changed.
- License and required attribution are retained.

## Environment and command

Windows host, Python 3.12.10, Selenium 4.44.0, Node.js 24.19.0,
ESLint 10.11.0, GeckoDriver 0.37.1 and ChromeDriver 155.0.8059.84.
Browsers: **Firefox 158.0** and **Chrome 155.0.8059.84**.

Command: `python -B run_tests.py`.
Drivers were selected explicitly using the runner's environment variables.
All browser checks used fresh headless profiles, generated audio and test doubles.
No personal browser profile, real microphone or personal audio library was used.

The full runner exited **0**, with **17 of 17 checks passed**, in **218.10 seconds**.
These are runner checks, not 17 independent end-to-end user sessions.
The full suite was rerun for this distribution; the userscript bytes are unchanged.

| Check | Firefox | Chrome |
| --- | --- | --- |
| Microphone recovery | Passed | Passed |
| Recording gain | Passed | Passed |
| Replay races | Passed | Passed |
| Audio compression | Passed | Passed |
| Storage and backup | Passed | Passed |
| Lookup and hotkey routing | Passed | Passed |
| Panel controls and layout | Passed | Passed |

ESLint, JavaScript syntax and all-language key/placeholder checks also passed.

## Limits

These automated results do not claim a live authenticated BunPro/Tampermonkey
installation test, physical microphone or USB-disconnect test, listening review,
or a genuinely multi-gigabyte import/export test. Import remains whole-file
JSON/Base64 processing; there is no claim of unlimited capacity.

These checks are regression coverage for the listed source, not a general
security audit.
