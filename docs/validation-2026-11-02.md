# Browser edition validation

Date: November 2, 2026 (Australia/Sydney).

## Tested source

- Userscript version: **0.6.1.7**.
- SHA-256 of the UTF-8, LF userscript:
  `14ae3aa8f41fb9a59ef3e61f5eb91e5b51d6e8dcd8c0af49079224603a66a5b4`.
- No playback, recording, storage, installation or backup identifiers were changed.
  The `.bpao` v1 format, database and settings are unchanged.

## Environment and command

Windows host, Python 3.12.10, Selenium 4.44.0, Node.js 24.22.1,
ESLint 10.11.0, GeckoDriver 0.37.1 and ChromeDriver 155.0.8059.84.
Browsers: **Firefox 159.0** and **Chrome 156.0.8078.74**.

Command: `python -B run_tests.py`.
Drivers were selected explicitly using the runner's environment variables.
All browser checks used fresh headless profiles, generated audio and test doubles.
No personal browser profile, real microphone or personal audio library was used.

The full runner exited **0**, with **19 of 19 checks passed**, in about
**225 seconds**. These are runner checks, not 19 independent end-to-end user
sessions.

| Check | Firefox | Chrome |
| --- | --- | --- |
| Microphone recovery | Passed | Passed |
| Recording gain | Passed | Passed |
| Replay races | Passed | Passed |
| Audio compression | Passed | Passed |
| Storage and backup | Passed | Passed |
| Lookup routing | Passed | Passed |
| P/O hotkey routing | Passed | Passed |
| Panel controls and layout | Passed | Passed |

ESLint, JavaScript syntax and all-language key/placeholder checks also passed.
The translation check now also requires a single translation table.

## What the new checks cover

- **Hotkey routing (66 checks per browser).** A fixture page drives P and O
  through local playback, recording, review, native BunPro playback and stop,
  click pass-through and timer expiry. The checks confirm that BunPro receives
  the user's own P key event exactly once, without `preventDefault` and
  without a synthesized replacement, whenever the native path owns it.
- **WebCodecs compression.** Both browsers reported WebCodecs Opus as
  supported. A generated clip of about four seconds (198,577 samples) encoded
  in **2.5%** of its duration in Firefox and **2.1%** in Chrome. The output is
  Ogg/Opus that decodes as mono with the exact duration; Ogg checksums, page
  sequence, start/end flags and the final sample position were checked for
  boundary lengths. Packing several packets per page keeps page headers at
  about 1% of the file. Encoder failure, failed decode validation, missing
  WebCodecs and unsupported settings fall back to the previous real-time
  method; cancellation closes the encoder and keeps the library unchanged.
  The previous real-time checks still run with WebCodecs disabled.

## Limits

These automated results do not claim a live authenticated BunPro/Tampermonkey
installation test, physical microphone or USB-disconnect test, or listening
review of compressed audio. Encoding speed depends on the device. The 50 MiB
per-clip limit, disk space and browser storage quota remain.

These checks are regression coverage for the listed source, not a general
security audit.
