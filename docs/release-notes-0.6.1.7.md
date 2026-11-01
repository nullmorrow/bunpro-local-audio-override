# BunPro Local Audio Override 0.6.1.7

Released November 2, 2026. This browser-edition update makes audio compression
much faster.

## Compression

- **Much faster than real time.** When the browser supports WebCodecs Opus,
  **Compress Audio** and automatic compression encode clips directly instead of
  playing them back in real time. In testing, encoding a generated
  four-second clip took about 2–3% of its duration in Firefox and Chrome.
- **Ogg/Opus in both browsers.** The faster path produces Ogg/Opus in Firefox
  and Chrome, still mono at a target 64 kbps.
- **Automatic fallback.** If WebCodecs Opus is unavailable or encoding fails,
  the previous real-time method is used: Ogg/Opus in Firefox and WebM/Opus in
  Chrome. The existing checks still apply: only decodable results at least 10%
  smaller replace the original.

## Unchanged behavior

P/O playback, recording and review, interface text in all seven languages, the
database, settings and the `.bpao` v1 backup format are unchanged. Internally,
P-key routing and the translation tables were reorganized; new regression tests
check that BunPro still receives the real P key press unchanged.

## Known limitations and validation

Compression is lossy, so export a backup first. The automated checks use fresh
headless Firefox and Chrome profiles, synthetic pages and generated audio. Live
BunPro behavior, physical microphones and listening quality remain unverified by
these checks. See the [November 2 validation report](validation-2026-11-02.md)
for results.

[Install on Greasy Fork](https://greasyfork.org/en/scripts/583595-bunpro-local-audio-override)
or view the [public source repository](https://github.com/nullmorrow/bunpro-local-audio-override).
