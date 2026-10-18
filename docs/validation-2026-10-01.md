# BunPro Local Audio Override release validation

Date: October 1, 2026 (Australia/Sydney).

This report records the final browser edition **0.6.1.3** and local-server
userscript **0.3.6.8**, tested in independent browser profiles. It distinguishes
automated checks from physical-device and live-site behavior that was not verified.

## Final source identity

| Edition | Workspace source | SHA-256 |
| --- | --- | --- |
| Browser 0.6.1.3 | `bunpro_local_audio_override.user_v6.1.3.js` | `07fa73e66f3065733858b24b2fc5d05ca85367771cc2e5c53583bc8fa33315f7` |
| Server userscript 0.3.6.8 | `bunpro_local_audio_override.user_v3.6.8.js` | `cd420b1e3236d266c4b523dcb54c0175d12b4c30010fb5edd7e33ff02818fda8` |

The public repository and browser release package use the canonical filename
`bunpro_local_audio_override.user.js`, with exactly the browser source bytes above.
The compatible Python server remains at 0.3.6.5. The older 0.3.6.7 userscript and
its release package are preserved separately; it is not the new server edition.

## Browsers and automated results

Actual browser versions: **Firefox 157.0** and **Chrome 154.0.8037.58**.
Selenium runs used fresh headless profiles, generated audio and temporary storage.
They did not use an existing browser profile, authenticated BunPro account,
physical microphone, speaker output, or personal audio library.

| Browser | Edition | Microphone recovery | Gain and P/O | Replay ownership | Compression |
| --- | --- | ---: | ---: | ---: | ---: |
| Firefox | 0.6.1.3 | 54 passed | 48 passed | 9 passed | 47 passed |
| Firefox | 0.3.6.8 | 54 passed | 48 passed | 9 passed | Not applicable |
| Chrome | 0.6.1.3 | 54 passed | 48 passed | 9 passed | 47 passed |
| Chrome | 0.3.6.8 | 54 passed | 48 passed | 9 passed | Not applicable |

All 12 Python migration unittest cases also passed, for **550 automated
assertions/checks and unittest cases in total**. This is not a claim of 550
independent end-to-end test cases. JavaScript syntax checks and **ESLint 10.11.0
recommended rules** passed for both final userscripts, with no errors or warnings.

## Coverage

Microphone recovery checks cover missing input, pending permission, a stalled
gain context, repeated P presses, cooldown/retry, device-change notification,
brief and persistent mute, ended input, cancellation, late requests, retained
recorded chunks, native P event pass-through, and teardown. Timing probes measure
when the script calls reference playback, not when sound reaches a speaker.

The gain suite uses real browser MediaRecorder, Web Audio and HTML audio with
generated input. It checks the direct 1x path, amplified takes, soft peak
protection, shared-input reuse, cleanup, no live microphone monitoring, remembered
settings, raw/clean modes, 75%/85% speed tracking, both local/native P/O cycles,
the first P after O naturally ends, translations, and panel placement above controls.
The encoder timing fixture waits for the real recorder start event before measuring
a take, so a slower startup does not shorten the gain measurement window.

Measured quiet-input gain ratios in the final run:

| Browser | Edition | Selected 2x | Selected 4x |
| --- | --- | ---: | ---: |
| Firefox | 0.6.1.3 | 2.003x | 4.006x |
| Firefox | 0.3.6.8 | 2.004x | 4.004x |
| Chrome | 0.6.1.3 | 2.001x | 4.000x |
| Chrome | 0.3.6.8 | 2.001x | 3.964x |

The replay ownership suite deliberately delays old audio-play and recording-stop
promises. It verifies that late completion releases only its own media object,
never stops the newer replay, and cannot overwrite its error status. Failed Web
Audio startup is also checked for owned-node cleanup and suppression of a stale
fallback. These controlled race checks do not claim audible playback coverage.

Compression checks cover real native Opus encoding/decoding, mono output,
SHA-256 validation, backup round-trip, corrupt input, compare-and-write against
concurrent edits/deletions, cancellation during startup and encoding, the actual
10-second startup timeout, storage failure, translated progress controls, automatic
Save/Import/Import & Replace, fallback to incoming originals, exact-byte restoration
with automatic compression off, and no microphone or speaker use.

A generated 153,644-byte WAV became 7,638 bytes of Ogg/Opus in Firefox and
6,338 bytes of WebM/Opus in Chrome. These are fixture results, not promised savings
for arbitrary audio. Both real browser-generated containers survived the Python
export/import boundary byte-for-byte.

The old 512 MiB import threshold is tested by reporting a larger File.size for a
small valid fixture. This verifies removal of the scripted cap without allocating
a real large backup; it is not a memory-capacity or full 512 MiB import test.
Whole-file JSON/Base64, memory, disk and browser storage quota limits remain.

## Reproductions and code review

The new replay checks failed against the saved earlier 0.6.1.3 and 0.3.6.7 code,
reproducing the late-callback interference. The startup-cancellation check also
failed against the exact saved pre-refactor browser source. Final code passes
those same checks after shared owned-resource cleanup and cancellable compression
startup were introduced. The browser version was not incremented because the
earlier 0.6.1.3 build had not been published; 0.3.6.8 is a new preserved artifact.

Code review also verified that the microphone remains an independent recording
sidecar, BunPro's native P event is not replaced by a synthetic event, database
identity and backup format remain unchanged, no whole-backup cap is reintroduced,
and backup parsing errors preserve their original cause. The public release uses
an explicit source/documentation/test allowlist, not the entire workspace.

## Not verified in this run

- Physical USB/headset unplug and reconnect with the user's real devices.
- Audible output switching, listening quality, or the user's quiet-voice input.
- The live authenticated BunPro page and installation through Tampermonkey.
- Import/export of a genuinely larger-than-512-MiB backup.

The user's active Firefox session was left untouched. If an unplugged headset was
also the output, Windows and the browser still need a working playback device.
Use a backup before lossy compression and keep only one userscript edition enabled.
