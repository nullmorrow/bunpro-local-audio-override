# BunPro Local Audio Override — Greasy Fork Changelog

## 0.6.1.7 — 2026-11-02

- 浏览器支持 WebCodecs Opus 时，音频压缩明显快于实时播放，Firefox 和 Chrome 均生成 Ogg/Opus；不支持或编码失败时，继续使用原来的实时压缩方式。

### English release summary

- With WebCodecs Opus support, compression is much faster than real time and produces Ogg/Opus in both Firefox and Chrome. If unsupported or encoding fails, the previous real-time method is used.

## 0.6.1.6 — 2026-11-01

- 大型备份可逐条读取并导入，不再受整个文件拼接成单个字符串的限制。
- 导入时显示校验和保存进度，并分批保存音频。中途失败或取消时，会明确显示已保存的词条数；用同一个按钮重新导入同一文件即可完成剩余部分。
- `.bpao` 备份格式保持不变；50 MiB 单音频上限、磁盘空间和浏览器存储配额仍然适用。

### English release summary

- Large backups are read and imported entry by entry, without one file-sized string.
- Import shows checking and saving progress and saves clips in batches. If it stops or is cancelled, the message reports how many entries were saved. Import the same file again with the same button to finish.
- The `.bpao` format is unchanged. The 50 MiB per-clip limit, disk space and browser storage quota still apply.

## 0.6.1.5 — 2026-10-05

- 大型音频库可逐条构建并导出备份，不再受整个库拼接成单个字符串的限制。`.bpao` 格式不变，旧版仍可读取，但仍受旧版导入限制影响。
- 使用保存位置选择器导出失败时，不会留下部分写入的文件。
- 补全繁体中文、西班牙语、印尼语、法语和日语的录音控件翻译，以及所有界面语言的压缩错误提示。
- 数据库连接关闭后，存储操作可自动恢复，无需刷新页面；数据库短暂被阻塞时，不再立即报错。
- 答案刚显示后立即按 P，已有本地覆盖的句子会播放本地音频。
- 使用面板控件后，P/O 快捷键仍可播放、录音和回听；鼠标或触摸操作后释放控件焦点，让 Enter 等页面按键继续生效，键盘操作则保留焦点。
- 切换界面语言时，当前状态消息和查询错误立即更新为所选语言，数值和系统错误原文保留。
- 面板状态独占一行并完整换行显示；音频选择按钮支持所有界面语言，操作控件按用途分组换行，标签不再被截断。句子和文件名可通过提示查看全文。

### English release summary

- Large libraries can be exported by building the backup entry by entry, without one library-sized string. The `.bpao` format is unchanged and remains readable by earlier versions, subject to their import limits.
- A failed export through the save-location picker leaves no partially written file.
- Completed recording-control translations in Traditional Chinese, Spanish, Indonesian, French and Japanese, and compression-error translations in every UI language.
- Storage recovers after a database connection closes without a page reload. A briefly blocked database no longer fails immediately.
- Pressing P immediately after the answer is revealed plays the local clip when an override exists.
- P/O playback, recording and replay keep working after using panel controls. Mouse and touch interactions release control focus so page keys such as Enter work again; keyboard interactions retain focus.
- Switching the UI language immediately updates the current status message and lookup error, preserving values and original system-error text.
- Status messages wrap on their own line. The choose-audio button is translated, controls wrap in groups, and labels remain fully readable. Sentence and file-name tooltips show their full text.

## 0.6.1.3 — 2026-10-01

- 修复缓存麦克风或录音增益异常时，P 键本地播放等待录音启动的问题。参考播放和录音并行启动，不再被录音恢复的两秒等待或麦克风授权拖住。
- 麦克风请求增加 10 秒超时及独立请求标识；取消、超时或切换设置后的迟到结果会释放，旧请求不会覆盖或清空新请求状态。
- 输入/增益失败后暂缓重试 30 秒，并停止反复预热录音 AudioContext。重新连接设备、关闭再开启 Rec 或切换麦克风处理模式后，下一次 P 可重试。
- 监听输入结束、mute/unmute 和设备变化。短暂无输入允许 1.5 秒恢复，持续失效会释放旧输入并保留能取得的录音片段；健康输入仍跨多次练习复用。
- 不自动开启录音、不更改用户的录音开关设置，不修改音频库、压缩配置或 `.bpao` 格式。BunPro 原音 P 事件继续直接传递。
- 修复连续按 O 时的回放竞争：旧播放或旧录音停止的迟到回调只释放自己的资源，不会停止新一轮回听或覆盖新的错误状态。
- 手动和自动压缩统一使用可取消、最多等待 10 秒的编码器启动流程。启动卡住时可及时取消；超时会恢复按钮并保留未处理的原始音频。
- 重构录音回放资源清理，保留备份解析异常的原始原因；通过 JavaScript 语法检查和 ESLint 推荐规则检查。

