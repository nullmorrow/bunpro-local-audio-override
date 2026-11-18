# Browser edition validation

Date: November 18, 2026 (Australia/Sydney).

## Tested source

- Userscript version: **0.6.2.1** (0.6.2.0 plus a panel layout fix).
- SHA-256 of the UTF-8, LF userscript:
  `90d9d888258723a206ddc104b33eb93c7bf71d450c60125b93cb0e8e8be92657`.
- No playback, recording, storage, installation or backup identifiers were changed.
  The `.bpao` v1 format, database and existing settings are unchanged.

## Environment and command

Windows host, Python 3.12.10, Selenium 4.44.0, Node.js 24.22.1 and ESLint 10.11.0.
Browsers: **Firefox 160.0** and **Chrome 157.0.8103.79**, with drivers chosen by
Selenium Manager (GeckoDriver 0.37.1, ChromeDriver 157.0.8103.78).

Command: `python -B run_tests.py`.
All browser checks used fresh headless profiles, generated audio and test doubles.
No personal browser profile, real microphone or personal audio library was used.

The full runner exited **0**, with **21 of 21 checks passed**, in about
**237 seconds**. These are runner checks, not 21 independent end-to-end user
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
| VOICEVOX generation | Passed | Passed |
| Panel controls and layout | Passed | Passed |

ESLint, JavaScript syntax and all-language key/placeholder checks also passed.

## What the new checks cover

- **VOICEVOX checks (336 assertions per browser).** Reading check: twelve sentences with
  BunPro-style ruby markup are checked against `audio_query` readings recorded
  from a real VOICEVOX Engine 0.25.2: per-kanji and per-word furigana, particles
  は/を/へ, long vowels, numerals, quotes, kanji without furigana and sentences
  without furigana. Misread words (日本→にほん, 辛→から, 何→なん) are corrected by
  replacing only those words with kana; the kana fallback keeps phrasing,
  accents, pauses and devoicing and always gives each phrase one accent.
- **Generation flow.** With a fetch stub at the network boundary: one request
  when the reading matches, a second query for corrections, the kana fallback
  and its HTTP 400 fallback, unreachable engine, timeout, cancel, discarding a
  result when the sentence changes, loopback-only addresses, settings
  persistence, lead-in silence scaled by speed, recent-voice buttons (order,
  default voice, replacement when full), automatic preview and Save.
- **Preview fix.** A Test or VOICEVOX preview keeps playing on a sentence without
  an override, including after P has played BunPro's own audio; this check
  failed before the fix.
- **Player position without BunPro audio (0.6.2.1).** On a footer with no native
  player, the player added after Save is placed above the Undo / Show Info /
  Alternatives row, and the panel above it leaves that row uncovered; this check
  failed before the fix.

## Real engine and live page

From a local test page (allowed by the engine's default origin policy), the
complete generation flow ran against a real local VOICEVOX Engine **0.25.2** and,
after an upgrade, **0.26.2**: all twelve sentences produced the expected result,
every kana fallback string was accepted (HTTP 200) and re-checked as matching,
and generated clips started speaking about 0.52–0.55 s in with the default
0.5 s lead-in. Engine 0.26.2 reports reading voices as `streaming_talk`, which is
now accepted. The feature was also tried by the maintainer on the live BunPro
review page in Firefox after adding `https://bunpro.jp` to the engine's Allow
Origin setting. The 0.6.2.1 layout fix was also tried there in Firefox on a
sentence without BunPro audio.

## Limits

These results do not claim Chrome's local-network permission prompt behaviour on
the live page, physical microphone or USB-disconnect tests, or a listening review
of every VOICEVOX voice. Readings are checked only where BunPro provides
furigana. The 50 MiB per-clip limit, disk space and browser storage quota remain.

These checks are regression coverage for the listed source, not a general
security audit.
