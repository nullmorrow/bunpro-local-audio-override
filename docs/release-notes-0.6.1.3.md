# BunPro Local Audio Override 0.6.1.3

Released October 1, 2026. This release keeps reference playback independent of
microphone failures, makes repeated recording review safer, and adds protection
against a stalled compression encoder.

## Playback and microphone recovery

This update fixes a problem where pressing **P** could appear unresponsive after
unplugging a headset, losing a USB microphone, or encountering a recording-gain
startup failure. Local reference playback no longer waits for recording to start.

- **Keep listening without a microphone.** Recording is now independent of
  reference playback, including when an input request or gain context stalls.
- **Safer recovery.** Microphone requests time out after 10 seconds. Failed
  capture attempts pause retries for 30 seconds instead of reopening the missing
  device on every P press. This does not turn off your saved recording preference.
- **Reconnect and retry.** After the browser reports a device change, press P to
  try recording again. You can also switch **Rec off → on** and press P to retry
  immediately. Reconnecting alone does not start recording or request permission.
- **No stale recordings.** A delayed permission result cannot start a cancelled
  take or replace a newer device request. Short input interruptions have a grace
  period, and usable chunks recorded before a disconnect are kept for O review.

## Recording review and compression

- **Safer repeated O replay.** Older playback and recording-stop callbacks can
  finish late without stopping the newer replay. Shared cleanup releases only
  the resources owned by each operation, including failed Web Audio fallback.
- **Cancellable compression startup.** Both manual and automatic compression
  stop waiting after 10 seconds if the encoder's audio context cannot start.
  You can cancel during startup; unprocessed originals remain unchanged and
  the controls become usable again.
- **Clearer diagnostics.** Invalid-backup errors retain their original cause.
  Both current editions pass JavaScript syntax and ESLint recommended checks.

## Features included since the previous public release

The previous public Greasy Fork version was 0.6.0. This update also includes:

- The P/O cycle fix: after O playback ends naturally, the next P starts reference
  playback and a fresh take without needing a second press.
- **Mic gain** at 1x, 1.5x, 2x, 3x or 4x for quiet voice-practice recordings.
  Start with 2x; background noise can become louder too.
- **Admin → Compress Audio**, using local mono Opus at a target 64 kbps, plus
  an optional remembered setting to compress incoming clips on Save and Import.
  Compression is lossy: export a backup first. Original source files on disk
  and temporary P/O recordings are not changed.
- Removal of the 512 MiB whole-backup cap from the script and Python converters.
  The 50 MiB per-clip limit remains. JSON/Base64 backups are processed in memory,
  so browser storage, memory and disk space still set practical limits.

## Upgrade and validation

The microphone-gain selector, P/O review, Firefox playback-speed synchronization,
audio compression and large `.bpao` support remain available. Existing clips,
settings and backup format are unchanged. On a cold start or first permission
request, recording may begin after the reference has already started; playback
will not wait for it.

The playback and microphone fixes are also available in local-server userscript
**v0.3.6.8**. The Python
server does not need an upgrade or restart.

After installing the updated script, refresh BunPro and keep only one edition
enabled. If an unplugged headset was also your output device, Windows/Firefox
still needs a working audio output; a userscript cannot replace that routing.

Tested in separate Firefox 157 and Chrome 154 profiles with generated audio and
controlled device failures. These tests do not claim physical USB-unplug,
audible output-switching, or live authenticated BunPro validation. See the
[validation report](validation-2026-10-01.md).

[Install on Greasy Fork](https://greasyfork.org/en/scripts/583595-bunpro-local-audio-override)
or view the [public source repository](https://github.com/nullmorrow/bunpro-local-audio-override).