### English release summary

- Reference playback no longer waits for microphone or gain startup. Missing/disconnected inputs and stalled capture contexts cannot hold the local P action pending.
- Added a 10-second microphone-request timeout, a 30-second failure cooldown, and request ownership checks that release late streams without disturbing newer requests.
- Device changes or an explicit Rec off/on allow the next P to retry. Brief input interruptions can recover; persistent failures release capture resources. Device events never start recording automatically.
- Repeated O presses are safe: a delayed callback from an older replay cannot stop a newer replay, leak its primed player, or replace the current error status.
- Manual and automatic compression share cancellable startup with a 10-second timeout. A stalled encoder returns the controls to idle without replacing unprocessed originals.
- Refactored recording-playback cleanup and preserved the cause of backup parsing errors. Both current editions pass syntax and ESLint recommended-rule checks.
- P/O review, microphone gain, Firefox speed synchronization, compression and existing audio storage remain compatible. The equivalent local-server userscript fixes are included in 0.3.6.8; no Python server update is required.
- See the October 1 validation report for isolated Firefox/Chrome regression results and the remaining physical-device test boundary. This is the first public release of 0.6.1.3; the earlier September 19 build was local only.

## 0.6.1.2 — 2026-09-14

- 新增主面板 **录音增益 / Mic gain**，支持 1×、1.5×、2×、3×、4×，默认 1×，自动保存选择。为轻声练习提供更清楚的回听音量。
- 增益在录音编码前应用，从下一次 P 录音开始生效。已录好的内容、当前录音、参考音频、系统麦克风设置均不因切换档位而改变。
- 1× 保留原来的直接录音路径；增强档位使用浏览器本地增益与软限幅，且不连接扬声器，不增加实时监听或音频上传。
- 继续复用共享麦克风；每段结束只回收该段处理节点和输出音轨。处理录音失败、关闭录音、切换麦克风模式和延迟授权取消时的资源回收。
- 保留 P/O 回听循环、Firefox 75%/85% 语速同步、自动/手动音频压缩，以及无 512 MiB 整包限制的 `.bpao` 管理。

### English release summary

- Added **Mic gain** for quiet voice-practice recordings: 1×, 1.5×, 2×, 3× and 4×, with a remembered default of 1×.
- Gain is applied before recording is encoded, starting with the next P take. Existing takes, reference playback and system microphone settings remain unchanged.
- Higher gain uses local Web Audio processing with soft peak protection and no live speaker monitoring. Background noise is amplified too; start with 2×.
- Shared microphone reuse, P/O review, raw/clean modes, Firefox speed synchronization, compression and large-backup behavior are preserved. Capture resources are cleaned up on stop, failure and teardown.

## 0.6.1.1 — 2026-09-12

- 移除 `.bpao` 备份的 512 MiB 整包导入限制；配套 Python 导入器和导出器同步移除整包大小限制。50 MiB 单音频上限、格式验证和 SHA-256 校验继续保留。
- 新增 **Admin → Compress Audio / 压缩音频**：确认后，在浏览器中逐条把已保存的句子音频转换成单声道、目标 64 kbps 的 Opus。Firefox 使用 Ogg/Opus，Chrome 使用 WebM/Opus。
- 新增默认关闭并记住选择的自动压缩开关：在 Save、Import 和 Import & Replace 中，仅对本次实际将写入的音频进行压缩；开启开关不会处理现有库，普通导入中被跳过的记录也不会处理。
- 自动压缩失败或节省不足时，保留本次选入或备份中的原始音频继续保存；若要从备份精确恢复原始音频，请先关闭自动压缩。
- 压缩使用浏览器原生编码器，不使用麦克风、不上传音频、不修改原磁盘文件，也不处理 P/O 临时练习录音。
- 显示处理进度、已节省空间、跳过和失败数量；可随时取消，已完成的结果保留。处理时间通常接近待压缩音频的总时长。
- 仅在压缩结果可解码且至少小 10% 时替换原记录；已压缩过或体积已经足够小的有损音频会跳过。失败时保留原音频，也不会覆盖其他标签页在压缩期间做出的记录修改。
- 压缩会有损替换 IndexedDB 内的音频，开始前提示先导出备份。取消不会撤销已完成的替换；需要恢复时可以导入并替换压缩前备份。
- 保留 v0.6.1 的 P/O 回听自然结束后单次 P 即可重启练习修复，以及 Firefox 75%/85% 速度同步和现有播放器行为。
- IndexedDB 名称与 `.bpao` 格式版本保持不变。导入、导出仍在内存中处理完整 JSON/Base64，并非流式；取消人为整包限制不改变可用内存、磁盘空间和浏览器存储配额的实际限制。

