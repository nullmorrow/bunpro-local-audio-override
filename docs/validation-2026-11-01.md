# Browser edition validation

Date: November 1, 2026 (Australia/Sydney).

## Tested source

- Userscript version: **0.6.1.6**.
- SHA-256 of the UTF-8, LF userscript:
  `84190482a7ff7ba2865ccaa654adf75b072cc3e3a2333403cf3b28c038591bd0`.
- No playback, recording, storage, installation or backup identifiers were changed.
  The `.bpao` v1 format and export output are unchanged.

## Environment and command

Windows host, Python 3.12.10, Selenium 4.44.0, Node.js 24.22.1,
ESLint 10.11.0, GeckoDriver 0.37.1 and ChromeDriver 155.0.8059.84.
Browsers: **Firefox 159.0** and **Chrome 156.0.8078.74**.

Command: `python -B run_tests.py`.
Drivers were selected explicitly using the runner's environment variables.
All browser checks used fresh headless profiles, generated audio and test doubles.
No personal browser profile, real microphone or personal audio library was used.

The full runner exited **0**, with **17 of 17 checks passed**, in **215.25 seconds**.
These are runner checks, not 17 independent end-to-end user sessions.

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

The storage regression covers the new import path: byte ranges and records
match a whole-file `JSON.parse` reference for read sizes from 1 byte upward
(BOM, CRLF, reordered keys, nested metadata, escapes and multi-byte text);
malformed structures are rejected with the existing error messages; import
never reads the whole file at once; a damaged entry imports nothing; batched
saving keeps keep/replace counts; and partial failures and cancellations report
how many entries were saved.

## Large backup measurement

A generated **640 MiB** backup (48 clips of 10 MiB) was selected from disk and
imported in headless Chrome 156.0.8078.47 on October 24, 2026: all 48 entries were
saved in **22.4 seconds**, with a peak JavaScript heap of 61 MiB, and checking and
saving progress was shown. Reading the same file with `File.text()`, as 0.6.1.5
did, returned an empty string in Chrome. This measurement was not repeated in
Firefox.

## Limits

These automated results do not claim a live authenticated BunPro/Tampermonkey
installation test, physical microphone or USB-disconnect test, or listening
review. The 50 MiB per-clip limit, disk space and browser storage quota remain;
there is no claim of unlimited capacity.

These checks are regression coverage for the listed source, not a general
security audit.
