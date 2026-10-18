# BunPro Local Audio Override v0.6.1.5

> 在浏览器中为 BunPro 句子保存自定义音频，并通过 P 键录音、O 键回听自己的发音。无需 Python、本地服务器或音频上传。

[Greasy Fork 安装页面](https://greasyfork.org/en/scripts/583595-bunpro-local-audio-override)

## 功能概览

BunPro Local Audio Override 是一个面向 BunPro 复习、Cram 和自学句子的油猴脚本。它可以把一个本地音频文件与当前句子关联，并在之后遇到同一句时，用自定义音频替代 BunPro 的句子音频。

v0.6.1.5 将浏览器存储版的音频管理功能与口语练习录音整合到同一个脚本中：

- 自定义音频按句子保存在当前浏览器的 IndexedDB 中。
- 无需 Python、BAT、后台服务、固定文件路径或网络权限。
- 保留 BunPro 风格的播放器，包括播放/暂停、进度、拖动、剩余时间、语速和音量。
- BunPro 没有原生音频按钮时，只要当前句子有本地覆盖，脚本也会补出播放按钮和播放器。
- 支持 P 键播放参考音频并开始录音，O 键停止录音并立即回听。
- 提供录音开关，以及“原始”和“降噪”两种麦克风模式。
- 提供 1×、1.5×、2×、3×、4× 录音增益，方便轻声练习后回听。
- 麦克风不可用或 USB 断连时，参考播放不再等待录音启动；失败后暂缓重试，支持设备恢复。
- 提供 `.bpao` 数据库导出、导入、覆盖导入、完整性校验和清空功能。
- 提供 **Compress Audio / 压缩音频**，在浏览器中批量压缩已保存的逐句音频，并显示进度和节省空间。
- 提供默认关闭、会记住选择的“自动压缩新音频”开关，用于之后保存或导入的音频。
- `.bpao` 导入、导出不再设置 512 MiB 的整包大小上限。
- 兼容 BunPro 旧版 Review 结构以及 2026 年 9 月启用的新版页面结构。
- 界面支持 English、简体中文、繁體中文、Español、Bahasa Indonesia、Français 和日本語。

这是非官方社区项目，与 BunPro 官方无隶属关系。

## 安装

1. 安装 Tampermonkey，或其他兼容的用户脚本管理器。
2. 打开 [Greasy Fork 页面](https://greasyfork.org/en/scripts/583595-bunpro-local-audio-override)，点击安装。
3. 保存脚本并刷新已打开的 BunPro 页面。
4. 在 BunPro 完成一道填空题并显示正确答案；本地音频面板会出现在答案区附近。

脚本匹配：

- `https://bunpro.jp/*`
- `https://www.bunpro.jp/*`

## 从旧版本升级

从 Greasy Fork v0.4.x、v0.5.x、v0.6.0 或 v0.6.1 升级时，IndexedDB 的数据库名称与存储表保持不变，已经保存的逐句音频应继续可用。升级前仍建议先在 **Admin** 中导出一份 `.bpao` 备份。

请务必在 Tampermonkey Dashboard 中禁用或删除其他 BunPro Local Audio Override 副本，包括：

- 旧的 Community Edition；
- 旧的 Serverless 版本；
- 手工粘贴而没有被 Greasy Fork 更新覆盖的重复副本。

同时运行两个版本会让它们一起拦截 P/O 快捷键、音频按钮和麦克风操作，可能导致重复播放、播放器状态冲突或重复权限请求。禁用旧版本后，请完整刷新 BunPro 标签页。

## 保存和播放自定义音频

1. 在 BunPro 填空题中提交答案，直到页面显示正确答案。
2. 在本地音频面板中点击 **Choose audio… / 选择音频…** 按钮。
3. 选择 WAV、MP3、OGG/OGA、M4A、AAC、FLAC 或 WebM 音频文件。
4. 点击 **Test / 测试** 试听所选文件；测试不会创建句子映射。
5. 点击 **Save / 保存**，把音频与当前句子关联。
6. 按 P，或点击答案区的音频按钮，从头播放本地覆盖音频。
7. 点击 **Delete / 删除** 可移除当前句子的覆盖，并恢复 BunPro 原生音频行为。

每个音频文件最大 50 MiB（52,428,800 字节）。浏览器安全机制不允许 serverless 脚本静默读取 `C:\temp\001.wav` 之类的固定路径，因此每次添加新音频时必须通过浏览器文件选择器选择文件。

句子键会在保存和查询时进行统一化处理，以减少页面空格和字符形式差异造成的重复映射。

## 快捷键和播放器操作

快捷键仅在适用的 BunPro 答题页面中生效；组合键和长按产生的自动重复不会被当作新的录音操作。

| 操作 | 行为 |
| --- | --- |
| P（停止状态） | 从头播放当前参考音频；录音开启时，同时开始一段新的口语练习录音。当前句子有本地覆盖时播放本地音频；没有覆盖时把原始按键交给 BunPro 播放原音频。 |
| P（正在播放） | 停止参考音频并把进度归零，同时结束当前录音并保留这一次录音，等待 O 键回听。 |
| O | 若正在录音，先停止录音和参考音频，再立即回放最新录音；若录音已完成，则直接重新回放最新录音。 |
| 答案区音频按钮 | 打开并从头播放本地覆盖；播放器已打开时可关闭播放器并停止播放。 |
| 播放器播放/暂停按钮 | 正常暂停和继续，不强制回到开头。 |
| 左方向键 | 当播放器进度控件获得焦点时，后退 5 秒。 |
| 右方向键 | 当播放器进度控件获得焦点时，前进 5 秒。 |
| Home | 当播放器进度控件获得焦点时，跳到开头。 |
| End | 当播放器进度控件获得焦点时，跳到结尾。 |

O 键开始回听时，脚本会先停止本地或 BunPro 的参考音频，避免参考音频和录音同时播放。

使用面板按钮或选择框后，P/O 仍可正常工作；只有在文本输入框中输入时才暂停快捷键。鼠标或触摸操作后，控件会释放焦点，让 Enter 等页面按键继续生效；键盘操作保留焦点，方便继续导航。状态消息独占一行并自动换行，切换界面语言时，当前消息和查询错误也会立即更新。句子和所选文件名的提示可显示全文，其他标签不再被截断。

v0.6.1 还修复了一个连续练习问题：录音回听自然结束后，下一次按 P 会直接开始参考音频和新录音，不再需要按第二次。

v0.6.1.3 进一步处理连续按 O 的情况：旧回放和旧录音停止操作的迟到回调不会中断新一轮回听，失败的备用回放也会释放自己的资源。

## 麦克风断连与恢复（0.6.1.3）

本地参考播放不再等待麦克风授权、设备初始化或录音增益恢复。没有麦克风也可以继续用 P 播放；BunPro 原音路径仍直接接收原始 P 键事件。

- 获取麦克风最多等待 10 秒；等待过程中不阻塞参考播放。超时、取消或过期请求后来才获得的输入会被释放，不会自动开始旧录音或覆盖新设备状态。
- 输入或增益启动失败后暂缓录音重试 30 秒，避免每次 P 都重新打开不可用设备。参考播放照常，录音开关的保存设置不会被自动关闭。
- 浏览器报告设备变化后，下一次 P 可以重试；也可以手动关闭再开启 **Rec**，或切换麦克风处理模式后按 P 立即重试。设备变化本身不会自动申请麦克风或开始录音。
- 短暂的无输入状态允许 1.5 秒恢复；持续无输入或设备结束会释放旧输入，尽可能保留已经录到的片段供 O 回听。
- 冷启动或首次授权期间，录音可能晚于参考音频开始；参考播放不会为了等待录音而停住。

如果耳机同时是声音输出设备，拔出后仍需保证 Windows/Firefox 有可用的输出。脚本不能替代系统的音频输出切换。

## 语速同步

本地播放器支持 75% 至 125% 的备用语速，每 5% 一档。脚本按以下顺序寻找当前应使用的速度：

1. BunPro 当前速度菜单中已选的值；
2. 最近一次观察到的 BunPro 播放器速度；
3. BunPro 保存在 localStorage 或 sessionStorage 中的音频速度；
4. BunPro 当前媒体元素的 `playbackRate`；
5. 本地音频面板中选择的备用速度。

在 Firefox 中，BunPro 可能使用没有插入页面 DOM 的 `new Audio()` 播放句子。脚本会从页面启动时追踪这些实际播放的媒体对象及其 `playbackRate`，因此 BunPro 的 75% 或 85% 设置也能同步到本地覆盖音频。

脚本会排除自己的本地播放器和录音回放播放器，避免把它们的默认 100% 误认成 BunPro 的速度。

## 口语练习录音

录音功能默认开启。首次在 **Rec on / 录音开** 状态下按 P 时，浏览器会请求 BunPro 站点的麦克风权限。

- **Rec on / 录音开**：P 播放参考音频并开始录音，O 回听最新录音。
- **Rec off / 录音关**：P 和 O 不会访问麦克风；关闭录音时会停止并释放正在使用的麦克风。已经完成的最后一段录音仍可用 O 回听，直到下一次录音或页面关闭。
- **Mic: raw / 麦克风：原始**：默认模式，关闭回声消除、降噪和自动增益。它能避免部分 Chromium 设备在录音启动时让参考音频卡住。
- **Mic: clean / 麦克风：降噪**：开启回声消除、降噪和自动增益，可减少参考音频被录入，但在部分设备上可能影响播放稳定性。

脚本会复用同一个麦克风流，而不是每按一次 P 都重新初始化设备。麦克风会在以下情况释放：

- 连续空闲 3 分钟；
- 关闭录音功能；
- 浏览器或设备结束音轨；
- 离开或关闭页面。

单次录音最长 120 秒。达到上限后会自动停止，并保留该段录音供 O 键回听。

### Mic gain / 录音增益

轻声说话时，可在主面板麦克风模式旁的 **录音增益** 中先选择 **2×**，再按 P 录音、按 O 回听。如果仍偏小，可以逐步试 3× 或 4×。

- 可选 1×、1.5×、2×、3×、4×，默认 1×；选择会保存在当前版本的设置中，刷新后仍记得。
- 从下一次 P 录音开始生效。录音中更改选项不会改变当前这段，也不会重开麦克风；已完成的录音不会被再次放大。
- 增益发生在录音编码之前，因此 O 键的常规回放和兼容性备用回放都会播放已经增强的声音。
- 1× 保留原来的直接录音路径；更高档位加入软限幅，减轻大峰值的过载。增益不是降噪，也不保证任意音量都不失真；背景噪声和被麦克风拾取的其他声音同样会增大。
- 不调整 BunPro/本地参考音频、系统音量或系统麦克风设置，也不会把麦克风实时送到扬声器。
- 原始/降噪麦克风模式均可配合使用。若增益无法启动会显示提示并暂缓重试，不影响参考播放；可先选回 1×，关闭再开启 Rec 后按 P 重试。

### 录音隐私

- 口语练习录音只作为临时 Blob 保存在当前页面会话的内存中。
- 录音不会写入自定义音频 IndexedDB，不会加入 `.bpao` 备份，也不会上传到网络。
- 开始下一次录音或关闭页面后，旧录音会被清除。切换题目会停止正在进行的回放，但会在当前页面会话中保留最后一段录音供 O 键回听。
- 麦克风权限由浏览器管理；不希望使用录音时，可以在首次按 P 前将面板切换为 **Rec off / 录音关**，也可以在浏览器的站点权限中撤销麦克风权限。

逐句保存的“本地覆盖音频”与临时的“口语练习录音”是两类不同数据：前者持久保存在 IndexedDB 并可备份，后者仅用于即时回听。

## 备份、恢复和数据库管理

正确回答一道填空题后，点击面板中的 **Admin / 管理**。

### Export to File / 导出到文件

把浏览器中全部逐句音频覆盖导出为一个 `.bpao` 文件。支持保存位置选择器的浏览器会让你选择保存位置；其他浏览器会使用普通下载流程。

备份包含句子、原始文件名、MIME 类型、更新时间、SHA-256 校验值和 Base64 编码的音频数据。Base64 会让备份文件比原始音频总大小更大。

v0.6.1.1 不再限制单个 `.bpao` 备份的总大小。v0.6.1.5 导出逐条构建备份，不再拼接整个库的 JSON 字符串；导入仍会一次读取完整 JSON/Base64 文件，超过约 512 MiB 的备份仍可能失败。实际可处理的大小取决于可用内存，保存和恢复还受到磁盘空间与浏览器站点存储配额影响。旧版 v0.6.0/v0.6.1 仍可能拒绝超过 512 MiB 的备份，恢复大备份前请升级。

### Compress Audio / 压缩音频

把已经保存的逐句覆盖音频批量转换成适合语音练习的 **Opus、单声道、目标 64 kbps** 音频。在 Admin 中点击 **Compress Audio / 压缩音频**，阅读确认提示后开始。

- 压缩完全在当前浏览器中进行，使用浏览器原生编码器；Firefox 使用 Ogg/Opus，Chrome 使用 WebM/Opus。
- 不访问麦克风，不上传音频，也不修改原来在磁盘中选择的源文件。
- 处理对象是 IndexedDB 中持久保存的逐句音频，不包括 P/O 的临时练习录音。
- 一次处理一条，通常需要接近待压缩音频总时长的时间。请保持页面打开；面板会显示进度、节省空间、跳过和失败的数量。
- 只有转换结果可以解码，并且体积至少减少 10% 时，才会替换数据库中的原音频。已使用此功能压缩过的音频，以及体积已经足够小的有损音频会跳过。
- 转换失败或不能节省足够空间时保留原音频。若其他标签页同时修改了某条记录，压缩操作不会覆盖那次修改。
- 可以取消；已经完成的压缩会保留，尚未处理的音频保持原样。
- 编码器启动最多等待 10 秒，并可在启动期间取消；启动超时后按钮会恢复，未处理的原始音频不会被替换。自动压缩也使用相同的启动保护。

这是有损压缩，会替换数据库中的音频，不能从压缩结果还原原始音质。**建议先使用 Export to File 导出备份**；需要恢复时，先关闭自动压缩新音频，再通过 Import & Replace 导入压缩前的备份。

### 自动压缩新音频

Admin 中的自动压缩开关默认关闭，选择会保存在当前浏览器中，刷新页面后仍会保留。开启后，脚本会在以下操作写入数据库之前尝试压缩新音频：

- **Save / 保存**：处理这次选择并准备保存的音频。
- **Import / 导入**：仅处理将新增的记录；已存在而被跳过的句子不会触发压缩。
- **Import & Replace / 导入并替换**：处理这次将新增或替换的音频。

自动压缩与批量压缩使用相同的本地 Opus 设置和体积检查。失败、无法使用压缩器或压缩后不能至少缩小 10% 时，继续使用本次选择或备份中的原始音频。开启开关不会重新处理数据库中已有的音频；要压缩现有库，请使用 **Compress Audio / 压缩音频**。

开启后，保存和导入需要额外的编码时间。如果要逐字节恢复备份中的原始音频，请在导入前关闭此开关。

### Import / 导入

导入备份中尚不存在的句子。如果当前浏览器已经有相同的统一化句子键，会保留现有记录并跳过备份中的同名记录。

### Import & Replace / 导入并替换

导入新句子，并用备份内容替换当前浏览器中相同句子键的记录。替换时，旧记录中的音频 Blob 会随记录一起被替换。

### Clean Database / 清空数据库

删除当前浏览器中全部逐句音频覆盖。该操作需要在 10 秒内进行第二次确认，以降低误触风险。它不会删除磁盘上已经导出的 `.bpao` 文件。

### 导入保护

- 导入前会验证备份格式版本和每个条目。
- 每段音频会进行 SHA-256 完整性校验。
- 单个音频仍受 50 MiB 上限限制。
- v0.6.1.1 不再设置整包大小上限；内存、磁盘和浏览器存储配额仍然适用。
- 普通 **Import / 导入** 不会覆盖已有句子。

`.bpao` 当前格式标识为 `bunpro-local-audio-override`，格式版本为 `1`。

## 本地存储与隐私

逐句覆盖音频保存在当前浏览器配置中的以下位置：

- IndexedDB 数据库：`BunProLocalAudioOverrideCommunity`
- 对象存储：`audioOverrides`

脚本不需要网络权限，也不会把自定义音频或练习录音发送到 BunPro 或其他服务器。请注意：

- 清除 `bunpro.jp` 的站点数据可能删除全部覆盖音频；
- 删除浏览器配置、使用临时配置或某些隐私模式也可能删除数据；
- 不同浏览器和不同浏览器配置不会自动共享数据库；
- 建议定期从 Admin 导出 `.bpao` 备份。

## BunPro 页面兼容性

v0.6.1.5 同时支持：

- 旧版 `#js-tour-quiz-question`、`#js-tour-quiz-answer` 和 `#js-tour-quiz-pam` 结构；
- 新版 `#js-quiz .bp-quiz-question` 和 `.bp-quiz-console` 结构。

脚本也会处理 BunPro React 重渲染期间的短暂页面状态变化，避免正在播放的音频因为瞬时“不可用”状态而被错误中断。

## Firefox 注意事项

- 第一次录音时，请在 Firefox 的麦克风权限提示中选择允许；若不需要录音，请使用 **Rec off**。
- 支持追踪 Firefox 中脱离 DOM 的 BunPro 音频播放器，并同步其 75%/85% 等播放速度。
- 若 Firefox 阻止自动播放，请直接按 P 或点击播放按钮，以提供浏览器要求的用户操作。
- 若选择文件或 IndexedDB 被隐私设置禁用，脚本无法保存覆盖音频；请检查 `bunpro.jp` 的站点权限和存储设置。

## 常见问题

### 面板没有出现

面板只在脚本能够识别的 BunPro 填空题状态中显示。请先提交正确答案，再确认脚本已启用并刷新页面。

### P/O 出现重复播放或重复录音

打开 Tampermonkey Dashboard，只保留 v0.6.1.5，禁用所有旧版或重复副本，然后完整刷新 BunPro 页面。

### 没有本地覆盖时，P 键是否仍可使用

可以。没有本地覆盖时，脚本让 BunPro 直接接收真实的 P 键事件并播放原音频；如果录音功能开启，脚本只在旁边同步开始口语练习录音。

### 删除覆盖后播放器不正常

刷新当前题目或页面，并确认没有另一个旧版脚本同时运行。脚本在删除覆盖或切换题目时会恢复 BunPro 原本的按钮状态和样式。

### 麦克风权限已允许但录音失败

确认系统没有把麦克风独占给其他程序，并尝试在面板中切换“原始/降噪”模式。模式变化后，脚本会释放旧流，并在下次按 P 时按新设置重新获取麦克风。

## English summary for Greasy Fork

**BunPro Local Audio Override v0.6.1.5** stores a custom audio clip for each BunPro cloze sentence in the browser's IndexedDB and plays it through a BunPro-style player. No Python process, localhost service, fixed source path, network permission, or upload is required.

New in **0.6.1.5**: large libraries can be exported, because the backup is now built entry by entry; the `.bpao` format is unchanged. A failed export through the save dialog leaves no partial file. Storage recovers without a page reload if the database connection closes, and pressing P right after the answer is revealed plays your local clip. Recording controls are translated in all seven interface languages. P/O keep working after using panel controls; mouse and touch interactions release focus for page keys, while keyboard navigation retains it. Switching language updates the current message and lookup error immediately. Status messages wrap on their own line, controls wrap in groups without truncated labels, and a translated choose-audio button opens the file chooser.

New in **0.6.1.3**: reference playback no longer waits for recording startup when a microphone is missing, disconnected or slow to initialize. Device requests time out after 10 seconds, failed capture attempts back off for 30 seconds, and stale requests cannot take over a newer recording. Reconnect the device or switch Rec off/on, then press P to retry. Short input interruptions have a recovery grace period; device changes do not start recording automatically. Existing gain, P/O review, speed synchronization and compression remain available.

Repeated **O** presses also handle delayed callbacks safely: an older playback or recording-stop operation cannot stop the newer replay. Manual and automatic compression now share cancellable startup with a 10-second timeout; a stalled encoder no longer leaves the controls busy indefinitely.

New in **0.6.1.2**: **Mic gain** makes quiet voice-practice recordings easier to hear. Choose 1× (unchanged), 1.5×, 2×, 3× or 4×; start with 2× if you speak softly. The preference is remembered and applies to the next P recording, not an existing take. Boosting happens before encoding, with soft peak protection. It does not change reference audio or system settings, and there is no live microphone monitoring. Background noise can become louder too.

Press **P** to play the current reference audio and, when recording is enabled, start a voice-practice take. Press **P** again to stop, or press **O** to stop and immediately review the latest take. Recording can be disabled completely. Raw and processed microphone modes are available, the microphone stream is reused to prevent playback stalls, and each take is limited to 120 seconds. Practice recordings remain temporary in page memory and are never included in the audio database or backups.

The Admin view can export all saved overrides to a portable `.bpao` file, import only new sentences, import and replace existing sentences, verify SHA-256 checksums, show database statistics, or clean the database with a two-step confirmation.

New in **0.6.1.1**: **Admin → Compress Audio** converts saved sentence audio locally to mono Opus at a target 64 kbps, using Ogg in Firefox and WebM in Chrome. It does not use the microphone, upload audio, or include temporary P/O recordings. Clips are processed one at a time, with progress and space savings shown. Only decodable results at least 10% smaller replace the original database audio; already compressed or sufficiently small lossy clips are skipped, and failures keep the original. You can cancel and retain completed results. Compression is lossy, so export a backup first. Your original source files on disk are not changed.

An optional **automatic compression** setting applies the same process to newly selected clips on Save and incoming clips on Import or Import & Replace. It is off by default and remembers your choice. Only clips that will actually be written are processed; turning it on does not recompress the existing library. If compression fails or saves too little space, the original incoming audio is used. Disable this setting before importing a backup if you want to restore its original audio bytes exactly.

The 512 MiB whole-backup cap has been removed from the script. The 50 MiB per-clip limit remains. Export builds the backup entry by entry without one library-sized JSON string. Import still reads the whole JSON/Base64 file, so backups larger than about 512 MiB can still fail. Available memory, disk space, and browser storage quota determine practical capacity.

Version 0.6.1.5 retains support for both legacy and September 2026 BunPro review layouts. It also tracks BunPro audio objects that Firefox keeps outside the DOM, allowing local overrides to follow BunPro playback rates such as 75% and 85%. The 0.6.1 fix is retained: after an O-key recording review ends naturally, the next P press starts a new playback-and-recording cycle immediately. Disable every older or duplicate copy of the script before use.
