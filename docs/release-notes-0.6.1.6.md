# BunPro Local Audio Override 0.6.1.6

Released November 1, 2026. This browser-edition update makes large `.bpao`
backups importable.

## Backups

- **Import large backups.** Import reads the backup entry by entry instead of
  loading the whole file into one string, so backups larger than about
  512 MiB can be restored. A 640 MiB backup with 48 clips was imported in about
  22 seconds in Chrome during testing.
- **Everything is checked before anything is saved.** Every entry's format,
  size and SHA-256 checksum is verified first. If one entry is damaged, nothing
  is imported.
- **Progress while importing.** The panel shows how many entries have been
  checked and saved.
- **Clear result if import stops.** Clips are saved in batches. If saving fails
  or automatic compression is cancelled part-way, the message reports how many
  entries were already saved. Import the same file again with the same button
  to finish.

The `.bpao` v1 format, export output, database and settings are unchanged.
Backups from earlier versions import as before.

## Known limitations and validation

The 50 MiB per-clip limit remains. Disk space and the browser's storage quota
still limit how much can be stored.

The automated checks use fresh headless Firefox and Chrome profiles, synthetic
pages and generated audio. The large-backup measurement used a generated
640 MiB file in headless Chrome only. Live BunPro behavior and physical
microphones remain unverified by these checks. See the
[November 1 validation report](validation-2026-11-01.md) for results.

[Install on Greasy Fork](https://greasyfork.org/en/scripts/583595-bunpro-local-audio-override)
or view the [public source repository](https://github.com/nullmorrow/bunpro-local-audio-override).
