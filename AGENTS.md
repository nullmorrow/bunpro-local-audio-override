# BunPro Local Audio Override (browser edition 0.6.x)

Single userscript `bunpro_local_audio_override.user.js` (`@grant none`, IndexedDB storage).
It replaces BunPro review-page sentence audio with the user's own clips and adds
P-to-record / O-to-replay. This repository is public: never add personal audio, `.bpao`
backups, BunPro page snapshots, logs, local absolute paths or server/migration tools.

## Git and release privacy

- Use the project-only author and committer identity configured locally; never copy
  personal names, account IDs or account-linked email addresses into release files.
- Set both commit timestamps explicitly to UTC and verify `+0000` in the commit object.
- Before remote writes, verify the authenticated account, actual Git credential identity
  and push target against the private local maintenance instructions.
- Do not create commits through the GitHub web editor or automatic merge buttons:
  they may reintroduce an account-linked author or committer identity.
- Preserve license and required attribution, userscript install identity, database and backup identifiers.
- Never include internal account records, backups, personal data, credentials or local paths in commits or releases.

## Constraints that must hold

1. Never intercept or synthesize the native P key on BunPro's own audio path. BunPro must
   receive the user's real keydown; recording is only a side path.
2. Keep the database identity (`BunProLocalAudioOverrideCommunity`, version 1, store
   `audioOverrides`, keyPath `sentenceKey`) and the `.bpao` v1 backup format. Changing either
   needs a version bump, a reader for the old format and migration tests.
3. Install the `HTMLMediaElement.prototype.play` / `playbackRate` hooks at `document-start`;
   BunPro plays detached `new Audio()` elements that never enter the DOM.
4. The microphone stream is shared across recording sessions and released after 180 s idle.
   Reopening it on every P stalls audio that Chrome is playing.
5. Only one edition may run at a time (`__bpLocalAudioOverrideActive` guard).
6. Every user-visible string exists in all UI languages (en, zh-CN, zh-TW, ja, es, id, fr).
7. Test-only access goes through the injection done by the Python test runners; the shipped
   script exposes no extra test API.

## Code style

- Follow the surrounding code: 4-space indent, `const`/`let`, small named functions,
  `t(key, vars)` for UI text, `state` for runtime state.
- Comments explain why the code is shaped this way, not the version history.
- No unrelated refactors in a fix change.

## Checks (run all before any release)

```
python -B run_tests.py
```

Runs ESLint, `node --check`, then the Selenium regressions in headless Firefox and Chrome
with fresh temporary profiles (about 3 minutes). Options and environment variables:

- `BUNPRO_NODE`: Node.js executable when `node` is not on `PATH`.
- `BUNPRO_GECKODRIVER`, `BUNPRO_CHROMEDRIVER`: drivers matching the installed browsers.
- `node_modules/` holds the pinned ESLint packages (`npm install --ignore-scripts`, or a link
  to an existing install). It is ignored by git.
- `--browsers firefox` or `--browsers chrome` limits the browser run while iterating; a
  release still needs both.

Browser tests need a real desktop session (they cannot run inside a filesystem sandbox).
Line endings are LF (`.gitattributes`); the published SHA-256 is computed on the LF file.
