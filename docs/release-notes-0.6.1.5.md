# BunPro Local Audio Override 0.6.1.5

Released October 5, 2026. This browser-edition update improves large-library
exports, storage recovery, translations, hotkeys and panel readability.
It covers every change since the previous public release, 0.6.1.3.

## Backups and storage

- **Export larger libraries.** Backups are built entry by entry without one
  library-sized JSON string. The `.bpao` v1 format is unchanged and remains
  readable by earlier versions, subject to their import limits.
- **No partial export file.** If an export through the save-location picker
  fails, the write is aborted without leaving a partially written backup.
- **Recover without refreshing.** Storage operations reopen a closed database
  connection. A briefly blocked database no longer fails immediately.

## Playback and translations

- **Immediate local P playback.** Press P right after the answer is revealed to
  play the saved local clip when one exists. Sentences without a local override
  continue to use BunPro's original P event.
- **Complete recording controls.** Traditional Chinese, Spanish, Indonesian,
  French and Japanese now have translated recording controls. Compression errors
  are translated in all seven UI languages.
- **Hotkeys after panel use.** P/O keep playing, recording and replaying when a
  panel button or selector has focus. Text-entry fields still suspend shortcuts.
  Mouse and touch interactions release control focus so page keys such as Enter
  work again; keyboard navigation keeps focus.
- **Messages follow your language.** Switching the UI language immediately
  translates the current status message and lookup error, keeping parameter
  values and browser/system error text unchanged.

## Clearer panel

Status messages have their own full-width line and wrap without truncation.
Controls wrap in groups, labels remain fully readable, and the translated
**Choose audio…** button opens the file chooser. Sentence and file-name tooltips
show their full text; the speed tooltip shows the detected speed and its source.

## Upgrade

Export a `.bpao` backup from **Admin** before upgrading. Install the update,
disable every older or duplicate copy, then refresh BunPro. Existing clips,
settings, database identity and backup format remain compatible.

## Known limitations and validation

Import still reads the whole JSON/Base64 file. Importing a backup larger than
about **512 MiB** can still fail because of browser string or memory limits,
even though the script has no explicit whole-backup size cap. The **50 MiB
per-clip limit** remains. Export also needs sufficient memory and disk space;
its maximum practical size has not been measured.

The automated checks use fresh headless Firefox and Chrome profiles, synthetic
pages and generated audio. Live BunPro behavior, physical microphones and
exports beyond the engine string limit remain unverified. See the
[October 3 validation report](validation-2026-10-03.md) for final results.

[Install on Greasy Fork](https://greasyfork.org/en/scripts/583595-bunpro-local-audio-override)
or view the [public source repository](https://github.com/nullmorrow/bunpro-local-audio-override).