### English release summary

- Removed the 512 MiB whole-backup cap from the browser script and both Python migration tools. Per-clip size limits, format validation, and SHA-256 checks remain.
- Added **Admin → Compress Audio** to reduce the size of saved sentence clips locally, using mono Opus at a target 64 kbps: Ogg/Opus in Firefox and WebM/Opus in Chrome.
- Added an optional automatic-compression setting, off by default with the choice remembered. It processes incoming clips on Save, Import, and Import & Replace only when they will actually be written; existing library entries and skipped imports are not recompressed.
- If automatic compression fails or saves too little space, the original incoming audio is used. Turn the setting off before importing a backup to restore its original audio bytes exactly.
- Compression uses the browser's native encoder, without a microphone or upload. It processes persistent overrides only; temporary P/O practice recordings and original source files on disk are not changed.
- Shows progress, saved space, and skipped/failed counts. Processing is sequential and takes roughly the combined duration of the clips being encoded. Cancellation keeps completed results.
- Replaces a clip only when the result is decodable and at least 10% smaller. Already compressed or sufficiently small lossy clips are skipped; failures retain the original, and concurrent edits from another tab are not overwritten.
- Compression is lossy and replaces database audio, so export a backup first. The P/O playback-cycle fix, Firefox speed syncing, database identity, and backup format remain compatible.
- Backups still use whole-file JSON/Base64 processing. Available memory, disk space, and browser storage quota remain the practical limits.

## 0.6.1 — 2026-09-11

- 修复 P/O 口语练习循环：按 P 播放并录音、按 O 回听且等待录音自然结束后，下一次只需按一次 P 就会立即播放参考音频并开始新录音。
- 根因是 BunPro 偶尔会在实际音频已经停止后继续显示 Pause 图标。脚本不再仅凭这个过期图标创建“原生音频仍在播放”的状态，因此不会把第一次 P 误当成停止键。
- 正在进行的 BunPro 原生播放仍保留原有的启动宽限和停止逻辑；Firefox 中脱离 DOM 的 `new Audio()`、75%/85% 速度同步、本地覆盖、录音回听和新版页面布局逻辑均保持不变。
- IndexedDB 名称与 `.bpao` 格式没有变化，v0.4.x、v0.5.x 和 v0.6.0 的现有浏览器音频数据无需迁移。

### English release summary

- Fixed the P/O voice-practice cycle: after a recording review finishes naturally, the very next **P** press now starts the reference audio and a new recording immediately.
- BunPro can leave a visible **Pause** icon after its real media is already idle. That stale UI is no longer allowed to create a new “native playback active” state and consume the first P press.
- Active native playback, Firefox detached-audio tracking, 75%/85% speed syncing, IndexedDB data, and `.bpao` backups remain unchanged.

## 0.6.0 — 2026-09-10

v0.6.0 把 Greasy Fork 浏览器存储版的数据库管理功能，与 3.6.x 的播放稳定性、口语练习录音和新版 BunPro 页面兼容性合并到同一个无服务器脚本中。

### 口语练习录音与回听

- 新增 P/O 口语练习流程：按 P 播放参考音频并开始录音，按 O 停止参考音频和录音后立即回听最新录音。
- 再次按 P 可停止当前参考音频、把播放进度归零，并结束当前录音；之后可按 O 回听。
- 无论当前句子使用本地覆盖还是 BunPro 原生音频，录音都可以作为独立的 sidecar 功能工作。
- 新增 **Rec on / Rec off** 开关。关闭后，P 和 O 完全不会访问麦克风，并会释放现有麦克风资源。
- 新增“原始”和“降噪”麦克风模式：
  - 原始模式默认关闭回声消除、降噪和自动增益，以避免部分 Chromium 音频设备在录音启动时让播放卡住；
  - 降噪模式开启这些处理，减少参考音频被录入，但可能在少数设备上影响播放稳定性。
