# BunPro Local Audio Override release validation

Date: October 3, 2026 (Australia/Sydney).

This report covers browser edition **0.6.1.5** only. All results below come from
this batch's final release test run after the version bump. The unpublished
0.6.1.4 changes are included in 0.6.1.5.

## Final source identity

| Source | Encoding / line endings | SHA-256 |
| --- | --- | --- |
| `bunpro_local_audio_override.user.js` | UTF-8 / LF | `01f397650c6271de90eece304d26aaa655126584180c9c93048104f96cfd68cf` |

The hash was computed on the final file bytes after the full test run.
No userscript changes were made afterward.

## Environment and command

Host execution on Windows, Python 3.12.10, Node.js v24.21.0,
ESLint 10.11.0 with the pinned recommended-rule configuration.

| Browser (reported by Selenium) | Driver |
| --- | --- |
| Firefox 157.0 | geckodriver 0.37.1 |
| Chrome 154.0.8037.93 | ChromeDriver 154.0.8037.92 |

```text
python -B run_tests.py
```

`BUNPRO_NODE`, `BUNPRO_GECKODRIVER` and `BUNPRO_CHROMEDRIVER` selected the
executables listed above. `PYTHONIOENCODING=utf-8` configured Python output.
`TEMP`, `TMP` and `TMPDIR` selected this run's writable scratch directory.
Browsers used fresh headless Selenium profiles, synthetic file:// fixtures,
generated audio and controlled failures. No personal profile, authenticated
BunPro account, physical microphone or personal audio library was used.

## Final automated results

| Check | Browser | Result | Reported checks / scope | Seconds |
| --- | --- | --- | --- | ---: |
| lint | - | passed | 1 source file; 0 errors/warnings | 1.63 |
| syntax | - | passed | 1 source file | 0.10 |
| i18n | - | passed | 5 tables × 7 languages | 0.22 |
| microphone | firefox | passed | 54 | 26.51 |
| microphone | chrome | passed | 54 | 22.16 |
| gain | firefox | passed | 48 | 18.35 |
| gain | chrome | passed | 48 | 12.74 |
| races | firefox | passed | 9 | 8.86 |
| races | chrome | passed | 9 | 3.56 |
| compression | firefox | passed | 47 | 29.72 |
| compression | chrome | passed | 47 | 24.10 |
| storage | firefox | passed | 34 | 11.04 |
| storage | chrome | passed | 34 | 5.43 |
| lookup | firefox | passed | 25 | 10.69 |
| lookup | chrome | passed | 25 | 4.45 |
| panel | firefox | passed | 265 | 12.74 |
| panel | chrome | passed | 265 | 6.84 |

Exit code: **0**. Total elapsed time: **199.26 seconds**.
The Selenium suites report **964 checks**, not that many independent
end-to-end scenarios. Lint and syntax do not report assertion counts.
Original i18n output:

```text
i18n: 5 tables, 7 languages; keys and placeholders match en.
```

## Coverage

- **Microphone:** controlled missing inputs, permission stalls, cooldown/retry,
  disconnect events, late results, native P pass-through and teardown.
  Playback timing measures the call, not audible output; request timeout uses
  the production 10-second setting.
- **Gain:** real MediaRecorder, Web Audio and HTML audio with generated input;
  P/O cycles, soft peak protection, shared input, speed, preferences and cleanup.
- **Races:** playback and recording-stop test doubles finish late; superseded
  operations cannot stop a newer replay or overwrite its status.
- **Compression:** real native Opus encoding/decoding, v1 integrity, automatic
  Save/Import, concurrent changes, cancellation and production startup timeout.
- **Storage:** real IndexedDB recovery and v1 JSON/Base64/checksum round-trips;
  save picker, writable failures and download delivery use test doubles.
  Export uses three 3–5 MiB clips, not a library beyond the engine string limit.
  The blocked-open timeout is shortened to 100 ms in the injected test copy;
  its measurement does not validate the production 10-second timing.
- **Lookup:** immediate P with/without an override, native event delivery,
  save/delete coherence, stale preload invalidation and recovery. Each browser's
  25 checks include 4 negative controls with startup preload removed. Playback
  is stubbed; Blob URLs and saved bytes are verified, not audible output.
- **Panel:** generated input feeds real MediaRecorder for P/O and auto-stop;
  focused panel controls preserve native P delivery, pointer interactions release
  focus, keyboard activation retains it, and text fields block local hotkeys.
  Current messages and lookup errors retranslate without changing parameters.
  Main/admin layouts are checked in all seven languages at actual viewport
  widths 1300 and 800 px (28 cases per browser): only sentence/file name may
  ellipsize; message visibility, grouped controls and toolbar clearance pass
  with 1 px rounding tolerance. Empty and one-line messages keep equal height.
  File selection, translated choose-audio buttons and speed tooltips pass.

## Measurements from this final run

Panel geometry is in CSS pixels; ranges include all seven languages and both
views at 1300 and 800 px. Ratios are rounded to four decimals and fractional
timings/geometry to three. Full original precision, output and all layout cases
remain in the run's local evidence, outside this public repository.

| Measurement | Firefox | Chrome |
| --- | ---: | ---: |
| Microphone request timeout (ms) | 10012 | 10014 |
| Quiet-input 2× gain ratio | 2.0029× | 2.0005× |
| Quiet-input 4× gain ratio | 4.0040× | 3.9646× |
| Compression input (bytes) | 153644 | 153644 |
| Compression output (bytes / container) | 7638 / audio/ogg;codecs=opus | 6338 / audio/webm;codecs=opus |
| Storage export (bytes) | 16778327 | 16778327 |
| Largest export string (characters) | 6990769 | 6990769 |
| Shortened blocked-open rejection (ms) | 100.000 | 114.100 |
| Panel layout cases | 28 | 28 |
| Empty / one-line panel height range (px) | 82.000–176.600 | 81.969–176.484 |
| Maximum empty-to-one-line height difference (px) | 0.0 | 0.0 |
| Long-message height range (px) | 72.000–72.000 | 71.953–71.953 |
| Panel height with long message (px) | 139.600–234.200 | 139.531–234.047 |
| Clearance above native toolbar (px) | 9.800–10.400 | 9.938–10.484 |

## Not verified in this run

- Live authenticated BunPro, userscript-manager installation, actual answer
  reveal timing and human visual UI acceptance (Claude/user owner). Claude
  reported prior-batch screenshot acceptance; this worker did not repeat it.
- Physical microphones, USB/headset unplug/reconnect, audible output switching
  and listening quality (Claude/user owner).
- Actual save-dialog write/close failure cleanup or filesystem rollback;
  writable test doubles verify abort calls and restored controls.
- Real imports larger than 512 MiB or exports beyond the engine string limit.
  The compression fixture reports a larger File.size on a small valid file;
  this tests absence of an explicit cap, not large-file capacity.

Import reads the whole JSON/Base64 file, so backups larger than about 512 MiB
can still fail. Export builds the backup entry by entry, but maximum practical
size was not measured. The 50 MiB per-clip limit, available memory, disk space
and browser storage quota still apply. Export a backup before lossy compression
and disable older or duplicate script copies before refreshing BunPro.
