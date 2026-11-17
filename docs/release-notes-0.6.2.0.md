# BunPro Local Audio Override 0.6.2.0

Released November 18, 2026. This browser-edition update can generate sentence
audio with a local VOICEVOX installation.

## Generate with VOICEVOX

- **One-click clips.** With [VOICEVOX](https://voicevox.hiroshiba.jp/) running on
  the same computer, select **VOICEVOX** after the answer is revealed. The
  sentence is generated, previewed once and becomes the selected file; select
  **Save** to keep it. While it is generating, the button reads **Cancel**.
- **Reading checked against furigana.** VOICEVOX sometimes misreads kanji (for
  example 辛い as つらい instead of からい). The original text is generated first,
  which keeps natural phrasing and pitch accent, and its reading is compared with
  BunPro's furigana. Only misread words are replaced by their furigana; if that is
  not enough, the reading is given to VOICEVOX as kana while keeping its phrasing
  and accents. The message says whether the reading matched, which words were
  corrected, or that it could not be checked because some kanji have no furigana.
  The VOICEVOX user dictionary is never changed.
- **Lead-in silence.** Clips start with 0.5 s of silence by default (0.1–1.0 s),
  so after pressing P there is a moment to react before shadowing. The length
  stays the same at any speed.
- **Recent voices.** Voices you have generated with appear as buttons (up to 8).
  One click generates with that voice and makes it the default.
- **Settings.** Admin → VOICEVOX sets the default voice, speed, lead-in and engine
  address. Only addresses on this computer (`127.0.0.1`, `localhost`, `[::1]`)
  are accepted.

**One-time setup:** open `http://127.0.0.1:50021/setting`, add
`https://bunpro.jp` to **Allow Origin**, save, and restart VOICEVOX. Without it,
VOICEVOX refuses requests from BunPro. Tested with VOICEVOX Engine 0.25.2 and
0.26.2.

Generated clips are ordinary overrides: automatic compression, backups and
**Delete** work as for any chosen file. Follow each VOICEVOX character's terms
of use and credit the voice (for example "VOICEVOX:ずんだもん") if you share
generated audio.

## Fixes

- **Test** no longer stops the preview of a chosen file immediately on a
  sentence without a saved override, including after P has played BunPro's own
  audio.

## Privacy

The script still uses `@grant none`. Only when you select **VOICEVOX**, a recent
voice button or **Load voices** does it contact the VOICEVOX engine on this
computer, sending the current sentence text. Nothing is uploaded.

## Unchanged

P/O routing, recording, the database, existing settings and the `.bpao` v1
backup format are unchanged.

## Validation

The automated checks use fresh headless Firefox and Chrome profiles, synthetic
pages and recorded VOICEVOX responses. The reading pipeline was also run against
a real local VOICEVOX engine, and the feature was tried on the live BunPro
review page in Firefox. See the
[November 18 validation report](validation-2026-11-18.md) for results.

[Install on Greasy Fork](https://greasyfork.org/en/scripts/583595-bunpro-local-audio-override)
or view the [public source repository](https://github.com/nullmorrow/bunpro-local-audio-override).