- 麦克风流改为按需获取并跨录音复用，不再在每次按 P 时反复拆除和重建音频设备。
- 麦克风连续空闲 3 分钟、关闭录音、音轨结束或页面退出时会自动释放。
- 单次录音最长 120 秒；达到上限后自动停止，并保留本次录音供 O 键回听。
- 录音启动不再无限等待权限或设备初始化；参考音频可以在有限等待后继续播放。
- 麦克风请求在对应的 P/O 操作被取消后才返回时，会立即清理失效的流。
- 练习录音仅临时保存在当前页面内存，不写入 IndexedDB、不进入 `.bpao` 备份，也不上传网络。

### P/O 快捷键与播放器协调

- 本地覆盖路径会拦截 P 并从头播放本地音频；原生路径继续把同一个受信任的键盘事件交给 BunPro，避免程序化重放破坏 BunPro 状态。
- O 键回听前会停止本地覆盖或 BunPro 原生参考音频，避免两路音频重叠。
- 停止 BunPro 原生音频时优先调用其可见暂停控件，再重置实际媒体对象，使 React 按钮状态、进度和真实声音保持同步。
- 修复 P 后快速按 O 时，进度仍显示为零但按钮停留在 Pause 状态的问题。
- 修复 Firefox 中第一次按 P 时，本地覆盖音频需要等待麦克风冷启动而显著延迟的问题。
- 本地音频在预载阶段就绑定到可复用的 Audio 对象，降低第一次播放的启动延迟。
- 播放器进度控件的左右方向键步进明确为 5 秒；Home 跳到开头，End 跳到结尾。

### Firefox 与播放速度同步

- BunPro 可能把播放器保存在 React ref 中，并用不在 DOM 内的 `new Audio()` 播放句子。脚本现在从 `document-start` 追踪真正播放的媒体对象。
- 监听原生媒体对象的 `playbackRate` 变化，使 Firefox 中 BunPro 的 75% 和 85% 设置能够立即同步到本地覆盖音频。
- 速度扫描包括已追踪的脱离 DOM 媒体，同时排除脚本自己的本地播放器和录音回放播放器，避免将默认 100% 误判为 BunPro 设置。
- 保留 75% 至 125%、每 5% 一档的本地备用速度，并继续支持 BunPro 菜单、浏览器存储、最近观察值和媒体对象等速度来源。

### BunPro 新版页面兼容性

- 支持 2026 年 9 月新版 Review 页面中的 `#js-quiz .bp-quiz-question` 句子结构。
- 支持新版 `.bp-quiz-console` 答案区、页脚、音频按钮、播放器挂载点和管理面板定位。
- 修复无播放器时管理面板与 Undo / Show Info / Alternatives 控制行重叠；播放器出现时仍优先定位在播放器上方。
- 恢复新版页面中的句子读取、本地映射查询、音频按钮接管、P/O 快捷键和管理面板显示。
- 保留 `#js-tour-quiz-question`、`#js-tour-quiz-answer` 和 `#js-tour-quiz-pam` 等旧选择器，继续兼容旧版 BunPro 页面。

### 稳定性与资源生命周期

- 为 BunPro React 重渲染、下一题预取和 reveal 动画造成的短暂“不符合条件”状态加入 1.5 秒宽限，避免正在播放的音频被误判为换题而中断。
- 页面变更监听会忽略脚本自己的播放器进度绘制，防止 60 fps 进度更新反复触发完整同步。
- 统一管理本地覆盖播放器、BunPro 原生媒体、录音会话、录音回放、对象 URL 和麦克风流的停止与释放顺序。
- 提升连续快速按键、切题、删除映射、权限拒绝、设备约束失败和页面退出时的清理可靠性。
- 原始麦克风约束只有在浏览器明确拒绝约束时才回退到默认约束；权限拒绝或设备不可用不会触发第二次权限请求。
- 保留脱敏诊断入口，可在浏览器控制台检查运行状态、已追踪媒体数量和麦克风是否启用，但不会向页面暴露媒体流、录音 Blob 或音频上下文对象。

### 浏览器存储、备份与管理

- 保留 v0.5.1.1 的 IndexedDB 数据库名称和对象存储，现有浏览器音频覆盖可直接继续使用。
- 保留每段音频 50 MB 上限以及 WAV、MP3、OGG/OGA、M4A、AAC、FLAC 和 WebM 支持。
- 保留 Admin 数据库统计、`.bpao` 完整导出、普通导入、导入并替换及两步确认清空数据库。
- 保留备份格式验证、SHA-256 校验、512 MB 导入上限和普通导入不覆盖已有句子的保护。
- 自定义覆盖音频继续完全保存在浏览器配置中；脚本无需 Python、本地 HTTP 服务或网络权限。
- 练习录音与逐句覆盖数据库明确分离，临时录音不会被导出。

### 界面与发布整理

