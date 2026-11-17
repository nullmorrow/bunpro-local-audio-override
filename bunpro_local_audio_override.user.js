// ==UserScript==
// @name         BunPro Local Audio Override
// @namespace    bunpro.local-audio-override.serverless
// @version      0.6.2.0
// @description  Store per-sentence audio overrides in your browser and practise speaking with P-to-record / O-to-review. No local server or upload required.
// @description:zh-CN  把逐句自定义音频保存在浏览器中，在 BunPro 复习时播放，并通过 P 键录音、O 键回听。无需本地服务，也不会上传音频。
// @description:zh-TW  把逐句自訂音訊保存在瀏覽器中，在 BunPro 複習時播放，並透過 P 鍵錄音、O 鍵回聽。無需本機服務，也不會上傳音訊。
// @author       QEWLsdAH
// @license      MIT
// @match        https://bunpro.jp/*
// @match        https://www.bunpro.jp/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const ACTIVE_INSTANCE_KEY = '__bpLocalAudioOverrideActive';
    if (window[ACTIVE_INSTANCE_KEY]) {
        console.warn('[BunPro Local Audio] Another copy is already active; this copy will not start.');
        return;
    }
    try {
        Object.defineProperty(window, ACTIVE_INSTANCE_KEY, {
            value: '0.6.1.6',
            configurable: true,
        });
    } catch {
        window[ACTIVE_INSTANCE_KEY] = '0.6.1.6';
    }

    const CONFIG = Object.freeze({
        DB_NAME: 'BunProLocalAudioOverrideCommunity',
        DB_VERSION: 1,
        DB_STORE_NAME: 'audioOverrides',
        DB_BLOCKED_TIMEOUT_MS: 10000,
        MAX_AUDIO_BYTES: 50 * 1024 * 1024,
        BACKUP_FORMAT: 'bunpro-local-audio-override',
        BACKUP_FORMAT_VERSION: 1,
        BACKUP_EXTENSION: '.bpao',
        BACKUP_READ_CHUNK_BYTES: 8 * 1024 * 1024,
        BACKUP_ENTRY_MAX_BYTES: Math.ceil(50 * 1024 * 1024 / 3) * 4 + 1024 * 1024,
        BACKUP_MEMBER_MAX_BYTES: 1024 * 1024,
        IMPORT_BATCH_BYTES: 32 * 1024 * 1024,
        SCRIPT_VERSION: '0.6.2.0',
        CLEAN_CONFIRM_TIMEOUT_MS: 10000,
        COMPRESSION_START_TIMEOUT_MS: 10000,
        DEFAULT_FALLBACK_RATE: 1.0,
        VOICEVOX_DEFAULT_URL: 'http://127.0.0.1:50021',
        VOICEVOX_QUERY_TIMEOUT_MS: 15000,
        VOICEVOX_SYNTHESIS_TIMEOUT_MS: 60000,
        FALLBACK_RATE_MIN: 0.75,
        FALLBACK_RATE_MAX: 1.25,
        FALLBACK_RATE_STEP: 0.05,
        SYNC_INTERVAL_MS: 750,
        PANEL_GAP_PX: 10,
        PANEL_EDGE_PX: 8,
        // Reopening getUserMedia on every P can switch Chrome's audio rendering
        // path and stall reference playback. Reuse the stream until it has been idle.
        MIC_IDLE_RELEASE_MS: 180000,
        MIC_REQUEST_TIMEOUT_MS: 10000,
        MIC_FAILURE_RETRY_MS: 30000,
        MIC_MUTE_GRACE_MS: 1500,
        // Bound each take to 120 seconds while retaining it for O replay.
        RECORDING_MAX_DURATION_MS: 120000,
        // BunPro briefly invalidates data-meta-* during question changes and prefetch.
        // Allow a grace period so transient metadata does not interrupt playback.
        PAGE_STATE_GRACE_MS: 1500,
        DEBUG: false,
    });

    const STORAGE_KEYS = Object.freeze({
        FALLBACK_RATE: 'bpLocalAudioServerlessFallbackRate',
        LAST_OBSERVED_RATE: 'bpLocalAudioServerlessLastObservedRate',
        UI_LANGUAGE: 'bpLocalAudioServerlessUiLanguage',
        RECORDING_ENABLED: 'bpLocalAudioServerlessRecordingEnabled',
        MIC_PROCESSING: 'bpLocalAudioServerlessMicProcessing',
        RECORDING_GAIN: 'bpLocalAudioServerlessRecordingGain',
        AUTO_COMPRESS: 'bpLocalAudioServerlessAutoCompress',
        VOICEVOX_URL: 'bpLocalAudioServerlessVoicevoxUrl',
        VOICEVOX_STYLE: 'bpLocalAudioServerlessVoicevoxStyle',
        VOICEVOX_LABEL: 'bpLocalAudioServerlessVoicevoxLabel',
        VOICEVOX_SPEED: 'bpLocalAudioServerlessVoicevoxSpeed',
    });

    const SUPPORTED_LANGUAGES = Object.freeze([
        'auto', 'en', 'zh-CN', 'zh-TW', 'es', 'id', 'fr', 'ja',
    ]);

    const LANGUAGE_NAMES = Object.freeze({
        auto: 'Auto',
        en: 'English',
        'zh-CN': '简体中文',
        'zh-TW': '繁體中文',
        es: 'Español',
        id: 'Bahasa Indonesia',
        fr: 'Français',
        ja: '日本語',
    });

    const I18N = Object.freeze({
        en: {
            voicevox: 'VOICEVOX',
            voicevoxVoice: 'Voice',
            voicevoxSpeed: 'Speed',
            voicevoxUrl: 'Engine address',
            voicevoxLoad: 'Load voices',
            voicevoxChooseVoice: 'Load voices to choose',
            voicevoxCancel: 'Cancel',
            voicevoxGenerating: 'Generating with VOICEVOX…',
            voicevoxReady: 'VOICEVOX ready — {voice}. {result}',
            voicevoxMatched: 'Reading matched.',
            voicevoxCorrected: 'Reading corrected: {words}.',
            voicevoxPartial: 'Some kanji have no furigana.',
            voicevoxUnverified: 'Reading unverified: no furigana.',
            voicevoxMismatch: 'Reading may still differ.',
            voicevoxUnreachable: 'Cannot reach VOICEVOX at {url}. Start VOICEVOX, add https://bunpro.jp to Allow Origin at {url}/setting, then restart VOICEVOX.',
            voicevoxTimeout: 'VOICEVOX request timed out.',
            voicevoxCancelled: 'VOICEVOX cancelled.',
            voicevoxEngineError: 'VOICEVOX engine error (HTTP {status}).',
            voicevoxInvalidUrl: 'Enter a loopback HTTP(S) address using 127.0.0.1, localhost or [::1], with an optional port.',
            voicevoxLoaded: 'Loaded {count} VOICEVOX voices.',
            voicevoxNoSentence: 'No sentence is available for VOICEVOX.',
            voicevoxInvalidResponse: 'VOICEVOX returned invalid audio or response data.',
            voicevoxNoVoices: 'VOICEVOX has no talk voices.',
            voicevoxFailed: 'VOICEVOX failed: {error}',
            // General
            panelTitle: 'Local audio override',
            statusWaiting: 'Waiting for answer',
            statusNone: 'No local override',
            statusLoading: 'Checking browser storage',
            statusServiceError: 'Browser storage unavailable',
            statusPlaying: 'Playing local audio',
            statusFound: 'Local override active',
            sentencePrefix: 'Sentence: {sentence}',
            sentenceUnreadable: 'Unable to read the current sentence',
            chooseFile: 'Choose audio file',
            chooseAudio: 'Choose audio…',
            noFileSelected: 'Choose an audio file first.',
            selectedFile: 'Selected: {file}',
            storedFile: 'Stored: {file}',
            storageNote: 'Audio is stored only in this browser profile.',
            storageUnavailable: 'Browser storage failed: {error}',
            storageBlocked: 'Browser storage is blocked or unavailable.',
            fileTooLarge: 'The selected file is larger than 50 MB.',
            invalidAudioFile: 'The selected file does not look like an audio file.',
            testingFile: 'Testing {file}…',
            save: 'Save',
            test: 'Test',
            delete: 'Delete',
            playLocalAudio: 'Play local audio',
            pauseLocalAudio: 'Pause local audio',
            closeLocalPlayer: 'Close the local audio player',
            scrubLocalAudio: 'Scrub manually through the local audio',
            localPlayerSettings: 'Open the local audio speed settings',
            fallbackSpeed: 'Speed',
            language: 'Language',
            autoLanguage: 'Auto',
            speedCurrent: '{rate} · {source}',
            speedSourceMedia: 'BunPro media',
            speedSourceMenu: 'BunPro menu',
            speedSourceStorage: 'BunPro storage',
            speedSourceObserved: 'last player choice',
            speedSourceFallback: 'plug-in setting',
            mappingMissingFile: 'The saved mapping exists, but its audio data is missing',
            preloadFailed: 'Mapping found, but audio preload failed: {error}',
            entryMissingFile: 'The saved override has no audio data',
            questionChanged: 'The question changed; the old audio load was cancelled',
            localPlayFailed: 'Local playback failed: {error}',
            saving: 'Saving audio in this browser…',
            saved: 'Saved in this browser profile.',
            savePreloadFailed: 'Saved, but preload failed: {error}',
            deleting: 'Deleting override…',
            deleted: 'Deleted. BunPro audio has been restored for this sentence.',
            testStarted: 'Test playback started.',
            testFailed: 'Test failed: {error}',
            recordingUnsupported: 'This browser does not support microphone recording.',
            recordingStarting: 'Requesting the microphone…',
            recordingActive: 'Recording… Press P to stop or O to review.',
            recordingStopped: 'Recording ready ({size}). Press O to review.',
            recordingEmpty: 'No recorded audio is available. Press P to start recording.',
            recordingPlaybackStarting: 'Preparing recording playback…',
            recordingPlaybackActive: 'Playing your recording…',
            recordingPlaybackEnded: 'Recording playback finished.',
            recordingStartFailed: 'Unable to start microphone recording: {error}',
            recordingPlaybackFailed: 'Unable to play the recording: {error}',
            recordingOffLabel: 'Rec off',
            recordingOnLabel: 'Rec on',
            recordingOffTitle: 'Voice recording is off. P and O never touch the microphone. Click to turn it on.',
            recordingOnTitle: 'Voice recording is on. P records, O plays it back. Click to turn it off.',
            recordingDisabled: 'Voice recording is off.',
            recordingMicProcessingRaw: 'Mic: raw',
            recordingMicProcessingClean: 'Mic: clean',
            recordingMicProcessingRawTitle: 'Microphone processing is off (no echo cancellation). This is the setting that keeps playback from stalling. Click to switch.',
            recordingMicProcessingCleanTitle: 'Microphone processing is on (echo cancellation, noise suppression). Keeps the reference audio out of your recording, but Chrome may stall playback on some devices. Click to switch.',

            // Recording gain
            micGainLabel: 'Mic gain',
            micGainTitle: 'Boost your voice in the next P recording. 1× = original; try 2× for a quiet voice. Saved automatically. Does not change reference audio or an existing take; higher gain also boosts background noise.',
            micGainUnavailable: 'Microphone gain could not start. Reference playback continues. Switch Rec off/on to retry; choose 1× to record without gain.',

            // Microphone recovery
            micUnavailable: 'Microphone unavailable. Reference playback continues. Reconnect the device or switch Rec off/on to retry.',
            micRetryWaiting: 'Recording paused after a microphone error. Next P can retry in {seconds}s; reconnect the device or switch Rec off/on to retry now.',
            micRequestTimeout: 'Microphone request timed out; reference playback is unaffected.',

            // Admin
            admin: 'Admin',
            adminTitle: 'Audio database admin',
            adminHelp: 'Import keeps existing sentences. Import & Replace overwrites them.',
            adminStatsLoading: 'Reading database…',
            adminStats: '{count} clips · {size}',
            exportToFile: 'Export to File',
            importKeep: 'Import',
            importReplace: 'Import & Replace',
            cleanDatabase: 'Clean Database',
            confirmClean: 'Confirm Delete All',
            back: 'Back',
            noOverridesToExport: 'There are no saved audio overrides to export.',
            exporting: 'Preparing backup…',
            exportComplete: 'Exported {count} clips ({size}).',
            exportFailed: 'Export failed: {error}',
            importing: 'Reading and validating backup…',
            importCheckingProgress: 'Checking backup… {done}/{total}',
            importWritingProgress: 'Saving backup… {done}/{total}',
            importPartialFailed: 'Import stopped after saving {committed}/{total} entries: {error}. Import the same file again with the same button to finish.',
            importPartialCancelled: 'Import cancelled after saving {committed}/{total} entries. Import the same file again with the same button to finish.',
            importSummaryKeep: 'Imported {imported}; skipped {skipped} existing entries.',
            importSummaryReplace: 'Imported {imported}; replaced {replaced} existing entries.',
            importFailed: 'Import failed: {error}',
            invalidBackup: 'This is not a valid BunPro Local Audio Override backup.',
            unsupportedBackupVersion: 'Unsupported backup format version: {version}',
            backupEntryTooLarge: 'An audio clip in the backup is larger than 50 MB.',
            backupChecksumMismatch: 'Backup checksum mismatch for: {sentence}',
            chooseBackupFile: 'Choose a BunPro Local Audio Override backup file',
            cleanWarning: 'Click the confirmation button again to delete every saved clip.',
            cleaning: 'Deleting all saved audio overrides…',
            cleaned: 'Deleted {count} saved audio overrides.',
            databaseError: 'Database operation failed: {error}',

            // Compression
            compressAudio: 'Compress Audio',
            cancelCompression: 'Cancel Compression',
            autoCompressLabel: 'Auto-compress new audio',
            autoCompressTitle: 'Use lossy mono Opus compression for new audio saved with Save or imported from .bpao backups. Existing library audio is not changed. Your choice is remembered.',
            autoCompressionProgress: 'Auto-compressing new audio {done}/{total}…',
            autoCompressionSummary: 'Auto-compression: {changed} converted, {skipped} skipped, {failed} failed · saved {saved}.',
            autoCompressionCancelled: 'Cancelled. No audio was saved or imported.',
            autoCompressionUnavailable: 'Auto-compression unavailable: {error}. Original audio will be saved or imported normally.',
            compressionConfirm: 'Compress all saved audio to mono Opus at 64 kbps? This is lossy and cannot restore the original quality. Export a backup first if you want to keep originals. Only smaller, verified clips replace originals. Encoding is silent and takes roughly the total audio duration. Keep this tab open; you can cancel at any time.',
            compressionStarting: 'Preparing compression…',
            compressionProgress: 'Compressing {done}/{total} · saved {saved} · converted {changed}, skipped {skipped}, failed {failed}',
            compressionComplete: 'Compression complete: {changed} converted, {skipped} skipped, {failed} failed · saved {saved}.',
            compressionCancelled: 'Compression cancelled: {changed} converted, {skipped} skipped, {failed} failed · saved {saved}. Completed changes were kept.',
            compressionCancelling: 'Cancelling compression…',
            compressionFailed: 'Compression stopped: {error}. Completed changes were kept; unprocessed clips are unchanged.',
            compressionAbort: 'Audio compression cancelled.',
            compressionRecorderUnavailable: 'This browser cannot encode Opus audio with MediaRecorder.',
            compressionEncoderUnavailable: 'This browser has no supported Ogg/WebM Opus encoder.',
            compressionContextUnavailable: 'The audio compression context is unavailable.',
            compressionNoSamples: 'The source audio has no decodable samples.',
            compressionSuspended: 'Audio processing is suspended. Keep this tab active and try again.',
            compressionEncoderFailed: 'The Opus encoder failed.',
            compressionStoppedEarly: 'Audio encoding stopped before the clip finished.',
            compressionTimedOut: 'Audio encoding timed out. Keep this tab active and try again.',
            compressionEmptyClip: 'The Opus encoder produced an empty clip.',
            compressionValidationFailed: 'Encoded audio failed duration/channel validation; the original was kept.',
        },
        'zh-CN': {
            voicevox: 'VOICEVOX',
            voicevoxVoice: '音色',
            voicevoxSpeed: '语速',
            voicevoxUrl: '引擎地址',
            voicevoxLoad: '加载音色',
            voicevoxChooseVoice: '加载音色后选择',
            voicevoxCancel: '取消',
            voicevoxGenerating: '正在使用 VOICEVOX 生成……',
            voicevoxReady: 'VOICEVOX 已生成（{voice}）。{result}',
            voicevoxMatched: '读音匹配。',
            voicevoxCorrected: '已纠正读音：{words}。',
            voicevoxPartial: '部分汉字没有振假名。',
            voicevoxUnverified: '读音未验证：没有振假名。',
            voicevoxMismatch: '读音可能仍有差异。',
            voicevoxUnreachable: '无法连接 {url} 的 VOICEVOX。请启动 VOICEVOX，在 {url}/setting 的 Allow Origin 中添加 https://bunpro.jp，然后重启 VOICEVOX。',
            voicevoxTimeout: 'VOICEVOX 请求超时。',
            voicevoxCancelled: '已取消 VOICEVOX。',
            voicevoxEngineError: 'VOICEVOX 引擎错误（HTTP {status}）。',
            voicevoxInvalidUrl: '请输入使用 127.0.0.1、localhost 或 [::1] 的本机 HTTP(S) 地址，可附带端口。',
            voicevoxLoaded: '已加载 {count} 个 VOICEVOX 音色。',
            voicevoxNoSentence: '没有可用于 VOICEVOX 的句子。',
            voicevoxInvalidResponse: 'VOICEVOX 返回了无效的音频或响应数据。',
            voicevoxNoVoices: 'VOICEVOX 没有可用的朗读音色。',
            voicevoxFailed: 'VOICEVOX 失败：{error}',
            // General
            panelTitle: '本地音频覆盖',
            statusWaiting: '等待正确答案',
            statusNone: '未设置本地覆盖',
            statusLoading: '正在检查浏览器存储',
            statusServiceError: '浏览器存储不可用',
            statusPlaying: '正在播放本地音频',
            statusFound: '已启用本地覆盖',
            sentencePrefix: '句子：{sentence}',
            sentenceUnreadable: '无法读取当前句子',
            chooseFile: '选择音频文件',
            chooseAudio: '选择音频…',
            noFileSelected: '请先选择一个音频文件。',
            selectedFile: '已选择：{file}',
            storedFile: '已保存：{file}',
            storageNote: '音频只保存在当前浏览器配置中。',
            storageUnavailable: '浏览器存储失败：{error}',
            storageBlocked: '浏览器存储被禁用或不可用。',
            fileTooLarge: '所选文件超过 50 MB。',
            invalidAudioFile: '所选文件看起来不是音频文件。',
            testingFile: '正在测试 {file}……',
            save: '保存',
            test: '测试',
            delete: '删除',
            playLocalAudio: '播放本地音频',
            pauseLocalAudio: '暂停本地音频',
            closeLocalPlayer: '关闭本地音频播放器',
            scrubLocalAudio: '拖动本地音频进度',
            localPlayerSettings: '打开本地音频速度设置',
            fallbackSpeed: '语速',
            language: '界面语言',
            autoLanguage: '自动',
            speedCurrent: '{rate} · {source}',
            speedSourceMedia: 'BunPro 媒体',
            speedSourceMenu: 'BunPro 菜单',
            speedSourceStorage: 'BunPro 存储',
            speedSourceObserved: '最近的播放器选择',
            speedSourceFallback: '插件设置',
            mappingMissingFile: '映射存在，但浏览器中的音频数据已丢失',
            preloadFailed: '映射已找到，但音频预载失败：{error}',
            entryMissingFile: '已保存的覆盖没有音频数据',
            questionChanged: '题目已切换，旧音频加载已取消',
            localPlayFailed: '本地播放失败：{error}',
            saving: '正在保存到浏览器……',
            saved: '已保存到当前浏览器配置。',
            savePreloadFailed: '保存成功，但预载失败：{error}',
            deleting: '正在删除本地覆盖……',
            deleted: '已删除。本题恢复使用 BunPro 原音频。',
            testStarted: '测试播放已启动。',
            testFailed: '测试失败：{error}',
            recordingUnsupported: '当前浏览器不支持麦克风录音。',
            recordingStarting: '正在请求麦克风权限……',
            recordingActive: '正在录音……按 P 停止，或按 O 回听。',
            recordingStopped: '录音已就绪（{size}），按 O 回听。',
            recordingEmpty: '没有可回放的录音，请先按 P 开始录音。',
            recordingPlaybackStarting: '正在准备回放录音……',
            recordingPlaybackActive: '正在回放你的录音……',
            recordingPlaybackEnded: '录音回放完毕。',
            recordingStartFailed: '无法开始麦克风录音：{error}',
            recordingPlaybackFailed: '无法播放录音：{error}',
            recordingOffLabel: '录音关',
            recordingOnLabel: '录音开',
            recordingOffTitle: '语音录制已关闭，P/O 完全不会碰麦克风。点击开启。',
            recordingOnTitle: '语音录制已开启：P 录音，O 回听。点击关闭。',
            recordingDisabled: '语音录制已关闭。',
            recordingMicProcessingRaw: '麦克风：原始',
            recordingMicProcessingClean: '麦克风：降噪',
            recordingMicProcessingRawTitle: '已关闭麦克风处理（不做回声消除）。这正是避免播放卡死的设置。点击切换。',
            recordingMicProcessingCleanTitle: '已开启麦克风处理（回声消除、降噪）。录音里不会混入参考音频，但在部分设备上 Chrome 会让播放卡死。点击切换。',

            // Recording gain
            micGainLabel: '录音增益',
            micGainTitle: '从下一次 P 录音起放大人声。1× 为原音量，轻声说话可先试 2×。自动记住选择，不影响参考音频或已录好的内容；增益也会放大背景噪声。',
            micGainUnavailable: '录音增益无法启动，不影响参考音频。关闭再开启 Rec 后按 P 重试；可选 1× 使用原音量录音。',

            // Microphone recovery
            micUnavailable: '麦克风暂不可用，参考音频继续播放。重新连接设备或关闭再开启 Rec 后可重试。',
            micRetryWaiting: '麦克风异常，已暂缓录音。{seconds} 秒后按 P 可重试；重新连接设备或关闭再开启 Rec 可立即重试。',
            micRequestTimeout: '请求麦克风超时，不影响参考音频播放。',

            // Admin
            admin: '管理',
            adminTitle: '音频数据库管理',
            adminHelp: '「导入」保留现有句子；「导入并替换」会覆盖现有句子。',
            adminStatsLoading: '正在读取数据库……',
            adminStats: '{count} 个音频 · {size}',
            exportToFile: '导出到文件',
            importKeep: '导入',
            importReplace: '导入并替换',
            cleanDatabase: '清空数据库',
            confirmClean: '确认全部删除',
            back: '返回',
            noOverridesToExport: '没有可导出的自定义音频。',
            exporting: '正在准备备份……',
            exportComplete: '已导出 {count} 个音频（{size}）。',
            exportFailed: '导出失败：{error}',
            importing: '正在读取并验证备份……',
            importCheckingProgress: '正在校验备份……{done}/{total}',
            importWritingProgress: '正在保存备份……{done}/{total}',
            importPartialFailed: '导入已停止，已保存 {committed}/{total} 个词条：{error}。用同一个按钮重新导入同一文件即可完成剩余部分。',
            importPartialCancelled: '导入已取消，已保存 {committed}/{total} 个词条。用同一个按钮重新导入同一文件即可完成剩余部分。',
            importSummaryKeep: '已导入 {imported} 个；跳过 {skipped} 个现有词条。',
            importSummaryReplace: '已导入 {imported} 个；替换 {replaced} 个现有词条。',
            importFailed: '导入失败：{error}',
            invalidBackup: '该文件不是有效的 BunPro Local Audio Override 备份。',
            unsupportedBackupVersion: '不支持的备份格式版本：{version}',
            backupEntryTooLarge: '备份中有音频超过 50 MB。',
            backupChecksumMismatch: '以下句子的备份校验失败：{sentence}',
            chooseBackupFile: '选择 BunPro Local Audio Override 备份文件',
            cleanWarning: '请再次点击确认按钮，以删除所有已保存音频。',
            cleaning: '正在删除所有自定义音频……',
            cleaned: '已删除 {count} 个自定义音频。',
            databaseError: '数据库操作失败：{error}',

            // Compression
            compressAudio: '压缩音频',
            cancelCompression: '取消压缩',
            autoCompressLabel: '自动压缩新音频',
            autoCompressTitle: '对点击 Save 保存或从 .bpao 备份导入的新音频进行单声道 Opus 有损压缩；不会改动现有音频库。此设置会被记住。',
            autoCompressionProgress: '正在自动压缩新音频 {done}/{total}……',
            autoCompressionSummary: '自动压缩：已压缩 {changed}，跳过 {skipped}，失败 {failed} · 节省 {saved}。',
            autoCompressionCancelled: '已取消，未保存或导入任何音频。',
            autoCompressionUnavailable: '自动压缩不可用：{error}。原音频将照常保存或导入。',
            compressionConfirm: '将全部已保存音频压缩为 64 kbps 单声道 Opus？这是有损压缩，不能恢复原始音质；如需保留原版，请先导出备份。仅用更小且验证通过的音频替换原音频。过程静音，耗时约为音频总时长。请保持标签页打开，可随时取消。',
            compressionStarting: '正在准备压缩……',
            compressionProgress: '正在压缩 {done}/{total} · 节省 {saved} · 已压缩 {changed}，跳过 {skipped}，失败 {failed}',
            compressionComplete: '压缩完成：已压缩 {changed}，跳过 {skipped}，失败 {failed} · 节省 {saved}。',
            compressionCancelled: '已取消：已压缩 {changed}，跳过 {skipped}，失败 {failed} · 节省 {saved}。已完成的压缩已保留。',
            compressionCancelling: '正在取消压缩……',
            compressionFailed: '压缩已停止：{error}。已完成的压缩已保留；未处理的音频不变。',
            compressionAbort: '音频压缩已取消。',
            compressionRecorderUnavailable: '当前浏览器无法使用 MediaRecorder 编码 Opus 音频。',
            compressionEncoderUnavailable: '当前浏览器没有可用的 Ogg/WebM Opus 编码器。',
            compressionContextUnavailable: '音频压缩环境不可用。',
            compressionNoSamples: '原音频没有可解码的采样。',
            compressionSuspended: '音频处理已暂停。请保持此标签页处于活动状态后重试。',
            compressionEncoderFailed: 'Opus 编码器出错。',
            compressionStoppedEarly: '音频编码在片段结束前停止。',
            compressionTimedOut: '音频编码超时。请保持此标签页处于活动状态后重试。',
            compressionEmptyClip: 'Opus 编码器生成了空音频。',
            compressionValidationFailed: '编码后音频的时长或声道验证失败；已保留原音频。',
        },
        'zh-TW': {
            voicevox: 'VOICEVOX',
            voicevoxVoice: '聲音',
            voicevoxSpeed: '語速',
            voicevoxUrl: '引擎位址',
            voicevoxLoad: '載入聲音',
            voicevoxChooseVoice: '載入聲音後選擇',
            voicevoxCancel: '取消',
            voicevoxGenerating: '正在使用 VOICEVOX 產生……',
            voicevoxReady: 'VOICEVOX 已就緒 — {voice}。{result}',
            voicevoxMatched: '讀音相符。',
            voicevoxCorrected: '已修正讀音：{words}。',
            voicevoxPartial: '部分漢字沒有振假名。',
            voicevoxUnverified: '讀音未驗證：沒有振假名。',
            voicevoxMismatch: '讀音可能仍有差異。',
            voicevoxUnreachable: '無法連線至 {url} 的 VOICEVOX。請啟動 VOICEVOX，在 {url}/setting 的 Allow Origin 中新增 https://bunpro.jp，然後重新啟動 VOICEVOX。',
            voicevoxTimeout: 'VOICEVOX 請求逾時。',
            voicevoxCancelled: '已取消 VOICEVOX。',
            voicevoxEngineError: 'VOICEVOX 引擎錯誤（HTTP {status}）。',
            voicevoxInvalidUrl: '請輸入使用 127.0.0.1、localhost 或 [::1] 的本機 HTTP(S) 位址，可附帶連接埠。',
            voicevoxLoaded: '已載入 {count} 個 VOICEVOX 聲音。',
            voicevoxNoSentence: '沒有可供 VOICEVOX 使用的句子。',
            voicevoxInvalidResponse: 'VOICEVOX 傳回無效的音訊或回應資料。',
            voicevoxNoVoices: 'VOICEVOX 沒有可用的說話聲音。',
            voicevoxFailed: 'VOICEVOX 失敗：{error}',
            // General
            panelTitle: '本機音訊覆蓋',
            statusWaiting: '等待正確答案',
            statusNone: '尚未設定本機覆蓋',
            statusLoading: '正在檢查瀏覽器儲存',
            statusServiceError: '瀏覽器儲存無法使用',
            statusPlaying: '正在播放本機音訊',
            statusFound: '已啟用本機覆蓋',
            sentencePrefix: '句子：{sentence}',
            sentenceUnreadable: '無法讀取目前句子',
            chooseFile: '選擇音訊檔案',
            chooseAudio: '選擇音訊…',
            noFileSelected: '請先選擇一個音訊檔案。',
            selectedFile: '已選擇：{file}',
            storedFile: '已儲存：{file}',
            storageNote: '音訊只儲存在目前的瀏覽器設定檔中。',
            storageUnavailable: '瀏覽器儲存失敗：{error}',
            storageBlocked: '瀏覽器儲存遭封鎖或無法使用。',
            fileTooLarge: '所選檔案超過 50 MB。',
            invalidAudioFile: '所選檔案看起來不是音訊檔案。',
            testingFile: '正在測試 {file}……',
            save: '儲存',
            test: '測試',
            delete: '刪除',
            playLocalAudio: '播放本機音訊',
            pauseLocalAudio: '暫停本機音訊',
            closeLocalPlayer: '關閉本機音訊播放器',
            scrubLocalAudio: '拖曳本機音訊進度',
            localPlayerSettings: '開啟本機音訊速度設定',
            fallbackSpeed: '語速',
            language: '介面語言',
            autoLanguage: '自動',
            speedCurrent: '{rate} · {source}',
            speedSourceMedia: 'BunPro 媒體',
            speedSourceMenu: 'BunPro 選單',
            speedSourceStorage: 'BunPro 儲存資料',
            speedSourceObserved: '最近的播放器選擇',
            speedSourceFallback: '外掛設定',
            mappingMissingFile: '對應存在，但瀏覽器中的音訊資料已遺失',
            preloadFailed: '已找到對應，但音訊預載失敗：{error}',
            entryMissingFile: '已儲存的覆蓋沒有音訊資料',
            questionChanged: '題目已切換，舊音訊載入已取消',
            localPlayFailed: '本機播放失敗：{error}',
            saving: '正在儲存到瀏覽器……',
            saved: '已儲存到目前的瀏覽器設定檔。',
            savePreloadFailed: '儲存成功，但預載失敗：{error}',
            deleting: '正在刪除本機覆蓋……',
            deleted: '已刪除。本題恢復使用 BunPro 原始音訊。',
            testStarted: '測試播放已開始。',
            testFailed: '測試失敗：{error}',
            recordingUnsupported: '目前瀏覽器不支援麥克風錄音。',
            recordingStartFailed: '無法開始麥克風錄音：{error}',
            recordingPlaybackFailed: '無法播放錄音：{error}',
            recordingStarting: '正在請求麥克風權限……',
            recordingActive: '正在錄音……按 P 停止，或按 O 回聽。',
            recordingStopped: '錄音已就緒（{size}），按 O 回聽。',
            recordingEmpty: '沒有可回放的錄音，請先按 P 開始錄音。',
            recordingPlaybackStarting: '正在準備回放錄音……',
            recordingPlaybackActive: '正在回放你的錄音……',
            recordingPlaybackEnded: '錄音回放完畢。',
            recordingOffLabel: '錄音關',
            recordingOnLabel: '錄音開',
            recordingOffTitle: '語音錄製已關閉，P/O 不會使用麥克風。點擊開啟。',
            recordingOnTitle: '語音錄製已開啟：P 錄音，O 回聽。點擊關閉。',
            recordingDisabled: '語音錄製已關閉。',
            recordingMicProcessingRaw: '麥克風：原始',
            recordingMicProcessingClean: '麥克風：降噪',
            recordingMicProcessingRawTitle: '已關閉麥克風處理（不進行回音消除）。此設定可避免播放卡住。點擊切換。',
            recordingMicProcessingCleanTitle: '已開啟麥克風處理（回音消除、降噪）。可避免參考音訊混入錄音，但在部分裝置上 Chrome 可能會讓播放卡住。點擊切換。',

            // Recording gain
            micGainLabel: '錄音增益',
            micGainTitle: '從下一次 P 錄音起放大人聲。1× 為原音量，輕聲說話可先試 2×。自動記住選擇，不影響參考音訊或已錄好的內容；增益也會放大背景噪音。',
            micGainUnavailable: '錄音增益無法啟動，不影響參考音訊。關閉再開啟 Rec 後按 P 重試；可選 1× 使用原音量錄音。',

            // Microphone recovery
            micUnavailable: '麥克風暫不可用，參考音訊繼續播放。重新連接裝置或關閉再開啟 Rec 後可重試。',
            micRetryWaiting: '麥克風異常，已暫緩錄音。{seconds} 秒後按 P 可重試；重新連接裝置或關閉再開啟 Rec 可立即重試。',
            micRequestTimeout: '請求麥克風逾時，不影響參考音訊播放。',

            // Admin
            admin: '管理',
            adminTitle: '音訊資料庫管理',
            adminHelp: '「匯入」會保留現有句子；「匯入並取代」會覆蓋現有句子。',
            adminStatsLoading: '正在讀取資料庫……',
            adminStats: '{count} 個音訊 · {size}',
            exportToFile: '匯出至檔案',
            importKeep: '匯入',
            importReplace: '匯入並取代',
            cleanDatabase: '清空資料庫',
            confirmClean: '確認全部刪除',
            back: '返回',
            noOverridesToExport: '沒有可匯出的自訂音訊。',
            exporting: '正在準備備份……',
            exportComplete: '已匯出 {count} 個音訊（{size}）。',
            exportFailed: '匯出失敗：{error}',
            importing: '正在讀取並驗證備份……',
            importCheckingProgress: '正在驗證備份……{done}/{total}',
            importWritingProgress: '正在儲存備份……{done}/{total}',
            importPartialFailed: '匯入已停止，已儲存 {committed}/{total} 個詞條：{error}。用同一個按鈕重新匯入同一檔案即可完成其餘部分。',
            importPartialCancelled: '匯入已取消，已儲存 {committed}/{total} 個詞條。用同一個按鈕重新匯入同一檔案即可完成其餘部分。',
            importSummaryKeep: '已匯入 {imported} 個；略過 {skipped} 個現有項目。',
            importSummaryReplace: '已匯入 {imported} 個；取代 {replaced} 個現有項目。',
            importFailed: '匯入失敗：{error}',
            invalidBackup: '此檔案不是有效的 BunPro Local Audio Override 備份。',
            unsupportedBackupVersion: '不支援的備份格式版本：{version}',
            backupEntryTooLarge: '備份中有音訊超過 50 MB。',
            backupChecksumMismatch: '以下句子的備份校驗失敗：{sentence}',
            chooseBackupFile: '選擇 BunPro Local Audio Override 備份檔案',
            cleanWarning: '請再次按下確認按鈕，以刪除所有已儲存音訊。',
            cleaning: '正在刪除所有自訂音訊……',
            cleaned: '已刪除 {count} 個自訂音訊。',
            databaseError: '資料庫操作失敗：{error}',

            // Compression
            compressAudio: '壓縮音訊',
            cancelCompression: '取消壓縮',
            autoCompressLabel: '自動壓縮新音訊',
            autoCompressTitle: '對按下 Save 儲存或從 .bpao 備份匯入的新音訊進行單聲道 Opus 有損壓縮；不會改動現有音訊庫。此設定會被記住。',
            autoCompressionProgress: '正在自動壓縮新音訊 {done}/{total}……',
            autoCompressionSummary: '自動壓縮：已壓縮 {changed}，略過 {skipped}，失敗 {failed} · 節省 {saved}。',
            autoCompressionCancelled: '已取消，未儲存或匯入任何音訊。',
            autoCompressionUnavailable: '自動壓縮無法使用：{error}。原音訊將照常儲存或匯入。',
            compressionConfirm: '將全部已儲存音訊壓縮為 64 kbps 單聲道 Opus？這是有損壓縮，不能恢復原始音質；如需保留原版，請先匯出備份。僅以更小且驗證通過的音訊取代原音訊。過程靜音，耗時約為音訊總時長。請保持分頁開啟，可隨時取消。',
            compressionStarting: '正在準備壓縮……',
            compressionProgress: '正在壓縮 {done}/{total} · 節省 {saved} · 已壓縮 {changed}，略過 {skipped}，失敗 {failed}',
            compressionComplete: '壓縮完成：已壓縮 {changed}，略過 {skipped}，失敗 {failed} · 節省 {saved}。',
            compressionCancelled: '已取消：已壓縮 {changed}，略過 {skipped}，失敗 {failed} · 節省 {saved}。已完成的壓縮已保留。',
            compressionCancelling: '正在取消壓縮……',
            compressionFailed: '壓縮已停止：{error}。已完成的壓縮已保留；未處理的音訊不變。',
            compressionAbort: '音訊壓縮已取消。',
            compressionRecorderUnavailable: '目前瀏覽器無法使用 MediaRecorder 編碼 Opus 音訊。',
            compressionEncoderUnavailable: '目前瀏覽器沒有可用的 Ogg/WebM Opus 編碼器。',
            compressionContextUnavailable: '音訊壓縮環境無法使用。',
            compressionNoSamples: '原音訊沒有可解碼的取樣。',
            compressionSuspended: '音訊處理已暫停。請保持此分頁處於使用中狀態後重試。',
            compressionEncoderFailed: 'Opus 編碼器發生錯誤。',
            compressionStoppedEarly: '音訊編碼在片段結束前停止。',
            compressionTimedOut: '音訊編碼逾時。請保持此分頁處於使用中狀態後重試。',
            compressionEmptyClip: 'Opus 編碼器產生了空音訊。',
            compressionValidationFailed: '編碼後音訊的時長或聲道驗證失敗；已保留原音訊。',
        },
        es: {
            voicevox: 'VOICEVOX',
            voicevoxVoice: 'Voz',
            voicevoxSpeed: 'Velocidad',
            voicevoxUrl: 'Dirección del motor',
            voicevoxLoad: 'Cargar voces',
            voicevoxChooseVoice: 'Carga las voces para elegir',
            voicevoxCancel: 'Cancelar',
            voicevoxGenerating: 'Generando con VOICEVOX…',
            voicevoxReady: 'VOICEVOX listo — {voice}. {result}',
            voicevoxMatched: 'La lectura coincide.',
            voicevoxCorrected: 'Lectura corregida: {words}.',
            voicevoxPartial: 'Algunos kanji no tienen furigana.',
            voicevoxUnverified: 'Lectura sin verificar: no hay furigana.',
            voicevoxMismatch: 'La lectura aún puede diferir.',
            voicevoxUnreachable: 'No se puede conectar con VOICEVOX en {url}. Inicia VOICEVOX, añade https://bunpro.jp a Allow Origin en {url}/setting y reinicia VOICEVOX.',
            voicevoxTimeout: 'La solicitud a VOICEVOX agotó el tiempo de espera.',
            voicevoxCancelled: 'VOICEVOX cancelado.',
            voicevoxEngineError: 'Error del motor VOICEVOX (HTTP {status}).',
            voicevoxInvalidUrl: 'Introduce una dirección HTTP(S) local con 127.0.0.1, localhost o [::1] y un puerto opcional.',
            voicevoxLoaded: 'Se cargaron {count} voces de VOICEVOX.',
            voicevoxNoSentence: 'No hay ninguna frase disponible para VOICEVOX.',
            voicevoxInvalidResponse: 'VOICEVOX devolvió audio o datos de respuesta inválidos.',
            voicevoxNoVoices: 'VOICEVOX no tiene voces de habla.',
            voicevoxFailed: 'Falló VOICEVOX: {error}',
            // General
            panelTitle: 'Sustitución de audio local',
            statusWaiting: 'Esperando la respuesta correcta',
            statusNone: 'Sin sustitución local',
            statusLoading: 'Comprobando el almacenamiento del navegador',
            statusServiceError: 'Almacenamiento del navegador no disponible',
            statusPlaying: 'Reproduciendo audio local',
            statusFound: 'Sustitución local activa',
            sentencePrefix: 'Frase: {sentence}',
            sentenceUnreadable: 'No se puede leer la frase actual',
            chooseFile: 'Elegir audio',
            chooseAudio: 'Elegir audio…',
            noFileSelected: 'Elige primero un archivo de audio.',
            selectedFile: 'Seleccionado: {file}',
            storedFile: 'Guardado: {file}',
            storageNote: 'El audio solo se guarda en este perfil del navegador.',
            storageUnavailable: 'Error del almacenamiento del navegador: {error}',
            storageBlocked: 'El almacenamiento del navegador está bloqueado o no disponible.',
            fileTooLarge: 'El archivo seleccionado supera los 50 MB.',
            invalidAudioFile: 'El archivo seleccionado no parece ser de audio.',
            testingFile: 'Probando {file}…',
            save: 'Guardar',
            test: 'Probar',
            delete: 'Eliminar',
            playLocalAudio: 'Reproducir audio local',
            pauseLocalAudio: 'Pausar el audio local',
            closeLocalPlayer: 'Cerrar el reproductor de audio local',
            scrubLocalAudio: 'Desplazarse por el audio local',
            localPlayerSettings: 'Abrir los ajustes de velocidad del audio local',
            fallbackSpeed: 'Velocidad',
            language: 'Idioma',
            autoLanguage: 'Automático',
            speedCurrent: '{rate} · {source}',
            speedSourceMedia: 'medio de BunPro',
            speedSourceMenu: 'menú de BunPro',
            speedSourceStorage: 'almacenamiento de BunPro',
            speedSourceObserved: 'última selección del reproductor',
            speedSourceFallback: 'ajuste del complemento',
            mappingMissingFile: 'La asignación existe, pero faltan los datos de audio guardados',
            preloadFailed: 'Se encontró la asignación, pero falló la precarga: {error}',
            entryMissingFile: 'La sustitución guardada no contiene datos de audio',
            questionChanged: 'La pregunta cambió; se canceló la carga anterior',
            localPlayFailed: 'Falló la reproducción local: {error}',
            saving: 'Guardando el audio en el navegador…',
            saved: 'Guardado en este perfil del navegador.',
            savePreloadFailed: 'Guardado, pero falló la precarga: {error}',
            deleting: 'Eliminando la sustitución…',
            deleted: 'Eliminado. Se ha restaurado el audio de BunPro para esta frase.',
            testStarted: 'La reproducción de prueba ha comenzado.',
            testFailed: 'Falló la prueba: {error}',
            recordingUnsupported: 'Este navegador no admite la grabación con micrófono.',
            recordingStartFailed: 'No se pudo iniciar la grabación del micrófono: {error}',
            recordingPlaybackFailed: 'No se pudo reproducir la grabación: {error}',
            recordingStarting: 'Solicitando acceso al micrófono…',
            recordingActive: 'Grabando… Pulsa P para detener o O para escuchar.',
            recordingStopped: 'Grabación lista ({size}). Pulsa O para escuchar.',
            recordingEmpty: 'No hay ninguna grabación disponible. Pulsa P para empezar a grabar.',
            recordingPlaybackStarting: 'Preparando la reproducción de la grabación…',
            recordingPlaybackActive: 'Reproduciendo tu grabación…',
            recordingPlaybackEnded: 'La reproducción de la grabación ha terminado.',
            recordingOffLabel: 'Rec: no',
            recordingOnLabel: 'Rec: sí',
            recordingOffTitle: 'La grabación de voz está desactivada. P y O no usan el micrófono. Haz clic para activarla.',
            recordingOnTitle: 'La grabación de voz está activada. P graba y O reproduce la grabación. Haz clic para desactivarla.',
            recordingDisabled: 'La grabación de voz está desactivada.',
            recordingMicProcessingRaw: 'Micro: original',
            recordingMicProcessingClean: 'Micro: filtrado',
            recordingMicProcessingRawTitle: 'El procesamiento del micrófono está desactivado (sin cancelación de eco). Este ajuste evita que se bloquee la reproducción. Haz clic para cambiarlo.',
            recordingMicProcessingCleanTitle: 'El procesamiento del micrófono está activado (cancelación de eco y reducción de ruido). Evita que el audio de referencia entre en la grabación, pero Chrome puede bloquear la reproducción en algunos dispositivos. Haz clic para cambiarlo.',

            // Recording gain
            micGainLabel: 'Ganancia mic.',
            micGainTitle: 'Amplifica tu voz en la próxima grabación con P. 1× conserva el volumen original; prueba 2× si hablas bajo. Se guarda la opción. No cambia el audio de referencia ni las tomas anteriores; también amplifica el ruido.',
            micGainUnavailable: 'No se pudo iniciar la ganancia. La referencia continúa. Desactiva y activa Rec, y pulsa P para reintentar; usa 1× para grabar sin ganancia.',

            // Microphone recovery
            micUnavailable: 'Micrófono no disponible. La referencia continúa. Reconecta el dispositivo o desactiva y activa Rec para reintentar.',
            micRetryWaiting: 'Grabación en pausa por un error. Pulsa P en {seconds}s, o reconecta el dispositivo o desactiva y activa Rec.',
            micRequestTimeout: 'La solicitud del micrófono agotó el tiempo de espera; la referencia no se ve afectada.',

            // Admin
            admin: 'Administrar',
            adminTitle: 'Administración de la base de audio',
            adminHelp: 'Importar conserva las frases existentes. Importar y reemplazar las sobrescribe.',
            adminStatsLoading: 'Leyendo la base de datos…',
            adminStats: '{count} clips · {size}',
            exportToFile: 'Exportar a archivo',
            importKeep: 'Importar',
            importReplace: 'Importar y reemplazar',
            cleanDatabase: 'Vaciar base de datos',
            confirmClean: 'Confirmar borrado total',
            back: 'Volver',
            noOverridesToExport: 'No hay audios personalizados para exportar.',
            exporting: 'Preparando la copia de seguridad…',
            exportComplete: 'Se exportaron {count} clips ({size}).',
            exportFailed: 'Error al exportar: {error}',
            importing: 'Leyendo y validando la copia de seguridad…',
            importCheckingProgress: 'Verificando la copia de seguridad… {done}/{total}',
            importWritingProgress: 'Guardando la copia de seguridad… {done}/{total}',
            importPartialFailed: 'Importación detenida tras guardar {committed}/{total} entradas: {error}. Vuelve a importar el mismo archivo con el mismo botón para terminar.',
            importPartialCancelled: 'Importación cancelada tras guardar {committed}/{total} entradas. Vuelve a importar el mismo archivo con el mismo botón para terminar.',
            importSummaryKeep: 'Importados: {imported}; omitidos por existir: {skipped}.',
            importSummaryReplace: 'Importados: {imported}; reemplazados: {replaced}.',
            importFailed: 'Error al importar: {error}',
            invalidBackup: 'No es una copia válida de BunPro Local Audio Override.',
            unsupportedBackupVersion: 'Versión de copia no compatible: {version}',
            backupEntryTooLarge: 'Un clip de la copia supera los 50 MB.',
            backupChecksumMismatch: 'La suma de comprobación no coincide para: {sentence}',
            chooseBackupFile: 'Elegir una copia de BunPro Local Audio Override',
            cleanWarning: 'Pulsa de nuevo el botón de confirmación para borrar todos los clips.',
            cleaning: 'Eliminando todos los audios personalizados…',
            cleaned: 'Se eliminaron {count} audios personalizados.',
            databaseError: 'Error de la base de datos: {error}',

            // Compression
            compressAudio: 'Comprimir audio',
            cancelCompression: 'Cancelar compresión',
            autoCompressLabel: 'Comprimir automáticamente los nuevos audios',
            autoCompressTitle: 'Comprime con pérdida en Opus mono los nuevos audios guardados con Save o importados desde copias .bpao. No modifica la biblioteca existente. Se recuerda tu elección.',
            autoCompressionProgress: 'Comprimiendo automáticamente los nuevos audios {done}/{total}…',
            autoCompressionSummary: 'Compresión automática: {changed} convertidos, {skipped} omitidos, {failed} fallidos · ahorro {saved}.',
            autoCompressionCancelled: 'Cancelado. No se guardó ni importó ningún audio.',
            autoCompressionUnavailable: 'Compresión automática no disponible: {error}. Los audios originales se guardarán o importarán normalmente.',
            compressionConfirm: '¿Comprimir los audios guardados a Opus mono de 64 kbps? Es una compresión con pérdida. Exporta una copia para conservar los originales. Solo se reemplazan los clips verificados y más pequeños. El proceso es silencioso y tarda aproximadamente la duración total del audio. Mantén la pestaña abierta; puedes cancelar.',
            compressionStarting: 'Preparando compresión…',
            compressionProgress: 'Comprimiendo {done}/{total} · ahorro {saved} · convertidos {changed}, omitidos {skipped}, fallidos {failed}',
            compressionComplete: 'Completado: {changed} convertidos, {skipped} omitidos, {failed} fallidos · ahorro {saved}.',
            compressionCancelled: 'Cancelado: {changed} convertidos, {skipped} omitidos, {failed} fallidos · ahorro {saved}. Se conservan los cambios completados.',
            compressionCancelling: 'Cancelando…',
            compressionFailed: 'Compresión detenida: {error}. Se conservan los cambios completados; los demás clips no cambian.',
            compressionAbort: 'Se canceló la compresión de audio.',
            compressionRecorderUnavailable: 'Este navegador no puede codificar audio Opus con MediaRecorder.',
            compressionEncoderUnavailable: 'Este navegador no tiene un codificador Ogg/WebM Opus compatible.',
            compressionContextUnavailable: 'El contexto de compresión de audio no está disponible.',
            compressionNoSamples: 'El audio original no tiene muestras decodificables.',
            compressionSuspended: 'El procesamiento de audio está suspendido. Mantén esta pestaña activa e inténtalo de nuevo.',
            compressionEncoderFailed: 'El codificador Opus falló.',
            compressionStoppedEarly: 'La codificación de audio se detuvo antes de que terminara el clip.',
            compressionTimedOut: 'La codificación de audio agotó el tiempo de espera. Mantén esta pestaña activa e inténtalo de nuevo.',
            compressionEmptyClip: 'El codificador Opus produjo un clip vacío.',
            compressionValidationFailed: 'El audio codificado no superó la validación de duración o canales; se conservó el original.',
        },
        id: {
            voicevox: 'VOICEVOX',
            voicevoxVoice: 'Suara',
            voicevoxSpeed: 'Kecepatan',
            voicevoxUrl: 'Alamat mesin',
            voicevoxLoad: 'Muat suara',
            voicevoxChooseVoice: 'Muat suara untuk memilih',
            voicevoxCancel: 'Batal',
            voicevoxGenerating: 'Membuat audio dengan VOICEVOX…',
            voicevoxReady: 'VOICEVOX siap — {voice}. {result}',
            voicevoxMatched: 'Bacaan cocok.',
            voicevoxCorrected: 'Bacaan diperbaiki: {words}.',
            voicevoxPartial: 'Beberapa kanji tidak memiliki furigana.',
            voicevoxUnverified: 'Bacaan belum terverifikasi: tidak ada furigana.',
            voicevoxMismatch: 'Bacaan mungkin masih berbeda.',
            voicevoxUnreachable: 'Tidak dapat menghubungi VOICEVOX di {url}. Jalankan VOICEVOX, tambahkan https://bunpro.jp ke Allow Origin di {url}/setting, lalu mulai ulang VOICEVOX.',
            voicevoxTimeout: 'Permintaan VOICEVOX kehabisan waktu.',
            voicevoxCancelled: 'VOICEVOX dibatalkan.',
            voicevoxEngineError: 'Kesalahan mesin VOICEVOX (HTTP {status}).',
            voicevoxInvalidUrl: 'Masukkan alamat HTTP(S) lokal dengan 127.0.0.1, localhost atau [::1], dengan port opsional.',
            voicevoxLoaded: 'Memuat {count} suara VOICEVOX.',
            voicevoxNoSentence: 'Tidak ada kalimat untuk VOICEVOX.',
            voicevoxInvalidResponse: 'VOICEVOX mengembalikan audio atau data respons yang tidak valid.',
            voicevoxNoVoices: 'VOICEVOX tidak memiliki suara bicara.',
            voicevoxFailed: 'VOICEVOX gagal: {error}',
            // General
            panelTitle: 'Pengganti audio lokal',
            statusWaiting: 'Menunggu jawaban benar',
            statusNone: 'Belum ada pengganti lokal',
            statusLoading: 'Memeriksa penyimpanan browser',
            statusServiceError: 'Penyimpanan browser tidak tersedia',
            statusPlaying: 'Memutar audio lokal',
            statusFound: 'Pengganti lokal aktif',
            sentencePrefix: 'Kalimat: {sentence}',
            sentenceUnreadable: 'Tidak dapat membaca kalimat saat ini',
            chooseFile: 'Pilih audio',
            chooseAudio: 'Pilih audio…',
            noFileSelected: 'Pilih berkas audio terlebih dahulu.',
            selectedFile: 'Dipilih: {file}',
            storedFile: 'Tersimpan: {file}',
            storageNote: 'Audio hanya disimpan di profil browser ini.',
            storageUnavailable: 'Penyimpanan browser gagal: {error}',
            storageBlocked: 'Penyimpanan browser diblokir atau tidak tersedia.',
            fileTooLarge: 'Berkas yang dipilih lebih besar dari 50 MB.',
            invalidAudioFile: 'Berkas yang dipilih tampaknya bukan audio.',
            testingFile: 'Menguji {file}…',
            save: 'Simpan',
            test: 'Uji',
            delete: 'Hapus',
            playLocalAudio: 'Putar audio lokal',
            pauseLocalAudio: 'Jeda audio lokal',
            closeLocalPlayer: 'Tutup pemutar audio lokal',
            scrubLocalAudio: 'Geser posisi audio lokal',
            localPlayerSettings: 'Buka pengaturan kecepatan audio lokal',
            fallbackSpeed: 'Kecepatan',
            language: 'Bahasa',
            autoLanguage: 'Otomatis',
            speedCurrent: '{rate} · {source}',
            speedSourceMedia: 'media BunPro',
            speedSourceMenu: 'menu BunPro',
            speedSourceStorage: 'penyimpanan BunPro',
            speedSourceObserved: 'pilihan pemutar terakhir',
            speedSourceFallback: 'pengaturan plugin',
            mappingMissingFile: 'Pemetaan ada, tetapi data audio yang tersimpan hilang',
            preloadFailed: 'Pemetaan ditemukan, tetapi pramuat gagal: {error}',
            entryMissingFile: 'Pengganti tersimpan tidak memiliki data audio',
            questionChanged: 'Soal berubah; pemuatan audio lama dibatalkan',
            localPlayFailed: 'Pemutaran lokal gagal: {error}',
            saving: 'Menyimpan audio di browser…',
            saved: 'Tersimpan di profil browser ini.',
            savePreloadFailed: 'Tersimpan, tetapi pramuat gagal: {error}',
            deleting: 'Menghapus pengganti…',
            deleted: 'Dihapus. Audio BunPro dipulihkan untuk kalimat ini.',
            testStarted: 'Pemutaran uji dimulai.',
            testFailed: 'Pengujian gagal: {error}',
            recordingUnsupported: 'Browser ini tidak mendukung perekaman mikrofon.',
            recordingStartFailed: 'Tidak dapat memulai perekaman mikrofon: {error}',
            recordingPlaybackFailed: 'Tidak dapat memutar rekaman: {error}',
            recordingStarting: 'Meminta akses mikrofon…',
            recordingActive: 'Merekam… Tekan P untuk berhenti atau O untuk mendengarkan.',
            recordingStopped: 'Rekaman siap ({size}). Tekan O untuk mendengarkan.',
            recordingEmpty: 'Belum ada rekaman yang tersedia. Tekan P untuk mulai merekam.',
            recordingPlaybackStarting: 'Menyiapkan pemutaran rekaman…',
            recordingPlaybackActive: 'Memutar rekaman Anda…',
            recordingPlaybackEnded: 'Pemutaran rekaman selesai.',
            recordingOffLabel: 'Rec nonaktif',
            recordingOnLabel: 'Rec aktif',
            recordingOffTitle: 'Perekaman suara nonaktif. P dan O tidak menggunakan mikrofon. Klik untuk mengaktifkan.',
            recordingOnTitle: 'Perekaman suara aktif. P merekam, O memutar rekaman. Klik untuk menonaktifkan.',
            recordingDisabled: 'Perekaman suara nonaktif.',
            recordingMicProcessingRaw: 'Mikrofon: mentah',
            recordingMicProcessingClean: 'Mikrofon: bersih',
            recordingMicProcessingRawTitle: 'Pemrosesan mikrofon nonaktif (tanpa pembatalan gema). Pengaturan ini mencegah pemutaran macet. Klik untuk mengganti.',
            recordingMicProcessingCleanTitle: 'Pemrosesan mikrofon aktif (pembatalan gema dan pengurangan derau). Mencegah audio referensi masuk ke rekaman, tetapi Chrome dapat membuat pemutaran macet pada beberapa perangkat. Klik untuk mengganti.',

            // Recording gain
            micGainLabel: 'Gain mikrofon',
            micGainTitle: 'Perkuat suara mulai rekaman P berikutnya. 1× adalah volume asli; coba 2× untuk suara pelan. Pilihan disimpan. Audio referensi dan rekaman lama tidak berubah; kebisingan latar juga meningkat.',
            micGainUnavailable: 'Gain mikrofon tidak dapat dimulai. Referensi tetap diputar. Matikan dan aktifkan Rec lalu tekan P; pilih 1× untuk merekam tanpa gain.',

            // Microphone recovery
            micUnavailable: 'Mikrofon tidak tersedia. Audio referensi tetap diputar. Sambungkan perangkat atau matikan dan aktifkan Rec untuk mencoba lagi.',
            micRetryWaiting: 'Rekaman dijeda karena galat. Tekan P setelah {seconds} detik, atau sambungkan perangkat atau matikan dan aktifkan Rec.',
            micRequestTimeout: 'Permintaan mikrofon kehabisan waktu; audio referensi tidak terpengaruh.',

            // Admin
            admin: 'Admin',
            adminTitle: 'Administrasi basis data audio',
            adminHelp: 'Impor mempertahankan kalimat yang ada. Impor & Ganti akan menimpanya.',
            adminStatsLoading: 'Membaca basis data…',
            adminStats: '{count} klip · {size}',
            exportToFile: 'Ekspor ke Berkas',
            importKeep: 'Impor',
            importReplace: 'Impor & Ganti',
            cleanDatabase: 'Bersihkan Basis Data',
            confirmClean: 'Konfirmasi Hapus Semua',
            back: 'Kembali',
            noOverridesToExport: 'Tidak ada audio khusus untuk diekspor.',
            exporting: 'Menyiapkan cadangan…',
            exportComplete: 'Mengekspor {count} klip ({size}).',
            exportFailed: 'Ekspor gagal: {error}',
            importing: 'Membaca dan memvalidasi cadangan…',
            importCheckingProgress: 'Memeriksa cadangan… {done}/{total}',
            importWritingProgress: 'Menyimpan cadangan… {done}/{total}',
            importPartialFailed: 'Impor berhenti setelah menyimpan {committed}/{total} entri: {error}. Impor kembali berkas yang sama dengan tombol yang sama untuk menyelesaikannya.',
            importPartialCancelled: 'Impor dibatalkan setelah menyimpan {committed}/{total} entri. Impor kembali berkas yang sama dengan tombol yang sama untuk menyelesaikannya.',
            importSummaryKeep: 'Diimpor {imported}; dilewati {skipped} entri yang sudah ada.',
            importSummaryReplace: 'Diimpor {imported}; diganti {replaced} entri yang sudah ada.',
            importFailed: 'Impor gagal: {error}',
            invalidBackup: 'Berkas ini bukan cadangan BunPro Local Audio Override yang valid.',
            unsupportedBackupVersion: 'Versi format cadangan tidak didukung: {version}',
            backupEntryTooLarge: 'Ada klip audio dalam cadangan yang lebih besar dari 50 MB.',
            backupChecksumMismatch: 'Checksum cadangan tidak cocok untuk: {sentence}',
            chooseBackupFile: 'Pilih berkas cadangan BunPro Local Audio Override',
            cleanWarning: 'Klik tombol konfirmasi sekali lagi untuk menghapus semua klip tersimpan.',
            cleaning: 'Menghapus semua audio khusus…',
            cleaned: 'Menghapus {count} audio khusus.',
            databaseError: 'Operasi basis data gagal: {error}',

            // Compression
            compressAudio: 'Kompres Audio',
            cancelCompression: 'Batalkan Kompresi',
            autoCompressLabel: 'Kompres otomatis audio baru',
            autoCompressTitle: 'Gunakan kompresi lossy Opus mono untuk audio baru yang disimpan dengan Save atau diimpor dari cadangan .bpao. Audio di pustaka yang sudah ada tidak diubah. Pilihan Anda akan diingat.',
            autoCompressionProgress: 'Mengompres otomatis audio baru {done}/{total}…',
            autoCompressionSummary: 'Kompresi otomatis: {changed} dikonversi, {skipped} dilewati, {failed} gagal · hemat {saved}.',
            autoCompressionCancelled: 'Dibatalkan. Tidak ada audio yang disimpan atau diimpor.',
            autoCompressionUnavailable: 'Kompresi otomatis tidak tersedia: {error}. Audio asli akan disimpan atau diimpor seperti biasa.',
            compressionConfirm: 'Kompres audio tersimpan ke Opus mono 64 kbps? Kompresi ini lossy. Ekspor cadangan untuk menyimpan kualitas asli. Hanya klip terverifikasi dan lebih kecil yang menggantikan aslinya. Proses senyap dan memerlukan sekitar total durasi audio. Biarkan tab terbuka; Anda dapat membatalkan.',
            compressionStarting: 'Menyiapkan kompresi…',
            compressionProgress: 'Mengompres {done}/{total} · hemat {saved} · dikonversi {changed}, dilewati {skipped}, gagal {failed}',
            compressionComplete: 'Selesai: {changed} dikonversi, {skipped} dilewati, {failed} gagal · hemat {saved}.',
            compressionCancelled: 'Dibatalkan: {changed} dikonversi, {skipped} dilewati, {failed} gagal · hemat {saved}. Perubahan selesai disimpan.',
            compressionCancelling: 'Membatalkan…',
            compressionFailed: 'Kompresi berhenti: {error}. Perubahan selesai disimpan; klip lainnya tidak berubah.',
            compressionAbort: 'Kompresi audio dibatalkan.',
            compressionRecorderUnavailable: 'Browser ini tidak dapat mengodekan audio Opus dengan MediaRecorder.',
            compressionEncoderUnavailable: 'Browser ini tidak memiliki encoder Ogg/WebM Opus yang didukung.',
            compressionContextUnavailable: 'Konteks kompresi audio tidak tersedia.',
            compressionNoSamples: 'Audio sumber tidak memiliki sampel yang dapat didekodekan.',
            compressionSuspended: 'Pemrosesan audio ditangguhkan. Biarkan tab ini aktif dan coba lagi.',
            compressionEncoderFailed: 'Encoder Opus gagal.',
            compressionStoppedEarly: 'Pengodean audio berhenti sebelum klip selesai.',
            compressionTimedOut: 'Pengodean audio melewati batas waktu. Biarkan tab ini aktif dan coba lagi.',
            compressionEmptyClip: 'Encoder Opus menghasilkan klip kosong.',
            compressionValidationFailed: 'Audio hasil pengodean gagal dalam validasi durasi atau kanal; audio asli dipertahankan.',
        },
        fr: {
            voicevox: 'VOICEVOX',
            voicevoxVoice: 'Voix',
            voicevoxSpeed: 'Vitesse',
            voicevoxUrl: 'Adresse du moteur',
            voicevoxLoad: 'Charger les voix',
            voicevoxChooseVoice: 'Chargez les voix pour choisir',
            voicevoxCancel: 'Annuler',
            voicevoxGenerating: 'Génération avec VOICEVOX…',
            voicevoxReady: 'VOICEVOX prêt — {voice}. {result}',
            voicevoxMatched: 'La lecture correspond.',
            voicevoxCorrected: 'Lecture corrigée : {words}.',
            voicevoxPartial: 'Certains kanjis sont sans furigana.',
            voicevoxUnverified: 'Lecture non vérifiée : aucun furigana.',
            voicevoxMismatch: 'La lecture peut encore différer.',
            voicevoxUnreachable: 'Impossible de joindre VOICEVOX à {url}. Démarrez VOICEVOX, ajoutez https://bunpro.jp à Allow Origin dans {url}/setting, puis redémarrez VOICEVOX.',
            voicevoxTimeout: 'La requête VOICEVOX a expiré.',
            voicevoxCancelled: 'VOICEVOX annulé.',
            voicevoxEngineError: 'Erreur du moteur VOICEVOX (HTTP {status}).',
            voicevoxInvalidUrl: 'Saisissez une adresse HTTP(S) locale avec 127.0.0.1, localhost ou [::1], et un port facultatif.',
            voicevoxLoaded: '{count} voix VOICEVOX chargées.',
            voicevoxNoSentence: 'Aucune phrase disponible pour VOICEVOX.',
            voicevoxInvalidResponse: 'VOICEVOX a renvoyé un audio ou une réponse invalide.',
            voicevoxNoVoices: 'VOICEVOX ne propose aucune voix parlée.',
            voicevoxFailed: 'Échec de VOICEVOX : {error}',
            // General
            panelTitle: 'Remplacement audio local',
            statusWaiting: 'En attente de la bonne réponse',
            statusNone: 'Aucun remplacement local',
            statusLoading: 'Vérification du stockage du navigateur',
            statusServiceError: 'Stockage du navigateur indisponible',
            statusPlaying: 'Lecture de l’audio local',
            statusFound: 'Remplacement local actif',
            sentencePrefix: 'Phrase : {sentence}',
            sentenceUnreadable: 'Impossible de lire la phrase actuelle',
            chooseFile: 'Choisir un audio',
            chooseAudio: 'Choisir un audio…',
            noFileSelected: 'Choisissez d’abord un fichier audio.',
            selectedFile: 'Sélectionné : {file}',
            storedFile: 'Enregistré : {file}',
            storageNote: 'L’audio est enregistré uniquement dans ce profil de navigateur.',
            storageUnavailable: 'Échec du stockage du navigateur : {error}',
            storageBlocked: 'Le stockage du navigateur est bloqué ou indisponible.',
            fileTooLarge: 'Le fichier sélectionné dépasse 50 Mo.',
            invalidAudioFile: 'Le fichier sélectionné ne semble pas être un fichier audio.',
            testingFile: 'Test de {file}…',
            save: 'Enregistrer',
            test: 'Tester',
            delete: 'Supprimer',
            playLocalAudio: 'Lire l’audio local',
            pauseLocalAudio: 'Mettre l’audio local en pause',
            closeLocalPlayer: 'Fermer le lecteur audio local',
            scrubLocalAudio: 'Se déplacer dans l’audio local',
            localPlayerSettings: 'Ouvrir les réglages de vitesse de l’audio local',
            fallbackSpeed: 'Vitesse',
            language: 'Langue',
            autoLanguage: 'Automatique',
            speedCurrent: '{rate} · {source}',
            speedSourceMedia: 'média BunPro',
            speedSourceMenu: 'menu BunPro',
            speedSourceStorage: 'stockage BunPro',
            speedSourceObserved: 'dernier choix du lecteur',
            speedSourceFallback: 'réglage du module',
            mappingMissingFile: 'La correspondance existe, mais les données audio enregistrées manquent',
            preloadFailed: 'Correspondance trouvée, mais préchargement impossible : {error}',
            entryMissingFile: 'Le remplacement enregistré ne contient aucune donnée audio',
            questionChanged: 'La question a changé ; l’ancien chargement a été annulé',
            localPlayFailed: 'Échec de la lecture locale : {error}',
            saving: 'Enregistrement de l’audio dans le navigateur…',
            saved: 'Enregistré dans ce profil de navigateur.',
            savePreloadFailed: 'Enregistré, mais préchargement impossible : {error}',
            deleting: 'Suppression du remplacement…',
            deleted: 'Supprimé. L’audio BunPro est rétabli pour cette phrase.',
            testStarted: 'La lecture de test a commencé.',
            testFailed: 'Échec du test : {error}',
            recordingUnsupported: 'Ce navigateur ne prend pas en charge l’enregistrement du microphone.',
            recordingStartFailed: 'Impossible de démarrer l’enregistrement du microphone : {error}',
            recordingPlaybackFailed: 'Impossible de lire l’enregistrement : {error}',
            recordingStarting: 'Demande d’accès au microphone…',
            recordingActive: 'Enregistrement en cours… Appuyez sur P pour arrêter ou sur O pour écouter.',
            recordingStopped: 'Enregistrement prêt ({size}). Appuyez sur O pour écouter.',
            recordingEmpty: 'Aucun enregistrement disponible. Appuyez sur P pour commencer à enregistrer.',
            recordingPlaybackStarting: 'Préparation de la lecture de l’enregistrement…',
            recordingPlaybackActive: 'Lecture de votre enregistrement…',
            recordingPlaybackEnded: 'La lecture de l’enregistrement est terminée.',
            recordingOffLabel: 'Rec : non',
            recordingOnLabel: 'Rec : oui',
            recordingOffTitle: 'L’enregistrement vocal est désactivé. P et O n’utilisent pas le microphone. Cliquez pour l’activer.',
            recordingOnTitle: 'L’enregistrement vocal est activé. P enregistre, O lit l’enregistrement. Cliquez pour le désactiver.',
            recordingDisabled: 'L’enregistrement vocal est désactivé.',
            recordingMicProcessingRaw: 'Micro : brut',
            recordingMicProcessingClean: 'Micro : filtré',
            recordingMicProcessingRawTitle: 'Le traitement du microphone est désactivé (sans suppression de l’écho). Ce réglage évite les blocages de lecture. Cliquez pour changer.',
            recordingMicProcessingCleanTitle: 'Le traitement du microphone est activé (suppression de l’écho et réduction du bruit). Il évite que l’audio de référence soit capté dans l’enregistrement, mais Chrome peut bloquer la lecture sur certains appareils. Cliquez pour changer.',

            // Recording gain
            micGainLabel: 'Gain micro',
            micGainTitle: 'Amplifie votre voix dès le prochain enregistrement avec P. 1× garde le volume original ; essayez 2× si vous parlez doucement. Le réglage est mémorisé. Aucun effet sur la référence ou les prises précédentes ; le bruit de fond augmente aussi.',
            micGainUnavailable: 'Impossible de démarrer le gain micro. La référence continue. Désactivez puis réactivez Rec et appuyez sur P ; choisissez 1× pour enregistrer sans gain.',

            // Microphone recovery
            micUnavailable: 'Microphone indisponible. La référence continue. Reconnectez le périphérique ou désactivez puis réactivez Rec.',
            micRetryWaiting: 'Enregistrement suspendu après une erreur. Appuyez sur P dans {seconds}s, ou reconnectez le périphérique ou désactivez puis réactivez Rec.',
            micRequestTimeout: 'La demande de microphone a expiré ; la référence reste inchangée.',

            // Admin
            admin: 'Administration',
            adminTitle: 'Administration de la base audio',
            adminHelp: 'Importer conserve les phrases existantes. Importer et remplacer les écrase.',
            adminStatsLoading: 'Lecture de la base de données…',
            adminStats: '{count} extraits · {size}',
            exportToFile: 'Exporter vers un fichier',
            importKeep: 'Importer',
            importReplace: 'Importer et remplacer',
            cleanDatabase: 'Vider la base de données',
            confirmClean: 'Confirmer la suppression',
            back: 'Retour',
            noOverridesToExport: 'Aucun audio personnalisé à exporter.',
            exporting: 'Préparation de la sauvegarde…',
            exportComplete: '{count} extraits exportés ({size}).',
            exportFailed: 'Échec de l’exportation : {error}',
            importing: 'Lecture et validation de la sauvegarde…',
            importCheckingProgress: 'Vérification de la sauvegarde… {done}/{total}',
            importWritingProgress: 'Enregistrement de la sauvegarde… {done}/{total}',
            importPartialFailed: 'Importation arrêtée après l’enregistrement de {committed}/{total} entrées : {error}. Importez à nouveau le même fichier avec le même bouton pour terminer.',
            importPartialCancelled: 'Importation annulée après l’enregistrement de {committed}/{total} entrées. Importez à nouveau le même fichier avec le même bouton pour terminer.',
            importSummaryKeep: '{imported} importés ; {skipped} entrées existantes ignorées.',
            importSummaryReplace: '{imported} importés ; {replaced} entrées existantes remplacées.',
            importFailed: 'Échec de l’importation : {error}',
            invalidBackup: 'Ce fichier n’est pas une sauvegarde BunPro Local Audio Override valide.',
            unsupportedBackupVersion: 'Version de sauvegarde non prise en charge : {version}',
            backupEntryTooLarge: 'Un extrait audio de la sauvegarde dépasse 50 Mo.',
            backupChecksumMismatch: 'Somme de contrôle incorrecte pour : {sentence}',
            chooseBackupFile: 'Choisir une sauvegarde BunPro Local Audio Override',
            cleanWarning: 'Cliquez de nouveau sur le bouton de confirmation pour tout supprimer.',
            cleaning: 'Suppression de tous les audios personnalisés…',
            cleaned: '{count} audios personnalisés supprimés.',
            databaseError: 'Échec de l’opération de base de données : {error}',

            // Compression
            compressAudio: 'Compresser les audios',
            cancelCompression: 'Annuler la compression',
            autoCompressLabel: 'Compresser automatiquement les nouveaux audios',
            autoCompressTitle: 'Compresse avec perte en Opus mono les nouveaux audios enregistrés avec Save ou importés depuis une sauvegarde .bpao. La bibliothèque existante reste inchangée. Votre choix est mémorisé.',
            autoCompressionProgress: 'Compression automatique des nouveaux audios {done}/{total}…',
            autoCompressionSummary: 'Compression automatique : {changed} convertis, {skipped} ignorés, {failed} échecs · gain {saved}.',
            autoCompressionCancelled: 'Annulé. Aucun audio n’a été enregistré ni importé.',
            autoCompressionUnavailable: 'Compression automatique indisponible : {error}. Les audios originaux seront enregistrés ou importés normalement.',
            compressionConfirm: 'Compresser les audios enregistrés en Opus mono à 64 kbps ? Cette compression est avec perte. Exportez une sauvegarde pour conserver les originaux. Seuls les clips vérifiés et plus petits les remplacent. Le traitement est silencieux et dure environ la durée totale des audios. Gardez cet onglet ouvert ; vous pouvez annuler.',
            compressionStarting: 'Préparation de la compression…',
            compressionProgress: 'Compression {done}/{total} · gain {saved} · convertis {changed}, ignorés {skipped}, échecs {failed}',
            compressionComplete: 'Terminé : {changed} convertis, {skipped} ignorés, {failed} échecs · gain {saved}.',
            compressionCancelled: 'Annulé : {changed} convertis, {skipped} ignorés, {failed} échecs · gain {saved}. Les changements terminés sont conservés.',
            compressionCancelling: 'Annulation…',
            compressionFailed: 'Compression arrêtée : {error}. Les changements terminés sont conservés ; les autres clips restent inchangés.',
            compressionAbort: 'La compression audio a été annulée.',
            compressionRecorderUnavailable: 'Ce navigateur ne peut pas encoder l’audio Opus avec MediaRecorder.',
            compressionEncoderUnavailable: 'Ce navigateur ne dispose d’aucun encodeur Ogg/WebM Opus compatible.',
            compressionContextUnavailable: 'Le contexte de compression audio est indisponible.',
            compressionNoSamples: 'L’audio source ne contient aucun échantillon décodable.',
            compressionSuspended: 'Le traitement audio est suspendu. Gardez cet onglet actif et réessayez.',
            compressionEncoderFailed: 'L’encodeur Opus a échoué.',
            compressionStoppedEarly: 'L’encodage audio s’est arrêté avant la fin du clip.',
            compressionTimedOut: 'Le délai d’encodage audio a expiré. Gardez cet onglet actif et réessayez.',
            compressionEmptyClip: 'L’encodeur Opus a produit un clip vide.',
            compressionValidationFailed: 'La validation de la durée ou des canaux de l’audio encodé a échoué ; l’original a été conservé.',
        },
        ja: {
            voicevox: 'VOICEVOX',
            voicevoxVoice: '音声',
            voicevoxSpeed: '話速',
            voicevoxUrl: 'エンジンのアドレス',
            voicevoxLoad: '音声を読み込む',
            voicevoxChooseVoice: '音声を読み込んで選択',
            voicevoxCancel: 'キャンセル',
            voicevoxGenerating: 'VOICEVOX で生成中…',
            voicevoxReady: 'VOICEVOX の音声が完成 — {voice}。{result}',
            voicevoxMatched: '読みが一致しました。',
            voicevoxCorrected: '読みを修正しました：{words}。',
            voicevoxPartial: '一部の漢字に振り仮名がありません。',
            voicevoxUnverified: '読みは未確認です：振り仮名がありません。',
            voicevoxMismatch: '読みがまだ異なる可能性があります。',
            voicevoxUnreachable: '{url} の VOICEVOX に接続できません。VOICEVOX を起動し、{url}/setting の Allow Origin に https://bunpro.jp を追加してから、VOICEVOX を再起動してください。',
            voicevoxTimeout: 'VOICEVOX のリクエストがタイムアウトしました。',
            voicevoxCancelled: 'VOICEVOX をキャンセルしました。',
            voicevoxEngineError: 'VOICEVOX エンジンエラー（HTTP {status}）。',
            voicevoxInvalidUrl: '127.0.0.1、localhost または [::1] のローカル HTTP(S) アドレスを入力してください。ポートも指定できます。',
            voicevoxLoaded: 'VOICEVOX の音声を {count} 件読み込みました。',
            voicevoxNoSentence: 'VOICEVOX で生成する文がありません。',
            voicevoxInvalidResponse: 'VOICEVOX から無効な音声または応答が返されました。',
            voicevoxNoVoices: 'VOICEVOX にトーク音声がありません。',
            voicevoxFailed: 'VOICEVOX に失敗しました：{error}',
            // General
            panelTitle: 'ローカル音声の上書き',
            statusWaiting: '正解待ち',
            statusNone: 'ローカル上書きなし',
            statusLoading: 'ブラウザー保存領域を確認中',
            statusServiceError: 'ブラウザー保存領域を利用できません',
            statusPlaying: 'ローカル音声を再生中',
            statusFound: 'ローカル上書きが有効です',
            sentencePrefix: '文：{sentence}',
            sentenceUnreadable: '現在の文を読み取れません',
            chooseFile: '音声を選択',
            chooseAudio: '音声を選択…',
            noFileSelected: '先に音声ファイルを選択してください。',
            selectedFile: '選択済み：{file}',
            storedFile: '保存済み：{file}',
            storageNote: '音声はこのブラウザープロファイル内だけに保存されます。',
            storageUnavailable: 'ブラウザー保存領域でエラーが発生しました：{error}',
            storageBlocked: 'ブラウザー保存領域が無効または利用不可です。',
            fileTooLarge: '選択したファイルは 50 MB を超えています。',
            invalidAudioFile: '選択したファイルは音声ファイルではないようです。',
            testingFile: '{file} をテスト中…',
            save: '保存',
            test: 'テスト',
            delete: '削除',
            playLocalAudio: 'ローカル音声を再生',
            pauseLocalAudio: 'ローカル音声を一時停止',
            closeLocalPlayer: 'ローカル音声プレーヤーを閉じる',
            scrubLocalAudio: 'ローカル音声をシークする',
            localPlayerSettings: 'ローカル音声の速度設定を開く',
            fallbackSpeed: '速度',
            language: '表示言語',
            autoLanguage: '自動',
            speedCurrent: '{rate} · {source}',
            speedSourceMedia: 'BunPro メディア',
            speedSourceMenu: 'BunPro メニュー',
            speedSourceStorage: 'BunPro ストレージ',
            speedSourceObserved: '直近のプレーヤー設定',
            speedSourceFallback: 'プラグイン設定',
            mappingMissingFile: '設定はありますが、保存された音声データがありません',
            preloadFailed: '設定は見つかりましたが、音声の事前読み込みに失敗しました：{error}',
            entryMissingFile: '保存済みの上書きに音声データがありません',
            questionChanged: '問題が切り替わったため、以前の読み込みを取り消しました',
            localPlayFailed: 'ローカル再生に失敗しました：{error}',
            saving: 'ブラウザーに音声を保存中…',
            saved: 'このブラウザープロファイルに保存しました。',
            savePreloadFailed: '保存しましたが、事前読み込みに失敗しました：{error}',
            deleting: 'ローカル上書きを削除中…',
            deleted: '削除しました。この文では BunPro の音声を使用します。',
            testStarted: 'テスト再生を開始しました。',
            testFailed: 'テストに失敗しました：{error}',
            recordingUnsupported: 'このブラウザーはマイク録音に対応していません。',
            recordingStartFailed: 'マイク録音を開始できません：{error}',
            recordingPlaybackFailed: '録音を再生できません：{error}',
            recordingStarting: 'マイクへのアクセスを要求中…',
            recordingActive: '録音中… P で停止、O で再生します。',
            recordingStopped: '録音の準備ができました（{size}）。O で再生します。',
            recordingEmpty: '再生できる録音がありません。P で録音を開始してください。',
            recordingPlaybackStarting: '録音の再生を準備中…',
            recordingPlaybackActive: '録音を再生中…',
            recordingPlaybackEnded: '録音の再生が終了しました。',
            recordingOffLabel: '録音オフ',
            recordingOnLabel: '録音オン',
            recordingOffTitle: '音声録音はオフです。P と O はマイクを使用しません。クリックでオンにします。',
            recordingOnTitle: '音声録音はオンです。P で録音、O で再生します。クリックでオフにします。',
            recordingDisabled: '音声録音はオフです。',
            recordingMicProcessingRaw: 'マイク：処理なし',
            recordingMicProcessingClean: 'マイク：ノイズ除去',
            recordingMicProcessingRawTitle: 'マイク処理はオフです（エコー除去なし）。再生が止まるのを防ぐ設定です。クリックで切り替えます。',
            recordingMicProcessingCleanTitle: 'マイク処理はオンです（エコー除去・ノイズ抑制）。お手本の音声が録音に混ざるのを防ぎますが、一部のデバイスでは Chrome の再生が止まることがあります。クリックで切り替えます。',

            // Recording gain
            micGainLabel: '録音ゲイン',
            micGainTitle: '次の P 録音から声を増幅します。1× は元の音量、小声ならまず 2× をお試しください。設定は保存されます。お手本や録音済み音声は変わりません。背景ノイズも大きくなります。',
            micGainUnavailable: '録音ゲインを開始できません。お手本の再生は続きます。Rec をオフ・オンにして P で再試行してください。1× ではゲインなしで録音できます。',

            // Microphone recovery
            micUnavailable: 'マイクを利用できません。お手本の再生は続きます。再接続か Rec のオフ・オンで再試行できます。',
            micRetryWaiting: 'マイクエラーで録音を停止しました。{seconds} 秒後に P で再試行、または再接続か Rec のオフ・オンで今すぐ再試行できます。',
            micRequestTimeout: 'マイクの要求がタイムアウトしました。お手本の再生には影響しません。',

            // Admin
            admin: '管理',
            adminTitle: '音声データベース管理',
            adminHelp: '「インポート」は既存の文を残し、「インポートして置換」は上書きします。',
            adminStatsLoading: 'データベースを読み込んでいます…',
            adminStats: '{count} 件 · {size}',
            exportToFile: 'ファイルへエクスポート',
            importKeep: 'インポート',
            importReplace: 'インポートして置換',
            cleanDatabase: 'データベースを消去',
            confirmClean: '全削除を確認',
            back: '戻る',
            noOverridesToExport: 'エクスポートできるカスタム音声がありません。',
            exporting: 'バックアップを準備しています…',
            exportComplete: '{count} 件（{size}）をエクスポートしました。',
            exportFailed: 'エクスポートに失敗しました：{error}',
            importing: 'バックアップを読み込み、検証しています…',
            importCheckingProgress: 'バックアップを検証しています… {done}/{total}',
            importWritingProgress: 'バックアップを保存しています… {done}/{total}',
            importPartialFailed: 'インポートが停止しました。{committed}/{total} 件を保存済みです：{error}。同じボタンで同じファイルをもう一度インポートすると、残りを完了できます。',
            importPartialCancelled: 'インポートをキャンセルしました。{committed}/{total} 件を保存済みです。同じボタンで同じファイルをもう一度インポートすると、残りを完了できます。',
            importSummaryKeep: '{imported} 件をインポートし、既存の {skipped} 件をスキップしました。',
            importSummaryReplace: '{imported} 件をインポートし、既存の {replaced} 件を置換しました。',
            importFailed: 'インポートに失敗しました：{error}',
            invalidBackup: '有効な BunPro Local Audio Override バックアップではありません。',
            unsupportedBackupVersion: '未対応のバックアップ形式です：{version}',
            backupEntryTooLarge: 'バックアップ内に 50 MB を超える音声があります。',
            backupChecksumMismatch: '次の文のチェックサムが一致しません：{sentence}',
            chooseBackupFile: 'BunPro Local Audio Override バックアップを選択',
            cleanWarning: '保存済み音声をすべて削除するには、確認ボタンをもう一度押してください。',
            cleaning: 'カスタム音声をすべて削除しています…',
            cleaned: '{count} 件のカスタム音声を削除しました。',
            databaseError: 'データベース操作に失敗しました：{error}',

            // Compression
            compressAudio: '音声を圧縮',
            cancelCompression: '圧縮をキャンセル',
            autoCompressLabel: '新しい音声を自動圧縮',
            autoCompressTitle: 'Save で保存する音声や .bpao バックアップから新たに取り込む音声を、モノラル Opus で非可逆圧縮します。既存ライブラリは変更しません。設定は保存されます。',
            autoCompressionProgress: '新しい音声を自動圧縮中 {done}/{total}…',
            autoCompressionSummary: '自動圧縮：圧縮 {changed}、スキップ {skipped}、失敗 {failed} · {saved} 削減。',
            autoCompressionCancelled: 'キャンセルしました。音声は保存・インポートされていません。',
            autoCompressionUnavailable: '自動圧縮を利用できません：{error}。元の音声を通常どおり保存またはインポートします。',
            compressionConfirm: '保存済み音声を 64 kbps・モノラルの Opus に圧縮しますか？非可逆圧縮です。元の音質を残す場合は先にバックアップをエクスポートしてください。検証済みで小さくなった音声のみ置換します。無音で処理し、所要時間は音声の合計時間が目安です。タブを開いたままにしてください。途中でキャンセルできます。',
            compressionStarting: '圧縮を準備中…',
            compressionProgress: '圧縮中 {done}/{total} · {saved} 削減 · 圧縮 {changed}、スキップ {skipped}、失敗 {failed}',
            compressionComplete: '完了：圧縮 {changed}、スキップ {skipped}、失敗 {failed} · {saved} 削減。',
            compressionCancelled: 'キャンセル：圧縮 {changed}、スキップ {skipped}、失敗 {failed} · {saved} 削減。完了分は保存されました。',
            compressionCancelling: 'キャンセル中…',
            compressionFailed: '圧縮停止：{error}。完了分は保存され、未処理の音声は変更されていません。',
            compressionAbort: '音声圧縮をキャンセルしました。',
            compressionRecorderUnavailable: 'このブラウザーは MediaRecorder で Opus 音声をエンコードできません。',
            compressionEncoderUnavailable: 'このブラウザーには対応する Ogg/WebM Opus エンコーダーがありません。',
            compressionContextUnavailable: '音声圧縮用のコンテキストを利用できません。',
            compressionNoSamples: '元の音声にデコード可能なサンプルがありません。',
            compressionSuspended: '音声処理が一時停止しています。このタブをアクティブにして再試行してください。',
            compressionEncoderFailed: 'Opus エンコーダーでエラーが発生しました。',
            compressionStoppedEarly: '音声のエンコードがクリップの終了前に停止しました。',
            compressionTimedOut: '音声のエンコードがタイムアウトしました。このタブをアクティブにして再試行してください。',
            compressionEmptyClip: 'Opus エンコーダーが空のクリップを生成しました。',
            compressionValidationFailed: 'エンコード後の音声の長さまたはチャンネル数の検証に失敗しました。元の音声は保持されています。',
        },
    });

    const SPEED_CONTEXT_RE = /speed|playback\s*rate|速度|语速|語速|播放速度|再生速度|スピード|velocidad|kecepatan|vitesse/i;
    const SYNTHETIC_PLAY_BUTTON_ID = 'bp-local-audio-play-button';
    const LOCAL_PLAYER_WRAPPER_ID = 'bp-local-audio-player-wrapper';
    const LOCAL_SPEED_MENU_ID = 'bp-local-audio-speed-menu';
    const LOCAL_PLAYER_OWNED_ATTR = 'data-bp-local-audio-owned';
    const NATIVE_AUDIO_HIDDEN_CLASS = 'bp-local-audio__native-unavailable-hidden';
    const MEDIA_TRACKING_MARKER = '__bpLocalAudioTrackedV060';
    const NATIVE_P_INTENT_GRACE_MS = 2000;
    const NATIVE_P_ENDED_GUARD_MS = 150;
    const NATIVE_P_STOP_GUARD_MS = 500;
    const NATIVE_P_CLICK_PASSTHROUGH_MS = 250;

    const ICON_PATHS = Object.freeze({
        PLAY_CIRCLE_FILLED: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 13.5v-7a.5.5 0 0 1 .8-.4l4.67 3.5c.27.2.27.6 0 .8l-4.67 3.5a.5.5 0 0 1-.8-.4',
        PLAY_ARROW: 'M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 0 0 0-1.69L9.54 5.98A.998.998 0 0 0 8 6.82',
        PAUSE: 'M6 19h4V5H6zm8-14v14h4V5z',
        CANCEL: 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2m4.3 14.3a.996.996 0 0 1-1.41 0L12 13.41 9.11 16.3a.996.996 0 1 1-1.41-1.41L10.59 12 7.7 9.11A.996.996 0 1 1 9.11 7.7L12 10.59l2.89-2.89a.996.996 0 1 1 1.41 1.41L13.41 12l2.89 2.89c.38.38.38 1.02 0 1.41',
        SETTINGS: 'M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5',
    });

    const state = {
        dbPromise: null,
        selectedFile: null,
        voicevoxJob: null,
        voicevoxVoices: [],
        voicevoxVoicesUrl: '',
        eligible: false,
        sentence: '',
        normalizedSentence: '',
        lookupStatus: 'idle', // idle | loading | ready | error
        lookupError: null,
        panelMessage: null,
        overrideFound: false,
        entry: null,
        lookupPromise: null,
        panel: null,
        refs: null,
        syncScheduled: false,
        bypassClick: false,
        audio: null,
        objectUrl: '',
        objectUrlKey: '',
        objectUrlPromise: null,
        objectUrlPromiseKey: '',
        previewObjectUrl: '',
        playGeneration: 0,
        playPending: false,
        observedPagePlaybackRate: null,
        recordingGeneration: 0,
        recordingStartPending: false,
        recordingSession: null,
        recordingBlob: null,
        recordingObjectUrl: '',
        recordingPlaybackAudio: null,
        recordingPlaybackContext: null,
        recordingCaptureContext: null,
        recordingPlaybackSource: null,
        recordingPlaybackGeneration: 0,
        recordingPlaybackLastError: '',

        // Reuse one microphone stream across takes to avoid device routing stalls.
        micStream: null,
        micStreamPromise: null,
        micRequest: null,
        micRetryAfter: 0,
        micStreamCleanup: null,
        micStreamKey: '',
        micIdleTimer: 0,

        // Track transient ineligibility so a React update does not interrupt playback.
        ineligibleSince: 0,

        pHotkeyGeneration: 0,
        pPlaybackStartPending: false,
        pRoute: {
            owner: '',
            intentActive: false,
            intentStartedAt: 0,
            stopGuardUntil: 0,
            clickPassthroughGeneration: 0,
            clickPassthroughTimer: 0,
        },
        panelPositionScheduled: false,
        syntheticPlayButton: null,

        // Reuse BunPro's player DOM where available; create a matching fallback otherwise.
        playerOpen: false,
        playerWrapper: null,
        playerWrapperIsNative: false,
        playerWrapperSnapshot: null,
        playerRefs: null,
        playerRafId: 0,
        playerSeeking: false,
        playerSeekPointerId: null,
        controlledAnswerButton: null,
        controlledAnswerSnapshot: null,
        speedMenu: null,

        // Database administration state.
        adminMode: false,
        adminBusy: false,
        compressionJob: null,
        adminStats: { loading: false, count: 0, totalBytes: 0, error: '' },
        adminStatsPromise: null,
        cleanConfirmArmed: false,
        cleanConfirmTimer: 0,
        pendingImportMode: 'keep',
    };

    const lookupCache = new Map();
    let lookupCacheGeneration = 0;

    function getSetting(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return fallback;
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    function setSetting(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Settings are optional; audio data is stored separately in IndexedDB.
        }
    }

    function addStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        const attach = () => {
            const target = document.head || document.documentElement;
            if (target && !style.isConnected) target.append(style);
        };
        attach();
        if (!style.isConnected) document.addEventListener('DOMContentLoaded', attach, { once: true });
    }

    // Keep the frozen public configuration separate from the runtime debug switch.
    const CONFIG_DEBUG_OVERRIDE = { enabled: CONFIG.DEBUG };

    function isDebugEnabled() {
        return CONFIG_DEBUG_OVERRIDE.enabled;
    }

    function debug(...args) {
        if (isDebugEnabled()) console.debug('[BunPro Local Audio]', ...args);
    }

    function normalizeLanguageCode(value, fallback = 'en') {
        const raw = String(value || '').trim().replace(/_/g, '-').toLowerCase();
        if (!raw) return fallback;
        if (raw === 'auto') return 'auto';
        if (/^zh-(tw|hk|mo|hant)/.test(raw)) return 'zh-TW';
        if (/^zh/.test(raw)) return 'zh-CN';
        if (/^(en)(-|$)/.test(raw)) return 'en';
        if (/^(es)(-|$)/.test(raw)) return 'es';
        if (/^(id|in)(-|$)/.test(raw)) return 'id';
        if (/^(fr)(-|$)/.test(raw)) return 'fr';
        if (/^(ja|jp)(-|$)/.test(raw)) return 'ja';
        return fallback;
    }

    function detectAutomaticLanguage() {
        const browserLanguages = [
            ...(Array.isArray(navigator.languages) ? navigator.languages : []),
            navigator.language,
        ].filter(Boolean);

        for (const language of browserLanguages) {
            const normalized = normalizeLanguageCode(language, '');
            if (normalized && normalized !== 'auto') return normalized;
        }

        const firstPathSegment = location.pathname.split('/').filter(Boolean)[0] || '';
        const pathLanguage = normalizeLanguageCode(firstPathSegment, '');
        if (pathLanguage && pathLanguage !== 'auto') return pathLanguage;

        const htmlLanguage = normalizeLanguageCode(document.documentElement?.lang, '');
        return htmlLanguage && htmlLanguage !== 'auto' ? htmlLanguage : 'en';
    }

    function getUiLanguageSetting() {
        const saved = String(getSetting(STORAGE_KEYS.UI_LANGUAGE, 'auto'));
        return SUPPORTED_LANGUAGES.includes(saved) ? saved : 'auto';
    }

    function getResolvedUiLanguage() {
        const setting = getUiLanguageSetting();
        return setting === 'auto' ? detectAutomaticLanguage() : setting;
    }

    function t(key, variables = {}) {
        const language = getResolvedUiLanguage();
        const template = I18N[language]?.[key]
            ?? I18N.en[key]
            ?? key;
        return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
            Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
        );
    }

    function setUiLanguage(language) {
        const value = SUPPORTED_LANGUAGES.includes(language) ? language : 'auto';
        setSetting(STORAGE_KEYS.UI_LANGUAGE, value);
        applyPanelTranslations();
        renderPanel();
    }


    function normalizeSentence(value) {
        return String(value || '')
            .normalize('NFKC')
            .replace(/\s+/gu, '')
            .trim();
    }

    function isValidRate(value) {
        const rate = Number(value);
        return Number.isFinite(rate) && rate >= 0.5 && rate <= 2.0;
    }

    function isRecordingEnabled() {
        return getSetting(STORAGE_KEYS.RECORDING_ENABLED, true) !== false;
    }

    function isAutoCompressionEnabled() {
        return getSetting(STORAGE_KEYS.AUTO_COMPRESS, false) === true;
    }

    function setAutoCompressionEnabled(enabled) {
        setSetting(STORAGE_KEYS.AUTO_COMPRESS, Boolean(enabled));
        renderPanel();
    }

    function setRecordingEnabled(enabled) {
        const value = Boolean(enabled);
        resetMicrophoneRetry();
        setSetting(STORAGE_KEYS.RECORDING_ENABLED, value);
        if (!value) {
            void stopVoiceRecording({ discard: true });
            cancelRecordedAudioPlayback();
            releaseMicrophoneStream('recording-disabled');
            showRecordingStatus('recordingDisabled');
        }
        renderPanel();
    }

    const RECORDING_GAIN_LEVELS = Object.freeze([1, 1.5, 2, 3, 4]);
    function getRecordingGain() {
        const value = Number(getSetting(STORAGE_KEYS.RECORDING_GAIN, 1));
        return RECORDING_GAIN_LEVELS.includes(value) ? value : 1;
    }

    function setRecordingGain(value) {
        const gain = Number(value);
        setSetting(STORAGE_KEYS.RECORDING_GAIN, RECORDING_GAIN_LEVELS.includes(gain) ? gain : 1);
        // Each take snapshots its gain. Never restart a microphone or alter an
        // in-progress take merely because the user changes this preference.
        renderPanel();
    }

    // Raw mode avoids Chrome's echo-cancellation output rerouting, which can
    // stall playback on some devices; clean mode opts into browser processing.
    function getMicProcessingMode() {
        return getSetting(STORAGE_KEYS.MIC_PROCESSING, 'raw') === 'clean' ? 'clean' : 'raw';
    }

    function setMicProcessingMode(mode) {
        const value = mode === 'clean' ? 'clean' : 'raw';
        if (value === getMicProcessingMode()) return;
        setSetting(STORAGE_KEYS.MIC_PROCESSING, value);
        // Reacquire the stream because existing tracks retain their processing constraints.
        releaseMicrophoneStream('mic-processing-changed');
        resetMicrophoneRetry();
        renderPanel();
    }

    function normalizeFallbackRate(value) {
        const numeric = Number(value);
        const fallback = Number.isFinite(numeric) ? numeric : CONFIG.DEFAULT_FALLBACK_RATE;
        const clamped = Math.min(CONFIG.FALLBACK_RATE_MAX, Math.max(CONFIG.FALLBACK_RATE_MIN, fallback));
        const steps = Math.round((clamped - CONFIG.FALLBACK_RATE_MIN) / CONFIG.FALLBACK_RATE_STEP);
        return Number((CONFIG.FALLBACK_RATE_MIN + steps * CONFIG.FALLBACK_RATE_STEP).toFixed(2));
    }

    function getFallbackRate() {
        return normalizeFallbackRate(
            getSetting(STORAGE_KEYS.FALLBACK_RATE, CONFIG.DEFAULT_FALLBACK_RATE)
        );
    }

    function setFallbackRate(rate) {
        const normalized = normalizeFallbackRate(rate);
        setSetting(STORAGE_KEYS.FALLBACK_RATE, normalized);
        renderPanel();
    }

    function rememberObservedRate(rate) {
        if (!isValidRate(rate)) return;
        setSetting(STORAGE_KEYS.LAST_OBSERVED_RATE, Number(rate));
    }

    function getSelectedFile() {
        return state.selectedFile instanceof File ? state.selectedFile : null;
    }

    function clearSelectedFile() {
        state.selectedFile = null;
        if (state.refs?.fileInput) state.refs.fileInput.value = '';
    }

    function looksLikeAudioFile(file) {
        if (!(file instanceof Blob)) return false;
        if (String(file.type || '').toLowerCase().startsWith('audio/')) return true;
        return /\.(wav|mp3|ogg|oga|m4a|aac|flac|webm)$/i.test(String(file.name || ''));
    }

    function validateSelectedFile(file) {
        if (!(file instanceof File)) throw translatedError('noFileSelected');
        if (!looksLikeAudioFile(file)) throw translatedError('invalidAudioFile');
        if (file.size > CONFIG.MAX_AUDIO_BYTES) throw translatedError('fileTooLarge');
        return file;
    }

    function entryFileName(entry) {
        return String(entry?.fileName || entry?.file_name || entry?.file || 'audio');
    }

    function rateToPercent(rate) {
        return `${Math.round(Number(rate) * 100)}%`;
    }

    function parseRateFromText(text) {
        const value = String(text || '').replace(/\s+/g, ' ').trim();
        if (!value) return null;

        let match = value.match(/(?:^|[^\d])([5-9]\d|1\d\d|200(?:\.0+)?)\s*%(?:$|[^\d])/);
        if (match) {
            const rate = Number(match[1]) / 100;
            return isValidRate(rate) ? rate : null;
        }

        match = value.match(/(?:^|[^\d])(0\.[5-9]\d*|1(?:\.\d+)?|2(?:\.0+)?)\s*[x×](?:$|[^a-z\d])/i);
        if (match) {
            const rate = Number(match[1]);
            return isValidRate(rate) ? rate : null;
        }

        return null;
    }

    function readRateFromMediaElements() {
        // BunPro's React player owns a detached `new Audio()`, so a DOM-only scan misses
        // the authoritative playbackRate. Include media registered by the prototype hooks,
        // and never let this userscript's local/recording Audio elements report 100% as if
        // it were BunPro's current setting.
        const elements = [...collectCandidateMediaElements()].filter((element) =>
            !isOwnMediaElement(element)
        );
        const playing = elements.find((element) =>
            isBunproPageMediaElement(element) && !element.paused && !element.ended
        );
        const preferred = playing || elements.find((element) => isBunproPageMediaElement(element));
        const candidates = preferred
            ? [preferred, ...elements.filter((element) => element !== preferred)]
            : elements;

        for (const element of candidates) {
            const rate = Number(element.playbackRate || element.defaultPlaybackRate);
            if (isValidRate(rate)) return { rate, sourceKey: 'speedSourceMedia' };
        }
        return null;
    }

    function isSelectedElement(element) {
        if (!element) return false;
        if (element.matches('option:checked, input:checked')) return true;
        if (element.getAttribute('aria-checked') === 'true') return true;
        if (element.getAttribute('aria-selected') === 'true') return true;
        if (['checked', 'active', 'selected', 'on'].includes(element.getAttribute('data-state'))) return true;
        if (/\b(active|selected|checked|current)\b/i.test(String(element.className || ''))) return true;
        if (element.querySelector('svg[data-name="CHECK"], svg[data-name*="CHECK_CIRCLE"]')) return true;
        return false;
    }

    function readRateFromSelectedDom() {
        const roots = [
            document.querySelector('#modal-portal'),
            document.querySelector('#floating-portal-footer'),
            document.querySelector('#floating-portal-header'),
            ...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]'),
        ].filter(Boolean);

        const seen = new Set();
        for (const root of roots) {
            if (
                seen.has(root) ||
                root.closest?.('#bp-local-audio-panel') ||
                root.id === LOCAL_SPEED_MENU_ID ||
                root.closest?.(`#${LOCAL_SPEED_MENU_ID}`)
            ) continue;
            seen.add(root);
            if (!SPEED_CONTEXT_RE.test(root.textContent || '')) continue;

            const candidates = root.querySelectorAll(
                'option:checked, input:checked, [aria-checked="true"], [aria-selected="true"], ' +
                '[data-state="checked"], [data-state="active"], button, [role="option"], [role="menuitem"]'
            );

            for (const candidate of candidates) {
                if (!isSelectedElement(candidate)) continue;
                const rate = parseRateFromText(candidate.textContent || candidate.getAttribute('aria-label'));
                if (rate) {
                    rememberObservedRate(rate);
                    return { rate, sourceKey: 'speedSourceMenu' };
                }
            }
        }
        return null;
    }

    function findRateRecursively(value, path = '') {
        if (value === null || value === undefined) return null;

        if (typeof value === 'number' || typeof value === 'string') {
            if (/audio|voice|media|playback/i.test(path) && /speed|rate/i.test(path)) {
                const direct = Number(value);
                if (isValidRate(direct)) return direct;
                if (Number.isFinite(direct) && direct >= 50 && direct <= 200) return direct / 100;
                return parseRateFromText(value);
            }
            return null;
        }

        if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index += 1) {
                const result = findRateRecursively(value[index], `${path}[${index}]`);
                if (result) return result;
            }
            return null;
        }

        if (typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                const result = findRateRecursively(child, path ? `${path}.${key}` : key);
                if (result) return result;
            }
        }
        return null;
    }

    function readRateFromStorageObject(storage) {
        if (!storage) return null;
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (!key || !/audio|voice|media|playback/i.test(key)) continue;

            const raw = storage.getItem(key);
            if (raw === null) continue;

            if (/speed|rate/i.test(key)) {
                const direct = Number(raw);
                if (isValidRate(direct)) return { rate: direct, sourceKey: 'speedSourceStorage' };
                if (Number.isFinite(direct) && direct >= 50 && direct <= 200) {
                    return { rate: direct / 100, sourceKey: 'speedSourceStorage' };
                }
                const parsedText = parseRateFromText(raw);
                if (parsedText) return { rate: parsedText, sourceKey: 'speedSourceStorage' };
            }

            try {
                const parsed = JSON.parse(raw);
                const nested = findRateRecursively(parsed, key);
                if (nested) return { rate: nested, sourceKey: 'speedSourceStorage' };
            } catch {
                // Non-JSON storage item.
            }
        }
        return null;
    }

    function detectPlaybackRate() {
        const dom = readRateFromSelectedDom();
        if (dom) return dom;

        const observed = Number(getSetting(STORAGE_KEYS.LAST_OBSERVED_RATE, NaN));
        if (isValidRate(observed)) return { rate: observed, sourceKey: 'speedSourceObserved' };

        try {
            const local = readRateFromStorageObject(window.localStorage);
            if (local) return local;
        } catch {
            // Storage may be unavailable.
        }

        try {
            const session = readRateFromStorageObject(window.sessionStorage);
            if (session) return session;
        } catch {
            // Storage may be unavailable.
        }

        const media = readRateFromMediaElements();
        if (media) return media;

        return { rate: getFallbackRate(), sourceKey: 'speedSourceFallback' };
    }

    function observeSpeedChoice(target) {
        const candidate = target?.closest?.(
            'button, [role="menuitem"], [role="option"], label, input[type="radio"], option'
        );
        if (
            !candidate ||
            candidate.closest('#bp-local-audio-panel') ||
            candidate.closest(`#${LOCAL_SPEED_MENU_ID}`)
        ) return;

        const rate = parseRateFromText(
            `${candidate.textContent || ''} ${candidate.getAttribute('aria-label') || ''}`
        );
        if (!rate) return;

        const context = candidate.closest(
            '[role="menu"], [role="listbox"], [role="dialog"], #modal-portal, #floating-portal-footer'
        );
        if (context && SPEED_CONTEXT_RE.test(context.textContent || '')) {
            rememberObservedRate(rate);
            if (state.audio && state.playerOpen) {
                state.audio.defaultPlaybackRate = rate;
                state.audio.playbackRate = rate;
            }
            debug('Observed BunPro speed choice', rate);
            updateLocalPlayerControls();
            renderPanel();
        }
    }

    function storageFailure(error) {
        const detail = error?.translation || String(error?.message || error?.name || error || '') || { key: 'storageBlocked' };
        return translatedError('storageUnavailable', { error: detail });
    }

    // Keep camelCase and snake_case aliases: older readers and migration tools
    // accept either spelling in stored entries.
    function normalizeStoredEntry(record) {
        if (!record) return null;
        const fileName = String(record.fileName || record.file_name || record.file || 'audio');
        const updatedAt = String(record.updatedAt || record.updated_at || '');
        const blob = record.blob instanceof Blob ? record.blob : null;
        return {
            ...record,
            sentenceKey: String(record.sentenceKey || record.sentence || ''),
            sentence: String(record.sentence || record.sentenceKey || ''),
            fileName,
            file_name: fileName,
            file: fileName,
            source_path: fileName,
            mimeType: String(record.mimeType || record.mime_type || blob?.type || 'audio/wav'),
            mime_type: String(record.mimeType || record.mime_type || blob?.type || 'audio/wav'),
            size: Number(record.size || blob?.size || 0),
            sha256: String(record.sha256 || record.hash || '').toLowerCase(),
            hash: String(record.sha256 || record.hash || '').toLowerCase(),
            updatedAt,
            updated_at: updatedAt,
            blob,
        };
    }

    function openAudioDb() {
        if (state.dbPromise) return state.dbPromise;
        const promise = new Promise((resolve, reject) => {
            let request;
            let settled = false;
            let blockedTimer = null;
            const fail = (error) => {
                if (settled) return;
                settled = true;
                clearTimeout(blockedTimer);
                reject(error);
            };
            try {
                request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
            } catch (error) {
                fail(storageFailure(error));
                return;
            }

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(CONFIG.DB_STORE_NAME)) {
                    const store = db.createObjectStore(CONFIG.DB_STORE_NAME, { keyPath: 'sentenceKey' });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                // A blocked request cannot be cancelled; discard a late connection.
                if (settled) {
                    db.close();
                    return;
                }
                settled = true;
                clearTimeout(blockedTimer);
                const resetConnection = () => {
                    if (state.dbPromise === promise) state.dbPromise = null;
                };
                db.onversionchange = () => {
                    db.close();
                    resetConnection();
                };
                db.onclose = resetConnection;
                resolve(db);
            };
            request.onerror = () => fail(storageFailure(request.error));
            request.onblocked = () => {
                // Another tab can release its connection while this open is pending.
                if (settled || blockedTimer !== null) return;
                blockedTimer = setTimeout(() => fail(translatedError('storageBlocked')), CONFIG.DB_BLOCKED_TIMEOUT_MS);
            };
        }).catch((error) => {
            if (state.dbPromise === promise) state.dbPromise = null;
            throw error;
        });
        state.dbPromise = promise;
        return promise;
    }

    async function dbGet(sentenceKey) {
        const db = await openAudioDb();
        return new Promise((resolve, reject) => {
            let request;
            try {
                const tx = db.transaction(CONFIG.DB_STORE_NAME, 'readonly');
                request = tx.objectStore(CONFIG.DB_STORE_NAME).get(sentenceKey);
                request.onsuccess = () => resolve(normalizeStoredEntry(request.result));
                request.onerror = () => reject(storageFailure(request.error));
                tx.onabort = () => reject(storageFailure(tx.error));
            } catch (error) {
                reject(storageFailure(error));
            }
        });
    }

    async function dbPut(record) {
        const db = await openAudioDb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(CONFIG.DB_STORE_NAME, 'readwrite');
                tx.objectStore(CONFIG.DB_STORE_NAME).put(record);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(storageFailure(tx.error));
                tx.onabort = () => reject(storageFailure(tx.error));
            } catch (error) {
                reject(storageFailure(error));
            }
        });
    }

    async function dbDelete(sentenceKey) {
        const db = await openAudioDb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(CONFIG.DB_STORE_NAME, 'readwrite');
                tx.objectStore(CONFIG.DB_STORE_NAME).delete(sentenceKey);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(storageFailure(tx.error));
                tx.onabort = () => reject(storageFailure(tx.error));
            } catch (error) {
                reject(storageFailure(error));
            }
        });
    }


    async function dbGetAll() {
        const db = await openAudioDb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(CONFIG.DB_STORE_NAME, 'readonly');
                const store = tx.objectStore(CONFIG.DB_STORE_NAME);
                if (typeof store.getAll === 'function') {
                    const request = store.getAll();
                    request.onsuccess = () => resolve((request.result || []).map(normalizeStoredEntry).filter(Boolean));
                    request.onerror = () => reject(storageFailure(request.error));
                } else {
                    const rows = [];
                    const request = store.openCursor();
                    request.onsuccess = () => {
                        const cursor = request.result;
                        if (!cursor) {
                            resolve(rows.map(normalizeStoredEntry).filter(Boolean));
                            return;
                        }
                        rows.push(cursor.value);
                        cursor.continue();
                    };
                    request.onerror = () => reject(storageFailure(request.error));
                }
                tx.onabort = () => reject(storageFailure(tx.error));
            } catch (error) {
                reject(storageFailure(error));
            }
        });
    }

    async function dbPutMany(records, { keepExisting = false } = {}) {
        if (!records.length) return { imported: 0, replaced: 0, skipped: 0, skippedKeys: [] };
        const db = await openAudioDb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(CONFIG.DB_STORE_NAME, 'readwrite');
                const store = tx.objectStore(CONFIG.DB_STORE_NAME);
                const stats = { imported: 0, replaced: 0, skipped: 0, skippedKeys: [] };
                records.forEach((record) => {
                    const request = store.get(record.sentenceKey);
                    request.onsuccess = () => {
                        const exists = request.result !== undefined;
                        if (keepExisting && exists) {
                            stats.skipped += 1;
                            stats.skippedKeys.push(record.sentenceKey);
                            return;
                        }
                        store.put(record);
                        stats[exists ? 'replaced' : 'imported'] += 1;
                    };
                });
                tx.oncomplete = () => resolve(stats);
                tx.onerror = () => reject(storageFailure(tx.error));
                tx.onabort = () => reject(storageFailure(tx.error));
            } catch (error) {
                reject(storageFailure(error));
            }
        });
    }

    // Collect keys and byte counts without retaining all audio Blobs in memory.
    async function dbAudioInventory() {
        const db = await openAudioDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONFIG.DB_STORE_NAME, 'readonly');
            const inventory = { keys: [], presentKeys: [], count: 0, totalBytes: 0 };
            const request = tx.objectStore(CONFIG.DB_STORE_NAME).openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                inventory.presentKeys.push(cursor.primaryKey);
                if (cursor.value?.blob instanceof Blob) {
                    inventory.keys.push(cursor.primaryKey);
                    inventory.count += 1;
                    inventory.totalBytes += cursor.value.blob.size;
                }
                cursor.continue();
            };
            tx.oncomplete = () => resolve(inventory);
            tx.onerror = () => reject(storageFailure(tx.error));
            tx.onabort = () => reject(storageFailure(tx.error));
        });
    }

    // Compare and write within ONE transaction. A save/delete in another tab
    // while encoding must never be overwritten by an older compression result.
    async function dbReplaceCompressed(before, after) {
        const db = await openAudioDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONFIG.DB_STORE_NAME, 'readwrite');
            const store = tx.objectStore(CONFIG.DB_STORE_NAME);
            let replaced = false;
            const request = store.get(before.sentenceKey);
            request.onsuccess = () => {
                const current = normalizeStoredEntry(request.result);
                if (!current || current.updatedAt !== before.updatedAt
                    || current.sha256 !== before.sha256
                    || current.blob?.size !== before.blob.size
                    || current.fileName !== before.fileName
                    || current.mimeType !== before.mimeType) return;
                store.put(after);
                replaced = true;
            };
            tx.oncomplete = () => resolve(replaced);
            tx.onerror = () => reject(storageFailure(tx.error));
            tx.onabort = () => reject(storageFailure(tx.error));
        });
    }

    async function dbClear() {
        const db = await openAudioDb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(CONFIG.DB_STORE_NAME, 'readwrite');
                tx.objectStore(CONFIG.DB_STORE_NAME).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(storageFailure(tx.error));
                tx.onabort = () => reject(storageFailure(tx.error));
            } catch (error) {
                reject(storageFailure(error));
            }
        });
    }

    async function sha256Hex(blob) {
        if (!(blob instanceof Blob) || !globalThis.crypto?.subtle) return '';
        try {
            const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
            return [...new Uint8Array(digest)]
                .map((value) => value.toString(16).padStart(2, '0'))
                .join('');
        } catch {
            return '';
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                const comma = result.indexOf(',');
                if (comma < 0) reject(translatedError('invalidBackup'));
                else resolve(result.slice(comma + 1));
            };
            reader.onerror = () => reject(reader.error || translatedError('invalidBackup'));
            reader.readAsDataURL(blob);
        });
    }

    function base64ToBlob(base64, mimeType) {
        const input = String(base64 || '').replace(/\s+/g, '');
        if (!input || !/^[A-Za-z0-9+/]*={0,2}$/.test(input)) throw translatedError('invalidBackup');
        const parts = [];
        const chunkChars = 4 * 1024 * 1024;
        for (let offset = 0; offset < input.length; offset += chunkChars) {
            const slice = input.slice(offset, offset + chunkChars);
            const binary = atob(slice);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            parts.push(bytes);
        }
        return new Blob(parts, { type: mimeType || 'audio/wav' });
    }

    function formatBytes(value) {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024) return `${bytes} B`;
        const units = ['KB', 'MB', 'GB', 'TB'];
        let amount = bytes / 1024;
        let unit = units[0];
        for (let index = 1; index < units.length && amount >= 1024; index += 1) {
            amount /= 1024;
            unit = units[index];
        }
        const digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
        return `${amount.toFixed(digits)} ${unit}`;
    }

    function backupFileName() {
        const date = new Date().toISOString().slice(0, 10);
        return `bunpro-local-audio-backup-${date}${CONFIG.BACKUP_EXTENSION}`;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        (document.body || document.documentElement).append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    async function chooseBackupSaveHandle(filename) {
        if (typeof window.showSaveFilePicker !== 'function') return { supported: false, handle: null };
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: 'BunPro Local Audio Override backup',
                    accept: { 'application/json': [CONFIG.BACKUP_EXTENSION] },
                }],
            });
            return { supported: true, handle };
        } catch (error) {
            if (error?.name === 'AbortError') return { supported: true, handle: null, cancelled: true };
            throw error;
        }
    }

    async function serializeBackupEntry(entry) {
        const normalized = normalizeStoredEntry(entry);
        if (!normalized?.sentenceKey || !(normalized.blob instanceof Blob)) return null;
        const sha256 = normalized.sha256 || await sha256Hex(normalized.blob);
        return {
            sentenceKey: normalized.sentenceKey,
            sentence: normalized.sentence || normalized.sentenceKey,
            fileName: entryFileName(normalized),
            mimeType: normalized.mimeType || normalized.blob.type || 'audio/wav',
            size: normalized.blob.size,
            updatedAt: normalized.updatedAt || new Date().toISOString(),
            sha256,
            dataBase64: await blobToBase64(normalized.blob),
            ...(normalized.compression ? { compression: normalized.compression } : {}),
        };
    }

    async function buildBackupBlob(entries) {
        const parts = [];
        let count = 0;
        // A whole-library JSON string can exceed the engine's maximum string length.
        for (const entry of entries) {
            const item = await serializeBackupEntry(entry);
            if (!item) continue;
            if (count) parts.push(',');
            parts.push(new Blob([JSON.stringify(item)]));
            count += 1;
        }
        const header = JSON.stringify({
            format: CONFIG.BACKUP_FORMAT,
            formatVersion: CONFIG.BACKUP_FORMAT_VERSION,
            createdAt: new Date().toISOString(),
            scriptVersion: CONFIG.SCRIPT_VERSION,
            entryCount: count,
        });
        parts.unshift(header.slice(0, -1) + ',"entries":[');
        parts.push(']}');
        return { blob: new Blob(parts, { type: 'application/json;charset=utf-8' }), count };
    }

    function isBackupWhitespace(byte) {
        return byte === 32 || byte === 9 || byte === 10 || byte === 13;
    }

    async function indexBackupFile(file, job, {
        chunkBytes = CONFIG.BACKUP_READ_CHUNK_BYTES,
        entryMaxBytes = CONFIG.BACKUP_ENTRY_MAX_BYTES,
    } = {}) {
        if (!(file instanceof File)) throw translatedError('invalidBackup');
        const header = Object.create(null);
        const ranges = [];
        const stack = [];
        let started = false;
        let done = false;
        let bom = 0;
        let entriesSeen = false;
        let key = '';
        let keyStart = -1;
        let valueStart = -1;
        let entryStart = -1;
        let token = null;

        function checkCancelled() {
            if (job?.cancelled) throw new DOMException('Import cancelled.', 'AbortError');
        }
        function invalid() {
            throw new SyntaxError('Invalid backup JSON structure.');
        }
        function checkLength(end) {
            if (entryStart >= 0 && end - entryStart > entryMaxBytes) {
                throw translatedError('backupEntryTooLarge');
            }
            if ((keyStart >= 0 && end - keyStart > CONFIG.BACKUP_MEMBER_MAX_BYTES)
                || (valueStart >= 0 && end - valueStart > CONFIG.BACKUP_MEMBER_MAX_BYTES)) invalid();
        }
        async function finishValue(end) {
            const parent = stack[stack.length - 1];
            if (!parent) { done = true; return; }
            parent.phase = 'separator';
            if (parent.kind === 'entries') {
                ranges.push({ start: entryStart, end });
                entryStart = -1;
            } else if (parent.kind === 'root' && key !== 'entries') {
                header[key] = JSON.parse(await file.slice(valueStart, end).text());
                valueStart = -1;
            }
        }
        async function finishString(end) {
            const parent = stack[stack.length - 1];
            if (token.key) {
                if (parent.kind === 'root') {
                    key = JSON.parse(await file.slice(keyStart, end).text());
                    keyStart = -1;
                }
                parent.phase = 'colon';
            } else {
                await finishValue(end);
            }
            token = null;
        }

        // The file may exceed the engine's string limit; only keys, header values
        // and individual entries are ever decoded, never the complete backup.
        try {
            if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1
                || !Number.isSafeInteger(entryMaxBytes) || entryMaxBytes < 1) invalid();
            let offset = 0;
            while (true) {
                checkCancelled();
                const bytes = new Uint8Array(await file.slice(offset, offset + chunkBytes).arrayBuffer());
                checkCancelled();
                if (!bytes.length) break;
                let index = 0;
                while (index < bytes.length) {
                    const position = offset + index;
                    const byte = bytes[index];
                    if (bom || (position === 0 && byte === 239)) {
                        if (byte !== [239, 187, 191][bom]) invalid();
                        bom += 1;
                        if (bom === 3) bom = 0;
                        index += 1;
                        continue;
                    }
                    if (token?.string) {
                        if (token.escaped) {
                            token.escaped = false;
                            index += 1;
                        } else if (byte === 92) {
                            token.escaped = true;
                            index += 1;
                        } else if (byte === 34) {
                            checkLength(position + 1);
                            await finishString(position + 1);
                            index += 1;
                        } else {
                            const quote = bytes.indexOf(34, index);
                            const end = quote < 0 ? bytes.length : quote;
                            const slash = bytes.subarray(index, end).indexOf(92);
                            index = slash < 0 ? end : index + slash;
                        }
                        checkLength(offset + index);
                        continue;
                    }
                    if (token) {
                        if (!isBackupWhitespace(byte) && ![44, 93, 125].includes(byte)) {
                            if ([34, 58, 91, 123].includes(byte)) invalid();
                            index += 1;
                            checkLength(offset + index);
                            continue;
                        }
                        token = null;
                        await finishValue(position);
                        continue;
                    }
                    checkLength(position);
                    if (isBackupWhitespace(byte)) { index += 1; continue; }
                    if (done) invalid();
                    if (!started) {
                        if (byte !== 123) invalid();
                        started = true;
                        stack.push({ kind: 'root', close: 125, phase: 'firstKey' });
                        index += 1;
                        continue;
                    }
                    const parent = stack[stack.length - 1];
                    if (byte === parent.close && ['firstKey', 'firstValue', 'separator'].includes(parent.phase)) {
                        checkLength(position + 1);
                        stack.pop();
                        await finishValue(position + 1);
                        index += 1;
                        continue;
                    }
                    if (parent.phase === 'separator') {
                        if (byte !== 44) invalid();
                        parent.phase = parent.close === 125 ? 'key' : 'value';
                    } else if (parent.phase === 'colon') {
                        if (byte !== 58) invalid();
                        parent.phase = 'value';
                    } else if (parent.phase === 'key' || parent.phase === 'firstKey') {
                        if (byte !== 34) invalid();
                        if (parent.kind === 'root') keyStart = position;
                        token = { string: true, key: true, escaped: false };
                    } else {
                        if (parent.kind === 'root') {
                            if (key === 'entries') {
                                if (entriesSeen || byte !== 91) invalid();
                                entriesSeen = true;
                            } else {
                                valueStart = position;
                            }
                        } else if (parent.kind === 'entries') {
                            entryStart = position;
                        }
                        if (byte === 123 || byte === 91) {
                            stack.push({
                                kind: parent.kind === 'root' && key === 'entries' ? 'entries' : 'value',
                                close: byte === 123 ? 125 : 93,
                                phase: byte === 123 ? 'firstKey' : 'firstValue',
                            });
                        } else if (byte === 34) {
                            token = { string: true, key: false, escaped: false };
                        } else if (byte === 45 || (byte >= 48 && byte <= 57) || [116, 102, 110].includes(byte)) {
                            token = { string: false };
                        } else {
                            invalid();
                        }
                    }
                    index += 1;
                    checkLength(offset + index);
                }
                offset += bytes.length;
                // Use the actual slice length, including when a caller overrides File.size.
                if (bytes.length < chunkBytes) break;
            }
            if (bom || token || stack.length || !done) invalid();
        } catch (error) {
            if (error?.name === 'AbortError' || error?.translation?.key === 'backupEntryTooLarge') throw error;
            throw translatedError('invalidBackup', {}, { cause: error });
        }
        if (header.format !== CONFIG.BACKUP_FORMAT || !entriesSeen) throw translatedError('invalidBackup');
        if (Number(header.formatVersion) !== CONFIG.BACKUP_FORMAT_VERSION) {
            throw translatedError('unsupportedBackupVersion', { version: header.formatVersion ?? '?' });
        }
        return { header, ranges };
    }

    async function parseBackupEntry(item) {
        const sentenceKey = normalizeSentence(item?.sentenceKey || item?.sentence || '');
        if (!sentenceKey || typeof item?.dataBase64 !== 'string') throw translatedError('invalidBackup');
        const mimeType = String(item.mimeType || 'audio/wav');
        const blob = base64ToBlob(item.dataBase64, mimeType);
        if (blob.size > CONFIG.MAX_AUDIO_BYTES) throw translatedError('backupEntryTooLarge');
        const fileName = String(item.fileName || 'audio');
        const fileLike = new File([blob], fileName, { type: mimeType });
        if (!looksLikeAudioFile(fileLike)) throw translatedError('invalidBackup');

        const actualHash = await sha256Hex(blob);
        const expectedHash = String(item.sha256 || '').toLowerCase();
        if (expectedHash && actualHash && expectedHash !== actualHash) {
            throw translatedError('backupChecksumMismatch', { sentence: item.sentence || sentenceKey });
        }

        const updatedAt = String(item.updatedAt || new Date().toISOString());
        return {
            sentenceKey,
            sentence: String(item.sentence || sentenceKey),
            fileName,
            file_name: fileName,
            file: fileName,
            source_path: fileName,
            mimeType,
            mime_type: mimeType,
            size: blob.size,
            sha256: actualHash || expectedHash,
            hash: actualHash || expectedHash,
            updatedAt,
            updated_at: updatedAt,
            blob,
            ...(item.compression?.version === 1 && actualHash
                && item.compression.sha256 === actualHash
                ? { compression: { version: 1, codec: 'opus', bitRate: 64000, sha256: actualHash } }
                : {}),
        };
    }

    async function readBackupEntry(file, range, expectedSha256 = '') {
        let item;
        try {
            item = JSON.parse(await file.slice(range.start, range.end).text());
        } catch (error) {
            throw translatedError('invalidBackup', {}, { cause: error });
        }
        const record = await parseBackupEntry(item);
        if (expectedSha256 && record.sha256 !== expectedSha256) {
            throw translatedError('backupChecksumMismatch', { sentence: record.sentence });
        }
        return record;
    }

    async function scanBackupFile(file, job, options) {
        const { ranges } = await indexBackupFile(file, job, options);
        const unique = new Map();
        let done = 0;
        options?.onProgress?.(done, ranges.length);
        for (const range of ranges) {
            if (job?.cancelled) throw new DOMException('Import cancelled.', 'AbortError');
            const record = await readBackupEntry(file, range);
            unique.set(record.sentenceKey, {
                range, sentenceKey: record.sentenceKey, sha256: record.sha256, size: record.size,
            });
            options?.onProgress?.(++done, ranges.length);
        }
        return { descriptors: [...unique.values()], total: ranges.length };
    }

    function invalidateLookupAfterDatabaseChange() {
        lookupCacheGeneration += 1;
        lookupCache.clear();
        void preloadLookupCache();
        releaseLocalOverrideUi();
        releaseObjectUrl();
        releasePreviewObjectUrl();
        state.lookupStatus = 'idle';
        state.lookupError = null;
        state.overrideFound = false;
        state.entry = null;
        state.lookupPromise = null;
        if (state.eligible && state.normalizedSentence) void ensureLookupStarted();
    }


    async function preloadLookupCache() {
        // A new sentence's first lookup races an immediate P; the native P cannot
        // be held or replayed, so keep stored Blob handles ready before reveal.
        const generation = lookupCacheGeneration;
        try {
            const entries = await dbGetAll();
            if (generation !== lookupCacheGeneration) return;
            for (const entry of entries) {
                if (entry.blob instanceof Blob && !lookupCache.has(entry.sentenceKey)) {
                    lookupCache.set(entry.sentenceKey, { found: true, entry, reason: '' });
                }
            }
        } catch (error) {
            debug('Lookup cache preload failed', error);
        }
    }

    async function lookupOverride(sentence) {
        const entry = await dbGet(sentence);
        if (!entry) return { ok: true, found: false, entry: null };
        if (!(entry.blob instanceof Blob)) {
            return { ok: true, found: false, entry: null, reason: 'mapped_file_missing' };
        }
        return { ok: true, found: true, entry };
    }

    async function saveOverride(sentence, selectedFile) {
        const file = validateSelectedFile(selectedFile);
        const automatic = startAutomaticCompression();
        try {
            if (automatic) automatic.job.total = 1;
            const updatedAt = new Date().toISOString();
            const blob = file.slice(0, file.size, file.type || 'audio/wav');
            const sha256 = await sha256Hex(blob);
            const record = {
                sentenceKey: sentence, sentence,
                fileName: file.name || 'audio', file_name: file.name || 'audio', file: file.name || 'audio',
                mimeType: file.type || 'audio/wav', mime_type: file.type || 'audio/wav',
                size: file.size, sha256, hash: sha256, updatedAt, updated_at: updatedAt, blob,
            };
            const [prepared] = await automaticallyCompressRecords([record], automatic);
            if (automatic) { automatic.job.committing = true; renderPanel(); }
            await dbPut(prepared);
            try { void navigator.storage?.persist?.(); } catch { /* best effort */ }
            return { ok: true, entry: normalizeStoredEntry(prepared),
                compressionMessage: automaticCompressionMessage(automatic) };
        } finally {
            await finishAutomaticCompression(automatic);
        }
    }

    async function deleteOverride(sentence) {
        await dbDelete(sentence);
        return { ok: true };
    }

    async function loadSourcePreviewObjectUrl(selectedFile) {
        const file = validateSelectedFile(selectedFile);
        return URL.createObjectURL(file);
    }

    function readMeta() {
        const element = document.querySelector('#quiz-metadata-element');
        if (!element) return null;
        const data = element.dataset;
        return {
            isCorrect: data.metaIsCorrect === 'true',
            isPostAttempt: data.metaIsPostAttempt === 'true',
            isLoading: data.metaIsLoading === 'true',
            questionMode: data.metaQuestionMode || '',
            inputMode: data.metaInputMode || '',
        };
    }

    function findQuizAnswerContainer() {
        // Support both the tour-wrapper layout and InputManual/InputFlashcard
        // layouts that expose only the stable quiz-console class.
        return document.querySelector('#js-tour-quiz-answer') ||
            document.querySelector('#js-quiz .bp-quiz-console');
    }

    function findQuizPlayerMount() {
        const legacyPam = document.querySelector('#js-tour-quiz-pam');
        if (legacyPam?.parentElement) {
            return { parent: legacyPam.parentElement, anchor: legacyPam };
        }

        const answer = findQuizAnswerContainer();
        if (!answer?.parentElement) return null;
        return { parent: answer.parentElement, anchor: answer };
    }

    function getSentenceRoot() {
        return (
            document.querySelector('#js-tour-quiz-question .QuestionSentenceQuestionCloze > .text-center') ||
            document.querySelector('#js-tour-quiz-question .bp-quiz-question > .text-center') ||
            document.querySelector('#js-quiz .QuestionSentenceQuestionCloze > .text-center') ||
            document.querySelector('#js-quiz .bp-quiz-question > .text-center')
        );
    }

    function getSentenceFromDom() {
        const sentenceRoot = getSentenceRoot();
        if (!sentenceRoot) return '';

        const clone = sentenceRoot.cloneNode(true);
        clone.querySelectorAll('rt, rp').forEach((node) => node.remove());
        return normalizeSentence(clone.textContent || '');
    }

    function extractVoicevoxReading(root) {
        const segments = [];
        let pending = '';
        function flushText() {
            for (const surface of pending.split(/([\p{Script=Han}\p{N}\p{Script=Latin}]+)/u)) {
                if (!surface) continue;
                const unknown = /[\p{Script=Han}\p{N}\p{Script=Latin}]/u.test(surface);
                segments.push({ surface, reading: unknown ? null : surface, ruby: false });
            }
            pending = '';
        }
        function visit(node) {
            if (node.nodeType === 3) {
                pending += node.textContent;
                return;
            }
            if (node.nodeType !== 1 || node.matches('rt, rp')) return;
            if (node.matches('ruby') && node.querySelector('rt')?.textContent.trim()) {
                flushText();
                const base = node.cloneNode(true);
                base.querySelectorAll('rt, rp').forEach(child => child.remove());
                segments.push({ surface: base.textContent,
                    reading: [...node.querySelectorAll('rt')].map(rt => rt.textContent).join(''), ruby: true });
                return;
            }
            node.childNodes.forEach(visit);
        }
        if (root) visit(root);
        flushText();
        const surface = segments.map(segment => segment.surface).join('').replace(/\s+/gu, ' ').trim();
        const hasUnknown = segments.some(segment => segment.reading === null);
        return { segments, surface, text: surface.normalize('NFKC'), hasUnknown,
            hasRuby: segments.some(segment => segment.ruby),
            reading: hasUnknown ? null : segments.map(segment => segment.reading).join('').replace(/\s+/gu, ' ').trim() };
    }

    function readingKatakana(value) {
        return String(value || '').normalize('NFKC').replace(/[ぁ-ゖ]/gu,
            character => String.fromCharCode(character.charCodeAt(0) + 0x60));
    }

    function splitReadingMoras(value) {
        const moras = [];
        for (const character of readingKatakana(value).replace(/[\p{P}\p{S}\s]/gu, '')) {
            if (/[ャュョァィゥェォヮ]/u.test(character) && moras.length) {
                moras[moras.length - 1] += character;
            } else {
                moras.push(character);
            }
        }
        return moras;
    }

    function readingMoraVowel(mora) {
        const last = mora.slice(-1);
        const rows = ['アカガサザタダナハバパマャヤラヮワァヵ', 'イキギシジチヂニヒビピミリィ',
            'ウクグスズツヅヌフブプムュユルヴゥ', 'エケゲセゼテデネヘベペメレェヶ',
            'オコゴソゾトドノホボポモョヨロヲォ'];
        return ['a', 'i', 'u', 'e', 'o'][rows.findIndex(row => row.includes(last))] || '';
    }

    function canonicalizeReadingMoras(moras, previousVowel = '') {
        const equivalents = { ヲ: 'オ', ハ: 'ワ', ヘ: 'エ', ヂ: 'ジ', ヅ: 'ズ' };
        return moras.map(mora => {
            const pronunciation = equivalents[mora] || mora;
            const vowel = readingMoraVowel(pronunciation);
            const long = pronunciation === 'ー' || (previousVowel &&
                ((pronunciation === 'ア' && previousVowel === 'a') ||
                 (pronunciation === 'イ' && ['i', 'e'].includes(previousVowel)) ||
                 (pronunciation === 'ウ' && ['u', 'o'].includes(previousVowel)) ||
                 (pronunciation === 'エ' && previousVowel === 'e') ||
                 (pronunciation === 'オ' && previousVowel === 'o')));
            previousVowel = long ? previousVowel : vowel;
            return long ? 'LONG' : pronunciation;
        });
    }

    function parseVoicevoxKana(kana) {
        const phrases = [];
        const moras = [];
        const text = readingKatakana(kana);
        let phrase = { moras: [], accent: 0, question: false, separator: '' };
        let devoiced = false;
        function finish(separator) {
            if (!phrase.moras.length || !phrase.accent || devoiced) return false;
            phrase.separator = separator;
            phrases.push(phrase);
            phrase = { moras: [], accent: 0, question: false, separator: '' };
            return true;
        }
        for (const character of text) {
            if (character === '/' || character === '、') {
                if (!finish(character)) return null;
            } else if (character === "'") {
                if (!phrase.moras.length || phrase.accent || devoiced || phrase.question) return null;
                phrase.accent = phrase.moras.length;
            } else if (character === '_') {
                if (devoiced || phrase.question) return null;
                devoiced = true;
            } else if (character === '?') {
                if (!phrase.moras.length || phrase.question || devoiced) return null;
                phrase.question = true;
            } else if (/[ァ-ヺー]/u.test(character) && !phrase.question) {
                const previous = phrase.moras[phrase.moras.length - 1];
                if (/[ャュョァィゥェォヮ]/u.test(character)) {
                    if (!previous || devoiced || phrase.accent === phrase.moras.length ||
                        /[ャュョァィゥェォヮッンー]$/u.test(previous.text)) return null;
                    previous.text += character;
                } else {
                    const mora = { text: character, devoiced, phrase: phrases.length, index: moras.length };
                    phrase.moras.push(mora);
                    moras.push(mora);
                    devoiced = false;
                }
            } else {
                return null;
            }
        }
        if (phrase.moras.length) {
            if (!finish('')) return null;
        } else if (!phrases.length || phrases[phrases.length - 1].separator !== '、' || devoiced) {
            return null;
        }
        let previousVowel = '';
        for (const mora of moras) {
            mora.vowelBefore = previousVowel;
            if (mora.text !== 'ー') previousVowel = readingMoraVowel(mora.text);
        }
        return { phrases, moras, canonical: canonicalizeReadingMoras(moras.map(mora => mora.text)) };
    }

    function voicevoxQueryKana(query) {
        if (typeof query === 'string') return query;
        if (typeof query?.kana === 'string') return query.kana;
        if (!Array.isArray(query?.accent_phrases)) return '';
        if (query.accent_phrases.some(phrase => !phrase || !Array.isArray(phrase.moras) || !phrase.moras.length ||
            !Number.isInteger(phrase.accent) || phrase.accent < 0 || phrase.accent > phrase.moras.length)) return '';
        return query.accent_phrases.map((phrase, index, phrases) => {
            const accent = phrase.accent || phrase.moras.length;
            return phrase.moras.map((mora, moraIndex) => (/^[AIUEO]$/u.test(mora.vowel) ? '_' : '') +
                mora.text + (moraIndex + 1 === accent ? "'" : '')).join('') +
                (phrase.is_interrogative ? '？' : '') + (phrase.pause_mora ? '、' : index + 1 < phrases.length ? '/' : '');
        }).join('');
    }

    function alignVoicevoxReading(extracted, query) {
        const engineKana = voicevoxQueryKana(query);
        const engine = parseVoicevoxKana(engineKana);
        const tokens = [];
        extracted.segments.forEach((segment, index) => {
            if (segment.reading === null) {
                tokens.push({ wildcard: true, segment: index });
            } else {
                splitReadingMoras(segment.reading).forEach(text => tokens.push({ text, segment: index }));
            }
        });
        // Unknown spans break vowel context because their final mora is unavailable.
        let known = [];
        function finishKnown() {
            const values = canonicalizeReadingMoras(known.map(token => token.text));
            known.forEach((token, index) => { token.value = values[index]; });
            known = [];
        }
        for (const token of tokens) {
            if (token.wildcard) finishKnown();
            else known.push(token);
        }
        finishKnown();
        const operations = [];
        let distance = Infinity;
        if (engine) {
            const width = engine.moras.length + 1;
            const costs = Array.from({ length: tokens.length + 1 }, () => new Float64Array(width).fill(Infinity));
            const paths = Array.from({ length: tokens.length + 1 }, () => new Array(width));
            costs[0][0] = 0;
            for (let i = 0; i <= tokens.length; i += 1) {
                for (let j = 0; j < width; j += 1) {
                    if (!i && !j) continue;
                    const token = tokens[i - 1];
                    function choose(cost, previousI, previousJ, type) {
                        if (cost < costs[i][j]) {
                            costs[i][j] = cost;
                            paths[i][j] = { previousI, previousJ, type, token: i - 1, engine: j - 1 };
                        }
                    }
                    if (token?.wildcard) {
                        if (j) {
                            choose(costs[i - 1][j - 1], i - 1, j - 1, 'wildcard');
                            choose(costs[i][j - 1], i, j - 1, 'wildcard');
                        }
                    } else if (token) {
                        // The aligned wildcard supplies the otherwise unknown vowel context.
                        const value = tokens[i - 2]?.wildcard && j ?
                            canonicalizeReadingMoras([token.text], engine.moras[j - 1].vowelBefore)[0] : token.value;
                        const equal = value === engine.canonical[j - 1];
                        if (j) choose(costs[i - 1][j - 1] + (equal ? 0 : 1), i - 1, j - 1, equal ? 'equal' : 'replace');
                        choose(costs[i - 1][j] + 1, i - 1, j, 'delete');
                    }
                    if (j) choose(costs[i][j - 1] + 1, i, j - 1, 'insert');
                }
            }
            distance = costs[tokens.length][width - 1];
            let i = tokens.length;
            let j = width - 1;
            while (i || j) {
                const operation = paths[i][j];
                if (!operation) break;
                operations.push(operation);
                i = operation.previousI;
                j = operation.previousJ;
            }
            operations.reverse();
        }
        const ruby = extracted.segments.map((segment, index) => ({ ...segment, segment: index,
            status: engine ? 'ok' : 'mismatch', engineReading: '' })).filter(segment => segment.ruby);
        for (const operation of operations) {
            let token = tokens[operation.token];
            if (operation.type === 'insert' && !extracted.segments[token?.segment]?.ruby) {
                token = tokens[operation.token + 1] || token;
            }
            const result = ruby.find(segment => segment.segment === token?.segment);
            if (!result) continue;
            if (operation.type !== 'delete') result.engineReading += engine.moras[operation.engine].text;
            if (!['equal', 'wildcard'].includes(operation.type)) result.status = 'mismatch';
        }
        const status = !extracted.hasRuby && extracted.hasUnknown ? 'unverified' : distance ? 'mismatch' :
            extracted.hasUnknown ? 'partial' : 'matched';
        return { status, ruby, misread: ruby.filter(segment => segment.status === 'mismatch'),
            engine, tokens, operations, distance };
    }

    function buildVoicevoxText(extracted, alignment) {
        const mismatched = new Set(alignment.misread.map(segment => segment.segment));
        return extracted.segments.map((segment, index) => mismatched.has(index) ? segment.reading : segment.surface).join('');
    }

    function buildVoicevoxKana(alignment) {
        const { engine, tokens, operations } = alignment;
        if (!engine || !operations.length || alignment.status === 'unverified') return null;
        const phrases = engine.phrases.map(phrase => ({ ...phrase, moras: [] }));
        for (let index = 0; index < operations.length; index += 1) {
            const operation = operations[index];
            if (operation.type === 'insert') continue;
            const retained = operation.type === 'equal' || operation.type === 'wildcard';
            let source = engine.moras[operation.engine];
            if (operation.type === 'delete') {
                const neighbour = operations.slice(index + 1).find(item => ['equal', 'wildcard', 'replace'].includes(item.type)) ||
                    operations.slice(0, index).reverse().find(item => ['equal', 'wildcard', 'replace'].includes(item.type));
                source = engine.moras[neighbour?.engine];
            }
            if (!source) return null;
            const text = retained ? source.text : tokens[operation.token].text;
            if (!/^[ァ-ヺー][ャュョァィゥェォヮ]?$/u.test(text)) return null;
            phrases[source.phrase].moras.push({ text, devoiced: retained && source.devoiced });
        }
        if (phrases.some(phrase => !phrase.moras.length)) return null;
        const kana = phrases.map(phrase => {
            const accent = Math.max(1, Math.min(phrase.accent, phrase.moras.length));
            return phrase.moras.map((mora, index) => (mora.devoiced ? '_' : '') + mora.text +
                (index + 1 === accent ? "'" : '')).join('') + (phrase.question ? '？' : '') + phrase.separator;
        }).join('');
        return parseVoicevoxKana(kana) ? kana : null;
    }

    function getSentenceFromPrefetch() {
        const link = document.querySelector('link#prefetch-audio[as="audio"]');
        if (!link?.href) return '';

        try {
            const url = new URL(link.href, location.href);
            let filename = decodeURIComponent(url.pathname.split('/').pop() || '');
            filename = filename.replace(/-(female|male)\.(mp3|wav|ogg|m4a|aac|flac)$/i, '');
            return normalizeSentence(filename);
        } catch {
            return '';
        }
    }

    function readPageContext() {
        const meta = readMeta();
        const eligible = Boolean(
            meta &&
            meta.isCorrect &&
            meta.isPostAttempt &&
            !meta.isLoading &&
            meta.questionMode === 'cloze'
        );
        const sentence = eligible ? (getSentenceFromDom() || getSentenceFromPrefetch()) : '';
        return {
            eligible: eligible && Boolean(sentence),
            sentence,
            normalizedSentence: normalizeSentence(sentence),
        };
    }

    function stopLocalAudio(invalidatePendingPlay = true, reason = '') {
        if (isDebugEnabled() && isLocalAudioPlaying()) {
            debug('stopLocalAudio while playing', reason || 'unspecified', {
                currentTime: state.audio?.currentTime,
                pRoute: getPRouteOwner(),
                eligible: state.eligible,
            });
        }
        if (invalidatePendingPlay) state.playGeneration += 1;
        state.playPending = false;
        stopPlayerAnimation();
        if (state.audio) {
            try {
                state.audio.pause();
                state.audio.currentTime = 0;
            } catch {
                // A media cleanup failure must not prevent switching questions.
            }
        }
        paintLocalPlayerProgress();
        updateLocalPlayerControls();
    }

    function releaseObjectUrl() {
        if (state.objectUrl) {
            try {
                URL.revokeObjectURL(state.objectUrl);
            } catch {
                // Ignore object URL cleanup errors.
            }
        }
        state.objectUrl = '';
        state.objectUrlKey = '';
        state.objectUrlPromise = null;
        state.objectUrlPromiseKey = '';
    }

    function releasePreviewObjectUrl() {
        if (state.previewObjectUrl) {
            try {
                URL.revokeObjectURL(state.previewObjectUrl);
            } catch {
                // Ignore object URL cleanup errors.
            }
        }
        state.previewObjectUrl = '';
    }

    function validateVoicevoxUrl(value) {
        try {
            const url = new URL(String(value).trim());
            if (!['http:', 'https:'].includes(url.protocol) ||
                !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
                url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
                throw new Error();
            }
            return url.origin;
        } catch {
            throw translatedError('voicevoxInvalidUrl');
        }
    }

    function getVoicevoxSpeed() {
        const speed = Number(getSetting(STORAGE_KEYS.VOICEVOX_SPEED, 1));
        return speed >= 0.8 && speed <= 1.5 && Math.abs(speed * 10 - Math.round(speed * 10)) < 0.00001
            ? Math.round(speed * 10) / 10 : 1;
    }

    function cancelVoicevox(showMessage = true) {
        const job = state.voicevoxJob;
        if (!job) return;
        state.voicevoxJob = null;
        job.controller.abort();
        setUiBusy(false);
        if (showMessage) setPanelMessage('voicevoxCancelled');
        renderVoicevoxControls();
    }

    async function voicevoxRequest(job, path, params = {}, body, wav = false) {
        const base = validateVoicevoxUrl(job.url);
        const url = new URL(path, base);
        url.search = new URLSearchParams(params).toString();
        const controller = new AbortController();
        const abort = () => controller.abort();
        job.controller.signal.addEventListener('abort', abort, { once: true });
        if (job.controller.signal.aborted) controller.abort();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, wav ? CONFIG.VOICEVOX_SYNTHESIS_TIMEOUT_MS : CONFIG.VOICEVOX_QUERY_TIMEOUT_MS);
        try {
            const response = await fetch(url.href, {
                method: path === '/speakers' ? 'GET' : 'POST',
                signal: controller.signal,
                redirect: 'error',
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                ...(body === undefined ? {} : {
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
                }),
            });
            if (!response.ok) {
                const error = translatedError('voicevoxEngineError', { status: response.status });
                error.status = response.status;
                throw error;
            }
            return await (wav ? response.blob() : response.json());
        } catch (error) {
            if (timedOut) throw translatedError('voicevoxTimeout');
            if (error?.name === 'TypeError') throw translatedError('voicevoxUnreachable', { url: base });
            throw error;
        } finally {
            clearTimeout(timer);
            job.controller.signal.removeEventListener('abort', abort);
        }
    }

    function selectVoicevoxVoice(voice) {
        setSetting(STORAGE_KEYS.VOICEVOX_STYLE, voice.id);
        setSetting(STORAGE_KEYS.VOICEVOX_LABEL, voice.label);
    }

    async function loadVoicevoxVoices(job) {
        const speakers = await voicevoxRequest(job, '/speakers');
        if (!Array.isArray(speakers)) throw translatedError('voicevoxInvalidResponse');
        const voices = speakers.flatMap(speaker => (speaker.styles || [])
            // Engine 0.26 reports ordinary voices as streaming_talk; singing styles cannot read sentences.
            .filter(style => (!style.type || ['talk', 'streaming_talk'].includes(style.type)) &&
                Number.isInteger(style.id) && style.id >= 0)
            .map(style => ({ id: style.id, label: `${speaker.name}(${style.name})` })));
        if (!voices.length) throw translatedError('voicevoxNoVoices');
        if (state.voicevoxJob !== job) return;
        state.voicevoxVoices = voices;
        state.voicevoxVoicesUrl = job.url;
        const selected = Number(getSetting(STORAGE_KEYS.VOICEVOX_STYLE, -1));
        selectVoicevoxVoice(voices.find(voice => voice.id === selected) || voices[0]);
        renderVoicevoxControls();
    }

    function renderVoicevoxControls() {
        const refs = state.refs;
        if (!refs?.voicevoxButton) return;
        const busy = Boolean(state.voicevoxJob);
        refs.voicevoxButton.textContent = t(busy ? 'voicevoxCancel' : 'voicevox');
        refs.voicevoxButton.disabled = !busy && refs.fileInput.disabled;
        refs.voicevoxLoad.disabled = busy || state.adminBusy || refs.fileInput.disabled;
        refs.voicevoxUrl.disabled = refs.voicevoxLoad.disabled;
        refs.voicevoxVoice.disabled = refs.voicevoxLoad.disabled;
        refs.voicevoxSpeed.disabled = refs.voicevoxLoad.disabled;
        const selected = String(getSetting(STORAGE_KEYS.VOICEVOX_STYLE, ''));
        const label = getSetting(STORAGE_KEYS.VOICEVOX_LABEL, '');
        const voices = state.voicevoxVoices.slice();
        if (!voices.some(voice => String(voice.id) === selected)) {
            voices.unshift({ id: selected, label: label || t('voicevoxChooseVoice') });
        }
        const options = [...refs.voicevoxVoice.options];
        if (options.length !== voices.length || voices.some((voice, index) =>
            options[index].value !== String(voice.id) || options[index].textContent !== voice.label)) {
            refs.voicevoxVoice.replaceChildren();
            for (const voice of voices) {
                const option = document.createElement('option');
                option.value = String(voice.id);
                option.textContent = voice.label;
                refs.voicevoxVoice.append(option);
            }
        }
        refs.voicevoxVoice.value = selected;
    }

    async function handleVoicevox(loadOnly = false) {
        if (state.voicevoxJob) {
            cancelVoicevox();
            return;
        }
        if (state.refs?.fileInput.disabled || state.adminBusy) return;
        ensureStateMatchesPage();
        const extracted = extractVoicevoxReading(getSentenceRoot());
        if (!loadOnly && (!state.eligible || !extracted.text)) {
            setPanelMessage('voicevoxNoSentence');
            return;
        }
        let url;
        try {
            url = validateVoicevoxUrl(state.refs.voicevoxUrl.value);
        } catch (error) {
            setPanelMessageFromError(error);
            return;
        }
        setSetting(STORAGE_KEYS.VOICEVOX_URL, url);
        state.refs.voicevoxUrl.value = url;
        const job = { url, controller: new AbortController(), sentence: state.normalizedSentence };
        state.voicevoxJob = job;
        setUiBusy(true, 'voicevoxGenerating');
        renderVoicevoxControls();
        const current = () => state.voicevoxJob === job && state.normalizedSentence === job.sentence &&
            (loadOnly || normalizeSentence(getSentenceFromDom()) === job.sentence);
        try {
            if (loadOnly || state.voicevoxVoicesUrl !== url) await loadVoicevoxVoices(job);
            if (!current()) return;
            if (loadOnly) {
                setPanelMessage('voicevoxLoaded', { count: state.voicevoxVoices.length });
                return;
            }
            const speaker = Number(getSetting(STORAGE_KEYS.VOICEVOX_STYLE, 0));
            const label = getSetting(STORAGE_KEYS.VOICEVOX_LABEL, '');
            let query = await voicevoxRequest(job, '/audio_query', { text: extracted.text, speaker });
            let alignment = alignVoicevoxReading(extracted, query);
            const misread = new Map(alignment.misread.map(segment => [segment.segment, segment]));
            if (alignment.status === 'mismatch' && alignment.misread.length) {
                const next = await voicevoxRequest(job, '/audio_query', {
                    text: buildVoicevoxText(extracted, alignment), speaker,
                });
                const nextAlignment = alignVoicevoxReading(extracted, next);
                // Keep the closer query if kana substitution makes another reading worse.
                if (nextAlignment.distance <= alignment.distance) {
                    query = next;
                    alignment = nextAlignment;
                }
            }
            if (alignment.status === 'mismatch') {
                alignment.misread.forEach(segment => misread.set(segment.segment, segment));
                const kana = buildVoicevoxKana(alignment);
                if (kana) {
                    try {
                        const phrases = await voicevoxRequest(job, '/accent_phrases', { text: kana, speaker, is_kana: true });
                        if (!Array.isArray(phrases)) throw translatedError('voicevoxInvalidResponse');
                        query = { ...query, kana, accent_phrases: phrases };
                        alignment = alignVoicevoxReading(extracted, { accent_phrases: phrases });
                    } catch (error) {
                        if (error.status !== 400) throw error;
                    }
                }
            }
            if (!current()) return;
            query.speedScale = getVoicevoxSpeed();
            const blob = await voicevoxRequest(job, '/synthesis', { speaker }, query, true);
            const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
            if (blob.size <= 12 || String.fromCharCode(...header.slice(0, 4)) !== 'RIFF' ||
                String.fromCharCode(...header.slice(8, 12)) !== 'WAVE') throw translatedError('voicevoxInvalidResponse');
            const file = validateSelectedFile(new File([blob], `VOICEVOX ${label}.wav`, { type: 'audio/wav' }));
            if (!current()) return;
            state.selectedFile = file;
            state.refs.fileInput.value = '';
            renderPanel();
            try {
                await playSourcePreview(file, current);
            } catch (error) {
                if (current()) setPanelMessage('testFailed', { error: errorMessage(error) });
                return;
            }
            if (!current()) return;
            const words = [...misread.values()].map(segment => `${segment.surface}→${segment.reading}`).join(', ');
            const result = alignment.status === 'matched' && words
                ? { key: 'voicevoxCorrected', vars: { words } }
                : { key: 'voicevox' + alignment.status[0].toUpperCase() + alignment.status.slice(1) };
            setPanelMessage('voicevoxReady', { voice: label, result });
        } catch (error) {
            if (current()) {
                if (error.name === 'AbortError') setPanelMessage('voicevoxCancelled');
                else if (error.translation) setPanelMessageFromError(error);
                else setPanelMessage('voicevoxFailed', { error: errorMessage(error) });
            }
        } finally {
            if (state.voicevoxJob === job) {
                state.voicevoxJob = null;
                setUiBusy(false);
                renderVoicevoxControls();
                renderPanel();
            }
        }
    }

    function resetForSentence(sentence) {
        cancelVoicevox(false);
        state.pHotkeyGeneration += 1;
        state.pPlaybackStartPending = false;
        releasePRoute({ resetNative: true });
        clearNativePClickPassthrough();
        void stopVoiceRecording({ discard: false });
        cancelRecordedAudioPlayback();
        releaseLocalOverrideUi();
        releaseObjectUrl();
        releasePreviewObjectUrl();
        clearSelectedFile();
        if (state.refs && !state.compressionJob) clearPanelMessage();
        state.sentence = sentence;
        state.normalizedSentence = normalizeSentence(sentence);
        state.lookupStatus = 'idle';
        state.lookupError = null;
        state.overrideFound = false;
        state.entry = null;
        state.lookupPromise = null;
    }

    function setLookupResult(sentence, payload) {
        if (state.normalizedSentence !== sentence) return;
        state.lookupStatus = 'ready';
        state.lookupError = payload.reason === 'mapped_file_missing' ? { key: 'mappingMissingFile', vars: {} } : null;
        state.overrideFound = payload.found === true;
        state.entry = payload.found ? payload.entry : null;
        lookupCache.set(sentence, {
            found: state.overrideFound,
            entry: state.entry,
            reason: payload.reason || '',
        });

        renderPanel();
        if (state.overrideFound) {
            void prepareLocalAudioElement(state.entry).catch((error) => {
                if (state.normalizedSentence !== sentence) return;
                state.lookupError = { key: 'preloadFailed', vars: { error: errorMessage(error) } };
                renderPanel();
            });
        }
    }

    function ensureLookupStarted() {
        const sentence = state.normalizedSentence;
        if (!state.eligible || !sentence) return Promise.resolve({ found: false });
        if (state.lookupStatus === 'ready') {
            return Promise.resolve({ found: state.overrideFound, entry: state.entry });
        }
        if (state.lookupPromise) return state.lookupPromise;

        const cached = lookupCache.get(sentence);
        if (cached) {
            setLookupResult(sentence, { ok: true, ...cached });
            return Promise.resolve(cached);
        }

        state.lookupStatus = 'loading';
        state.lookupError = null;
        renderPanel();

        state.lookupPromise = lookupOverride(sentence)
            .then((payload) => {
                setLookupResult(sentence, payload);
                return payload;
            })
            .catch((error) => {
                if (state.normalizedSentence === sentence) {
                    state.lookupStatus = 'error';
                    state.lookupError = error.translation || { key: null, vars: { error: error.message } };
                    state.overrideFound = false;
                    state.entry = null;
                    renderPanel();
                }
                return { found: false, error };
            })
            .finally(() => {
                if (state.normalizedSentence === sentence) state.lookupPromise = null;
            });

        return state.lookupPromise;
    }

    // React rerenders, prefetch and reveal animations can briefly invalidate
    // data-meta-*. Defer teardown during playback until ineligibility persists,
    // because resetForSentence would otherwise stop the current audio.
    function shouldDeferIneligibleTeardown() {
        if (!isLocalAudioPlaying() && !state.pPlaybackStartPending) {
            state.ineligibleSince = 0;
            return false;
        }
        const now = performance.now();
        if (!state.ineligibleSince) state.ineligibleSince = now;
        if (now - state.ineligibleSince < CONFIG.PAGE_STATE_GRACE_MS) {
            debug('Deferring teardown: page reported ineligible while audio is playing');
            return true;
        }
        return false;
    }

    function ensureStateMatchesPage() {
        const context = readPageContext();

        if (!context.eligible) {
            if (shouldDeferIneligibleTeardown()) return { ...context, eligible: state.eligible };
            state.eligible = false;
            if (state.normalizedSentence) resetForSentence('');
            else releaseLocalOverrideUi();
            ensurePanelPlacement(false);
            return context;
        }

        state.eligible = true;
        state.ineligibleSince = 0;

        if (context.normalizedSentence !== state.normalizedSentence) {
            resetForSentence(context.sentence);
        } else {
            state.sentence = context.sentence;
        }

        ensurePanelPlacement(true);
        void ensureLookupStarted();
        renderPanel();
        return context;
    }

    async function ensureAudioObjectUrl(entry) {
        if (!(entry?.blob instanceof Blob)) throw translatedError('entryMissingFile');
        const fileName = entryFileName(entry);
        const key = `${fileName}|${entry.updated_at || entry.updatedAt || ''}|${entry.size || entry.blob.size || ''}`;

        if (state.objectUrl && state.objectUrlKey === key) return state.objectUrl;
        if (state.objectUrlPromise && state.objectUrlPromiseKey === key) return state.objectUrlPromise;

        stopLocalAudio(false);
        releaseObjectUrl();
        state.objectUrlPromiseKey = key;

        const promise = Promise.resolve().then(() => {
            const objectUrl = URL.createObjectURL(entry.blob);
            if (state.objectUrlPromiseKey !== key) {
                URL.revokeObjectURL(objectUrl);
                throw translatedError('questionChanged');
            }
            state.objectUrl = objectUrl;
            state.objectUrlKey = key;
            return objectUrl;
        }).finally(() => {
            if (state.objectUrlPromiseKey === key) {
                state.objectUrlPromise = null;
                state.objectUrlPromiseKey = '';
            }
        });

        state.objectUrlPromise = promise;
        return promise;
    }

    async function prepareLocalAudioElement(entry) {
        const objectUrl = await ensureAudioObjectUrl(entry);
        const audio = ensureAudioElement();
        if (audio.src !== objectUrl) {
            audio.src = objectUrl;
            audio.load();
        }
        return objectUrl;
    }

    // BunPro keeps new Audio() elements in React refs outside the DOM, where
    // document queries and event capture cannot reach them. Hook play() to track
    // active media and playbackRate to observe settings before the first play:
    // a local override can prevent BunPro's element from ever playing, even though
    // React already assigned the account's speed (for example 75% or 85%).
    const trackedMediaElements = new Set();

    function isOwnMediaElement(media) {
        return Boolean(
            media &&
            (media === state.audio || media === state.recordingPlaybackAudio)
        );
    }

    function observePageMediaPlaybackRate(media) {
        if (!(media instanceof HTMLMediaElement) || isOwnMediaElement(media)) return;
        const rate = Number(media.playbackRate || media.defaultPlaybackRate);
        if (!isValidRate(rate)) return;

        state.observedPagePlaybackRate = rate;
        rememberObservedRate(rate);

        // If the user changes BunPro's speed while local audio is already open, mirror the
        // change immediately instead of waiting for the next play/pause cycle.
        if (
            state.audio &&
            state.playerOpen &&
            Math.abs(Number(state.audio.playbackRate) - rate) > 0.0001
        ) {
            state.audio.defaultPlaybackRate = rate;
            state.audio.playbackRate = rate;
        }
        debug('Observed BunPro media playback rate', rate);
    }

    function trackMediaElement(media) {
        if (!(media instanceof HTMLMediaElement) || isOwnMediaElement(media)) return;
        if (!trackedMediaElements.has(media)) {
            trackedMediaElements.add(media);
            ['ended', 'error', 'abort', 'emptied'].forEach((eventName) => {
                media.addEventListener(eventName, onBunproPageMediaStateChanged);
            });
            debug('Tracking a media element', media.currentSrc || media.src || '(no src)');
        }
        observePageMediaPlaybackRate(media);
    }

    function installMediaElementTracking() {
        const proto = window.HTMLMediaElement?.prototype;
        if (!proto || proto[MEDIA_TRACKING_MARKER]) return;
        const nativePlay = proto.play;
        if (typeof nativePlay !== 'function') return;

        try {
            proto.play = function play(...args) {
                try {
                    trackMediaElement(this);
                } catch {
                    // Tracking failures must not interfere with BunPro's own playback.
                }
                return nativePlay.apply(this, args);
            };
        } catch (error) {
            debug('Unable to hook HTMLMediaElement.play; falling back to DOM scanning', error);
        }

        try {
            const descriptor = Object.getOwnPropertyDescriptor(proto, 'playbackRate');
            if (descriptor?.get && descriptor?.set && descriptor.configurable) {
                Object.defineProperty(proto, 'playbackRate', {
                    ...descriptor,
                    set(value) {
                        descriptor.set.call(this, value);
                        try {
                            trackMediaElement(this);
                        } catch {
                            // Observing a page rate must never interfere with BunPro's setter.
                        }
                    },
                });
            } else {
                debug('Unable to hook HTMLMediaElement.playbackRate; descriptor unavailable');
            }
        } catch (error) {
            debug('Unable to hook HTMLMediaElement.playbackRate; using play/DOM fallbacks', error);
        }

        try {
            Object.defineProperty(proto, MEDIA_TRACKING_MARKER, {
                value: true,
                configurable: true,
            });
        } catch {
            // The hooks can still work when the marker cannot be installed.
        }
    }

    function collectCandidateMediaElements() {
        const candidates = new Set(document.querySelectorAll('audio, video'));
        trackedMediaElements.forEach((media) => {
            // Drop abandoned detached elements with no source so tracking stays bounded.
            if (!media.isConnected && !media.currentSrc && !media.src) {
                trackedMediaElements.delete(media);
                return;
            }
            candidates.add(media);
        });
        return candidates;
    }

    function pausePageMedia() {
        // Pausing detached media alone leaves BunPro's React isPlaying state and
        // PAUSE icon stale. Click its visible pause button to synchronize that state,
        // then reset each media element as a fallback.
        const nativePauseButton = (() => {
            const player = findVisibleBunproAudioPlayer();
            if (!player) return null;
            return [...player.querySelectorAll('button')].find((button) =>
                !isButtonDisabled(button) &&
                isElementRendered(button) &&
                ['PAUSE', 'PAUSE_CIRCLE_FILLED'].includes(getButtonIconName(button))
            ) || null;
        })();
        if (nativePauseButton) {
            const previousBypassClick = state.bypassClick;
            state.bypassClick = true;
            try {
                nativePauseButton.click();
            } catch (error) {
                debug('Unable to pause BunPro audio through its own control', error);
            } finally {
                state.bypassClick = previousBypassClick;
            }
            schedulePanelPositionAfterAudioUiChange();
        }

        collectCandidateMediaElements().forEach((media) => {
            if (isOwnMediaElement(media)) return;
            try {
                media.pause();
                media.currentTime = 0;
            } catch {
                // Ignore unrelated media errors.
            }
        });
    }

    function isBunproPageMediaElement(media) {
        if (!media || isOwnMediaElement(media)) return false;
        if (trackedMediaElements.has(media)) return true;
        const source = String(media.currentSrc || media.src || '');
        return Boolean(media.closest?.('#js-quiz')) || /audio|cloudfront|bunpro/i.test(source);
    }

    function isPageMediaPlaying() {
        return [...collectCandidateMediaElements()].some((media) => {
            if (media.paused || media.ended) return false;
            return isBunproPageMediaElement(media);
        });
    }

    function isNativeBunproAudioPlaying() {
        const player = findVisibleBunproAudioPlayer();
        if (!player) return false;
        return [...player.querySelectorAll('button')].some((button) => {
            const icon = getButtonIconName(button);
            const label = `${button.getAttribute('title') || ''} ${button.getAttribute('aria-label') || ''}`;
            return ['PAUSE', 'PAUSE_CIRCLE_FILLED'].includes(icon) || /\bpause\b/i.test(label);
        });
    }

    function getPRouteOwner() {
        return state.pRoute.owner;
    }

    function isLocalPRoute() {
        return getPRouteOwner() === 'local';
    }

    function isNativePRoute() {
        return getPRouteOwner().startsWith('native');
    }

    function isNativePStopRoute() {
        return getPRouteOwner() === 'native-stopping';
    }

    function hasNativePClickPassthrough() {
        return Boolean(state.pRoute.clickPassthroughGeneration);
    }

    /*
     * P routes: idle ('') -> local for a ready override, or native for the real
     * BunPro keydown; native -> native-stopping on the next P. Local includes
     * pending preparation (pPlaybackStartPending); a second P, failed start or
     * local ended releases it. O and sentence changes release all route state;
     * deleting an override releases ownership. Native intent expires on terminal
     * media events or after its grace period; stopping releases on click expiry.
     * A loading lookup uses native for that press: taking over would require
     * intercepting or delaying BunPro's real P keydown.
     * The intent grace lets React's icon and real media settle in either order.
     * The ended guard and captured action/timestamp protect a new intent from
     * stale terminal events. The stop guard prevents still-playing media from
     * restarting intent during stop-then-restart races, even after route release.
     * Click passthrough lets BunPro's own follow-up click handle the same P.
     */
    function releasePRoute({ resetNative = false } = {}) {
        state.pRoute.owner = '';
        if (resetNative) {
            clearNativePIntent();
            state.pRoute.stopGuardUntil = 0;
        }
    }

    function beginLocalPRoute() {
        clearNativePClickPassthrough();
        state.pRoute.stopGuardUntil = 0;
        state.pRoute.owner = 'local';
    }

    function clearNativePIntent() {
        state.pRoute.intentActive = false;
        state.pRoute.intentStartedAt = 0;
        if (getPRouteOwner() === 'native') releasePRoute();
    }

    function markNativePIntent() {
        state.pRoute.owner = 'native';
        state.pRoute.intentActive = true;
        state.pRoute.intentStartedAt = performance.now();
        state.pRoute.stopGuardUntil = 0;
    }

    function markNativePStop() {
        clearNativePIntent();
        state.pRoute.owner = 'native-stopping';
        state.pRoute.stopGuardUntil = performance.now() + NATIVE_P_STOP_GUARD_MS;
    }

    function clearNativePClickPassthrough(generation = null) {
        if (
            generation !== null &&
            state.pRoute.clickPassthroughGeneration !== generation
        ) {
            return;
        }
        if (state.pRoute.clickPassthroughTimer) {
            window.clearTimeout(state.pRoute.clickPassthroughTimer);
        }
        state.pRoute.clickPassthroughGeneration = 0;
        state.pRoute.clickPassthroughTimer = 0;
    }

    function armNativePClickPassthrough(generation) {
        clearNativePClickPassthrough();
        state.pRoute.clickPassthroughGeneration = generation;
        state.pRoute.clickPassthroughTimer = window.setTimeout(() => {
            const releaseStoppingRoute = isNativePStopRoute();
            clearNativePClickPassthrough(generation);
            if (releaseStoppingRoute) {
                releasePRoute();
                scheduleSync();
            }
        }, NATIVE_P_CLICK_PASSTHROUGH_MS);
    }

    function isNativePIntentActive() {
        const nativeMediaActive = isPageMediaPlaying();
        const nativeUiActive = isNativeBunproAudioPlaying();
        if (state.pRoute.intentActive && getPRouteOwner() === 'native') {
            // During a native P cycle, the real media state and BunPro's React icon
            // may settle in either order. Keep accepting both while the intent is ours.
            if (nativeMediaActive || nativeUiActive) return true;
            const age = performance.now() - state.pRoute.intentStartedAt;
            if (age <= NATIVE_P_INTENT_GRACE_MS) return true;
            clearNativePIntent();
            return false;
        }
        if (
            // A detached Audio element is tracked by the document-start play() hook.
            // Do not bootstrap a new native cycle from a stale PAUSE icon alone: after
            // O finishes reviewing a recording, BunPro can leave that icon visible and
            // the next P would otherwise be misclassified as a stop-only press.
            nativeMediaActive &&
            !isLocalPRoute() &&
            performance.now() >= state.pRoute.stopGuardUntil
        ) {
            markNativePIntent();
            return true;
        }
        return false;
    }

    function expireNativePIntent() {
        const terminalGeneration = state.pHotkeyGeneration;
        const terminalIntentStartedAt = state.pRoute.intentStartedAt;
        window.setTimeout(() => {
            // Wait one task for media to settle; a React icon may still be stale.
            // Only real media and the captured intent can authorize this release.
            if (state.pHotkeyGeneration !== terminalGeneration) return;
            if (isLocalPRoute()) return;
            if (
                state.pRoute.intentActive &&
                state.pRoute.intentStartedAt !== terminalIntentStartedAt
            ) {
                return;
            }
            if (isPageMediaPlaying()) return;
            if (
                state.pRoute.intentActive &&
                performance.now() - state.pRoute.intentStartedAt < NATIVE_P_ENDED_GUARD_MS
            ) {
                return;
            }
            const nativeStopInProgress = isNativePStopRoute();
            clearNativePIntent();
            if (!nativeStopInProgress) state.pRoute.stopGuardUntil = 0;
            scheduleSync();
        }, 0);
    }

    function onBunproPageMediaStateChanged(event) {
        if (!isBunproPageMediaElement(event.target)) return;
        if (!['ended', 'error', 'abort', 'emptied'].includes(event.type)) return;
        expireNativePIntent();
    }

    function stopMediaStream(stream) {
        stream?.getTracks?.().forEach((track) => {
            try {
                track.stop();
            } catch {
                // One failed track cleanup must not prevent releasing the remaining tracks.
            }
        });
    }

    // Sharing the microphone avoids repeated device opens that can switch
    // Chrome/Windows between normal and echo-cancellation rendering paths,
    // stalling both local and native reference audio. Raw constraints also keep
    // AEC, noise suppression and AGC from activating that processing path.

    function getMicConstraints() {
        if (getMicProcessingMode() === 'clean') return { audio: true };
        return {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        };
    }

    function primeRecordingCaptureContext() {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return null;
        let context = state.recordingCaptureContext;
        try {
            if (!context || context.state === 'closed') {
                context = new Context({ latencyHint: 'interactive' });
                state.recordingCaptureContext = context;
            }
            // Called in the P-key gesture, before lookup/permission awaits.
            if (context.state === 'suspended') void context.resume().catch(() => {});
            return context;
        } catch (error) {
            debug('Unable to prepare microphone gain', error);
            return null;
        }
    }

    let recordingPeakCurve = null;
    function getRecordingPeakCurve() {
        if (recordingPeakCurve) return recordingPeakCurve;
        const curve = new Float32Array(4097);
        for (let index = 0; index < curve.length; index += 1) {
            const input = index * 2 / (curve.length - 1) - 1;
            const magnitude = Math.abs(input);
            // Quiet speech remains linear. Bend only strong peaks; the endpoint
            // also bounds inputs beyond ±1, leaving headroom before encoding.
            const output = magnitude <= 0.75 ? magnitude
                : 0.75 + 0.2 * Math.tanh((magnitude - 0.75) / 0.2);
            curve[index] = Math.sign(input) * output;
        }
        recordingPeakCurve = curve;
        return curve;
    }

    async function createRecordingGainInput(stream, gain, context) {
        if (gain === 1) return { stream, dispose() {} };
        if (!context || context.state === 'closed') throw translatedError('micGainUnavailable');
        let timer;
        try {
            await Promise.race([
                context.resume(),
                new Promise((_, reject) => {
                    timer = window.setTimeout(() => reject(translatedError('micGainUnavailable')), 2000);
                }),
            ]);
        } finally { window.clearTimeout(timer); }
        if (context.state !== 'running') throw translatedError('micGainUnavailable');

        const nodes = [];
        let destination = null;
        let disposed = false;
        const dispose = () => {
            if (disposed) return;
            disposed = true;
            nodes.forEach((node) => { try { node.disconnect(); } catch { /* already disconnected */ } });
            // Own only the processed output. Never stop the shared mic track.
            if (destination) stopMediaStream(destination.stream);
        };
        try {
            const source = context.createMediaStreamSource(stream);
            nodes.push(source);
            const gainNode = context.createGain();
            nodes.push(gainNode);
            gainNode.gain.value = gain;
            const peakGuard = context.createWaveShaper();
            nodes.push(peakGuard);
            peakGuard.curve = getRecordingPeakCurve();
            peakGuard.oversample = '2x';
            destination = context.createMediaStreamDestination();
            nodes.push(destination);
            destination.channelCount = 1;
            destination.channelCountMode = 'explicit';
            source.connect(gainNode).connect(peakGuard).connect(destination);
            // Deliberately no connection to context.destination: no live
            // monitoring, feedback, or extra reference-audio amplification.
            return { stream: destination.stream, gain, dispose };
        } catch (error) {
            dispose();
            throw error;
        }
    }

    function clearMicIdleTimer() {
        if (state.micIdleTimer) {
            window.clearTimeout(state.micIdleTimer);
            state.micIdleTimer = 0;
        }
    }

    function closeRecordingCaptureContext() {
        const context = state.recordingCaptureContext;
        state.recordingCaptureContext = null;
        if (context && context.state !== 'closed') void context.close().catch(() => {});
    }

    function microphoneCancelledError() {
        const error = new Error('Microphone request superseded');
        error.name = 'AbortError';
        error.bpMicCancelled = true;
        return error;
    }

    function resetMicrophoneRetry() {
        state.micRetryAfter = 0;
    }

    function hasLiveMicrophoneTrack(stream) {
        return (stream?.getAudioTracks?.() || []).some((track) => track.readyState === 'live');
    }

    function isMicStreamUsable(stream) {
        return (stream?.getAudioTracks?.() || []).some((track) =>
            track.readyState === 'live' && track.enabled !== false && !track.muted
        );
    }

    function canStartVoiceRecording() {
        return isRecordingEnabled() && performance.now() >= state.micRetryAfter
            && !(hasLiveMicrophoneTrack(state.micStream) && !isMicStreamUsable(state.micStream));
    }

    function releaseMicrophoneStream(reason = '', cancelPendingRecording = true) {
        clearMicIdleTimer();
        if (cancelPendingRecording || state.recordingSession) void stopVoiceRecording({ discard: false });
        state.micRequest?.cancel();
        state.micStreamCleanup?.();
        state.micStreamCleanup = null;
        closeRecordingCaptureContext();
        const stream = state.micStream;
        state.micStream = null;
        state.micStreamPromise = null;
        state.micStreamKey = '';
        if (!stream) return;
        debug('Releasing the shared microphone stream', reason);
        stopMediaStream(stream);
    }

    function deferMicrophoneRetry(reason) {
        state.micRetryAfter = performance.now() + CONFIG.MIC_FAILURE_RETRY_MS;
        releaseMicrophoneStream(reason);
    }

    function scheduleMicIdleRelease() {
        clearMicIdleTimer();
        if (!state.micStream) return;
        state.micIdleTimer = window.setTimeout(() => {
            state.micIdleTimer = 0;
            if (state.recordingSession || state.recordingStartPending) return;
            releaseMicrophoneStream('idle');
        }, CONFIG.MIC_IDLE_RELEASE_MS);
    }

    function watchMicrophoneStream(stream) {
        state.micStreamCleanup?.();
        const tracks = stream.getAudioTracks();
        let muteTimer = 0;
        const clearMuteTimer = () => { window.clearTimeout(muteTimer); muteTimer = 0; };
        const fail = () => {
            if (state.micStream !== stream) return;
            deferMicrophoneRetry('device-unavailable');
            showRecordingError('micUnavailable');
        };
        const onEnded = () => { if (!hasLiveMicrophoneTrack(stream)) fail(); };
        const onHealthChanged = () => {
            if (state.micStream !== stream) return;
            if (isMicStreamUsable(stream)) {
                clearMuteTimer();
                resetMicrophoneRetry();
            } else if (!muteTimer) {
                // A short mute is normal during routing changes; allow recovery.
                muteTimer = window.setTimeout(() => {
                    muteTimer = 0;
                    if (!isMicStreamUsable(stream)) fail();
                }, CONFIG.MIC_MUTE_GRACE_MS);
            }
        };
        tracks.forEach((track) => {
            track.addEventListener('ended', onEnded);
            track.addEventListener('mute', onHealthChanged);
            track.addEventListener('unmute', onHealthChanged);
        });
        state.micStreamCleanup = () => {
            clearMuteTimer();
            tracks.forEach((track) => {
                track.removeEventListener('ended', onEnded);
                track.removeEventListener('mute', onHealthChanged);
                track.removeEventListener('unmute', onHealthChanged);
            });
        };
        onHealthChanged();
    }

    function onMicrophoneDeviceChange() {
        // No permission request/automatic recording here. Only the next P retries.
        // Keep a healthy shared input even if an unrelated output device changes.
        if (state.micRequest || (state.micStream && !isMicStreamUsable(state.micStream))) {
            releaseMicrophoneStream('device-change');
        }
        resetMicrophoneRetry();
    }

    function isMicrophoneConstraintError(error) {
        return ['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error?.name);
    }

    async function ensureMicrophoneStream() {
        clearMicIdleTimer();
        if (state.micStream) {
            if (hasLiveMicrophoneTrack(state.micStream)) return state.micStream;
            releaseMicrophoneStream('stale-tracks', false);
        }

        const key = getMicProcessingMode();
        if (state.micRequest && state.micRequest.key === key) return state.micRequest.promise;
        state.micRequest?.cancel();

        const request = { key, done: false, timer: 0, promise: null, cancel: null };
        const current = () => state.micRequest === request && !request.done
            && isRecordingEnabled() && getMicProcessingMode() === key;
        request.promise = new Promise((resolve, reject) => {
            const finish = (error, stream = null) => {
                if (request.done) return;
                request.done = true;
                window.clearTimeout(request.timer);
                if (state.micRequest === request) {
                    state.micRequest = null;
                    state.micStreamPromise = null;
                    if (error) state.micStreamKey = '';
                }
                if (error) reject(error);
                else resolve(stream);
            };
            request.cancel = () => finish(microphoneCancelledError());
            request.timer = window.setTimeout(() => {
                const error = translatedError('micRequestTimeout');
                error.name = 'TimeoutError';
                finish(error);
            }, CONFIG.MIC_REQUEST_TIMEOUT_MS);
            // Delay the actual device call to a microtask so reference playback
            // can be invoked first. The request token owns all late callbacks.
            Promise.resolve().then(() => {
                if (!current()) throw microphoneCancelledError();
                return navigator.mediaDevices.getUserMedia(getMicConstraints());
            }).catch((error) => {
                if (!current()) throw microphoneCancelledError();
                if (key !== 'raw' || !isMicrophoneConstraintError(error)) throw error;
                debug('Raw microphone constraints rejected; retrying with defaults', error);
                return navigator.mediaDevices.getUserMedia({ audio: true });
            }).then((stream) => {
                if (!current()) {
                    stopMediaStream(stream);
                    return;
                }
                if (!hasLiveMicrophoneTrack(stream)) {
                    stopMediaStream(stream);
                    throw translatedError('micUnavailable');
                }
                state.micStream = stream;
                watchMicrophoneStream(stream);
                debug('Shared microphone stream acquired', key);
                finish(null, stream);
            }).catch((error) => finish(error));
        });
        state.micStreamKey = key;
        state.micRequest = request;
        state.micStreamPromise = request.promise;
        return request.promise;
    }

    function getRecordingMimeType() {
        if (typeof MediaRecorder === 'undefined') return '';
        const candidates = [
            'audio/webm;codecs=opus',
            'audio/ogg;codecs=opus',
            'audio/webm',
            'audio/ogg',
        ];
        return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
    }

    function renderMessage(message) {
        if (!message) return '';
        if (typeof message === 'string') return message;
        const vars = Object.fromEntries(Object.entries(message.vars || {}).map(([key, value]) =>
            [key, value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'key') ? renderMessage(value) : value]
        ));
        if (message.key === null) return String(vars.error || '');
        return t(message.key, vars) + (message.suffix ? ' ' + renderMessage(message.suffix) : '');
    }

    function translatedError(key, vars = {}, options) {
        const error = new Error(renderMessage({ key, vars }), options);
        error.translation = { key, vars: { ...vars } };
        return error;
    }

    function errorMessage(error) {
        return error.translation || error.message;
    }

    function setPanelMessage(key, vars = {}, suffix = null) {
        state.panelMessage = { key, vars: { ...vars }, suffix };
        renderPanelMessage();
    }

    function clearPanelMessage() {
        state.panelMessage = null;
        renderPanelMessage();
    }

    function setPanelMessageFromError(error) {
        state.panelMessage = error.translation || { key: null, vars: { error: error.message } };
        renderPanelMessage();
    }

    function renderPanelMessage() {
        if (!state.refs) return;
        const file = getSelectedFile();
        const fallback = state.adminMode ? { key: 'adminHelp' } : state.lookupError ||
            (file ? { key: 'selectedFile', vars: { file: file.name } } :
                (state.overrideFound ? { key: 'storedFile', vars: { file: entryFileName(state.entry) } } : null));
        const text = renderMessage(state.panelMessage || fallback);
        state.refs.message.textContent = text;
        state.refs.message.title = text;
    }

    function showRecordingError(key, vars = {}) {
        if (!key) return;
        console.warn('[BunPro Local Audio] Recording:', renderMessage({ key, vars }));
        if (state.refs?.message && !state.compressionJob) {
            setPanelMessage(key, vars);
            renderPanel();
        }
    }

    function showRecordingStatus(key, vars = {}) {
        if (!key || !state.refs?.message || state.compressionJob) return;
        setPanelMessage(key, vars);
        renderPanel();
    }

    function formatRecordingSize(blob) {
        const bytes = Number(blob?.size || 0);
        if (bytes < 1024) return `${bytes} B`;
        return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
    }

    let silentPlaybackDataUrl = '';
    const recordingPlaybackPrimePromises = new WeakMap();

    function getSilentPlaybackDataUrl() {
        if (silentPlaybackDataUrl) return silentPlaybackDataUrl;

        const sampleRate = 8000;
        const dataLength = 1600;
        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);
        const writeText = (offset, text) => {
            for (let index = 0; index < text.length; index += 1) {
                view.setUint8(offset + index, text.charCodeAt(index));
            }
        };

        writeText(0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeText(8, 'WAVE');
        writeText(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate, true);
        view.setUint16(32, 1, true);
        view.setUint16(34, 8, true);
        writeText(36, 'data');
        view.setUint32(40, dataLength, true);
        for (let index = 44; index < buffer.byteLength; index += 1) {
            view.setUint8(index, 128);
        }

        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let index = 0; index < bytes.length; index += 1) {
            binary += String.fromCharCode(bytes[index]);
        }
        silentPlaybackDataUrl = `data:audio/wav;base64,${btoa(binary)}`;
        return silentPlaybackDataUrl;
    }

    function primeRecordingPlaybackAudioElement() {
        stopRecordedAudioPlayback();
        try {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.loop = true;
            // The WAV is silent; leave it unmuted to unlock later audible playback under strict autoplay policies.
            audio.muted = false;
            audio.volume = 1;
            audio.setAttribute('aria-hidden', 'true');
            audio.style.display = 'none';
            audio.src = getSilentPlaybackDataUrl();
            (document.body || document.documentElement)?.append(audio);
            state.recordingPlaybackAudio = audio;
            const primePromise = Promise.resolve(audio.play());
            recordingPlaybackPrimePromises.set(audio, primePromise);
            void primePromise.catch((error) => {
                debug('Silent recording-playback priming failed', error);
            });
            return audio;
        } catch (error) {
            debug('Unable to create a primed recording audio element', error);
            return null;
        }
    }

    // Release captured resources, not whichever replay happens to be current
    // when an older asynchronous operation finally settles.
    function releaseRecordingPlaybackSource(source) {
        if (!source) return;
        if (state.recordingPlaybackSource === source) state.recordingPlaybackSource = null;
        try {
            source.onended = null;
            source.stop();
        } catch {
            // The source may already have ended or failed before starting.
        }
        try {
            source.disconnect();
        } catch {
            // Already disconnected.
        }
    }

    function releaseRecordingPlaybackAudio(audio) {
        if (!audio) return;
        if (state.recordingPlaybackAudio === audio) state.recordingPlaybackAudio = null;
        recordingPlaybackPrimePromises.delete(audio);
        try {
            audio.pause();
            audio.currentTime = 0;
            audio.removeAttribute('src');
            audio.load();
            audio.remove();
        } catch {
            // A stale player cleanup failure must not prevent starting the next replay.
        }
    }

    function stopRecordedAudioPlayback(exceptAudio = null) {
        releaseRecordingPlaybackSource(state.recordingPlaybackSource);
        const audio = state.recordingPlaybackAudio;
        if (audio !== exceptAudio) releaseRecordingPlaybackAudio(audio);
    }

    function cancelRecordedAudioPlayback() {
        state.recordingPlaybackGeneration += 1;
        stopRecordedAudioPlayback();
    }

    function releaseRecordingObjectUrl() {
        if (state.recordingObjectUrl) {
            try {
                URL.revokeObjectURL(state.recordingObjectUrl);
            } catch {
                // A URL cleanup failure must not retain the stale recording in state.
            }
        }
        state.recordingObjectUrl = '';
    }

    function clearRecordedAudio(options = {}) {
        const {
            invalidatePlayback = true,
            stopPlayback = true,
        } = options;
        if (stopPlayback) {
            if (invalidatePlayback) cancelRecordedAudioPlayback();
            else stopRecordedAudioPlayback();
        }
        releaseRecordingObjectUrl();
        state.recordingBlob = null;
    }

    function hasRecordingActivity() {
        return Boolean(
            state.recordingStartPending ||
            state.recordingSession ||
            state.recordingBlob
        );
    }

    function createRecordingBlob(session) {
        if (!session?.chunks?.length) return null;
        try {
            const type = session.recorder.mimeType || session.mimeType || 'audio/webm';
            return new Blob(session.chunks, { type });
        } catch (error) {
            console.warn('[BunPro Local Audio] Unable to assemble recording blob:', error);
            return null;
        }
    }

    function completeRecordingSession(session, blob = null) {
        if (!session || session.settled) return;
        session.settled = true;
        if (state.recordingSession === session) state.recordingSession = null;
        const result = session.discard ? null : blob;
        session.gainInput?.dispose();

        try {
            if (session.stopTimer) {
                window.clearTimeout(session.stopTimer);
                session.stopTimer = 0;
            }
            if (session.maxDurationTimer) {
                window.clearTimeout(session.maxDurationTimer);
                session.maxDurationTimer = 0;
            }

            // Keep shared microphone tracks alive between takes: stopping them can
            // switch Chrome's render path and stall audio that has just started.
            if (session.ownsStream) stopMediaStream(session.stream);
            else scheduleMicIdleRelease();
            if (!session.discard && blob?.size) {
                clearRecordedAudio({
                    invalidatePlayback: false,
                    stopPlayback: false,
                });
                state.recordingBlob = blob;
                showRecordingStatus('recordingStopped', {
                    size: formatRecordingSize(blob),
                });
            } else if (!session.discard) {
                showRecordingStatus('recordingEmpty');
            }
        } catch (error) {
            console.warn('[BunPro Local Audio] Recording cleanup:', error);
        } finally {
            // Always settle the stop Promise, even if UI cleanup fails, so later P presses cannot hang.
            try {
                session.resolveStop(result);
            } catch {
                // Keep finalization idempotent even if a stop callback throws.
            }
        }
    }

    function scheduleRecordingStopFallback(session) {
        if (!session || session.settled || session.stopTimer) return;
        session.stopTimer = window.setTimeout(() => {
            debug('MediaRecorder stop event timed out; releasing the stale session');
            completeRecordingSession(session, createRecordingBlob(session));
        }, 750);
    }

    function finalizeRecordingSession(discard = false) {
        const session = state.recordingSession;
        if (!session) {
            return Promise.resolve(discard ? null : state.recordingBlob);
        }

        session.discard = session.discard || discard;
        if (session.discard) {
            try {
                if (session.recorder.state !== 'inactive') session.recorder.stop();
            } catch {
                // Discarded takes do not need the recorder's final data before releasing the session.
            }
            completeRecordingSession(session, null);
            return session.stopPromise;
        }

        if (session.recorder.state !== 'inactive') {
            try {
                try {
                    session.recorder.requestData?.();
                } catch {
                    // stop() still requests the final data if requestData() fails.
                }
                session.recorder.stop();
            } catch (error) {
                completeRecordingSession(session, null);
                showRecordingError('recordingStartFailed', { error: errorMessage(error) });
            }
        }
        scheduleRecordingStopFallback(session);
        return session.stopPromise;
    }

    async function restartVoiceRecording() {
        if (!isRecordingEnabled()) return;
        if (!canStartVoiceRecording()) {
            showRecordingStatus(performance.now() < state.micRetryAfter
                ? 'micRetryWaiting' : 'micUnavailable',
                { seconds: Math.ceil((state.micRetryAfter - performance.now()) / 1000) });
            return;
        }
        const recordingGain = getRecordingGain();
        let captureContext = recordingGain > 1 ? primeRecordingCaptureContext() : null;

        const generation = ++state.recordingGeneration;
        state.recordingStartPending = true;
        cancelRecordedAudioPlayback();
        // A reused stream needs no new permission request, so avoid showing the permission-wait status.
        showRecordingStatus(state.micStream ? 'recordingActive' : 'recordingStarting');

        await finalizeRecordingSession(true);
        if (generation !== state.recordingGeneration) return;
        clearRecordedAudio();

        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            state.recordingStartPending = false;
            if (!state.micStream) releaseMicrophoneStream('recording-unsupported');
            showRecordingError('recordingUnsupported');
            return;
        }

        let stream = null;
        let gainInput = null;
        let session = null;
        let startupStage = 'microphone';
        try {
            stream = await ensureMicrophoneStream();
            if (generation !== state.recordingGeneration) return;
            // A newly opened device may be briefly muted. Its health watcher
            // permits recovery without requesting the same device again.
            if (!isMicStreamUsable(stream)) {
                showRecordingStatus('micUnavailable');
                return;
            }
            startupStage = 'gain';
            if (recordingGain > 1) captureContext = primeRecordingCaptureContext();
            gainInput = await createRecordingGainInput(stream, recordingGain, captureContext);
            if (generation !== state.recordingGeneration) {
                gainInput.dispose();
                return;
            }

            startupStage = 'recorder';
            const mimeType = getRecordingMimeType();
            const recorder = mimeType
                ? new MediaRecorder(gainInput.stream, { mimeType })
                : new MediaRecorder(gainInput.stream);
            const chunks = [];
            let resolveStop;
            const stopPromise = new Promise((resolve) => {
                resolveStop = resolve;
            });
            session = {
                generation,
                recorder,
                stream,
                gainInput,
                recordingGain,
                // releaseMicrophoneStream() owns the shared stream; a take must not stop it.
                ownsStream: false,
                chunks,
                mimeType,
                discard: false,
                stopPromise,
                resolveStop,
                settled: false,
                stopTimer: 0,
                maxDurationTimer: 0,
            };

            recorder.addEventListener('dataavailable', (event) => {
                if (event.data?.size) chunks.push(event.data);
            });
            recorder.addEventListener('error', (event) => {
                const error = event.error || new Error('MediaRecorder error');
                showRecordingError('recordingStartFailed', { error: errorMessage(error) });
                try {
                    if (recorder.state !== 'inactive') recorder.stop();
                } catch {
                    // The common finalizer below still releases session resources and settles its Promise.
                }
                completeRecordingSession(session, null);
            });
            recorder.addEventListener('stop', () => {
                completeRecordingSession(session, createRecordingBlob(session));
            }, { once: true });

            state.recordingSession = session;
            state.recordingStartPending = false;
            recorder.start(250);
            session.maxDurationTimer = window.setTimeout(() => {
                session.maxDurationTimer = 0;
                if (state.recordingSession !== session || session.settled) return;
                debug('Recording reached the 120-second limit; stopping automatically');
                void stopVoiceRecording({ discard: false });
            }, CONFIG.RECORDING_MAX_DURATION_MS);
            showRecordingStatus('recordingActive');
            debug('Microphone recording started');
        } catch (error) {
            // A failed device/gain context must not be reused on every P. A
            // standalone encoder failure may retain a healthy shared input.
            if (session && !session.settled) {
                session.discard = true;
                try { if (session.recorder.state !== 'inactive') session.recorder.stop(); } catch { /* failed startup */ }
                completeRecordingSession(session, null);
            } else gainInput?.dispose();
            if (!stream || stream !== state.micStream) stopMediaStream(stream);
            if (generation === state.recordingGeneration) {
                state.recordingStartPending = false;
                state.recordingSession = null;
                if (!error.bpMicCancelled) {
                    if (startupStage !== 'recorder' || !isMicStreamUsable(stream)) {
                        deferMicrophoneRetry('recording-startup-failed');
                    }
                    showRecordingError('recordingStartFailed', { error: errorMessage(error) });
                }
            }
        } finally {
            if (generation === state.recordingGeneration) {
                state.recordingStartPending = false;
            }
            if (
                state.micStream &&
                !state.recordingSession &&
                !state.recordingStartPending
            ) {
                scheduleMicIdleRelease();
            }
            if (!state.micStream && !state.recordingSession && !state.recordingStartPending
                && state.recordingCaptureContext === captureContext) {
                releaseMicrophoneStream('recording-startup-failed');
            }
        }
    }

    async function stopVoiceRecording(options = {}) {
        const { discard = false } = options;
        state.recordingGeneration += 1;
        const startWasPending = state.recordingStartPending;
        state.recordingStartPending = false;
        state.micRequest?.cancel();
        if (startWasPending) closeRecordingCaptureContext();
        return finalizeRecordingSession(discard);
    }

    function ensureRecordingObjectUrl(blob) {
        if (!state.recordingObjectUrl) {
            state.recordingObjectUrl = URL.createObjectURL(blob);
        }
        return state.recordingObjectUrl;
    }

    function primeRecordingPlaybackContext() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;

        let context = state.recordingPlaybackContext;
        if (!context || context.state === 'closed') {
            try {
                context = new AudioContextClass();
                state.recordingPlaybackContext = context;
            } catch {
                return null;
            }
        }

        // Resume synchronously within the O gesture: after MediaRecorder's async
        // stop event, Firefox may treat replay as autoplay and block it.
        if (context.state === 'suspended') {
            void context.resume().catch(() => {});
        }
        try {
            const silentBuffer = context.createBuffer(1, 1, 22050);
            const silentSource = context.createBufferSource();
            silentSource.buffer = silentBuffer;
            silentSource.connect(context.destination);
            silentSource.onended = () => {
                try {
                    silentSource.disconnect();
                } catch {
                    // An unlock-node cleanup failure must not affect recording replay.
                }
            };
            silentSource.start(0);
        } catch (error) {
            debug('Silent Web Audio priming failed', error);
        }
        return context;
    }

    async function playRecordingWithAudioContext(recording, context, generation) {
        if (!context || context.state === 'closed') return false;
        let source = null;
        try {
            if (context.state === 'suspended') await context.resume();
            if (generation !== state.recordingPlaybackGeneration) return true;

            const encodedAudio = await recording.arrayBuffer();
            if (generation !== state.recordingPlaybackGeneration) return true;

            const decodedAudio = await context.decodeAudioData(encodedAudio.slice(0));
            if (generation !== state.recordingPlaybackGeneration) return true;

            source = context.createBufferSource();
            source.buffer = decodedAudio;
            source.connect(context.destination);
            state.recordingPlaybackSource = source;
            source.onended = () => {
                if (state.recordingPlaybackSource === source) {
                    state.recordingPlaybackSource = null;
                    showRecordingStatus('recordingPlaybackEnded');
                }
                try {
                    source.disconnect();
                } catch {
                    // The playback node may already be disconnected.
                }
            };
            source.start(0);
            showRecordingStatus('recordingPlaybackActive');
            return true;
        } catch (error) {
            releaseRecordingPlaybackSource(source);
            if (generation !== state.recordingPlaybackGeneration) return true;
            state.recordingPlaybackLastError = error?.message || String(error);
            debug('Web Audio recording playback failed; falling back to HTMLAudioElement', error);
            return false;
        }
    }

    async function playRecordingWithAudioElement(recording, preparedAudio, generation) {
        const audio = preparedAudio || new Audio();
        try {
            const primePromise = recordingPlaybackPrimePromises.get(audio);
            if (primePromise) {
                try {
                    await Promise.race([
                        primePromise,
                        new Promise((resolve) => window.setTimeout(resolve, 500)),
                    ]);
                } catch {
                    // Failed silent priming need not block real playback; Web Audio remains a fallback.
                }
                recordingPlaybackPrimePromises.delete(audio);
            }
            if (generation !== state.recordingPlaybackGeneration) {
                releaseRecordingPlaybackAudio(audio);
                return true;
            }
            state.recordingPlaybackAudio = audio;
            audio.pause();
            audio.loop = false;
            audio.muted = false;
            audio.volume = 1;
            audio.preload = 'auto';
            audio.src = ensureRecordingObjectUrl(recording);
            audio.currentTime = 0;
            audio.addEventListener('ended', () => {
                if (state.recordingPlaybackAudio === audio) {
                    state.recordingPlaybackAudio = null;
                    audio.remove();
                    showRecordingStatus('recordingPlaybackEnded');
                }
            }, { once: true });
            await audio.play();
            if (generation !== state.recordingPlaybackGeneration) {
                releaseRecordingPlaybackAudio(audio);
                return true;
            }
            showRecordingStatus('recordingPlaybackActive');
            return true;
        } catch (error) {
            releaseRecordingPlaybackAudio(audio);
            if (generation !== state.recordingPlaybackGeneration) return true;
            state.recordingPlaybackLastError = error?.message || String(error);
            debug('HTML audio recording playback failed', error);
            return false;
        }
    }

    function playStoredRecordingImmediately(recording, playbackContext = null) {
        const playbackGeneration = ++state.recordingPlaybackGeneration;
        state.recordingPlaybackLastError = '';
        stopRecordedAudioPlayback();
        stopLocalAudio();
        pausePageMedia();
        showRecordingStatus('recordingPlaybackStarting');

        // Calling this async player before its first await invokes audio.play()
        // inside the O gesture, preserving transient activation for an existing Blob.
        const playbackAttempt = playRecordingWithAudioElement(
            recording,
            new Audio(),
            playbackGeneration
        );
        void playbackAttempt.then(async (played) => {
            if (played || playbackGeneration !== state.recordingPlaybackGeneration) return;
            if (await playRecordingWithAudioContext(recording, playbackContext, playbackGeneration)) return;
            if (playbackGeneration !== state.recordingPlaybackGeneration) return;
            showRecordingError('recordingPlaybackFailed', {
                error: state.recordingPlaybackLastError || 'unknown playback error',
            });
        });
    }

    async function stopAndPlayLatestRecording(playbackContext = null, preparedAudio = null) {
        const playbackGeneration = ++state.recordingPlaybackGeneration;
        state.recordingPlaybackLastError = '';
        stopRecordedAudioPlayback(preparedAudio);
        const blob = await stopVoiceRecording({ discard: false });
        if (playbackGeneration !== state.recordingPlaybackGeneration) {
            releaseRecordingPlaybackAudio(preparedAudio);
            return;
        }

        const recording = blob?.size ? blob : state.recordingBlob;
        if (!recording?.size) {
            stopRecordedAudioPlayback();
            showRecordingStatus('recordingEmpty');
            return;
        }

        stopLocalAudio();
        pausePageMedia();
        stopRecordedAudioPlayback(preparedAudio);
        showRecordingStatus('recordingPlaybackStarting');

        if (await playRecordingWithAudioElement(recording, preparedAudio, playbackGeneration)) return;
        if (playbackGeneration !== state.recordingPlaybackGeneration) return;

        if (await playRecordingWithAudioContext(recording, playbackContext, playbackGeneration)) return;
        if (playbackGeneration !== state.recordingPlaybackGeneration) return;

        if (await playRecordingWithAudioElement(recording, null, playbackGeneration)) return;
        if (playbackGeneration !== state.recordingPlaybackGeneration) return;

        showRecordingError('recordingPlaybackFailed', {
            error: state.recordingPlaybackLastError || 'unknown playback error',
        });
    }

    function releaseRecordingResources() {
        state.recordingGeneration += 1;
        state.recordingStartPending = false;
        const session = state.recordingSession;
        if (session) {
            session.discard = true;
            try {
                if (session.recorder.state !== 'inactive') session.recorder.stop();
            } catch {
                // Page teardown cannot wait for the recorder's asynchronous final data.
            }
            completeRecordingSession(session, null);
        }
        clearRecordedAudio();
        releaseMicrophoneStream('page-teardown');
        const context = state.recordingPlaybackContext;
        state.recordingPlaybackContext = null;
        if (context && context.state !== 'closed') {
            void context.close().catch(() => {});
        }
    }

    function stopPlayerAnimation() {
        if (state.playerRafId) {
            cancelAnimationFrame(state.playerRafId);
            state.playerRafId = 0;
        }
    }

    function startPlayerAnimation() {
        stopPlayerAnimation();
        const tick = () => {
            state.playerRafId = 0;
            paintLocalPlayerProgress();
            if (state.audio && !state.audio.paused && !state.audio.ended && state.playerOpen) {
                state.playerRafId = requestAnimationFrame(tick);
            }
        };
        state.playerRafId = requestAnimationFrame(tick);
    }

    function ensureAudioElement() {
        if (!state.audio) {
            state.audio = new Audio();
            state.audio.preload = 'auto';

            const refreshState = () => {
                updateLocalPlayerControls();
                paintLocalPlayerProgress();
                renderPanel();
            };
            state.audio.addEventListener('loadedmetadata', refreshState);
            state.audio.addEventListener('durationchange', refreshState);
            state.audio.addEventListener('emptied', refreshState);
            state.audio.addEventListener('ratechange', refreshState);
            state.audio.addEventListener('timeupdate', paintLocalPlayerProgress);
            state.audio.addEventListener('ended', () => {
                if (isLocalPRoute()) releasePRoute();
                stopPlayerAnimation();
                refreshState();
            });
            state.audio.addEventListener('pause', () => {
                stopPlayerAnimation();
                refreshState();
            });
            state.audio.addEventListener('play', () => {
                startPlayerAnimation();
                refreshState();
            });
        }
        return state.audio;
    }

    function applyCurrentPlaybackRate(audio = state.audio) {
        if (!audio) return detectPlaybackRate();
        const speed = detectPlaybackRate();
        audio.defaultPlaybackRate = speed.rate;
        audio.playbackRate = speed.rate;
        if ('preservesPitch' in audio) audio.preservesPitch = true;
        if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = true;
        if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;
        return speed;
    }


    function isLocalAudioPlaying() {
        return Boolean(
            state.playPending ||
            (state.audio && !state.audio.paused && !state.audio.ended)
        );
    }

    async function startPreparedLocalAudio(audio, generation) {
        if (!audio || generation !== state.playGeneration) return;
        state.playPending = true;
        updateLocalPlayerControls();
        try {
            await audio.play();
        } catch (error) {
            if (generation !== state.playGeneration) return;
            throw error;
        } finally {
            if (generation === state.playGeneration) {
                state.playPending = false;
                updateLocalPlayerControls();
            }
        }
    }

    async function playObjectUrl(objectUrl, options = {}) {
        const {
            restart = true,
            openPlayer = false,
        } = options;
        const generation = ++state.playGeneration;
        pausePageMedia();

        if (openPlayer) {
            state.playerOpen = true;
            ensureLocalPlayerWrapper();
            syncAnswerAudioControl();
            updateLocalPlayerControls();
            schedulePanelPositionAfterAudioUiChange();
        }

        const audio = ensureAudioElement();
        audio.pause();
        if (generation !== state.playGeneration) return;
        if (audio.src !== objectUrl) {
            audio.src = objectUrl;
            audio.load();
        }
        if (restart) {
            try {
                audio.currentTime = 0;
            } catch {
                // Without ready metadata, playback will start naturally at zero.
            }
        }
        const speed = applyCurrentPlaybackRate(audio);
        updateLocalPlayerControls();
        paintLocalPlayerProgress();
        await startPreparedLocalAudio(audio, generation);
        if (generation === state.playGeneration) {
            debug('Playing local audio', state.sentence, speed);
        }
    }

    async function playLocalAudio(entry, options = {}) {
        const objectUrl = await ensureAudioObjectUrl(entry);
        releasePreviewObjectUrl();
        await playObjectUrl(objectUrl, {
            restart: options.restart !== false,
            openPlayer: options.openPlayer !== false,
        });
    }

    async function playSourcePreview(selectedFile, isCurrent = () => true) {
        stopLocalAudio();
        // An explicit preview replaces any BunPro P cycle (its audio is paused below);
        // a lingering native route would otherwise close the preview player at once.
        releasePRoute({ resetNative: true });
        clearNativePClickPassthrough();
        releasePreviewObjectUrl();
        const objectUrl = await loadSourcePreviewObjectUrl(selectedFile);
        if (!isCurrent()) {
            URL.revokeObjectURL(objectUrl);
            return;
        }
        state.previewObjectUrl = objectUrl;
        await playObjectUrl(objectUrl, {
            restart: true,
            openPlayer: true,
        });
    }

    function getButtonIconName(button) {
        return button?.querySelector?.('svg[data-name]')?.getAttribute('data-name') || '';
    }

    function setButtonIcon(button, iconName) {
        if (!button || !ICON_PATHS[iconName]) return;
        const svg = button.querySelector('svg[data-name]');
        if (!svg) return;
        svg.setAttribute('data-name', iconName);
        let path = svg.querySelector('path');
        if (!path) {
            path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            svg.append(path);
        }
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('d', ICON_PATHS[iconName]);
        [...svg.querySelectorAll('path')].slice(1).forEach((extra) => extra.remove());
    }

    function isSyntheticLocalAudioButton(button) {
        return Boolean(
            button &&
            (button.id === SYNTHETIC_PLAY_BUTTON_ID || button.dataset?.bpLocalAudioInjected === 'true')
        );
    }

    function isButtonDisabled(button) {
        return Boolean(
            !button ||
            button.disabled ||
            button.getAttribute('aria-disabled') === 'true'
        );
    }

    function isElementRendered(element) {
        if (!element?.isConnected || element.hidden) return false;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isInsideLocalPlayer(element) {
        return Boolean(element?.closest?.(`[${LOCAL_PLAYER_OWNED_ATTR}="true"], #${LOCAL_PLAYER_WRAPPER_ID}`));
    }

    function isNativeAudioControl(button) {
        if (
            !button ||
            isSyntheticLocalAudioButton(button) ||
            button.closest('#bp-local-audio-panel') ||
            button.closest(`#${LOCAL_SPEED_MENU_ID}`) ||
            isInsideLocalPlayer(button)
        ) {
            return false;
        }

        const title = `${button.getAttribute('title') || ''} ${button.getAttribute('aria-label') || ''}`;
        const icon = getButtonIconName(button);
        if (/audio/i.test(title)) return true;
        return ['PLAY_CIRCLE_FILLED', 'PLAY_ARROW', 'PAUSE', 'PAUSE_CIRCLE_FILLED', 'CANCEL'].includes(icon) &&
            Boolean(button.closest('#js-quiz'));
    }

    function isNativePlayIntentButton(button) {
        if (!isNativeAudioControl(button) || isButtonDisabled(button)) return false;

        const title = `${button.getAttribute('title') || ''} ${button.getAttribute('aria-label') || ''}`;
        if (/close\s+the\s+audio\s+player/i.test(title)) return false;
        if (/open\s+the\s+audio\s+player\s+and\s+play\s+audio|^\s*play\s+audio\s*$/i.test(title)) {
            return true;
        }

        return ['PLAY_CIRCLE_FILLED', 'PLAY_ARROW', 'PAUSE', 'PAUSE_CIRCLE_FILLED'].includes(
            getButtonIconName(button)
        );
    }

    function findNativeAnswerAudioControl() {
        const answer = findQuizAnswerContainer();
        if (!answer) return null;

        const form = answer.querySelector(':scope > form');
        return [...answer.children].find((child) => {
            if (!child.matches?.('button') || isSyntheticLocalAudioButton(child)) return false;
            if (isNativeAudioControl(child)) return true;
            if (!form) return false;
            return Boolean(child.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING);
        }) || null;
    }

    function hasAudioPlayerShape(element) {
        if (!element || element.id === LOCAL_PLAYER_WRAPPER_ID) return false;
        const hasProgress = Boolean(element.querySelector('[role="progressbar"]'));
        const hasPlay = Boolean(
            element.querySelector('button svg[data-name="PLAY_ARROW"], button svg[data-name="PAUSE"], button svg[data-name="PAUSE_CIRCLE_FILLED"]')
        );
        const hasSettings = Boolean(element.querySelector('button svg[data-name="SETTINGS"]'));
        return hasProgress && hasPlay && hasSettings;
    }

    function findBunproAudioPlayerWrapper(includeHidden = false) {
        const pam = document.querySelector('#js-tour-quiz-pam');
        if (pam) {
            let sibling = pam.previousElementSibling;
            while (sibling) {
                if (
                    sibling !== state.playerWrapper &&
                    sibling.getAttribute(LOCAL_PLAYER_OWNED_ATTR) !== 'true' &&
                    hasAudioPlayerShape(sibling) &&
                    (includeHidden || isElementRendered(sibling))
                ) {
                    return sibling;
                }
                sibling = sibling.previousElementSibling;
            }
        }

        // The audio-player wrapper and .bp-quiz-console are direct siblings inside
        // the quiz footer's centre column. Restricting the search to direct children
        // selects the outer wrapper whose visibility React toggles.
        const answer = findQuizAnswerContainer();
        const siblings = answer?.parentElement ? [...answer.parentElement.children] : [];
        return siblings.find((element) =>
            element !== state.playerWrapper &&
            element.getAttribute?.(LOCAL_PLAYER_OWNED_ATTR) !== 'true' &&
            hasAudioPlayerShape(element) &&
            (includeHidden || isElementRendered(element))
        ) || null;
    }

    function findVisibleBunproAudioPlayer() {
        return findBunproAudioPlayerWrapper(false);
    }

    function findVisiblePlayerPlayButton() {
        const player = findVisibleBunproAudioPlayer();
        if (!player) return null;
        return [...player.querySelectorAll('button')].find((button) =>
            isNativePlayIntentButton(button) && isElementRendered(button)
        ) || null;
    }

    function findPrimaryBunproAudioButton() {
        const answerControl = findNativeAnswerAudioControl();
        if (answerControl && isNativePlayIntentButton(answerControl) && isElementRendered(answerControl)) {
            return answerControl;
        }
        return findVisiblePlayerPlayButton();
    }

    function createSyntheticPlayButton() {
        const button = document.createElement('button');
        button.id = SYNTHETIC_PLAY_BUTTON_ID;
        button.type = 'button';
        button.className = 'transition-opacity false';
        button.dataset.bpLocalAudioInjected = 'true';
        button.innerHTML = `
            <div class="bp-hover-bg__child rounded-normal undefined" style="font-size: 2.25rem;">
                <div class="relative flex items-center justify-center" style="width: 1em; height: 1em;">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                         style="width: 0.666667em; height: 0.666667em;"
                         data-name="PLAY_CIRCLE_FILLED" class="h-24 w-24 undefined" aria-hidden="true">
                        <path fill="currentColor" d="${ICON_PATHS.PLAY_CIRCLE_FILLED}"></path>
                    </svg>
                </div>
            </div>
        `;
        updateSyntheticPlayButtonTranslation(button);
        return button;
    }

    function updateSyntheticPlayButtonTranslation(button = state.syntheticPlayButton) {
        if (!button) return;
        const label = state.playerOpen ? t('closeLocalPlayer') : t('playLocalAudio');
        button.title = label;
        button.setAttribute('aria-label', label);
    }

    function restoreSuppressedNativeAudioControls() {
        document.querySelectorAll(`.${NATIVE_AUDIO_HIDDEN_CLASS}`).forEach((element) => {
            element.classList.remove(NATIVE_AUDIO_HIDDEN_CLASS);
        });
    }

    function removeSyntheticPlayButton() {
        const button = state.syntheticPlayButton || document.getElementById(SYNTHETIC_PLAY_BUTTON_ID);
        if (button?.isConnected) button.remove();
        state.syntheticPlayButton = null;
        restoreSuppressedNativeAudioControls();
    }

    function syncSyntheticPlayButton() {
        const answer = findQuizAnswerContainer();
        const nativeAnswerControl = findNativeAnswerAudioControl();
        const nativeAnswerCanBeControlled = Boolean(
            nativeAnswerControl &&
            !isButtonDisabled(nativeAnswerControl) &&
            isElementRendered(nativeAnswerControl)
        );
        const shouldInject = Boolean(
            answer &&
            state.eligible &&
            state.lookupStatus === 'ready' &&
            state.overrideFound &&
            state.entry &&
            !nativeAnswerCanBeControlled
        );

        if (!shouldInject) {
            const existing = state.syntheticPlayButton || document.getElementById(SYNTHETIC_PLAY_BUTTON_ID);
            if (existing?.isConnected) existing.remove();
            state.syntheticPlayButton = null;
            restoreSuppressedNativeAudioControls();
            return;
        }

        if (nativeAnswerControl && isButtonDisabled(nativeAnswerControl)) {
            nativeAnswerControl.classList.add(NATIVE_AUDIO_HIDDEN_CLASS);
        } else {
            restoreSuppressedNativeAudioControls();
        }

        let button = state.syntheticPlayButton || document.getElementById(SYNTHETIC_PLAY_BUTTON_ID);
        if (!button) button = createSyntheticPlayButton();
        state.syntheticPlayButton = button;

        if (button.parentElement !== answer) {
            const form = answer.querySelector(':scope > form');
            answer.insertBefore(button, form || answer.firstChild);
        }
        updateSyntheticPlayButtonTranslation(button);
    }

    function captureControlledAnswerButton(button) {
        if (!button || isSyntheticLocalAudioButton(button)) {
            state.controlledAnswerButton = button || null;
            state.controlledAnswerSnapshot = null;
            return;
        }
        if (state.controlledAnswerButton === button && state.controlledAnswerSnapshot) return;
        restoreControlledAnswerButton();
        state.controlledAnswerButton = button;
        state.controlledAnswerSnapshot = {
            className: button.className,
            title: button.getAttribute('title'),
            ariaLabel: button.getAttribute('aria-label'),
            ariaDisabled: button.getAttribute('aria-disabled'),
            disabled: button.disabled,
            iconName: getButtonIconName(button),
            iconPath: button.querySelector('svg[data-name] path')?.getAttribute('d') || '',
        };
    }

    function restoreControlledAnswerButton() {
        const button = state.controlledAnswerButton;
        const snapshot = state.controlledAnswerSnapshot;
        if (button?.isConnected && snapshot && !isSyntheticLocalAudioButton(button)) {
            button.className = snapshot.className;
            button.disabled = snapshot.disabled;
            if (snapshot.title === null) button.removeAttribute('title');
            else button.setAttribute('title', snapshot.title);
            if (snapshot.ariaLabel === null) button.removeAttribute('aria-label');
            else button.setAttribute('aria-label', snapshot.ariaLabel);
            if (snapshot.ariaDisabled === null) button.removeAttribute('aria-disabled');
            else button.setAttribute('aria-disabled', snapshot.ariaDisabled);
            const svg = button.querySelector('svg[data-name]');
            const path = svg?.querySelector('path');
            if (svg && snapshot.iconName) svg.setAttribute('data-name', snapshot.iconName);
            if (path && snapshot.iconPath) path.setAttribute('d', snapshot.iconPath);
            delete button.dataset.bpLocalAudioControlled;
        }
        state.controlledAnswerButton = null;
        state.controlledAnswerSnapshot = null;
    }

    function syncAnswerAudioControl() {
        const active = Boolean(
            state.eligible &&
            state.lookupStatus === 'ready' &&
            state.overrideFound &&
            state.entry &&
            !isNativePRoute()
        );
        if (!active) {
            restoreControlledAnswerButton();
            return;
        }

        syncSyntheticPlayButton();
        const button = state.syntheticPlayButton || findNativeAnswerAudioControl();
        if (!button) return;
        if (state.controlledAnswerButton !== button) captureControlledAnswerButton(button);

        button.disabled = false;
        button.removeAttribute('aria-disabled');
        button.dataset.bpLocalAudioControlled = 'true';
        button.classList.remove('opacity-70');

        if (state.playerOpen) {
            button.classList.add('text-primary-accent');
            button.title = t('closeLocalPlayer');
            button.setAttribute('aria-label', t('closeLocalPlayer'));
            setButtonIcon(button, 'CANCEL');
        } else {
            button.classList.remove('text-primary-accent');
            button.title = t('playLocalAudio');
            button.setAttribute('aria-label', t('playLocalAudio'));
            setButtonIcon(button, 'PLAY_CIRCLE_FILLED');
        }
    }

    function createSyntheticPlayerWrapper() {
        const wrapper = document.createElement('div');
        wrapper.id = LOCAL_PLAYER_WRAPPER_ID;
        wrapper.className = 'hidden';
        wrapper.setAttribute(LOCAL_PLAYER_OWNED_ATTR, 'true');
        wrapper.dataset.bpLocalAudioSyntheticPlayer = 'true';
        wrapper.innerHTML = `
            <div class="flex items-center justify-between gap-4 rounded-normal text-primary-fg undefined">
                <div class="shrink-0">
                    <button type="button" class="block text-primary-fg" data-bp-local-player-role="play">
                        <div class="bp-hover-bg__child rounded-normal undefined" style="font-size: 2.25rem;">
                            <div class="relative flex items-center justify-center" style="width: 1em; height: 1em;">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                                     style="width: 0.666667em; height: 0.666667em;"
                                     data-name="PLAY_ARROW" class="h-24 w-24 undefined">
                                    <path fill="currentColor" d="${ICON_PATHS.PLAY_ARROW}"></path>
                                </svg>
                            </div>
                        </div>
                    </button>
                </div>
                <div class="grow px-12">
                    <div class="relative w-full rounded-full bg-tertiary-bg shadow-progress-bar-cont transition-opacity duration-fast false h-12"
                         data-bp-local-player-role="track">
                        <div role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"
                             style="width: 0%;"
                             class="absolute top-0 bottom-0 left-0 z-1 h-full rounded-full bg-primary-accent ease-linear">
                            <div class="absolute inset-0 h-full w-full rounded-full bg-secondary-bg/30 shadow-progress-bar-fill" aria-hidden="true"></div>
                        </div>
                        <button type="button" class="absolute inset-0 z-2" data-bp-local-player-role="scrub">
                            <div aria-hidden="true" style="left: 0%;"
                                 class="absolute z-2 -translate-x-1/2 -translate-y-1/2 p-2 ease-linear">
                                <div class="rounded-full shadow-normal h-24 w-24 bg-primary-accent"></div>
                            </div>
                        </button>
                    </div>
                </div>
                <p class="min-w-[2.75rem] text-center select-none false" data-bp-local-player-role="time">00:00</p>
                <div class="shrink-0">
                    <button type="button" aria-haspopup="menu" class="block" data-bp-local-player-role="settings">
                        <div class="bp-hover-bg__child rounded-normal undefined" style="font-size: 2.25rem;">
                            <div class="relative flex items-center justify-center" style="width: 1em; height: 1em;">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                                     style="width: 0.666667em; height: 0.666667em;"
                                     data-name="SETTINGS" class="h-24 w-24 undefined">
                                    <path fill="currentColor" d="${ICON_PATHS.SETTINGS}"></path>
                                </svg>
                            </div>
                        </div>
                    </button>
                </div>
            </div>
        `;
        return wrapper;
    }

    function collectLocalPlayerRefs(wrapper) {
        if (!wrapper) return null;
        const buttons = [...wrapper.querySelectorAll('button')];
        const playButton = wrapper.querySelector('[data-bp-local-player-role="play"]') ||
            buttons.find((button) => ['PLAY_ARROW', 'PAUSE', 'PAUSE_CIRCLE_FILLED'].includes(getButtonIconName(button)));
        const progressBar = wrapper.querySelector('[role="progressbar"]');
        const scrubButton = wrapper.querySelector('[data-bp-local-player-role="scrub"]') ||
            buttons.find((button) => button.querySelector('[aria-hidden="true"][style*="left"]')) ||
            progressBar?.parentElement?.querySelector('button');
        const track = wrapper.querySelector('[data-bp-local-player-role="track"]') || progressBar?.parentElement || null;
        const thumb = scrubButton?.querySelector(':scope > div') || null;
        const settingsButton = wrapper.querySelector('[data-bp-local-player-role="settings"]') ||
            buttons.find((button) => getButtonIconName(button) === 'SETTINGS');
        const timeDisplay = wrapper.querySelector('[data-bp-local-player-role="time"]') ||
            [...wrapper.querySelectorAll('p')].find((element) => /^\d{1,2}:\d{2}$/.test((element.textContent || '').trim()));

        if (!playButton || !progressBar || !scrubButton || !track || !thumb || !timeDisplay || !settingsButton) {
            return null;
        }
        return { wrapper, playButton, progressBar, scrubButton, track, thumb, timeDisplay, settingsButton };
    }


    function markLocalPlayerRefs(refs) {
        if (!refs) return;
        refs.playButton.dataset.bpLocalPlayerRole = 'play';
        refs.scrubButton.dataset.bpLocalPlayerRole = 'scrub';
        refs.track.dataset.bpLocalPlayerRole = 'track';
        refs.timeDisplay.dataset.bpLocalPlayerRole = 'time';
        refs.settingsButton.dataset.bpLocalPlayerRole = 'settings';
    }

    function removeLocalPlayerRoleMarkers(refs) {
        if (!refs) return;
        [refs.playButton, refs.scrubButton, refs.track, refs.timeDisplay, refs.settingsButton]
            .filter(Boolean)
            .forEach((element) => delete element.dataset.bpLocalPlayerRole);
    }

    function restoreNullableAttribute(element, name, value) {
        if (!element) return;
        if (value === null || value === undefined) element.removeAttribute(name);
        else element.setAttribute(name, value);
    }

    function makeLocalPlayerControlsInteractive(refs) {
        if (!refs) return;
        markLocalPlayerRefs(refs);

        [refs.playButton, refs.scrubButton, refs.settingsButton].forEach((button) => {
            if (!button) return;
            button.disabled = false;
            button.removeAttribute('aria-disabled');
            button.classList.remove('opacity-50', 'opacity-70', 'pointer-events-none');
        });

        refs.playButton.classList.remove('text-tertiary-fg');
        refs.playButton.classList.add('text-primary-fg');
        refs.track.classList.remove('opacity-50', 'opacity-70', 'pointer-events-none');
        refs.track.removeAttribute('title');
        refs.track.parentElement?.removeAttribute('title');
        refs.timeDisplay.removeAttribute('title');

        const thumbDot = refs.thumb.firstElementChild;
        if (thumbDot) {
            thumbDot.classList.remove('bg-secondary-fg');
            thumbDot.classList.add('bg-primary-accent');
        }
    }

    function capturePlayerWrapperSnapshot(wrapper, refs) {
        const thumbDot = refs.thumb.firstElementChild;
        return {
            className: wrapper.className,
            hidden: wrapper.hidden,
            style: wrapper.getAttribute('style'),
            playClassName: refs.playButton.className,
            playDisabled: refs.playButton.disabled,
            playAriaDisabled: refs.playButton.getAttribute('aria-disabled'),
            playTitle: refs.playButton.getAttribute('title'),
            playAria: refs.playButton.getAttribute('aria-label'),
            playIcon: getButtonIconName(refs.playButton),
            playPath: refs.playButton.querySelector('svg[data-name] path')?.getAttribute('d') || '',
            progressWidth: refs.progressBar.style.width,
            progressNow: refs.progressBar.getAttribute('aria-valuenow'),
            progressText: refs.progressBar.getAttribute('aria-valuetext'),
            trackClassName: refs.track.className,
            trackTitle: refs.track.getAttribute('title'),
            trackContainerTitle: refs.track.parentElement?.getAttribute('title') ?? null,
            scrubClassName: refs.scrubButton.className,
            scrubDisabled: refs.scrubButton.disabled,
            scrubAriaDisabled: refs.scrubButton.getAttribute('aria-disabled'),
            scrubAria: refs.scrubButton.getAttribute('aria-label'),
            thumbClassName: refs.thumb.className,
            thumbLeft: refs.thumb.style.left,
            thumbDotClassName: thumbDot?.className ?? null,
            timeText: refs.timeDisplay.textContent,
            timeTitle: refs.timeDisplay.getAttribute('title'),
            settingsClassName: refs.settingsButton.className,
            settingsDisabled: refs.settingsButton.disabled,
            settingsAriaDisabled: refs.settingsButton.getAttribute('aria-disabled'),
            settingsTitle: refs.settingsButton.getAttribute('title'),
            settingsAria: refs.settingsButton.getAttribute('aria-label'),
        };
    }

    function ensureLocalPlayerWrapper() {
        if (state.playerWrapper?.isConnected) {
            const refs = collectLocalPlayerRefs(state.playerWrapper);
            if (refs) {
                state.playerRefs = refs;
                markLocalPlayerRefs(refs);
                return state.playerWrapper;
            }
            releaseLocalPlayerWrapper();
        }

        const mount = findQuizPlayerMount();
        if (!mount) return null;

        const nativeWrapper = findBunproAudioPlayerWrapper(true);
        if (nativeWrapper) {
            const refs = collectLocalPlayerRefs(nativeWrapper);
            if (refs) {
                state.playerWrapper = nativeWrapper;
                state.playerWrapperIsNative = true;
                state.playerRefs = refs;
                state.playerWrapperSnapshot = capturePlayerWrapperSnapshot(nativeWrapper, refs);
                nativeWrapper.setAttribute(LOCAL_PLAYER_OWNED_ATTR, 'true');
                markLocalPlayerRefs(refs);
                return nativeWrapper;
            }
        }

        const wrapper = createSyntheticPlayerWrapper();
        mount.parent.insertBefore(wrapper, mount.anchor);
        state.playerWrapper = wrapper;
        state.playerWrapperIsNative = false;
        state.playerRefs = collectLocalPlayerRefs(wrapper);
        markLocalPlayerRefs(state.playerRefs);
        state.playerWrapperSnapshot = null;
        return wrapper;
    }

    function restoreNativePlayerSnapshot() {
        const wrapper = state.playerWrapper;
        const refs = state.playerRefs;
        const snapshot = state.playerWrapperSnapshot;
        if (!wrapper?.isConnected || !state.playerWrapperIsNative || !refs || !snapshot) return;

        wrapper.className = snapshot.className;
        wrapper.hidden = snapshot.hidden;
        restoreNullableAttribute(wrapper, 'style', snapshot.style);

        refs.playButton.className = snapshot.playClassName;
        refs.playButton.disabled = snapshot.playDisabled;
        restoreNullableAttribute(refs.playButton, 'aria-disabled', snapshot.playAriaDisabled);
        restoreNullableAttribute(refs.playButton, 'title', snapshot.playTitle);
        restoreNullableAttribute(refs.playButton, 'aria-label', snapshot.playAria);
        const playSvg = refs.playButton.querySelector('svg[data-name]');
        const playPath = playSvg?.querySelector('path');
        if (playSvg && snapshot.playIcon) playSvg.setAttribute('data-name', snapshot.playIcon);
        if (playPath && snapshot.playPath) playPath.setAttribute('d', snapshot.playPath);

        refs.progressBar.style.width = snapshot.progressWidth;
        restoreNullableAttribute(refs.progressBar, 'aria-valuenow', snapshot.progressNow);
        restoreNullableAttribute(refs.progressBar, 'aria-valuetext', snapshot.progressText);

        refs.track.className = snapshot.trackClassName;
        restoreNullableAttribute(refs.track, 'title', snapshot.trackTitle);
        restoreNullableAttribute(refs.track.parentElement, 'title', snapshot.trackContainerTitle);

        refs.scrubButton.className = snapshot.scrubClassName;
        refs.scrubButton.disabled = snapshot.scrubDisabled;
        restoreNullableAttribute(refs.scrubButton, 'aria-disabled', snapshot.scrubAriaDisabled);
        restoreNullableAttribute(refs.scrubButton, 'aria-label', snapshot.scrubAria);

        refs.thumb.className = snapshot.thumbClassName;
        refs.thumb.style.left = snapshot.thumbLeft;
        const thumbDot = refs.thumb.firstElementChild;
        if (thumbDot && snapshot.thumbDotClassName !== null) {
            thumbDot.className = snapshot.thumbDotClassName;
        }

        refs.timeDisplay.textContent = snapshot.timeText;
        restoreNullableAttribute(refs.timeDisplay, 'title', snapshot.timeTitle);

        refs.settingsButton.className = snapshot.settingsClassName;
        refs.settingsButton.disabled = snapshot.settingsDisabled;
        restoreNullableAttribute(refs.settingsButton, 'aria-disabled', snapshot.settingsAriaDisabled);
        restoreNullableAttribute(refs.settingsButton, 'title', snapshot.settingsTitle);
        restoreNullableAttribute(refs.settingsButton, 'aria-label', snapshot.settingsAria);
        removeLocalPlayerRoleMarkers(refs);
    }

    function releaseLocalPlayerWrapper() {
        hideLocalSpeedMenu();
        stopPlayerAnimation();
        const wrapper = state.playerWrapper;
        if (wrapper?.isConnected) {
            if (state.playerWrapperIsNative) {
                restoreNativePlayerSnapshot();
                wrapper.removeAttribute(LOCAL_PLAYER_OWNED_ATTR);
            } else {
                wrapper.remove();
            }
        }
        state.playerWrapper = null;
        state.playerWrapperIsNative = false;
        state.playerWrapperSnapshot = null;
        state.playerRefs = null;
        state.playerSeeking = false;
        state.playerSeekPointerId = null;
    }

    function formatAudioTime(seconds) {
        const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
        const rounded = Math.ceil(safe);
        const minutes = Math.floor(rounded / 60);
        const remainder = rounded % 60;
        return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }

    function paintLocalPlayerProgress() {
        const refs = state.playerRefs;
        if (!refs?.wrapper?.isConnected) return;
        const audio = state.audio;
        const duration = Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : 0;
        const current = duration > 0 && Number.isFinite(audio?.currentTime)
            ? Math.min(duration, Math.max(0, audio.currentTime))
            : 0;
        const percent = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
        const remaining = duration > 0 ? Math.max(0, duration - current) : 0;

        refs.progressBar.style.width = `${percent}%`;
        refs.progressBar.setAttribute('aria-valuenow', String(Math.round(percent)));
        refs.progressBar.setAttribute('aria-valuetext', `${formatAudioTime(current)} / ${formatAudioTime(duration)}`);
        refs.thumb.style.left = `${percent}%`;
        refs.timeDisplay.textContent = formatAudioTime(remaining);
    }

    function updateLocalPlayerControls() {
        const active = Boolean(
            state.eligible &&
            state.lookupStatus === 'ready' &&
            state.overrideFound &&
            state.entry &&
            !isNativePRoute()
        );
        if (!active) return;

        if (!state.playerOpen) {
            if (state.playerWrapper?.isConnected) {
                state.playerWrapper.hidden = false;
                if (state.playerWrapper.className !== 'hidden') state.playerWrapper.className = 'hidden';
            }
            hideLocalSpeedMenu();
            syncAnswerAudioControl();
            return;
        }

        const wrapper = ensureLocalPlayerWrapper();
        const refs = state.playerRefs;
        if (!wrapper || !refs) return;
        wrapper.hidden = false;
        if (wrapper.className !== 'animate-fade-in-fast') wrapper.className = 'animate-fade-in-fast';
        makeLocalPlayerControlsInteractive(refs);

        const playing = isLocalAudioPlaying();
        setButtonIcon(refs.playButton, playing ? 'PAUSE' : 'PLAY_ARROW');
        refs.playButton.title = playing ? t('pauseLocalAudio') : t('playLocalAudio');
        refs.playButton.setAttribute('aria-label', refs.playButton.title);
        refs.scrubButton.setAttribute('aria-label', t('scrubLocalAudio'));
        refs.settingsButton.title = t('localPlayerSettings');
        refs.settingsButton.setAttribute('aria-label', t('localPlayerSettings'));
        refs.settingsButton.setAttribute('aria-haspopup', 'menu');
        paintLocalPlayerProgress();
        syncAnswerAudioControl();
        schedulePanelPosition();
    }

    function createLocalSpeedMenu() {
        const menu = document.createElement('div');
        menu.id = LOCAL_SPEED_MENU_ID;
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        menu.innerHTML = `<div class="bp-local-audio-speed-menu__label"></div><div class="bp-local-audio-speed-menu__options"></div>`;
        const options = menu.querySelector('.bp-local-audio-speed-menu__options');
        const min = Math.round(CONFIG.FALLBACK_RATE_MIN * 100);
        const max = Math.round(CONFIG.FALLBACK_RATE_MAX * 100);
        const step = Math.round(CONFIG.FALLBACK_RATE_STEP * 100);
        for (let percent = min; percent <= max; percent += step) {
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('role', 'menuitemradio');
            button.dataset.rate = String(percent / 100);
            button.textContent = `${percent}%`;
            options.append(button);
        }
        (document.body || document.documentElement).append(menu);
        state.speedMenu = menu;
        return menu;
    }

    function hideLocalSpeedMenu() {
        const menu = state.speedMenu || document.getElementById(LOCAL_SPEED_MENU_ID);
        if (menu) menu.hidden = true;
    }

    function showLocalSpeedMenu(anchor) {
        const menu = state.speedMenu || createLocalSpeedMenu();
        menu.querySelector('.bp-local-audio-speed-menu__label').textContent = t('fallbackSpeed');
        const current = detectPlaybackRate().rate;
        menu.querySelectorAll('button[data-rate]').forEach((button) => {
            const selected = Math.abs(Number(button.dataset.rate) - current) < 0.001;
            button.setAttribute('aria-checked', selected ? 'true' : 'false');
        });
        menu.hidden = false;
        const rect = anchor.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, rect.right - menuRect.width));
        const preferredTop = rect.bottom + 6;
        const top = preferredTop + menuRect.height <= window.innerHeight - 8
            ? preferredTop
            : Math.max(8, rect.top - menuRect.height - 6);
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
    }

    function toggleLocalSpeedMenu(anchor) {
        const menu = state.speedMenu || createLocalSpeedMenu();
        if (!menu.hidden) hideLocalSpeedMenu();
        else showLocalSpeedMenu(anchor);
    }

    function resolveLocalPlayerRefsForControl(button) {
        const wrapper = button?.closest?.(`[${LOCAL_PLAYER_OWNED_ATTR}="true"], #${LOCAL_PLAYER_WRAPPER_ID}`);
        if (!wrapper) return null;
        const refs = collectLocalPlayerRefs(wrapper);
        if (!refs) return null;
        state.playerWrapper = wrapper;
        state.playerRefs = refs;
        markLocalPlayerRefs(refs);
        if (state.playerOpen) makeLocalPlayerControlsInteractive(refs);
        return refs;
    }

    function isLocalPlayerPlayButton(button) {
        const refs = resolveLocalPlayerRefsForControl(button);
        return Boolean(refs && refs.playButton === button);
    }

    function isLocalPlayerScrubButton(button) {
        const refs = resolveLocalPlayerRefsForControl(button);
        return Boolean(refs && refs.scrubButton === button);
    }

    function isLocalPlayerSettingsButton(button) {
        const refs = resolveLocalPlayerRefsForControl(button);
        return Boolean(refs && refs.settingsButton === button);
    }

    function setLocalAudioPositionFromClientX(clientX) {
        const refs = state.playerRefs;
        const audio = state.audio;
        const duration = Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : 0;
        if (!refs || !duration) return;
        const rect = refs.track.getBoundingClientRect();
        if (!rect.width) return;
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        audio.currentTime = ratio * duration;
        paintLocalPlayerProgress();
    }

    async function restartLocalPlayerPlayback() {
        if (!state.overrideFound || !state.entry) return;
        state.playerOpen = true;
        ensureLocalPlayerWrapper();
        syncAnswerAudioControl();
        updateLocalPlayerControls();
        await playLocalAudio(state.entry, { restart: true, openPlayer: true });
    }


    async function toggleLocalPlayerPlayback() {
        if (!state.overrideFound || !state.entry) return;
        state.playerOpen = true;
        ensureLocalPlayerWrapper();
        updateLocalPlayerControls();

        if (state.playPending) {
            stopLocalAudio();
            return;
        }

        const objectUrl = await ensureAudioObjectUrl(state.entry);
        const audio = ensureAudioElement();
        if (audio.src !== objectUrl) {
            await playObjectUrl(objectUrl, { restart: false, openPlayer: true });
            return;
        }

        if (!audio.paused && !audio.ended) {
            audio.pause();
            return;
        }
        if (audio.ended || (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.02)) {
            audio.currentTime = 0;
        }
        applyCurrentPlaybackRate(audio);
        const generation = ++state.playGeneration;
        await startPreparedLocalAudio(audio, generation);
    }

    function closeLocalPlayer(options = {}) {
        const { release = false } = options;
        state.playerOpen = false;
        stopLocalAudio();
        hideLocalSpeedMenu();
        if (release) releaseLocalPlayerWrapper();
        else updateLocalPlayerControls();
        syncAnswerAudioControl();
        schedulePanelPositionAfterAudioUiChange();
    }

    function releaseLocalOverrideUi() {
        state.playerOpen = false;
        stopLocalAudio(true, 'releaseLocalOverrideUi');
        hideLocalSpeedMenu();
        restoreControlledAnswerButton();
        removeSyntheticPlayButton();
        releaseLocalPlayerWrapper();
    }

    function isSourcePreviewActive() {
        return Boolean(state.eligible && state.previewObjectUrl && state.audio?.src === state.previewObjectUrl);
    }

    function syncLocalOverrideUi() {
        const active = Boolean(
            state.eligible &&
            state.lookupStatus === 'ready' &&
            state.overrideFound &&
            state.entry &&
            !isNativePRoute()
        );
        if (!active) {
            // A chosen or generated file can be previewed before any override exists;
            // keep its player until the preview is released or BunPro's own P takes over.
            if (isSourcePreviewActive() && !isNativePRoute()) {
                updateLocalPlayerControls();
                return;
            }
            if (
                state.playerOpen ||
                state.playerWrapper ||
                state.controlledAnswerButton ||
                state.syntheticPlayButton
            ) {
                releaseLocalOverrideUi();
            }
            return;
        }
        syncSyntheticPlayButton();
        syncAnswerAudioControl();
        updateLocalPlayerControls();
    }

    function schedulePanelPositionAfterAudioUiChange() {
        [0, 80, 220].forEach((delay) => {
            window.setTimeout(schedulePanelPosition, delay);
        });
    }

    function isBunproAudioButton(button) {
        if (!button || button.closest('#bp-local-audio-panel') || isInsideLocalPlayer(button)) return false;
        if (isSyntheticLocalAudioButton(button)) return true;
        if (button.dataset?.bpLocalAudioControlled === 'true') return true;
        return isNativePlayIntentButton(button);
    }

    function triggerBunproAudio(button = null) {
        const supplied = button?.isConnected && !isSyntheticLocalAudioButton(button) &&
            isNativePlayIntentButton(button) ? button : null;
        const target = supplied || findPrimaryBunproAudioButton();
        if (!target) return false;

        state.bypassClick = true;
        try {
            target.click();
        } finally {
            state.bypassClick = false;
        }
        schedulePanelPositionAfterAudioUiChange();
        return true;
    }

    async function playOverrideOrFallback(fallbackButton = null) {
        const nativeFallback = isSyntheticLocalAudioButton(fallbackButton) ? null : fallbackButton;
        if (!state.overrideFound || !state.entry) {
            triggerBunproAudio(nativeFallback);
            return;
        }

        try {
            await restartLocalPlayerPlayback();
        } catch (error) {
            state.lookupError = { key: 'localPlayFailed', vars: { error: errorMessage(error) } };
            renderPanel();
            triggerBunproAudio(nativeFallback);
        }
    }

    function blockEvent(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    function isEditableTarget(target) {
        const element = target instanceof Element ? target : null;
        if (!element) return false;
        // Panel controls must not swallow P/O; BunPro still handles the real P.
        if (element.closest(`#bp-local-audio-panel, #${LOCAL_SPEED_MENU_ID}`)) {
            if (element.closest('[contenteditable="true"]')) return true;
            const field = element.closest('input, textarea');
            return Boolean(field && !field.readOnly && !field.disabled &&
                (field.tagName === 'TEXTAREA' ||
                    !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/.test(field.type)));
        }
        if (element.closest('[contenteditable="true"]')) return true;
        const input = element.closest('input, textarea, select');
        return Boolean(input && !input.readOnly && !input.disabled);
    }

    function isBunproQuizEditableTarget(target) {
        const element = target instanceof Element ? target : null;
        if (!element) return false;
        return Boolean(element.closest(
            '#js-tour-quiz-answer, #js-tour-quiz-question, #js-quiz .bp-quiz-console, #js-quiz .bp-quiz-question'
        ));
    }

    function isCurrentPHotkeyAction(generation, sentence) {
        if (generation !== state.pHotkeyGeneration) return false;
        const context = ensureStateMatchesPage();
        return Boolean(
            context.eligible &&
            state.eligible &&
            state.normalizedSentence === sentence &&
            generation === state.pHotkeyGeneration
        );
    }

    async function prepareLocalPHotkeyPlayback(generation, sentence) {
        if (
            state.lookupStatus !== 'ready' ||
            !state.overrideFound ||
            !state.entry
        ) {
            return false;
        }
        const entry = state.entry;
        const objectUrl = await prepareLocalAudioElement(entry);
        return (
            isCurrentPHotkeyAction(generation, sentence) &&
            state.lookupStatus === 'ready' &&
            state.overrideFound &&
            state.entry === entry
        ) ? objectUrl : '';
    }

    async function startLocalPHotkeyPlayback(generation, sentence) {
        try {
            const objectUrl = await prepareLocalPHotkeyPlayback(generation, sentence);
            if (!objectUrl || !isCurrentPHotkeyAction(generation, sentence)) return;

            const startPlayback = () => {
                releasePreviewObjectUrl();
                return playObjectUrl(objectUrl, { restart: true, openPlayer: true });
            };

            // Recording is a best-effort sidecar, never a playback prerequisite.
            // Start it concurrently to retain the beginning on warm devices,
            // while slow permission, unplugged inputs and gain failures cannot
            // hold P in a pending-playback state.
            void restartVoiceRecording();
            await startPlayback();
        } catch (error) {
            if (!isCurrentPHotkeyAction(generation, sentence)) return;
            state.lookupError = { key: 'localPlayFailed', vars: { error: errorMessage(error) } };
            renderPanel();
        } finally {
            if (generation === state.pHotkeyGeneration) {
                state.pPlaybackStartPending = false;
                if (
                    isLocalPRoute() &&
                    !isLocalAudioPlaying()
                ) {
                    releasePRoute();
                }
            }
        }
    }

    function onKeyDown(event) {
        const targetButton = event.target?.closest?.('button');
        if (isLocalPlayerScrubButton(targetButton)) {
            const audio = state.audio;
            const duration = Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : 0;
            if (!duration) return;
            let nextTime = null;
            if (event.key === 'ArrowLeft') nextTime = Math.max(0, audio.currentTime - 5);
            if (event.key === 'ArrowRight') nextTime = Math.min(duration, audio.currentTime + 5);
            if (event.key === 'Home') nextTime = 0;
            if (event.key === 'End') nextTime = duration;
            if (nextTime !== null) {
                blockEvent(event);
                audio.currentTime = nextTime;
                paintLocalPlayerProgress();
            }
            return;
        }

        if (event.isComposing || event.repeat) return;
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        const key = String(event.key || '').toLowerCase();
        const isPKey = event.code === 'KeyP' || key === 'p';
        const isOKey = event.code === 'KeyO' || key === 'o';
        if (!isPKey && !isOKey) return;
        if (isEditableTarget(event.target) && !isBunproQuizEditableTarget(event.target)) return;

        const context = ensureStateMatchesPage();
        if (!context.eligible) return;

        if (isOKey) {
            const pPlaybackWasPending = state.pPlaybackStartPending;
            state.pHotkeyGeneration += 1;
            state.pPlaybackStartPending = false;
            releasePRoute({ resetNative: true });
            clearNativePClickPassthrough();
            blockEvent(event);
            if (!hasRecordingActivity() && !pPlaybackWasPending) {
                showRecordingStatus(isRecordingEnabled() ? 'recordingEmpty' : 'recordingDisabled');
                return;
            }
            const playbackContext = primeRecordingPlaybackContext();
            if (
                !state.recordingStartPending &&
                !state.recordingSession &&
                state.recordingBlob?.size
            ) {
                playStoredRecordingImmediately(state.recordingBlob, playbackContext);
                return;
            }
            const preparedAudio = primeRecordingPlaybackAudioElement();
            if (hasRecordingActivity()) {
                void stopAndPlayLatestRecording(playbackContext, preparedAudio);
            } else {
                cancelRecordedAudioPlayback();
                showRecordingStatus('recordingEmpty');
            }
            return;
        }

        const localPlaybackWasActive = isLocalAudioPlaying();
        const localPStartWasPending = state.pPlaybackStartPending;
        const nativePlaybackCycleWasActive = isNativePIntentActive();
        const generation = ++state.pHotkeyGeneration;
        state.pPlaybackStartPending = false;
        cancelRecordedAudioPlayback();

        if (localPlaybackWasActive || localPStartWasPending) {
            releasePRoute({ resetNative: true });
            blockEvent(event);
            void stopVoiceRecording({ discard: false });
            stopLocalAudio();
            return;
        }

        if (nativePlaybackCycleWasActive) {
            markNativePStop();
            armNativePClickPassthrough(generation);
            void stopVoiceRecording({ discard: false });
            schedulePanelPositionAfterAudioUiChange();
            // BunPro must receive this same trusted P to stop and reset its audio.
            return;
        }

        const useLocalOverride = Boolean(
            state.lookupStatus === 'ready' &&
            state.overrideFound &&
            state.entry
        );
        if (canStartVoiceRecording() && getRecordingGain() > 1) primeRecordingCaptureContext();
        if (useLocalOverride) {
            beginLocalPRoute();
            blockEvent(event);
            state.pPlaybackStartPending = true;
            const sentenceAtPress = state.normalizedSentence;
            void startLocalPHotkeyPlayback(generation, sentenceAtPress);
            return;
        }

        // Recording is only a sidecar: BunPro needs the user's original keydown
        // directly, without interception, delay or a synthetic replacement.
        markNativePIntent();
        armNativePClickPassthrough(generation);
        void restartVoiceRecording();
        schedulePanelPositionAfterAudioUiChange();
    }

    function applyLocalSpeedMenuSelection(button) {
        const rate = Number(button?.dataset?.rate);
        if (!isValidRate(rate)) return;
        rememberObservedRate(rate);
        setSetting(STORAGE_KEYS.FALLBACK_RATE, normalizeFallbackRate(rate));
        if (state.audio) {
            state.audio.defaultPlaybackRate = rate;
            state.audio.playbackRate = rate;
        }
        hideLocalSpeedMenu();
        updateLocalPlayerControls();
        renderPanel();
    }

    function onClick(event) {
        if (state.bypassClick) return;
        const button = event.target?.closest?.('button');
        if (
            hasNativePClickPassthrough() &&
            isNativeAudioControl(button)
        ) {
            return;
        }
        observeSpeedChoice(event.target);

        const speedOption = event.target?.closest?.(`#${LOCAL_SPEED_MENU_ID} button[data-rate]`);
        if (speedOption) {
            blockEvent(event);
            applyLocalSpeedMenuSelection(speedOption);
            return;
        }

        if (!button?.closest?.(`#${LOCAL_SPEED_MENU_ID}`) && !isLocalPlayerSettingsButton(button)) {
            hideLocalSpeedMenu();
        }

        if (isLocalPlayerPlayButton(button)) {
            blockEvent(event);
            void toggleLocalPlayerPlayback().catch((error) => {
                state.lookupError = { key: 'localPlayFailed', vars: { error: errorMessage(error) } };
                renderPanel();
            });
            return;
        }
        if (isLocalPlayerScrubButton(button)) {
            blockEvent(event);
            if (Number.isFinite(event.clientX)) setLocalAudioPositionFromClientX(event.clientX);
            return;
        }
        if (isLocalPlayerSettingsButton(button)) {
            blockEvent(event);
            toggleLocalSpeedMenu(button);
            return;
        }

        if (isNativeAudioControl(button)) schedulePanelPositionAfterAudioUiChange();
        if (!isBunproAudioButton(button)) return;

        const context = ensureStateMatchesPage();
        if (!context.eligible) return;

        if (state.lookupStatus === 'ready') {
            if (!state.overrideFound) return;
            blockEvent(event);
            if (state.playerOpen) {
                closeLocalPlayer();
            } else {
                void playOverrideOrFallback(button);
            }
            return;
        }

        if (state.lookupStatus === 'error') return;

        blockEvent(event);
        const sentenceAtClick = state.normalizedSentence;
        void ensureLookupStarted().then((result) => {
            if (state.normalizedSentence !== sentenceAtClick || !state.eligible) return;
            if (result?.found) void playOverrideOrFallback(button);
            else triggerBunproAudio(button);
        });
    }

    function onPointerDown(event) {
        const button = event.target?.closest?.('button');
        if (!isLocalPlayerScrubButton(button)) return;
        blockEvent(event);
        state.playerSeeking = true;
        state.playerSeekPointerId = event.pointerId;
        try {
            button.setPointerCapture?.(event.pointerId);
        } catch {
            // Some browsers reject pointer capture during the capturing phase.
        }
        setLocalAudioPositionFromClientX(event.clientX);
    }

    function onPointerMove(event) {
        if (!state.playerSeeking || state.playerSeekPointerId !== event.pointerId) return;
        blockEvent(event);
        setLocalAudioPositionFromClientX(event.clientX);
    }

    function finishPointerSeek(event, cancelled = false) {
        if (!state.playerSeeking || state.playerSeekPointerId !== event.pointerId) return;
        blockEvent(event);
        if (!cancelled) setLocalAudioPositionFromClientX(event.clientX);
        const button = state.playerRefs?.scrubButton;
        try {
            button?.releasePointerCapture?.(event.pointerId);
        } catch {
            // Capture may already be lost; still clear the seek state below.
        }
        state.playerSeeking = false;
        state.playerSeekPointerId = null;
    }

    function populateRateOptions(select) {
        select.textContent = '';
        const min = Math.round(CONFIG.FALLBACK_RATE_MIN * 100);
        const max = Math.round(CONFIG.FALLBACK_RATE_MAX * 100);
        const step = Math.round(CONFIG.FALLBACK_RATE_STEP * 100);
        for (let percent = min; percent <= max; percent += step) {
            const option = document.createElement('option');
            option.value = String(percent / 100);
            option.textContent = `${percent}%`;
            select.append(option);
        }
    }

    function populateLanguageOptions(select) {
        const current = getUiLanguageSetting();
        select.textContent = '';
        for (const language of SUPPORTED_LANGUAGES) {
            const option = document.createElement('option');
            option.value = language;
            option.textContent = language === 'auto'
                ? `${t('autoLanguage')} (${LANGUAGE_NAMES[detectAutomaticLanguage()]})`
                : LANGUAGE_NAMES[language];
            select.append(option);
        }
        select.value = current;
    }

    function installPanelFocusHandlers(panel) {
        let pointerControl = null;
        const controlFor = (target) => target instanceof Element ? target.closest('button, select, input') : null;
        panel.addEventListener('pointerdown', (event) => { pointerControl = controlFor(event.target); });
        panel.addEventListener('keydown', () => { pointerControl = null; });
        const finishInteraction = (event) => {
            const control = controlFor(event.target);
            if (!control || control !== pointerControl) return;
            const pointerActivation = event.type === 'click'
                ? control.matches('button, input[type="button"], input[type="submit"], input[type="reset"]') && event.detail > 0
                : control.matches('select, input[type="file"], input[type="checkbox"]');
            if (!pointerActivation) return;
            pointerControl = null;
            // Target handlers run first; returning focus lets the page receive Enter too.
            if (!isLocalPlayerScrubButton(control)) control.blur();
        };
        panel.addEventListener('click', finishInteraction);
        panel.addEventListener('change', finishInteraction);
    }

    function createPanel() {
        const panel = document.createElement('section');
        panel.id = 'bp-local-audio-panel';
        panel.hidden = true;
        panel.innerHTML = `
            <div class="bp-local-audio__top-row">
                <strong data-role="title"></strong>
                <span class="bp-local-audio__sentence" data-role="sentence"></span>
                <span class="bp-local-audio__status" data-role="status"></span>
                <select class="bp-local-audio__language" data-role="language"></select>
            </div>
            <div class="bp-local-audio__message" data-role="message" role="status" aria-live="polite"></div>
            <div class="bp-local-audio__control-row" data-role="main-view">
                <div class="bp-local-audio__control-group">
                    <button data-role="choose-audio" type="button"></button>
                    <button data-role="voicevox" type="button"></button>
                    <input data-role="file" type="file" accept="audio/*,.wav,.mp3,.ogg,.oga,.m4a,.aac,.flac,.webm" hidden>
                    <span class="bp-local-audio__file-name" data-role="file-name"></span>
                    <label class="bp-local-audio__speed-control" data-role="fallback-control">
                        <span data-role="fallback-label"></span>
                        <select data-role="fallback-rate"></select>
                    </label>
                </div>
                <div class="bp-local-audio__control-group">
                    <button data-role="save" type="button"></button>
                    <button data-role="test" type="button"></button>
                    <button data-role="delete" type="button"></button>
                </div>
                <div class="bp-local-audio__control-group">
                    <button data-role="admin" type="button"></button>
                </div>
                <div class="bp-local-audio__control-group">
                    <button data-role="recording-toggle" type="button" aria-pressed="false"></button>
                    <button data-role="mic-processing" type="button"></button>
                    <label class="bp-local-audio__speed-control" data-role="mic-gain-control">
                        <span data-role="mic-gain-label"></span>
                        <select data-role="mic-gain"></select>
                    </label>
                </div>
            </div>
            <div class="bp-local-audio__control-row bp-local-audio__admin-view" data-role="admin-view" hidden>
                <div class="bp-local-audio__voicevox-settings">
                    <strong data-role="voicevox-title"></strong>
                    <label><span data-role="voicevox-voice-label"></span><select data-role="voicevox-voice"></select></label>
                    <label><span data-role="voicevox-speed-label"></span><select data-role="voicevox-speed"></select></label>
                    <label><span data-role="voicevox-url-label"></span><input data-role="voicevox-url" type="url" spellcheck="false"></label>
                    <button data-role="voicevox-load" type="button"></button>
                </div>
                <button data-role="export" type="button"></button>
                <button data-role="import" type="button"></button>
                <button data-role="import-replace" type="button"></button>
                <button data-role="compress" type="button"></button>
                <label class="bp-local-audio__auto-compress" data-role="auto-compress-label">
                    <input data-role="auto-compress" type="checkbox">
                    <span data-role="auto-compress-text"></span>
                </label>
                <button data-role="clean" type="button"></button>
                <button data-role="back" type="button"></button>
                <input data-role="import-file" type="file" accept=".bpao,.json,application/json,application/octet-stream" hidden>
            </div>
        `;

        const refs = {
            voicevoxButton: panel.querySelector('[data-role="voicevox"]'),
            voicevoxVoice: panel.querySelector('[data-role="voicevox-voice"]'),
            voicevoxSpeed: panel.querySelector('[data-role="voicevox-speed"]'),
            voicevoxUrl: panel.querySelector('[data-role="voicevox-url"]'),
            voicevoxLoad: panel.querySelector('[data-role="voicevox-load"]'),
            title: panel.querySelector('[data-role="title"]'),
            status: panel.querySelector('[data-role="status"]'),
            sentence: panel.querySelector('[data-role="sentence"]'),
            message: panel.querySelector('[data-role="message"]'),
            languageSelect: panel.querySelector('[data-role="language"]'),
            mainView: panel.querySelector('[data-role="main-view"]'),
            adminView: panel.querySelector('[data-role="admin-view"]'),
            chooseAudioButton: panel.querySelector('[data-role="choose-audio"]'),
            fileName: panel.querySelector('[data-role="file-name"]'),
            fileInput: panel.querySelector('[data-role="file"]'),
            fallbackControl: panel.querySelector('[data-role="fallback-control"]'),
            importFileInput: panel.querySelector('[data-role="import-file"]'),
            fallbackLabel: panel.querySelector('[data-role="fallback-label"]'),
            fallbackRate: panel.querySelector('[data-role="fallback-rate"]'),
            saveButton: panel.querySelector('[data-role="save"]'),
            testButton: panel.querySelector('[data-role="test"]'),
            deleteButton: panel.querySelector('[data-role="delete"]'),
            adminButton: panel.querySelector('[data-role="admin"]'),
            exportButton: panel.querySelector('[data-role="export"]'),
            importButton: panel.querySelector('[data-role="import"]'),
            importReplaceButton: panel.querySelector('[data-role="import-replace"]'),
            compressButton: panel.querySelector('[data-role="compress"]'),
            autoCompressInput: panel.querySelector('[data-role="auto-compress"]'),
            autoCompressLabel: panel.querySelector('[data-role="auto-compress-label"]'),
            autoCompressText: panel.querySelector('[data-role="auto-compress-text"]'),
            cleanButton: panel.querySelector('[data-role="clean"]'),
            backButton: panel.querySelector('[data-role="back"]'),
            recordingToggle: panel.querySelector('[data-role="recording-toggle"]'),
            micProcessingButton: panel.querySelector('[data-role="mic-processing"]'),
            micGainLabel: panel.querySelector('[data-role="mic-gain-label"]'),
            micGainSelect: panel.querySelector('[data-role="mic-gain"]'),
        };

        populateRateOptions(refs.fallbackRate);
        refs.voicevoxUrl.value = getSetting(STORAGE_KEYS.VOICEVOX_URL, CONFIG.VOICEVOX_DEFAULT_URL);
        for (let step = 8; step <= 15; step += 1) {
            const option = document.createElement('option');
            option.value = String(step / 10);
            option.textContent = (step / 10).toFixed(1) + '×';
            refs.voicevoxSpeed.append(option);
        }
        refs.voicevoxSpeed.value = String(getVoicevoxSpeed());
        refs.voicevoxSpeed.addEventListener('change', () => {
            setSetting(STORAGE_KEYS.VOICEVOX_SPEED, Number(refs.voicevoxSpeed.value));
        });
        refs.voicevoxVoice.addEventListener('change', () => {
            const voice = state.voicevoxVoices.find(item => String(item.id) === refs.voicevoxVoice.value);
            if (voice) selectVoicevoxVoice(voice);
        });
        refs.voicevoxUrl.addEventListener('change', () => {
            try {
                const url = validateVoicevoxUrl(refs.voicevoxUrl.value);
                refs.voicevoxUrl.value = url;
                setSetting(STORAGE_KEYS.VOICEVOX_URL, url);
            } catch (error) {
                setPanelMessageFromError(error);
            }
        });
        refs.voicevoxButton.addEventListener('click', () => void handleVoicevox());
        refs.voicevoxLoad.addEventListener('click', () => void handleVoicevox(true));
        refs.fallbackRate.value = String(getFallbackRate());
        populateLanguageOptions(refs.languageSelect);

        refs.languageSelect.addEventListener('change', () => {
            setUiLanguage(refs.languageSelect.value);
        });
        refs.fallbackRate.addEventListener('change', () => {
            setFallbackRate(Number(refs.fallbackRate.value));
        });
        refs.chooseAudioButton.addEventListener('click', () => refs.fileInput.click());
        refs.fileInput.addEventListener('change', () => {
            state.selectedFile = refs.fileInput.files?.[0] || null;
            clearPanelMessage();
            renderPanel();
        });
        refs.saveButton.addEventListener('click', () => void handleSave());
        refs.testButton.addEventListener('click', () => void handleTest());
        refs.deleteButton.addEventListener('click', () => void handleDelete());
        refs.adminButton.addEventListener('click', enterAdminMode);
        refs.exportButton.addEventListener('click', () => void handleExport());
        refs.importButton.addEventListener('click', () => requestImport('keep'));
        refs.importReplaceButton.addEventListener('click', () => requestImport('replace'));
        refs.compressButton.addEventListener('click', () => void handleCompressAudio());
        refs.autoCompressInput.addEventListener('change', () => {
            setAutoCompressionEnabled(refs.autoCompressInput.checked);
        });
        refs.cleanButton.addEventListener('click', () => void handleCleanDatabase());
        refs.backButton.addEventListener('click', leaveAdminMode);
        refs.importFileInput.addEventListener('change', () => {
            const file = refs.importFileInput.files?.[0] || null;
            refs.importFileInput.value = '';
            if (file) void handleImport(file, state.pendingImportMode);
        });
        refs.recordingToggle.addEventListener('click', () => {
            setRecordingEnabled(!isRecordingEnabled());
        });
        refs.micProcessingButton.addEventListener('click', () => {
            setMicProcessingMode(getMicProcessingMode() === 'clean' ? 'raw' : 'clean');
        });
        RECORDING_GAIN_LEVELS.forEach((gain) => {
            const option = document.createElement('option');
            option.value = String(gain);
            option.textContent = String(gain) + '×';
            refs.micGainSelect.append(option);
        });
        refs.micGainSelect.addEventListener('change', () => setRecordingGain(refs.micGainSelect.value));

        installPanelFocusHandlers(panel);
        state.panel = panel;
        state.refs = refs;
        applyPanelTranslations();
        return panel;
    }

    function applyRecordingControlTranslations() {
        const refs = state.refs;
        if (!refs?.recordingToggle) return;

        const recordingOn = isRecordingEnabled();
        refs.recordingToggle.textContent = t(recordingOn ? 'recordingOnLabel' : 'recordingOffLabel');
        refs.recordingToggle.title = t(recordingOn ? 'recordingOnTitle' : 'recordingOffTitle');
        refs.recordingToggle.setAttribute('aria-pressed', recordingOn ? 'true' : 'false');
        refs.recordingToggle.dataset.active = recordingOn ? 'true' : 'false';

        const clean = getMicProcessingMode() === 'clean';
        refs.micProcessingButton.textContent = t(clean ? 'recordingMicProcessingClean' : 'recordingMicProcessingRaw');
        refs.micProcessingButton.title = t(clean ? 'recordingMicProcessingCleanTitle' : 'recordingMicProcessingRawTitle');
        refs.micProcessingButton.disabled = !recordingOn;
        refs.micGainLabel.textContent = t('micGainLabel');
        refs.micGainSelect.title = t('micGainTitle');
        refs.micGainSelect.setAttribute('aria-label', t('micGainLabel'));
        refs.micGainSelect.value = String(getRecordingGain());
        refs.micGainSelect.disabled = !recordingOn;
    }

    function applyPanelTranslations() {
        if (!state.refs) return;
        const refs = state.refs;
        refs.title.textContent = t('panelTitle');
        refs.chooseAudioButton.textContent = t('chooseAudio');
        for (const [role, key] of [['voicevox-title', 'voicevox'], ['voicevox-voice-label', 'voicevoxVoice'],
            ['voicevox-speed-label', 'voicevoxSpeed'], ['voicevox-url-label', 'voicevoxUrl']]) {
            state.panel.querySelector(`[data-role="${role}"]`).textContent = t(key);
        }
        refs.voicevoxLoad.textContent = t('voicevoxLoad');
        renderVoicevoxControls();
        refs.fileInput.title = t('chooseFile');
        refs.fileInput.setAttribute('aria-label', t('chooseFile'));
        refs.saveButton.textContent = t('save');
        refs.testButton.textContent = t('test');
        refs.deleteButton.textContent = t('delete');
        refs.adminButton.textContent = t('admin');
        refs.exportButton.textContent = t('exportToFile');
        refs.importButton.textContent = t('importKeep');
        refs.importReplaceButton.textContent = t('importReplace');
        refs.compressButton.textContent = t(state.compressionJob ? 'cancelCompression' : 'compressAudio');
        refs.autoCompressText.textContent = t('autoCompressLabel');
        refs.autoCompressLabel.title = t('autoCompressTitle');
        refs.autoCompressInput.setAttribute('aria-label', t('autoCompressLabel'));
        refs.autoCompressInput.title = t('autoCompressTitle');
        refs.autoCompressInput.checked = isAutoCompressionEnabled();
        refs.autoCompressInput.disabled = state.adminBusy;
        refs.cleanButton.textContent = state.cleanConfirmArmed ? t('confirmClean') : t('cleanDatabase');
        refs.backButton.textContent = t('back');
        refs.importFileInput.title = t('chooseBackupFile');
        refs.importFileInput.setAttribute('aria-label', t('chooseBackupFile'));
        refs.fallbackLabel.textContent = t('fallbackSpeed');
        applyRecordingControlTranslations();
        refs.languageSelect.title = t('language');
        refs.languageSelect.setAttribute('aria-label', t('language'));
        populateLanguageOptions(refs.languageSelect);
        renderPanelMessage();
        updateSyntheticPlayButtonTranslation();
        updateLocalPlayerControls();
        if (state.speedMenu && !state.speedMenu.hidden) {
            state.speedMenu.querySelector('.bp-local-audio-speed-menu__label').textContent = t('fallbackSpeed');
        }
        schedulePanelPosition();
    }

    function resetCleanConfirmation() {
        state.cleanConfirmArmed = false;
        if (state.cleanConfirmTimer) clearTimeout(state.cleanConfirmTimer);
        state.cleanConfirmTimer = 0;
        if (state.refs?.cleanButton) {
            state.refs.cleanButton.dataset.confirm = 'false';
            state.refs.cleanButton.textContent = t('cleanDatabase');
        }
    }

    function enterAdminMode() {
        state.adminMode = true;
        resetCleanConfirmation();
        if (state.refs) setPanelMessage('adminHelp');
        applyPanelTranslations();
        renderPanel();
        void refreshAdminStats();
    }

    function leaveAdminMode() {
        if (state.adminBusy) return;
        state.adminMode = false;
        resetCleanConfirmation();
        if (state.refs) clearPanelMessage();
        applyPanelTranslations();
        renderPanel();
    }

    async function refreshAdminStats() {
        if (state.adminStatsPromise) return state.adminStatsPromise;
        state.adminStats.loading = true;
        state.adminStats.error = '';
        renderPanel();
        const promise = dbAudioInventory()
            .then((inventory) => {
                state.adminStats = {
                    loading: false,
                    count: inventory.count,
                    totalBytes: inventory.totalBytes,
                    error: '',
                };
                return state.adminStats;
            })
            .catch((error) => {
                state.adminStats = {
                    loading: false,
                    count: 0,
                    totalBytes: 0,
                    error: errorMessage(error),
                };
                return state.adminStats;
            })
            .finally(() => {
                state.adminStatsPromise = null;
                renderPanel();
            });
        state.adminStatsPromise = promise;
        return promise;
    }

    function setAdminBusy(busy, key, vars = {}) {
        state.adminBusy = busy;
        setUiBusy(busy, key, vars);
        renderPanel();
    }

    async function supportsWebCodecsOpus() {
        if (typeof AudioEncoder !== 'function' || typeof AudioData !== 'function') return false;
        const support = await AudioEncoder.isConfigSupported({
            codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 64000,
        });
        return support.supported;
    }

    function opusPacketSamples(packet) {
        const config = packet[0] >> 3;
        const frameSamples = config >= 16 ? 120 << (config & 3)
            : config >= 12 ? 480 << (config & 1)
                : (config & 3) === 3 ? 2880 : 480 << (config & 3);
        const code = packet[0] & 3;
        return frameSamples * (code === 0 ? 1 : code === 3 ? packet[1] & 63 : 2);
    }

    function muxOggOpus(packets, sampleCount, preSkip) {
        const serial = crypto.getRandomValues(new Uint32Array(1))[0];
        const pages = [];
        function page(pagePackets, flags, granule) {
            const segments = pagePackets.reduce((sum, packet) => sum + Math.floor(packet.length / 255) + 1, 0);
            const payloadBytes = pagePackets.reduce((sum, packet) => sum + packet.length, 0);
            if (segments > 255) throw translatedError('compressionEncoderFailed');
            const bytes = new Uint8Array(27 + segments + payloadBytes);
            const view = new DataView(bytes.buffer);
            bytes.set([79, 103, 103, 83, 0, flags]);
            view.setUint32(6, granule >>> 0, true);
            view.setUint32(10, Math.floor(granule / 4294967296), true);
            view.setUint32(14, serial, true);
            view.setUint32(18, pages.length, true);
            bytes[26] = segments;
            let laceOffset = 27;
            let payloadOffset = 27 + segments;
            for (const packet of pagePackets) {
                const fullSegments = Math.floor(packet.length / 255);
                bytes.fill(255, laceOffset, laceOffset + fullSegments);
                laceOffset += fullSegments;
                // A terminating zero lace is required for exact multiples of 255.
                bytes[laceOffset++] = packet.length % 255;
                bytes.set(packet, payloadOffset);
                payloadOffset += packet.length;
            }
            let crc = 0;
            for (const byte of bytes) {
                crc ^= byte << 24;
                for (let bit = 0; bit < 8; bit += 1) {
                    crc = (crc << 1) ^ ((crc & 0x80000000) ? 0x04c11db7 : 0);
                }
            }
            view.setUint32(22, crc >>> 0, true);
            pages.push(bytes);
        }
        const head = new Uint8Array(19);
        head.set(new TextEncoder().encode('OpusHead'));
        const headView = new DataView(head.buffer);
        head[8] = 1;
        head[9] = 1;
        headView.setUint16(10, preSkip, true);
        headView.setUint32(12, 48000, true);
        page([head], 2, 0);
        const vendor = new TextEncoder().encode('BunPro Local Audio');
        const tags = new Uint8Array(16 + vendor.length);
        tags.set(new TextEncoder().encode('OpusTags'));
        new DataView(tags.buffer).setUint32(8, vendor.length, true);
        tags.set(vendor, 12);
        page([tags], 0, 0);
        let granule = 0;
        let pagePackets = [];
        let pageSegments = 0;
        let pageSamples = 0;
        if (!packets.length) throw translatedError('compressionEmptyClip');
        for (let index = 0; index < packets.length; index += 1) {
            const packet = packets[index];
            const segments = Math.floor(packet.length / 255) + 1;
            const samples = opusPacketSamples(packet);
            if (segments > 255) throw translatedError('compressionEncoderFailed');
            // Keep whole packets together while bounding page overhead and duration.
            if (pagePackets.length && (pageSegments + segments > 255 || pageSamples + samples > 48000)) {
                page(pagePackets, 0, granule);
                pagePackets = [];
                pageSegments = 0;
                pageSamples = 0;
            }
            pagePackets.push(packet);
            pageSegments += segments;
            pageSamples += samples;
            granule += samples;
            const last = index === packets.length - 1;
            // The last page trims encoder padding without discarding the codec delay.
            if (last && (granule < preSkip + sampleCount
                || preSkip + sampleCount <= granule - samples)) {
                throw translatedError('compressionValidationFailed');
            }
            if (last) page(pagePackets, 4, preSkip + sampleCount);
        }
        return new Blob(pages, { type: 'audio/ogg;codecs=opus' });
    }

    async function encodeWebCodecsOpus(mono, job, awaitOrAbort, checkCancelled) {
        const packets = [];
        let preSkip = 312;
        let encoderError;
        let encoder;
        const previousAbort = job.abortCurrent;
        const closeEncoder = () => {
            if (encoder && encoder.state !== 'closed') encoder.close();
        };
        const abort = () => {
            previousAbort();
            closeEncoder();
        };
        job.abortCurrent = abort;
        try {
            encoder = new AudioEncoder({
                output: (chunk, metadata) => {
                    const packet = new Uint8Array(chunk.byteLength);
                    chunk.copyTo(packet);
                    packets.push(packet);
                    const description = metadata?.decoderConfig?.description;
                    if (description) {
                        const bytes = ArrayBuffer.isView(description)
                            ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
                            : new Uint8Array(description);
                        if (bytes.length >= 19 && new TextDecoder().decode(bytes.subarray(0, 8)) === 'OpusHead') {
                            preSkip = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(10, true);
                        }
                    }
                },
                error: (error) => { encoderError = error; },
            });
            encoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 64000 });
            const samples = mono.getChannelData(0);
            for (let offset = 0; offset < samples.length; offset += 960) {
                checkCancelled();
                if (encoderError) throw encoderError;
                const data = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfChannels: 1,
                    numberOfFrames: Math.min(960, samples.length - offset),
                    timestamp: Math.round(offset * 1000000 / 48000), data: samples.subarray(offset, offset + 960) });
                try { encoder.encode(data); } finally { data.close(); }
                // Bound queued PCM and yield to Cancel even when encoding runs off-thread.
                if (offset % (960 * 16) === 0 || encoder.encodeQueueSize > 16) {
                    do {
                        await awaitOrAbort(new Promise(resolve => setTimeout(resolve, 0)));
                        checkCancelled();
                        if (encoderError) throw encoderError;
                    } while (encoder.encodeQueueSize > 16);
                }
            }
            await awaitOrAbort(encoder.flush());
            checkCancelled();
            if (encoderError) throw encoderError;
            return muxOggOpus(packets, mono.length, preSkip);
        } finally {
            closeEncoder();
            if (job.abortCurrent === abort) job.abortCurrent = previousAbort;
        }
    }

    // Both encoders stay local and never connect to a speaker or microphone.
    async function encodeSpeechOpus(blob, audioContext, job) {
        const abortError = () => new DOMException(t('compressionAbort'), 'AbortError');
        const checkCancelled = () => { if (job.cancelled) throw abortError(); };
        checkCancelled();
        if (!audioContext || audioContext.state === 'closed') {
            throw translatedError('compressionContextUnavailable');
        }

        let source = null;
        let destination = null;
        let recorder = null;
        let tailTimer = null;
        let watchdog = null;
        let rejectAbort;
        const aborted = new Promise((_, reject) => { rejectAbort = reject; });
        // Cancellation may occur between awaited operations; keep that rejection
        // handled even when no Promise.race is listening at that exact moment.
        aborted.catch(() => {});
        const awaitOrAbort = (operation) => Promise.race([operation, aborted]);
        const abortCurrent = () => {
            job.cancelled = true;
            rejectAbort(abortError());
            try { source?.stop(); } catch (_) { /* It may already have ended. */ }
            try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch (_) { /* Cleanup below. */ }
        };
        job.abortCurrent = abortCurrent;

        try {
            const inputBytes = await awaitOrAbort(blob.arrayBuffer());
            checkCancelled();
            const decoded = await awaitOrAbort(audioContext.decodeAudioData(inputBytes));
            checkCancelled();
            const duration = decoded.duration;
            if (!Number.isFinite(duration) || duration <= 0 || !decoded.numberOfChannels) {
                throw translatedError('compressionNoSamples');
            }
            // Do not repeatedly degrade an already compact, lossy recording.
            // PCM WAV and FLAC are intentionally not covered by this shortcut.
            if (/^audio\/(?:ogg|webm|mpeg|mp3|mp4|aac|m4a|x-m4a)(?:;|$)/i.test(blob.type)
                && blob.size * 8 / duration <= 80000) {
                return { skipped: true, reason: 'already-compact' };
            }

            // Downmix explicitly instead of relying on a browser's default stereo
            // MediaStreamDestination configuration. Preserve sample rate/duration.
            let mono = decoded;
            if (decoded.numberOfChannels !== 1) {
                mono = audioContext.createBuffer(1, decoded.length, decoded.sampleRate);
                const output = mono.getChannelData(0);
                const weight = 1 / decoded.numberOfChannels;
                for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
                    const input = decoded.getChannelData(channel);
                    for (let sample = 0; sample < output.length; sample += 1) output[sample] += input[sample] * weight;
                }
            }
            checkCancelled();
            async function validate(encoded) {
                if (!encoded.size) throw translatedError('compressionEmptyClip');
                const verification = await awaitOrAbort(audioContext.decodeAudioData(await awaitOrAbort(encoded.arrayBuffer())));
                checkCancelled();
                // Keep the same decode gate for both container/encoder paths.
                if (verification.numberOfChannels !== 1
                    || !Number.isFinite(verification.duration)
                    || verification.duration < duration - 0.08
                    || verification.duration > duration + 0.65) {
                    throw translatedError('compressionValidationFailed');
                }
                return {
                    blob: encoded,
                    mimeType: encoded.type,
                    extension: /ogg/i.test(encoded.type) ? '.ogg' : '.webm',
                    duration: verification.duration,
                };
            }
            try {
                if (await awaitOrAbort(supportsWebCodecsOpus())) {
                    checkCancelled();
                    return await validate(await encodeWebCodecsOpus(mono, job, awaitOrAbort, checkCancelled));
                }
                console.warn('[BunPro Local Audio] WebCodecs Opus unavailable; using MediaRecorder.');
            } catch (error) {
                checkCancelled();
                if (error?.name === 'AbortError') throw error;
                console.warn('[BunPro Local Audio] WebCodecs Opus failed; using MediaRecorder:', error);
            }
            checkCancelled();
            if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
                throw translatedError('compressionRecorderUnavailable');
            }
            const mimeType = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus']
                .find((type) => MediaRecorder.isTypeSupported(type));
            if (!mimeType) throw translatedError('compressionEncoderUnavailable');
            destination = audioContext.createMediaStreamDestination();
            destination.channelCount = 1;
            destination.channelCountMode = 'explicit';
            source = audioContext.createBufferSource();
            source.buffer = mono;
            source.connect(destination);
            recorder = new MediaRecorder(destination.stream, { mimeType, audioBitsPerSecond: 64000 });

            // The owner resumes the context from the button's user gesture. If a
            // browser suspends it afterwards, fail safely instead of saving silence.
            if (audioContext.state !== 'running') {
                throw translatedError('compressionSuspended');
            }
            let sourceEnded = false;
            const encoded = await awaitOrAbort(new Promise((resolve, reject) => {
                const chunks = [];
                let settled = false;
                const fail = (error) => {
                    if (settled) return;
                    settled = true;
                    reject(error);
                };
                recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
                recorder.onstart = () => {
                    // Chrome may initialize its stream encoder asynchronously;
                    // waiting for start prevents losing the beginning of a word.
                    try { source.start(audioContext.currentTime + 0.025); }
                    catch (error) { fail(error); }
                };
                recorder.onerror = (event) => fail(event.error || translatedError('compressionEncoderFailed'));
                recorder.onstop = () => {
                    if (settled) return;
                    settled = true;
                    if (!sourceEnded) {
                        reject(translatedError('compressionStoppedEarly'));
                        return;
                    }
                    resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
                };
                source.onended = () => {
                    sourceEnded = true;
                    // Let the last audio render block reach the recorder before
                    // stopping. A small amount of codec/container padding is OK.
                    tailTimer = setTimeout(() => {
                        try { if (recorder.state !== 'inactive') recorder.stop(); }
                        catch (error) { fail(error); }
                    }, 75);
                };
                watchdog = setTimeout(() => fail(translatedError('compressionTimedOut')),
                    Math.ceil(duration * 1000) + 30000);
                try {
                    // The start event schedules the first source sample only once
                    // the encoder has acknowledged the recording request.
                    recorder.start(1000);
                } catch (error) { fail(error); }
            }));
            checkCancelled();
            return await validate(encoded);
        } finally {
            clearTimeout(tailTimer);
            clearTimeout(watchdog);
            if (job.abortCurrent === abortCurrent) job.abortCurrent = null;
            if (source) {
                source.onended = null;
                try { source.stop(); } catch (_) { /* Already stopped / not started. */ }
                try { source.disconnect(); } catch (_) { /* Best-effort cleanup. */ }
                try { source.buffer = null; } catch (_) { /* Best-effort cleanup. */ }
            }
            if (recorder) {
                recorder.ondataavailable = null;
                recorder.onstart = null;
                recorder.onerror = null;
                recorder.onstop = null;
                try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_) { /* Best-effort cleanup. */ }
            }
            if (destination) {
                for (const track of destination.stream.getTracks()) track.stop();
                try { destination.disconnect(); } catch (_) { /* No outgoing edge. */ }
            }
        }
    }

    function compressionSummary(job) {
        return { ...job, saved: formatBytes(job.savedBytes) };
    }

    function createCompressionContext() {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context || (typeof AudioEncoder !== 'function' && (!window.MediaRecorder
            || !['audio/ogg;codecs=opus', 'audio/webm;codecs=opus']
                .some((mime) => MediaRecorder.isTypeSupported(mime))))) {
            throw new Error('This browser does not support native Opus encoding.');
        }
        return new Context({ sampleRate: 48000 });
    }

    // Both compression entry points remain cancellable while the browser
    // audio engine is starting, before any clip or database write is touched.
    async function resumeCompressionContext(context, job) {
        let timer;
        const cancelled = new Promise((_, reject) => {
            job.cancelReady = () => reject(new DOMException('Audio compression cancelled.', 'AbortError'));
        });
        const timeout = new Promise((_, reject) => {
            timer = window.setTimeout(() => reject(new Error('Audio processing could not start.')),
                CONFIG.COMPRESSION_START_TIMEOUT_MS);
        });
        try {
            await Promise.race([context.resume(), cancelled, timeout]);
        } finally {
            window.clearTimeout(timer);
            job.cancelReady = null;
        }
    }

    // Shared by manual library compression, file saves and backup imports.
    // Pure preparation: no database write occurs until the caller commits.
    async function compressAudioEntry(before, context, job) {
        const marker = before.compression;
        if (marker?.version === 1 && marker.codec === 'opus'
            && marker.sha256 && marker.sha256 === await sha256Hex(before.blob)) return null;
        const encoded = await encodeSpeechOpus(before.blob, context, job);
        if (job.cancelled) throw new DOMException('Audio compression cancelled.', 'AbortError');
        if (encoded.skipped || encoded.blob.size > before.blob.size * 0.9) return null;
        const hash = await sha256Hex(encoded.blob);
        if (!hash) throw new Error('Unable to verify the compressed audio checksum.');
        const fileName = (entryFileName(before).replace(/\.[^.]+$/, '') || 'audio') + encoded.extension;
        const updatedAt = new Date().toISOString();
        return { ...before, fileName, file_name: fileName, file: fileName, source_path: fileName,
            mimeType: encoded.mimeType, mime_type: encoded.mimeType, blob: encoded.blob,
            size: encoded.blob.size, sha256: hash, hash, updatedAt, updated_at: updatedAt,
            compression: { version: 1, codec: 'opus', bitRate: 64000, sha256: hash } };
    }

    // Called synchronously from the Save/file-selection gesture, before hashing
    // or parsing. Automatic compression is opt-in and failure falls back to the
    // uncompressed incoming file, never to removal of an existing library entry.
    function startAutomaticCompression() {
        if (!isAutoCompressionEnabled()) return null;
        const job = { automatic: true, cancelled: false, abortCurrent: null, done: 0, total: 0,
            changed: 0, skipped: 0, failed: 0, savedBytes: 0, savedByKey: new Map() };
        const session = { job, context: null, error: '', adminMode: state.adminMode, adminBusy: state.adminBusy };
        state.compressionJob = job;
        state.adminMode = true;
        state.adminBusy = true;
        try {
            session.context = createCompressionContext();
            session.ready = resumeCompressionContext(session.context, job);
        } catch (error) { session.ready = Promise.reject(error); }
        session.ready = session.ready.catch((error) => { session.error = errorMessage(error); });
        renderPanel();
        return session;
    }

    async function automaticallyCompressRecords(records, session) {
        if (!session) return records;
        const { job, context } = session;
        await session.ready;
        for (let index = 0; index < records.length; index += 1) {
            if (job.cancelled) throw new DOMException('Audio compression cancelled.', 'AbortError');
            const before = records[index];
            if (session.updateProgress) session.updateProgress('autoCompressionProgress', compressionSummary(job));
            else {
                if (state.refs) setPanelMessage('autoCompressionProgress', compressionSummary(job));
                renderPanel();
            }
            try {
                if (session.error) throw new Error(renderMessage(session.error));
                const after = await compressAudioEntry(before, context, job);
                if (after) {
                    records[index] = after;
                    job.changed += 1;
                    job.savedBytes += before.blob.size - after.blob.size;
                    job.savedByKey.set(before.sentenceKey, before.blob.size - after.blob.size);
                } else job.skipped += 1;
            } catch (error) {
                if (job.cancelled || error?.name === 'AbortError') throw error;
                job.failed += 1;
                console.warn('[BunPro Local Audio] Auto compression kept the incoming original:', error);
            }
            job.done += 1;
        }
        if (job.cancelled) throw new DOMException('Audio compression cancelled.', 'AbortError');
        return records;
    }

    function automaticCompressionMessage(session) {
        if (!session) return null;
        return session.error
            ? { key: 'autoCompressionUnavailable', vars: { error: session.error } }
            : { key: 'autoCompressionSummary', vars: compressionSummary(session.job) };
    }

    async function finishAutomaticCompression(session) {
        if (!session) return;
        session.job.cancelReady?.();
        session.job.abortCurrent?.();
        if (session.context) await session.context.close().catch(() => {});
        if (state.compressionJob === session.job) state.compressionJob = null;
        state.adminMode = session.adminMode;
        state.adminBusy = session.adminBusy;
        renderPanel();
    }

    async function handleCompressAudio() {
        if (state.compressionJob) {
            if (state.compressionJob.committing) return;
            state.compressionJob.cancelled = true;
            state.compressionJob.abortCurrent?.();
            state.compressionJob.cancelReady?.();
            setPanelMessage('compressionCancelling');
            renderPanel();
            return;
        }
        if (state.adminBusy || !window.confirm(t('compressionConfirm'))) return;
        const job = { cancelled: false, abortCurrent: null, done: 0, total: 0,
            changed: 0, skipped: 0, failed: 0, savedBytes: 0 };
        state.compressionJob = job;
        resetCleanConfirmation();
        setAdminBusy(true, 'compressionStarting');
        let context;
        try {
            context = createCompressionContext();
            // Resume here, still inside the button's user activation, before any DB awaits.
            await resumeCompressionContext(context, job);
            const inventory = await dbAudioInventory();
            job.total = inventory.count;
            for (const key of inventory.keys) {
                if (job.cancelled) break;
                setPanelMessage('compressionProgress', compressionSummary(job));
                renderPanel();
                const before = await dbGet(key);
                if (job.cancelled) break;
                if (!(before?.blob instanceof Blob)) {
                    job.skipped += 1;
                    job.done += 1;
                    continue;
                }
                let after;
                try {
                    after = await compressAudioEntry(before, context, job);
                } catch (error) {
                    if (job.cancelled || error?.name === 'AbortError') break;
                    // Undecodable clips remain untouched; one bad file doesn't block the library.
                    job.failed += 1;
                    job.done += 1;
                    console.warn('[BunPro Local Audio] Compression skipped a failed clip:', error);
                    continue;
                }
                if (job.cancelled) break;
                if (!after) {
                    job.skipped += 1;
                } else {
                    // Storage failures stop the batch; they do not discard originals.
                    if (await dbReplaceCompressed(before, after)) {
                        job.changed += 1;
                        job.savedBytes += before.blob.size - after.blob.size;
                    } else {
                        job.skipped += 1;
                    }
                }
                job.done += 1;
            }
            setPanelMessage(job.cancelled ? 'compressionCancelled' : 'compressionComplete', compressionSummary(job));
        } catch (error) {
            setPanelMessage(job.cancelled ? 'compressionCancelled' : 'compressionFailed',
                { ...compressionSummary(job), error: errorMessage(error) });
        } finally {
            job.abortCurrent?.();
            if (context) await context.close().catch(() => {});
            state.compressionJob = null;
            state.adminBusy = false;
            setUiBusy(false);
            if (job.changed) invalidateLookupAfterDatabaseChange();
            await refreshAdminStats();
            applyPanelTranslations();
            renderPanel();
        }
    }

    async function handleExport() {
        if (state.adminBusy) return;
        const filename = backupFileName();
        let saveChoice;
        try {
            saveChoice = await chooseBackupSaveHandle(filename);
            if (saveChoice.cancelled) return;
        } catch (error) {
            setPanelMessage('exportFailed', { error: errorMessage(error) });
            renderPanel();
            return;
        }

        setAdminBusy(true, 'exporting');
        try {
            const entries = await dbGetAll();
            const { blob: backupBlob, count } = await buildBackupBlob(entries);
            if (!count) {
                setPanelMessage('noOverridesToExport');
                return;
            }

            if (saveChoice.handle) {
                const writable = await saveChoice.handle.createWritable();
                try {
                    await writable.write(backupBlob);
                    await writable.close();
                } catch (error) {
                    try { await writable.abort(); } catch (_) { /* Report the write error, not the discard. */ }
                    throw error;
                }
            } else {
                downloadBlob(backupBlob, filename);
            }
            setPanelMessage('exportComplete', {
                count,
                size: formatBytes(backupBlob.size),
            });
        } catch (error) {
            setPanelMessage('exportFailed', { error: errorMessage(error) });
        } finally {
            state.adminBusy = false;
            setUiBusy(false);
            renderPanel();
        }
    }

    function requestImport(mode) {
        if (state.adminBusy || !state.refs?.importFileInput) return;
        state.pendingImportMode = mode === 'replace' ? 'replace' : 'keep';
        state.refs.importFileInput.value = '';
        state.refs.importFileInput.click();
    }

    async function handleImport(file, mode) {
        if (state.adminBusy) return;
        const replace = mode === 'replace';
        const automatic = startAutomaticCompression();
        let committedCount = 0;
        let total = 0;
        let complete = false;
        let lastProgress = -Infinity;
        let progressTimer = null;
        let pendingProgress = null;
        function flushProgress() {
            progressTimer = null;
            lastProgress = performance.now();
            setPanelMessage(pendingProgress.key, pendingProgress.vars);
            renderPanel();
        }
        function updateProgress(key, vars) {
            pendingProgress = { key, vars };
            const delay = 250 - (performance.now() - lastProgress);
            if (delay <= 0) {
                clearTimeout(progressTimer);
                flushProgress();
            } else if (progressTimer === null) {
                progressTimer = setTimeout(flushProgress, delay);
            }
        }
        function checkCancelled() {
            if (automatic?.job.cancelled) throw new DOMException('Import cancelled.', 'AbortError');
        }
        if (automatic) automatic.updateProgress = updateProgress;
        setAdminBusy(true, 'importing');
        try {
            const { descriptors } = await scanBackupFile(file, automatic?.job, {
                onProgress: (done, count) => updateProgress('importCheckingProgress', { done, total: count }),
            });
            const inventory = await dbAudioInventory();
            const existingKeys = new Set(inventory.presentKeys);
            const writes = descriptors.filter((descriptor) => replace || !existingKeys.has(descriptor.sentenceKey));
            let imported = 0;
            let skipped = descriptors.length - writes.length;
            let replaced = 0;
            total = writes.length;
            if (automatic) automatic.job.total = total;

            for (let offset = 0; offset < writes.length;) {
                checkCancelled();
                if (!automatic) updateProgress('importWritingProgress', { done: offset, total });
                const batch = [];
                let bytes = 0;
                // A clip larger than the target gets its own batch. No decoded
                // records from a previous commit survive into the next read.
                while (offset < writes.length) {
                    const descriptor = writes[offset];
                    if (batch.length && bytes + descriptor.size > CONFIG.IMPORT_BATCH_BYTES) break;
                    checkCancelled();
                    batch.push(await readBackupEntry(file, descriptor.range, descriptor.sha256));
                    bytes += descriptor.size;
                    offset += 1;
                }
                await automaticallyCompressRecords(batch, automatic);
                checkCancelled();
                if (automatic) { automatic.job.committing = true; renderPanel(); }
                let committed;
                try {
                    committed = await dbPutMany(batch, { keepExisting: !replace });
                } finally {
                    if (automatic) { automatic.job.committing = false; renderPanel(); }
                }
                imported += committed.imported;
                replaced += committed.replaced;
                skipped += committed.skipped;
                committedCount += committed.imported + committed.replaced;
                if (automatic) {
                    for (const key of committed.skippedKeys) {
                        if (!automatic.job.savedByKey.has(key)) continue;
                        automatic.job.changed -= 1;
                        automatic.job.skipped += 1;
                        automatic.job.savedBytes -= automatic.job.savedByKey.get(key);
                        automatic.job.savedByKey.delete(key);
                    }
                }
                if (!automatic) updateProgress('importWritingProgress', { done: offset, total });
            }
            checkCancelled();
            complete = true;
            try { void navigator.storage?.persist?.(); } catch { /* best effort */ }
            setPanelMessage(replace ? 'importSummaryReplace' : 'importSummaryKeep',
                { imported, replaced, skipped }, automaticCompressionMessage(automatic));
        } catch (error) {
            if (committedCount) {
                setPanelMessage(error?.name === 'AbortError' ? 'importPartialCancelled' : 'importPartialFailed',
                    { committed: committedCount, total, error: errorMessage(error) });
            } else {
                setPanelMessage(error?.name === 'AbortError' ? 'autoCompressionCancelled' : 'importFailed',
                    { error: errorMessage(error) });
            }
        } finally {
            clearTimeout(progressTimer);
            if (complete || committedCount) {
                invalidateLookupAfterDatabaseChange();
                await refreshAdminStats();
            }
            await finishAutomaticCompression(automatic);
            state.adminBusy = false;
            setUiBusy(false);
            renderPanel();
        }
    }

    async function handleCleanDatabase() {
        if (state.adminBusy) return;
        if (!state.cleanConfirmArmed) {
            state.cleanConfirmArmed = true;
            state.refs.cleanButton.dataset.confirm = 'true';
            state.refs.cleanButton.textContent = t('confirmClean');
            setPanelMessage('cleanWarning');
            if (state.cleanConfirmTimer) clearTimeout(state.cleanConfirmTimer);
            state.cleanConfirmTimer = setTimeout(() => {
                resetCleanConfirmation();
                renderPanel();
            }, CONFIG.CLEAN_CONFIRM_TIMEOUT_MS);
            renderPanel();
            return;
        }

        resetCleanConfirmation();
        setAdminBusy(true, 'cleaning');
        try {
            const entries = await dbGetAll();
            const count = entries.filter((entry) => entry?.blob instanceof Blob).length;
            await dbClear();
            invalidateLookupAfterDatabaseChange();
            setPanelMessage('cleaned', { count });
            await refreshAdminStats();
        } catch (error) {
            setPanelMessage('databaseError', { error: errorMessage(error) });
        } finally {
            state.adminBusy = false;
            setUiBusy(false);
            renderPanel();
        }
    }

    function schedulePanelPosition() {
        if (state.panelPositionScheduled) return;
        state.panelPositionScheduled = true;
        requestAnimationFrame(() => {
            state.panelPositionScheduled = false;
            positionPanel();
        });
    }

    function findQuizActionControlsAnchor() {
        const answer = findQuizAnswerContainer();
        if (!answer?.parentElement) return null;

        // The footer's native player, Undo / Show Info / Alternatives row, and
        // .bp-quiz-console are direct siblings in that order. With no visible player,
        // anchoring above the answer console would overlap the action row. Use the
        // nearest preceding visible controls sibling, excluding player wrappers.
        const siblings = [...answer.parentElement.children];
        for (let index = siblings.indexOf(answer) - 1; index >= 0; index -= 1) {
            const candidate = siblings[index];
            if (
                candidate === state.playerWrapper ||
                candidate.getAttribute?.(LOCAL_PLAYER_OWNED_ATTR) === 'true' ||
                hasAudioPlayerShape(candidate) ||
                !isElementRendered(candidate)
            ) {
                continue;
            }
            if (candidate.matches?.('ul, nav, [role="toolbar"]') || candidate.querySelector?.('button')) {
                return candidate;
            }
        }
        return null;
    }

    function findPanelAnchor() {
        if (state.playerOpen && state.playerWrapper?.isConnected && isElementRendered(state.playerWrapper)) {
            return state.playerWrapper;
        }
        return findVisibleBunproAudioPlayer()
            || document.querySelector('#js-tour-quiz-pam')
            || findQuizActionControlsAnchor()
            || findQuizAnswerContainer();
    }

    function positionPanel() {
        const panel = state.panel;
        if (!panel || panel.hidden) return;

        const anchor = findPanelAnchor();
        if (!anchor || !anchor.isConnected) {
            if (state.compressionJob) {
                panel.style.left = `${Math.round(window.innerWidth / 2)}px`;
                panel.style.top = `${CONFIG.PANEL_EDGE_PX}px`;
            } else panel.hidden = true;
            return;
        }

        const anchorRect = anchor.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const gap = CONFIG.PANEL_GAP_PX;
        const edge = CONFIG.PANEL_EDGE_PX;
        const width = panelRect.width;
        const halfWidth = width / 2;

        let centerX = anchorRect.left + anchorRect.width / 2;
        centerX = Math.max(edge + halfWidth, Math.min(window.innerWidth - edge - halfWidth, centerX));

        const top = Math.max(edge, anchorRect.top - panelRect.height - gap);
        panel.style.left = `${Math.round(centerX)}px`;
        panel.style.top = `${Math.round(top)}px`;
    }

    function ensurePanelPlacement(visible) {
        const anchor = findPanelAnchor();
        if (!anchor && !state.compressionJob) {
            if (state.panel) state.panel.hidden = true;
            return;
        }

        const panel = state.panel || createPanel();
        const portal = document.body || document.documentElement;
        if (panel.parentElement !== portal) portal.append(panel);

        panel.hidden = !visible && !state.compressionJob;
        if (!panel.hidden) schedulePanelPosition();
    }

    function setUiBusy(busy, key, vars = {}) {
        if (!state.refs) return;
        const hasSelectedFile = Boolean(getSelectedFile());
        state.refs.fileInput.disabled = busy;
        state.refs.chooseAudioButton.disabled = busy;
        state.refs.saveButton.disabled = busy || !hasSelectedFile;
        state.refs.testButton.disabled = busy || (!hasSelectedFile && !state.overrideFound);
        state.refs.deleteButton.disabled = busy || !state.overrideFound;
        state.refs.adminButton.disabled = busy;
        state.refs.exportButton.disabled = busy;
        state.refs.importButton.disabled = busy;
        state.refs.importReplaceButton.disabled = busy;
        state.refs.compressButton.disabled = busy && !state.compressionJob;
        state.refs.autoCompressInput.disabled = busy;
        state.refs.cleanButton.disabled = busy;
        state.refs.backButton.disabled = busy;
        state.refs.fallbackRate.disabled = busy;
        state.refs.languageSelect.disabled = busy;
        renderVoicevoxControls();
        if (key !== undefined) setPanelMessage(key, vars);
        else renderPanelMessage();
    }

    async function handleSave() {
        ensureStateMatchesPage();
        if (!state.eligible || !state.normalizedSentence) return;

        let selectedFile;
        try {
            selectedFile = validateSelectedFile(getSelectedFile());
        } catch (error) {
            setPanelMessageFromError(error);
            renderPanel();
            return;
        }

        setUiBusy(true, 'saving');
        const sentence = state.normalizedSentence;
        try {
            const payload = await saveOverride(sentence, selectedFile);
            const entry = payload.entry;
            lookupCache.set(sentence, { found: true, entry });
            setPanelMessage('saved', {}, payload.compressionMessage);
            // Encoding can outlive the current question. Save its original key,
            // but do not paint that entry onto a different question's player.
            if (state.normalizedSentence !== sentence) return;
            state.lookupStatus = 'ready';
            state.lookupError = null;
            state.overrideFound = true;
            state.entry = entry;
            stopLocalAudio();
            releaseObjectUrl();
            releasePreviewObjectUrl();
            clearSelectedFile();
            void prepareLocalAudioElement(entry).catch((error) => {
                if (state.normalizedSentence !== sentence) return;
                state.lookupError = { key: 'savePreloadFailed', vars: { error: errorMessage(error) } };
                renderPanel();
            });
        } catch (error) {
            if (error?.name === 'AbortError') {
                setPanelMessage('autoCompressionCancelled');
                return;
            }
            if (state.normalizedSentence === sentence) {
                state.lookupStatus = 'error';
                state.lookupError = error.translation || { key: null, vars: { error: error.message } };
            }
            setPanelMessageFromError(error);
        } finally {
            setUiBusy(false);
            renderPanel();
        }
    }

    async function handleDelete() {
        ensureStateMatchesPage();
        if (!state.eligible || !state.overrideFound) return;

        setUiBusy(true, 'deleting');
        try {
            await deleteOverride(state.normalizedSentence);
            lookupCache.set(state.normalizedSentence, { found: false, entry: null });
            releaseLocalOverrideUi();
            releaseObjectUrl();
            releasePreviewObjectUrl();
            clearSelectedFile();
            state.lookupStatus = 'ready';
            state.lookupError = null;
            state.overrideFound = false;
            state.entry = null;
            releasePRoute();
            setPanelMessage('deleted');
        } catch (error) {
            state.lookupError = error.translation || { key: null, vars: { error: error.message } };
            setPanelMessageFromError(error);
        } finally {
            setUiBusy(false);
            renderPanel();
        }
    }

    async function handleTest() {
        ensureStateMatchesPage();
        if (!state.eligible) return;

        const selectedFile = getSelectedFile();
        const displayName = selectedFile?.name || (state.overrideFound ? entryFileName(state.entry) : '');
        if (!selectedFile && !state.overrideFound) {
            setPanelMessage('noFileSelected');
            renderPanel();
            return;
        }

        setUiBusy(true, 'testingFile', { file: displayName });
        try {
            if (selectedFile) await playSourcePreview(selectedFile);
            else await playLocalAudio(state.entry, { restart: true, openPlayer: true });
            state.lookupError = null;
            setPanelMessage('testStarted');
        } catch (error) {
            state.lookupError = error.translation || { key: null, vars: { error: error.message } };
            setPanelMessage('testFailed', { error: errorMessage(error) });
        } finally {
            setUiBusy(false);
            renderPanel();
        }
    }

    function renderPanel() {
        syncLocalOverrideUi();
        if (!state.panel || !state.refs) return;
        state.panel.hidden = !state.eligible && !state.compressionJob;
        if (state.panel.hidden) return;

        const refs = state.refs;
        renderPanelMessage();
        renderVoicevoxControls();
        refs.mainView.hidden = state.adminMode;
        refs.adminView.hidden = !state.adminMode;
        state.panel.classList.toggle('bp-local-audio-panel--admin', state.adminMode);
        refs.languageSelect.value = getUiLanguageSetting();

        if (state.adminMode) {
            refs.title.textContent = t('adminTitle');
            const stats = state.adminStats;
            refs.sentence.textContent = stats.loading
                ? t('adminStatsLoading')
                : (stats.error
                    ? renderMessage({ key: 'databaseError', vars: { error: stats.error } })
                    : t('adminStats', { count: stats.count, size: formatBytes(stats.totalBytes) }));
            refs.sentence.title = refs.sentence.textContent;
            refs.status.textContent = '';
            refs.status.dataset.kind = 'none';
            refs.cleanButton.textContent = state.cleanConfirmArmed ? t('confirmClean') : t('cleanDatabase');
            refs.cleanButton.dataset.confirm = state.cleanConfirmArmed ? 'true' : 'false';
            const disabled = state.adminBusy;
            refs.exportButton.disabled = disabled;
            refs.importButton.disabled = disabled;
            refs.importReplaceButton.disabled = disabled;
            refs.compressButton.textContent = t(state.compressionJob ? 'cancelCompression' : 'compressAudio');
            refs.compressButton.disabled = state.compressionJob
                ? Boolean(state.compressionJob.cancelled || state.compressionJob.committing) : disabled;
            refs.autoCompressInput.checked = isAutoCompressionEnabled();
            refs.autoCompressInput.disabled = disabled;
            refs.cleanButton.disabled = disabled;
            refs.backButton.disabled = disabled;
            schedulePanelPosition();
            return;
        }

        refs.title.textContent = t('panelTitle');
        refs.sentence.textContent = state.sentence
            ? t('sentencePrefix', { sentence: state.sentence })
            : t('sentenceUnreadable');
        refs.sentence.title = state.sentence || '';
        refs.fallbackRate.value = String(getFallbackRate());
        refs.languageSelect.value = getUiLanguageSetting();
        applyRecordingControlTranslations();

        let statusText = t('statusNone');
        let statusKind = 'none';
        if (state.lookupStatus === 'loading') {
            statusText = t('statusLoading');
            statusKind = 'loading';
        } else if (state.lookupStatus === 'error') {
            statusText = t('statusServiceError');
            statusKind = 'error';
        } else if (state.overrideFound) {
            statusText = state.audio && !state.audio.paused ? t('statusPlaying') : t('statusFound');
            statusKind = 'found';
        } else if (state.lookupError) {
            statusText = renderMessage(state.lookupError);
            statusKind = 'error';
        }
        refs.status.textContent = statusText;
        refs.status.dataset.kind = statusKind;
        refs.status.title = renderMessage(state.lookupError) || statusText;

        const speed = detectPlaybackRate();
        const speedText = t('speedCurrent', {
            rate: rateToPercent(speed.rate),
            source: t(speed.sourceKey),
        });
        refs.fallbackControl.title = speedText;
        refs.fallbackLabel.title = speedText;
        refs.fallbackRate.title = speedText;

        const selectedFile = getSelectedFile();
        refs.fileInput.title = selectedFile?.name || t('chooseFile');
        refs.fileName.textContent = selectedFile?.name || '';
        refs.fileName.title = selectedFile?.name || '';
        refs.fileName.hidden = !selectedFile;
        refs.chooseAudioButton.disabled = refs.fileInput.disabled;
        refs.saveButton.disabled = refs.fileInput.disabled || !selectedFile;
        refs.testButton.disabled = refs.fileInput.disabled || (!selectedFile && !state.overrideFound);
        refs.deleteButton.disabled = refs.fileInput.disabled || !state.overrideFound;
        refs.adminButton.disabled = refs.fileInput.disabled;
        schedulePanelPosition();
    }

    function scheduleSync() {
        if (state.syncScheduled) return;
        state.syncScheduled = true;
        setTimeout(() => {
            state.syncScheduled = false;
            ensureStateMatchesPage();
        }, 50);
    }

    // The local player writes progress width and remaining time every frame.
    // Ignore those owned mutations to avoid repeatedly reading page context and
    // rerendering the panel at the sync debounce limit of 20 Hz during playback.
    function isSelfOwnedNode(node) {
        const element = node instanceof Element
            ? node
            : node?.parentElement || null;
        if (!element) return false;
        return Boolean(
            element.closest?.(
                `#bp-local-audio-panel, #${LOCAL_SPEED_MENU_ID}, [${LOCAL_PLAYER_OWNED_ATTR}="true"], #${LOCAL_PLAYER_WRAPPER_ID}`
            )
        );
    }

    function onPageMutations(records) {
        for (const record of records) {
            if (!isSelfOwnedNode(record.target)) {
                scheduleSync();
                return;
            }
        }
    }

    function installObserver() {
        const root = document.documentElement;
        if (!root) {
            setTimeout(installObserver, 25);
            return;
        }

        const observer = new MutationObserver(onPageMutations);
        observer.observe(root, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: [
                'data-meta-is-correct',
                'data-meta-is-post-attempt',
                'data-meta-is-loading',
                'data-meta-question-mode',
                'href',
                'readonly',
                'lang',
                'class',
                'disabled',
                'aria-disabled',
            ],
        });

        // The observer filters attributes and ignores text-node changes; 750 ms
        // polling catches page updates that those mutation filters cannot see.
        window.setInterval(scheduleSync, CONFIG.SYNC_INTERVAL_MS);
        scheduleSync();
    }

    addStyle(`
        #bp-local-audio-panel {
            position: fixed;
            z-index: 20;
            left: 50%;
            top: 0;
            transform: translateX(-50%);
            width: min(52rem, calc(100vw - 2rem));
            box-sizing: border-box;
            margin: 0;
            pointer-events: auto;
            padding: 0.3rem 0.4rem;
            border: 1px solid rgba(127, 127, 127, 0.35);
            border-radius: 0.45rem;
            background: rgba(127, 127, 127, 0.08);
            color: inherit;
            font-size: 0.72rem;
            line-height: 1.15;
        }
        #bp-local-audio-panel[hidden] { display: none !important; }
        #bp-local-audio-panel .bp-local-audio__top-row,
        #bp-local-audio-panel .bp-local-audio__control-row {
            display: flex;
            align-items: center;
            min-width: 0;
            gap: 0.3rem;
        }
        #bp-local-audio-panel .bp-local-audio__top-row {
            flex-wrap: wrap;
            min-height: 1.15rem;
            margin-bottom: 0.25rem;
        }
        #bp-local-audio-panel [hidden] { display: none !important; }
        #bp-local-audio-panel .bp-local-audio__control-row {
            flex-wrap: wrap;
            column-gap: 0.65rem;
        }
        #bp-local-audio-panel .bp-local-audio__control-group {
            display: flex;
            align-items: center;
            flex: 0 1 auto;
            min-width: 0;
            max-width: 100%;
            gap: 0.3rem;
            white-space: nowrap;
        }
        #bp-local-audio-panel .bp-local-audio__admin-view {
            justify-content: center;
        }
        #bp-local-audio-panel .bp-local-audio__voicevox-settings {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 0.4rem;
            flex: 1 1 100%;
            min-width: 0;
        }
        #bp-local-audio-panel .bp-local-audio__voicevox-settings label {
            display: flex;
            align-items: center;
            gap: 0.3rem;
            max-width: 100%;
        }
        #bp-local-audio-panel .bp-local-audio__voicevox-settings select,
        #bp-local-audio-panel .bp-local-audio__voicevox-settings input {
            min-width: 0;
            max-width: 18rem;
        }
        #bp-local-audio-panel [data-role="clean"][data-confirm="true"] {
            font-weight: 700;
            outline: 2px solid rgba(220, 80, 80, 0.55);
        }
        #bp-local-audio-panel [data-role="title"] {
            flex: 0 0 auto;
            white-space: nowrap;
        }
        #bp-local-audio-panel .bp-local-audio__sentence {
            flex: 1 1 15rem;
            min-width: 4rem;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            opacity: 0.78;
        }
        #bp-local-audio-panel .bp-local-audio__message {
            min-height: 1.25em;
            margin-bottom: 0.25rem;
            white-space: normal;
            overflow-wrap: anywhere;
            line-height: 1.25;
            opacity: 0.92;
        }
        #bp-local-audio-panel .bp-local-audio__status {
            flex: 0 1 auto;
            min-width: 0;
            max-width: 100%;
            white-space: normal;
            overflow-wrap: anywhere;
            text-align: right;
            opacity: 0.85;
        }
        #bp-local-audio-panel .bp-local-audio__status:empty { display: none; }
        #bp-local-audio-panel .bp-local-audio__status[data-kind="found"] { font-weight: 700; }
        #bp-local-audio-panel .bp-local-audio__status[data-kind="error"] { text-decoration: underline; }
        #bp-local-audio-panel input,
        #bp-local-audio-panel select,
        #bp-local-audio-panel button {
            box-sizing: border-box;
            height: 1.7rem;
            min-height: 1.7rem;
            border: 1px solid rgba(127, 127, 127, 0.45);
            border-radius: 0.32rem;
            background: rgba(127, 127, 127, 0.08);
            color: inherit;
            font: inherit;
        }
        #bp-local-audio-panel input {
            flex: 1 1 22rem;
            min-width: 8rem;
            width: auto;
            padding: 0.1rem 0.4rem;
        }
        #bp-local-audio-panel .bp-local-audio__file-name {
            min-width: 0;
            max-width: 12rem;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            opacity: 0.78;
        }
        #bp-local-audio-panel .bp-local-audio__auto-compress {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            max-width: 100%;
            padding: 0.15rem 0.25rem;
            line-height: 1.25;
            cursor: pointer;
        }
        #bp-local-audio-panel .bp-local-audio__auto-compress input[type="checkbox"] {
            flex: 0 0 auto;
            width: 1rem;
            height: 1rem;
            min-width: 1rem;
            min-height: 1rem;
            margin: 0;
            padding: 0;
            appearance: auto;
        }
        #bp-local-audio-panel .bp-local-audio__auto-compress:has(input:disabled) {
            opacity: 0.55;
            cursor: default;
        }
        #bp-local-audio-panel button {
            flex: 0 0 auto;
            padding: 0.1rem 0.52rem;
            cursor: pointer;
        }
        #bp-local-audio-panel select {
            padding: 0.05rem 0.22rem;
        }
        #bp-local-audio-panel .bp-local-audio__speed-control {
            display: flex;
            align-items: center;
            flex: 0 0 auto;
            gap: 0.2rem;
            white-space: nowrap;
        }
        #bp-local-audio-panel .bp-local-audio__language {
            flex: 0 0 auto;
            width: auto;
            height: 1.3rem;
            min-height: 1.3rem;
            padding: 0 0.18rem;
        }
        #bp-local-audio-panel button:disabled,
        #bp-local-audio-panel input:disabled,
        #bp-local-audio-panel select:disabled {
            opacity: 0.45;
            cursor: default;
        }
        #bp-local-audio-panel button[data-role="recording-toggle"][data-active="true"] {
            border-color: rgba(220, 68, 68, 0.75);
            color: rgb(220, 68, 68);
        }
        #bp-local-audio-panel button[data-role="recording-toggle"][data-active="false"] {
            opacity: 0.65;
        }
        .${NATIVE_AUDIO_HIDDEN_CLASS} {
            display: none !important;
        }
        #${SYNTHETIC_PLAY_BUTTON_ID} {
            flex: 0 0 auto;
            appearance: none;
            border: 0;
            padding: 0;
            background: transparent;
            color: inherit;
        }
        [${LOCAL_PLAYER_OWNED_ATTR}="true"] button[data-bp-local-player-role="play"],
        [${LOCAL_PLAYER_OWNED_ATTR}="true"] button[data-bp-local-player-role="scrub"],
        [${LOCAL_PLAYER_OWNED_ATTR}="true"] button[data-bp-local-player-role="settings"] {
            pointer-events: auto !important;
        }
        [${LOCAL_PLAYER_OWNED_ATTR}="true"] button[aria-label*="Scrub" i],
        [${LOCAL_PLAYER_OWNED_ATTR}="true"] [data-bp-local-player-role="scrub"] {
            touch-action: none;
            cursor: pointer;
        }
        #${LOCAL_SPEED_MENU_ID} {
            position: fixed;
            z-index: 70;
            box-sizing: border-box;
            min-width: 9.5rem;
            max-width: min(18rem, calc(100vw - 1rem));
            padding: 0.45rem;
            border: 1px solid rgb(var(--c-rim) / 1);
            border-radius: 0.5rem;
            background: rgb(var(--c-secondary-bg) / 1);
            color: rgb(var(--c-primary-fg) / 1);
            box-shadow: 0 0.35rem 1.1rem rgba(0, 0, 0, 0.25);
            font-size: 0.78rem;
        }
        #${LOCAL_SPEED_MENU_ID}[hidden] { display: none !important; }
        #${LOCAL_SPEED_MENU_ID} .bp-local-audio-speed-menu__label {
            margin: 0 0 0.35rem;
            font-weight: 700;
        }
        #${LOCAL_SPEED_MENU_ID} .bp-local-audio-speed-menu__options {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0.25rem;
        }
        #${LOCAL_SPEED_MENU_ID} button {
            min-height: 1.65rem;
            padding: 0.15rem 0.35rem;
            border: 1px solid rgb(var(--c-rim) / 1);
            border-radius: 0.35rem;
            background: rgb(var(--c-tertiary-bg) / 1);
            color: inherit;
            cursor: pointer;
        }
        #${LOCAL_SPEED_MENU_ID} button[aria-checked="true"] {
            color: rgb(var(--c-primary-accent) / 1);
            font-weight: 700;
            outline: 2px solid rgb(var(--c-primary-accent) / 0.45);
        }
    `);

    // Install at document-start before BunPro creates detached Audio elements,
    // so their first playback and rate assignment are observed.
    installMediaElementTracking();
    // Open the database early so the first P after reveal is unlikely to race
    // the initial IndexedDB connection.
    void openAudioDb().then(() => preloadLookupCache())
        .catch((error) => debug('IndexedDB warm-up failed', error));

    navigator.mediaDevices?.addEventListener?.('devicechange', onMicrophoneDeviceChange);
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('click', onClick, true);
    // Document capture covers DOM media; trackMediaElement() attaches listeners
    // directly to detached elements because their events cannot reach document.
    ['ended', 'error', 'abort', 'emptied'].forEach((eventName) => {
        document.addEventListener(eventName, onBunproPageMediaStateChanged, true);
    });
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', (event) => finishPointerSeek(event, false), true);
    document.addEventListener('pointercancel', (event) => finishPointerSeek(event, true), true);
    // This teardown permanently releases resources. Using pagehide would leave
    // a back/forward-cache restore half-initialized, so reserve it for beforeunload.
    window.addEventListener('beforeunload', () => {
        cancelVoicevox(false);
        navigator.mediaDevices?.removeEventListener?.('devicechange', onMicrophoneDeviceChange);
        if (state.compressionJob) {
            state.compressionJob.cancelled = true;
            state.compressionJob.abortCurrent?.();
            state.compressionJob.cancelReady?.();
        }
        releaseRecordingResources();
        releaseLocalOverrideUi();
        releaseObjectUrl();
        releasePreviewObjectUrl();
        state.speedMenu?.remove();
        if (state.cleanConfirmTimer) clearTimeout(state.cleanConfirmTimer);
    });
    window.addEventListener('resize', schedulePanelPosition, { passive: true });
    window.addEventListener('scroll', schedulePanelPosition, { passive: true, capture: true });
    window.visualViewport?.addEventListener('resize', schedulePanelPosition, { passive: true });
    window.visualViewport?.addEventListener('scroll', schedulePanelPosition, { passive: true });

    // Diagnostics intentionally expose a snapshot rather than MediaStream, Blob,
    // AudioContext, or element references to the page's main JavaScript world.
    try {
        Object.defineProperty(window, '__bpLocalAudio', {
            value: Object.freeze({
                version: CONFIG.SCRIPT_VERSION,
                active: true,
                debug: (on = true) => {
                    CONFIG_DEBUG_OVERRIDE.enabled = Boolean(on);
                    return CONFIG_DEBUG_OVERRIDE.enabled;
                },
                snapshot: () => Object.freeze({
                    eligible: state.eligible,
                    lookupStatus: state.lookupStatus,
                    overrideFound: state.overrideFound,
                    localAudioPlaying: isLocalAudioPlaying(),
                    nativeAudioPlaying: isNativeBunproAudioPlaying(),
                    recordingEnabled: isRecordingEnabled(),
                    recordingActive: Boolean(state.recordingSession),
                    recordingReady: Boolean(state.recordingBlob),
                    microphoneActive: isMicStreamUsable(state.micStream),
                    microphoneRequestPending: Boolean(state.micRequest),
                    microphoneRetryInMs: Math.max(0, Math.ceil(state.micRetryAfter - performance.now())),
                    micProcessingMode: getMicProcessingMode(),
                    recordingGain: getRecordingGain(),
                    observedPlaybackRate: state.observedPagePlaybackRate,
                    trackedMediaCount: [...trackedMediaElements].length,
                }),
                releaseMic: () => releaseMicrophoneStream('manual'),
                setRecordingEnabled,
                setMicProcessingMode,
                setRecordingGain,
            }),
            configurable: true,
        });
    } catch {
        // A page-owned property with this name does not affect core behavior.
    }
    installObserver();
})();
