# BunPro Local Audio Override

Store a custom audio clip for a BunPro sentence and practise speaking with **P**
to play and record, then **O** to review your own voice. The published 0.6.x
edition runs entirely in your browser: no Python server and no audio uploads.

Current release: **0.6.1.7**, November 2, 2026.

[Install from Greasy Fork](https://greasyfork.org/en/scripts/583595-bunpro-local-audio-override)
· [Release notes](docs/release-notes-0.6.1.7.md)
· [简体中文详细说明](docs/guide.zh-CN.md)

This is an unofficial community project, not affiliated with BunPro.

Source code and releases: [nullmorrow/bunpro-local-audio-override](https://github.com/nullmorrow/bunpro-local-audio-override).

The [November 2 validation report](docs/validation-2026-11-02.md) records the latest
Firefox and Chrome regression results for this source.

## Install or update

1. Install Tampermonkey or a compatible userscript manager.
2. Install or update the script from the Greasy Fork link above.
3. Disable other copies or editions of BunPro Local Audio Override, then refresh
   BunPro. Running two copies can cause conflicting P/O and audio behavior.
4. Answer a supported cloze review correctly to reveal the local audio panel.

Before upgrading, export a `.bpao` backup from **Admin**. The database name,
settings keys and backup format remain compatible with earlier browser editions.

## Add a reference clip

In the panel, choose an audio file, use **Test** to preview it, and select **Save**
to associate it with the revealed sentence. On the same sentence, P and the
answer-area audio button use that clip. **Delete** removes the override and
restores BunPro's own audio for that sentence.

Use **Choose audio…** to open the file chooser. The selected file name and sentence
have tooltips with their full text. Status messages wrap on their own line, and
switching the UI language updates any current message immediately.

WAV, MP3, OGG/OGA, M4A, AAC, FLAC and WebM are supported when your browser can
decode them. Each clip can be at most **50 MiB**. Browser security requires a
file chooser; this edition cannot silently read a fixed local path.

The player has play/pause, seeking, remaining time, speed and volume controls.
It follows BunPro's playback speed, including Firefox's detached audio players
and choices such as **75%** or **85%**. A fallback speed selector is available
when a BunPro speed cannot be observed. Sentences without native audio can still
use an override and the supplied player.

## Generate a clip with VOICEVOX

If [VOICEVOX](https://voicevox.hiroshiba.jp/) is running on the same computer,
select **VOICEVOX** after the answer is revealed. The sentence is sent to the
local VOICEVOX engine, the result is played once as a preview and becomes the
selected file; select **Save** to keep it. While it is generating, the button
reads **Cancel**.

**One-time setup:** open `http://127.0.0.1:50021/setting`, add
`https://bunpro.jp` to **Allow Origin**, save, and restart VOICEVOX. Without it,
VOICEVOX refuses requests from BunPro. Chrome may also ask whether bunpro.jp may
access devices on your local network; allow it for VOICEVOX to work.

Under **Admin → VOICEVOX**, choose the default voice (select **Load voices**
first), the speed and the engine address. Only addresses on this computer
(`127.0.0.1`, `localhost` or `[::1]`) are accepted.

**Reading check:** VOICEVOX sometimes misreads kanji (for example 辛い as つらい
instead of からい). The script first generates from the original text, which
keeps natural word boundaries and pitch accent, and compares VOICEVOX's reading
with BunPro's furigana. Only misread words are replaced by their furigana; if
that is not enough, the reading is passed to VOICEVOX as kana while keeping its
phrasing and accents. The message says whether the reading matched, which words
were corrected, or whether it could not be checked because some kanji have no
furigana. The VOICEVOX user dictionary is never changed.

Generated clips are ordinary overrides: automatic compression, backups and
**Delete** work as for any chosen file. Follow each VOICEVOX character's terms
of use, and credit the voice (for example "VOICEVOX:ずんだもん") if you share
generated audio.

## Speaking practice and O replay

| Action | Result |
| --- | --- |
| P while idle | Play the reference and start a new take when Rec is on. |
| P while reference audio is playing | Stop and reset the reference; finish the take for later O review. |
| O | Stop the reference and current take, then replay the latest recording. Press O again to replay it. |
| P after O playback finishes | Start the next playback-and-recording cycle with one press. |
| Rec off | Stop and release the microphone. P still plays reference audio. |

With no local override, BunPro receives the original P event directly; recording
runs alongside it. Repeated O presses safely discard outdated callbacks without
stopping a newer replay. Each take is limited to 120 seconds.

P/O keep working after using panel controls; typing in a text-entry field suspends
the shortcuts. Mouse and touch interactions release control focus so page keys
such as Enter work again, while keyboard navigation retains focus.

Recording is **on by default**. The first recording action requests microphone
permission. Select **Rec off** before pressing P if you only want playback.

**Mic gain** offers 1x, 1.5x, 2x, 3x and 4x, with the preference remembered.
Start with 2x for a quiet voice. Gain is applied before encoding from the next
take onward, not to an existing recording or reference audio. Higher gain has
soft peak protection, but noise is amplified too and distortion is still possible.
There is no live microphone monitoring or change to system microphone settings.

**Mic: raw** disables echo cancellation, noise suppression and automatic gain;
it is the default. **Mic: clean** enables those browser processing options.
The microphone is reused between takes and released after three idle minutes,
on Rec off, device failure or page exit.

## When a microphone disconnects

Reference playback does not wait for microphone permission, a missing device,
or a stalled recording-gain context. Requests time out after 10 seconds; failed
capture attempts pause retries for 30 seconds instead of reopening a broken
input on every P press. Your saved Rec setting is not switched off.

After the browser reports a device change, the next P can retry. You can also
switch Rec off and back on for an immediate retry. Reconnection alone never
starts recording or asks for permission. Brief input interruptions have a grace
period; usable chunks before a disconnect can remain available for O review.
On a cold start, the recording may begin after the reference has started.

If the headset was also your output device, the operating system and browser
still need a working audio output. The script cannot replace output routing.

## Backups and compression

Open **Admin** to export `.bpao` backups, import new sentences, import and replace
existing sentences, view library statistics, or clear the library after a second
confirmation. Imports validate format, per-clip size and SHA-256 checksums.

There is **no 512 MiB whole-backup cap**. Import reads and validates entries
without loading the whole file into one string, then saves clips in batches.
Checking and saving progress is shown. If import stops, the message reports how
many entries were saved; import the same file again with the same button to
finish. Export also builds the backup entry by entry.
The `.bpao` format is unchanged. Base64 enlarges backups; the **50 MiB per-clip
limit**, available memory, disk space and browser storage quota remain practical limits.

**Compress Audio** encodes saved overrides locally as mono Opus at a target
64 kbps. With WebCodecs Opus support, compression is much faster than real time
and produces Ogg/Opus in both Firefox and Chrome. If unsupported or encoding fails,
the previous real-time method is used: Ogg/Opus in Firefox and WebM/Opus in Chrome.
It uses neither a microphone nor an upload. Clips are processed sequentially.
Only decodable results at least 10% smaller replace the original. Already marked
or sufficiently small lossy clips are skipped; failures keep the original and
concurrent edits in another tab are not overwritten.

Compression is lossy, so **export a backup first**. Cancel retains completed
results and leaves unprocessed clips unchanged. Startup can also be cancelled
and has a 10-second timeout, so a stalled encoder does not leave the UI busy.
Original files on disk and temporary speaking-practice recordings are untouched.

Optional **automatic compression** is off by default and remembers your choice.
It applies to incoming clips on Save, Import, and Import & Replace, only when
they will be written. Failed or ineffective compression uses the incoming original.
To restore a backup's exact audio bytes, disable automatic compression first.

## Storage and privacy

Saved sentence overrides stay in this browser profile's IndexedDB database
`BunProLocalAudioOverrideCommunity`, object store `audioOverrides`. Clearing site
data or deleting the profile can remove them. Different browsers do not sync the
library automatically; keep backups.

P/O practice recordings are temporary in the current page's memory, not in the
audio library or `.bpao` backups. They are replaced by a new take and disappear
when the page closes. Neither reference clips nor practice recordings are uploaded
by this userscript. Its metadata uses `@grant none` and no remote dependencies.
Only when you select **VOICEVOX** or **Load voices** does it contact the VOICEVOX
engine on this computer, sending the current sentence text.

The UI supports English, 简体中文, 繁體中文, Español, Bahasa Indonesia, Français
and 日本語. Review layout support covers the legacy and September 2026 structures;
future BunPro page changes may require another update.

## Development and validation

See [the validation report](docs/validation-2026-11-02.md) for the tested versions,
source hashes, regression counts and limits. Tests use separate headless profiles,
generated audio and controlled device failures, never a personal BunPro library.
They do not replace physical USB-disconnect tests, listening checks or a live
authenticated BunPro/Tampermonkey installation check.

Install Selenium for the browser tests and the pinned development dependencies
for linting. Use a recent Node.js release supported by ESLint 10.

```text
python -m pip install selenium
npm install --ignore-scripts
python -B run_tests.py
```

The runner checks lint and JavaScript syntax, then runs every regression in
Firefox and Chrome and prints results and timings. Any failure returns a nonzero
exit code. Use `--browsers firefox` or `--browsers chrome` to select one browser.
Set `BUNPRO_GECKODRIVER` / `BUNPRO_CHROMEDRIVER`, or use `--geckodriver PATH` /
`--chromedriver PATH`, for matching drivers; otherwise Selenium finds them.
Set `BUNPRO_NODE` if Node.js is not on `PATH`. Missing lint tools fail the run;
`--skip-lint` explicitly skips lint but still requires Node for the syntax check.
These repository runners and the current validation report cover the browser
edition only.

## License

[MIT](LICENSE), copyright 2026 QEWLsdAH.