- 保留 v0.5.1.1 的 UI 修复：主面板不再显示占用句子空间的空闲存储提示。
- 保留 Admin 帮助文字的全宽换行布局，导入与“导入并替换”的说明不再被省略号截断。
- 录音状态、开关和麦克风模式加入现有多语言界面。
- 版本统一为 `0.6.0`，并继续使用 Greasy Fork 现有脚本名称、namespace、IndexedDB 名称和偏好键，确保正常覆盖更新。
- 更新用户文档，补充安装/升级、快捷键、Firefox、录音隐私、备份恢复及禁用旧版本说明。

## 0.5.1.1 — 2026-06-24

- 仅包含界面布局调整，播放、IndexedDB、导入导出和数据库逻辑不变。
- 移除主面板空闲时的“音频只保存在当前浏览器配置中”提示，为句子显示保留更多横向空间。
- 将 Admin 帮助文字移到按钮上方的全宽行，允许正常换行，不再用省略号截断。

## 0.5.1 — 2026-06-24

- 修复 BunPro 没有原生音频时，本地播放/暂停和进度控件偶尔保持禁用的问题。
- 本地覆盖生效时显式启用脚本播放器控件，并移除 BunPro 的“音频不可用”样式。
- 离开题目或删除覆盖后，完整恢复 BunPro 原来的禁用状态和样式。
- 提升 BunPro 替换播放器 DOM 节点时的按钮识别稳定性。
- 调整 P 键行为：停止状态下从头播放；播放状态下立即停止并把进度归零。
- 播放器内部的三角/暂停按钮继续作为普通暂停与继续控制。

## 0.5.0 — 2026-06-20

- 公开脚本名称统一为 **BunPro Local Audio Override**。
- 保留 v0.4.1 的 IndexedDB 数据和内部偏好键，支持无损升级。
- 新增 **Admin** 数据库管理模式。
- 新增 `.bpao` 完整备份导出。
- 新增普通导入，保留相同统一化句子键的现有记录。
- 新增“导入并替换”，允许覆盖相同句子键的现有记录。
- 新增带 10 秒确认超时的两步清空数据库操作。
- 新增音频数量和总大小统计。
- 备份条目加入 SHA-256 完整性信息，并在导入时校验。
- Admin 功能加入七种界面语言。
- 保留 v0.4.1 的播放、速度同步、BunPro 播放器整合和补充音频按钮功能。

## 0.4.1 — 2026-06-20

- 以稳定的 v0.3.2 播放器和页面整合逻辑重新构建 serverless 版本。
- 用浏览器 IndexedDB 替代本地 HTTP API。
- 移除全部网络授权、localhost 连接、Python 和 BAT 依赖。
- 修复 v0.4.0 因 MutationObserver 自触发循环造成的 BunPro 页面卡死。
- 保留 BunPro 风格的播放/暂停、进度、拖动、剩余时间、语速、P 键和补充音频按钮功能。
- 能够读取已由 v0.4.0 成功保存到相同 IndexedDB 中的音频记录。
- 从公开分发脚本中移除个人路径和仅供本地开发使用的信息。

## English release summary for Greasy Fork

### Version 0.6.0

- Merged the browser-only IndexedDB edition with the recording, playback-stability, Firefox speed-sync, and September 2026 BunPro layout fixes from the 3.6.x development line.
- Added voice practice: press **P** to play the reference and start a take, then press **O** to stop and review it immediately.
- Added a recording on/off toggle, raw and processed microphone modes, a reusable microphone stream, a 120-second take limit, and three-minute idle release.
- Practice takes remain temporary in page memory. They are not saved in IndexedDB, included in `.bpao` backups, or uploaded.
- Fixed first-play delays, repeated microphone initialization stalls, stale P/O playback state, late permission cleanup, and rejected-constraint fallback behavior.
- Tracks BunPro media that Firefox keeps outside the DOM and mirrors playback-rate changes such as 75% and 85% while excluding the script's own media.
- Added support for `.bp-quiz-question` and `.bp-quiz-console` while retaining legacy `js-tour-quiz-*` compatibility.
- Fixed the management panel overlapping BunPro's Undo / Show Info / Alternatives row when no player is visible, without changing its correct player-open position.
- Added a grace period for transient BunPro rerenders and ignored self-owned progress mutations to prevent playback interruption and excessive resync work.
- Retained all v0.5.1.1 browser storage, BunPro-style player, Admin, backup/import, integrity verification, and UI layout features.
- Existing v0.4.x/v0.5.x IndexedDB audio remains available after upgrading. Disable all older or duplicate copies before refreshing BunPro.
