# BunPro Local Audio Override 0.6.2.1

Released November 18, 2026. This browser-edition update fixes the panel layout
on sentences without BunPro audio.

## Fixes

- **Panel no longer covers BunPro's action row.** BunPro shows no player for a
  sentence without its own audio, so its Undo / Show Info / Alternatives row
  sits directly above the answer area. After a clip was saved for such a
  sentence (for example with **VOICEVOX**), the player was added below that row
  and the panel above the player covered it. The player now appears above the
  row, where BunPro's own player is on other sentences.

## Unchanged

VOICEVOX generation, P/O routing, recording, the database, existing settings
and the `.bpao` v1 backup format are unchanged. See the
[0.6.2.0 release notes](release-notes-0.6.2.0.md) for the VOICEVOX features and
one-time setup.

## Validation

The automated checks use fresh headless Firefox and Chrome profiles and
synthetic pages; a new check covers the player position on a sentence without
BunPro audio. The fix was also tried by the maintainer on the live BunPro review
page in Firefox. See the [November 18 validation report](validation-2026-11-18.md)
for results.

[Install on Greasy Fork](https://greasyfork.org/en/scripts/583595-bunpro-local-audio-override)
or view the [public source repository](https://github.com/nullmorrow/bunpro-local-audio-override).
