// The fixture is synthetic markup; recorded engine responses stay unchanged.
window.runVoicevoxRegression = async fixtures => {
    const api = window.__voicevoxTest;
    const checks = [];
    const root = document.querySelector('.text-center');
    function check(condition, label) {
        if (!condition) throw new Error(label);
        checks.push(label);
    }
    function equal(actual, expected, label) {
        check(JSON.stringify(actual) === JSON.stringify(expected),
            label + ' expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
    }
    function extract(html) {
        // All HTML comes from the repository fixture or literal regression cases.
        root.innerHTML = html;
        const before = root.innerHTML;
        const result = api.extractVoicevoxReading(root);
        check(root.innerHTML === before, 'extraction leaves the DOM unchanged');
        return result;
    }
    function ruby(reading) {
        root.replaceChildren();
        const annotation = document.createElement('ruby');
        annotation.append(document.createTextNode('語'));
        const rt = document.createElement('rt');
        rt.textContent = reading;
        annotation.append(rt);
        root.append(annotation);
        return api.extractVoicevoxReading(root);
    }
    function correction(reading, kana) {
        const alignment = api.alignVoicevoxReading(ruby(reading), {kana});
        return api.buildVoicevoxKana(alignment);
    }
    function canonical(value) {
        return api.canonicalizeReadingMoras(api.splitReadingMoras(value));
    }
    try {
        for (const item of fixtures.cases) {
            const sentence = extract(item.html);
            equal(sentence.surface, item.surface, item.id + ' surface');
            equal(sentence.text, item.surface.normalize('NFKC'), item.id + ' TTS NFKC');
            equal(sentence.reading, item.reading, item.id + ' reading');
            const result = api.alignVoicevoxReading(sentence, {kana: item.engineKana1});
            equal(result.status, item.expect === 'corrected' ? 'mismatch' : item.expect, item.id + ' classification');
            equal(result.misread.map(segment => segment.surface), item.misread || [], item.id + ' misread');
            equal(sentence.hasUnknown, item.reading === null, item.id + ' unknown flag');
            if (item.expect === 'corrected') {
                equal(api.buildVoicevoxText(sentence, result), item.level2Text, item.id + ' level 2 text');
                equal(api.alignVoicevoxReading(sentence, {kana: item.engineKana2}).status, 'matched', item.id + ' level 2 reading');
                for (const segment of result.misread) {
                    check(segment.engineReading.length > 0 && segment.reading.length > 0,
                        item.id + ' reports engine and expected ruby readings');
                }
            } else {
                equal(api.buildVoicevoxText(sentence, result), item.surface, item.id + ' unchanged text');
            }
            if (sentence.hasRuby) {
                const kana = api.buildVoicevoxKana(result);
                check(kana !== null, item.id + ' level 3 buildable');
                equal(api.alignVoicevoxReading(sentence, {kana}).status,
                    sentence.hasUnknown ? 'partial' : 'matched', item.id + ' level 3 reading');
                const parsed = api.parseVoicevoxKana(kana);
                equal(parsed.phrases.length, result.engine.phrases.length, item.id + ' phrase count');
                check(parsed.phrases.every(phrase => phrase.accent >= 1 && phrase.accent <= phrase.moras.length),
                    item.id + ' valid accent bounds');
            }
        }
        equal(api.splitReadingMoras('きゃしゅチョふぁティクヮッンー'),
            ['キャ', 'シュ', 'チョ', 'ファ', 'ティ', 'クヮ', 'ッ', 'ン', 'ー'], 'small kana and independent moras');
        equal(canonical('ジュウ'), ['ジュ', 'LONG'], 'u-row long vowel');
        equal(canonical('エエ'), canonical('えい'), 'e-i folding');
        equal(canonical('トーキョー'), canonical('とうきょう'), 'o-u and long mark');
        equal(canonical('はへをぢづ'), canonical('ワエオジズ'), 'pronunciation equivalents');
        equal(canonical("_トオ'/キョオ、？！「」　"), canonical('とうきょう'), 'notation punctuation and whitespace');
        check(JSON.stringify(canonical('カイ')) !== JSON.stringify(canonical('カア')), 'distinct vowels stay distinct');
        equal(correction('なんのほんですか', "ナ'ニノ/ホ'ンデ_スカ"), "ナ'ンノ/ホ'ンデ_スカ", 'level 3 minimal correction');
        equal(correction('わたしはほんをとうきょうへ', "ワタシワ'/ホンオ'/トオキョオエ'"),
            "ワタシワ'/ホンオ'/トオキョオエ'", 'retain engine particles long vowels and accents');
        equal(correction('か', "カタナ'"), "カ'", 'accent clamps after deletion');
        equal(correction('かな', "カ'"), "カ'ナ", 'inserted mora inherits neighbouring phrase');
        equal(correction('かに', "カ'_キ"), "カ'ニ", 'replacement drops devoicing marker');
        equal(correction('かき', "カ'_キ？"), "カ'_キ？", 'retained devoicing and question');
        const pauses = correction('かきくけ', "カ'キ、ク'ケ？");
        equal(pauses, "カ'キ、ク'ケ？", 'retain pauses and interrogative phrase');
        equal(correction('かき', "カ'キ、"), "カ'キ、", 'retain a terminal pause');
        check(pauses.split(/[\/、]/u).every(phrase => (phrase.match(/'/gu) || []).length === 1), 'exactly one accent per phrase');
        for (const invalid of ['', 'カナ', "'カ", "カ''", "カ'/", "カ'//キ'", "カ'_", "カ'?キ", "カ'X", "キ'ャ"]) {
            equal(api.parseVoicevoxKana(invalid), null, 'reject invalid notation ' + invalid);
            equal(correction('かな', invalid), null, 'unbuildable correction ' + invalid);
        }
        equal(correction('あ', "カ'/キ'"), null, 'empty corrected phrase is unbuildable');
        const partial = extract('漢字は<ruby>本<rt>ほん</rt></ruby>です。');
        equal(api.alignVoicevoxReading(partial, "カンジワ'/ホン'デ_ス").status, 'partial', 'wildcard with adjacent known kana');
        equal(api.alignVoicevoxReading(partial, "カンジワ'/ホネ'デ_ス").status, 'mismatch', 'wildcard cannot swallow a ruby error');
        equal(api.alignVoicevoxReading(partial, "ワ'/ホン'デ_ス").status, 'mismatch', 'wildcard needs at least one mora');
        equal(api.alignVoicevoxReading(extract('他<ruby>会<rt>あ</rt></ruby>'), "タア'").status,
            'partial', 'wildcard supplies long-vowel context to adjacent ruby');
        equal(api.alignVoicevoxReading(extract('某<ruby>右<rt>う</rt></ruby>'), "トーオ'").status,
            'partial', 'wildcard long mark supplies o-u context');
        const perKanji = extract('<ruby>落<rt>お</rt></ruby>ち<ruby>葉<rt>ば</rt></ruby>');
        equal(api.alignVoicevoxReading(perKanji, "オチバ'").misread, [], 'per-kanji ruby stays contiguous');
        equal(api.alignVoicevoxReading(perKanji, "オチハ'").misread.map(segment => segment.surface),
            ['葉'], 'voiced consonant mismatch stays on its ruby');
        equal(api.alignVoicevoxReading(ruby('すき'), {accent_phrases: [{accent: 0,
            moras: [{text: 'ス', vowel: 'U'}, {text: 'キ', vowel: 'i'}], is_interrogative: true,
            pause_mora: {text: '、'}}]}).status, 'matched', 'accent phrase fallback supports heiban and devoicing');
        equal(api.alignVoicevoxReading(ruby('か'), {kana: "カ'", accent_phrases: []}).status,
            'matched', 'query kana takes precedence');
        equal(api.alignVoicevoxReading(ruby('か'), {accent_phrases: [null]}).status,
            'mismatch', 'invalid accent phrase fallback fails safely');
        equal(api.alignVoicevoxReading(extract('かなだけ。'), "カナダケ'").status, 'matched', 'kana-only sentence is verifiable');
        equal(api.alignVoicevoxReading(extract('かなだけ。'), "カナダキ'").status, 'mismatch', 'kana-only mismatch is verifiable');
        equal(api.alignVoicevoxReading(extract('漢字だけ。'), "カンジダケ'").status, 'unverified', 'unannotated kanji stays unverified');
        equal(api.extractVoicevoxReading(null).surface, '', 'missing question root');
        const spaced = extract('  Ａ１２ <ruby>本<rt>ほん</rt></ruby>\nです。 ');
        equal(spaced.text, 'A12 本 です。', 'NFKC text and collapsed whitespace');
        check(spaced.hasUnknown, 'Latin letters and digits are wildcards');
        equal(api.buildVoicevoxText(spaced, api.alignVoicevoxReading(spaced, "エエイチニ'/ホネ'デ_ス")),
            '  Ａ１２ ほん\nです。 ', 'level 2 preserves other characters and whitespace');
        await runVoicevoxFlowRegression(fixtures, checks);
        return {ok: true, checks};
    } catch (error) {
        return {ok: false, checks, error: String(error) + '\n' + (error.stack || '')};
    }
};

async function runVoicevoxFlowRegression(fixtures, checks) {
    const api = window.__voicevoxTest;
    const {state} = api;
    const root = document.querySelector('.text-center');
    const originalFetch = window.fetch;
    const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    const wave = new ArrayBuffer(1644);
    const view = new DataView(wave);
    const tag = (offset, text) => [...text].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
    tag(0, 'RIFF'); view.setUint32(4, 1636, true); tag(8, 'WAVE'); tag(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, 1600, true);
    const wav = new Blob([wave], {type: 'audio/wav'});
    let calls = [];
    let readings = [];
    let accentStatus = 200;
    let failure = '';
    let pendingResolve;
    let synthBody;
    function setup(html, kana) {
        root.innerHTML = html;
        api.ensureStateMatchesPage();
        state.selectedFile = null;
        calls = [];
        readings = kana.slice();
        accentStatus = 200;
        failure = '';
        synthBody = null;
    }
    window.fetch = async (address, options) => {
        const url = new URL(address);
        calls.push(url);
        check(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'request stays on loopback');
        check(options.redirect === 'error' && options.credentials === 'omit', 'redirect and credential boundary');
        if (failure === 'unreachable') throw new TypeError('synthetic CORS failure');
        if (failure === 'timeout' || failure === 'cancel') {
            return new Promise((resolve, reject) => options.signal.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')), {once: true}));
        }
        if (url.pathname === '/speakers') return new Response(JSON.stringify([{name: 'Speaker', styles: [
            {id: 3, name: 'Normal', type: 'talk'}, {id: 9, name: 'Song', type: 'sing'},
            {id: 12, name: 'Stream', type: 'streaming_talk'}, {id: 13, name: 'Frame', type: 'frame_decode'}]}]));
        if (url.pathname === '/audio_query') return new Response(JSON.stringify({kana: readings.shift(),
            accent_phrases: [], volumeScale: 0.7, speedScale: 1}));
        if (url.pathname === '/accent_phrases') {
            const parsed = api.parseVoicevoxKana(url.searchParams.get('text'));
            check(url.searchParams.get('is_kana') === 'true' && parsed, 'level 3 sends valid kana notation');
            return new Response(JSON.stringify(parsed.phrases.map(phrase => ({accent: phrase.accent,
                moras: phrase.moras.map(mora => ({text: mora.text})), is_interrogative: phrase.question}))), {status: accentStatus});
        }
        synthBody = JSON.parse(options.body);
        if (failure === 'stale') return new Promise(resolve => { pendingResolve = () => resolve(new Response(wav)); });
        if (failure === 'invalid') return new Response('invalid wav');
        if (failure === 'http') return new Response('', {status: 503});
        return new Response(wav);
    };
    try {
        api.setSetting(api.STORAGE_KEYS.VOICEVOX_RECENT, []);
        api.setSetting(api.STORAGE_KEYS.VOICEVOX_STYLE, 3);
        api.setSetting(api.STORAGE_KEYS.VOICEVOX_LABEL, 'Speaker(Normal)');
        setup('かな。', ["カナ'"]);
        check(state.refs.voicevoxVoice.selectedOptions[0].textContent === 'Speaker(Normal)',
            'saved voice label shown before voices load');
        check(calls.length === 0 && !state.voicevoxVoices.length, 'no requests before explicit generation');
        await api.handleVoicevox();
        check(calls.filter(url => url.pathname === '/audio_query').length === 1 && synthBody,
            'matched path uses one query and synthesis ' + JSON.stringify({calls: calls.map(url => url.href),
                message: state.panelMessage, eligible: state.eligible}));
        check(state.selectedFile?.name === 'VOICEVOX Speaker(Normal).wav' && state.previewObjectUrl && state.audio,
            'generated WAV is selected and auto-previewed through the existing player');
        check(state.panelMessage.key === 'voicevoxReady' && state.panelMessage.vars.result.key === 'voicevoxMatched', 'matched ready status');
        check(synthBody.prePhonemeLength === 0.5 && synthBody.speedScale === 1, 'default 0.5 s lead-in silence at normal speed');
        api.renderPanel();
        check(!state.overrideFound && state.playerOpen && state.audio?.src === state.previewObjectUrl,
            'preview keeps playing on a sentence without an override after the panel re-renders');
        await api.handleTest();
        check(state.playerOpen && state.audio?.src === state.previewObjectUrl && state.panelMessage.key === 'testStarted',
            'Test of the selected file keeps its preview without an override');
        // After P has played BunPro's own audio on a sentence without an override, the native
        // route can outlive that audio; an explicit preview must still play.
        api.markNativePIntent();
        await api.handleTest();
        api.renderPanel();
        check(!api.isNativePRoute() && state.playerOpen && state.audio?.src === state.previewObjectUrl,
            'preview after a native P cycle ends that cycle and keeps playing');
        check(state.voicevoxVoices.map(voice => voice.id).join() === '3,12',
            'talk and streaming_talk styles are voices; singing styles are not');
        await api.handleSave();
        check(state.overrideFound && state.entry && !state.selectedFile, 'Save stores generated clip through normal flow');
        check((state.entry.file_name || state.entry.fileName) === 'VOICEVOX Speaker(Normal).wav', 'saved filename retained');
        const recentRow = state.refs.voicevoxRecent;
        check(!recentRow.hidden && api.getRecentVoicevoxVoices().map(voice => voice.id).join() === '3' &&
            recentRow.querySelector('button[data-voice-id="3"]')?.getAttribute('aria-pressed') === 'true',
            'a generated voice appears as a highlighted recent-voice button');
        setup('かな。', ["カナ'"]);
        await api.handleVoicevox(false, {id: 12, label: 'Speaker(Stream)'});
        const synthesis = calls.find(url => url.pathname === '/synthesis');
        check(synthesis?.searchParams.get('speaker') === '12' && state.selectedFile?.name === 'VOICEVOX Speaker(Stream).wav',
            'a recent-voice button generates with that voice');
        check(api.getSetting(api.STORAGE_KEYS.VOICEVOX_STYLE) === 12 &&
            api.getRecentVoicevoxVoices().map(voice => voice.id).join() === '3,12' &&
            recentRow.querySelector('button[data-voice-id="12"]')?.getAttribute('aria-pressed') === 'true' &&
            recentRow.querySelector('button[data-voice-id="3"]')?.getAttribute('aria-pressed') === 'false',
            'the picked voice becomes the default and buttons keep first-use order');
        api.setSetting(api.STORAGE_KEYS.VOICEVOX_RECENT, Array.from({length: 8}, (_, index) =>
            ({id: 20 + index, label: `Voice${index}(Normal)`, usedAt: index === 5 ? 1 : 100 + index})));
        api.rememberVoicevoxVoice({id: 40, label: 'New(Normal)'});
        check(api.getRecentVoicevoxVoices().map(voice => voice.id).join() === '20,21,22,23,24,26,27,40',
            'a full list drops only the least recently used voice');
        api.rememberVoicevoxVoice({id: 22, label: 'Voice2(Normal)'});
        check(api.getRecentVoicevoxVoices().map(voice => voice.id).join() === '20,21,22,23,24,26,27,40',
            'reusing a voice does not reorder the buttons');
        check(api.shortVoicevoxLabel('四国めたん(ノーマル)') === '四国めたん' &&
            api.shortVoicevoxLabel('ずんだもん(あまあま)') === 'ずんだもん(あまあま)',
            'normal-style buttons show only the speaker name');
        state.voicevoxJob = {controller: new AbortController()};
        api.renderPanel();
        check([...recentRow.querySelectorAll('button')].every(button => button.disabled),
            'recent-voice buttons are disabled while generating');
        state.voicevoxJob = null;
        api.setSetting(api.STORAGE_KEYS.VOICEVOX_RECENT, []);
        api.renderPanel();
        check(recentRow.hidden, 'the recent-voice row is hidden when empty');
        api.setSetting(api.STORAGE_KEYS.VOICEVOX_STYLE, 3);
        api.setSetting(api.STORAGE_KEYS.VOICEVOX_LABEL, 'Speaker(Normal)');
        const item = fixtures.cases.find(item => item.expect === 'corrected');
        setup(item.html, [item.engineKana1, item.engineKana2]);
        await api.handleVoicevox();
        check(calls.filter(url => url.pathname === '/audio_query').length === 2 &&
            calls.findLast(url => url.pathname === '/audio_query').searchParams.get('text') === item.level2Text,
            'level 2 replaces only misread ruby');
        check(state.panelMessage.vars.result.key === 'voicevoxCorrected' &&
            state.panelMessage.vars.result.vars.words.includes('→'), 'corrected ready status lists words');
        for (const fallback of [false, true]) {
            setup('<ruby>本<rt>ほん</rt></ruby>', ["ホネ'", "ホネ'"]);
            accentStatus = fallback ? 400 : 200;
            await api.handleVoicevox();
            check(calls.some(url => url.pathname === '/accent_phrases') && synthBody.volumeScale === 0.7,
                'level 3 preserves other query fields ' + fallback);
            check(state.panelMessage.vars.result.key === (fallback ? 'voicevoxMismatch' : 'voicevoxCorrected'),
                'level 3 success or HTTP 400 fallback status ' + fallback);
        }
        setup('<ruby>本<rt>ほん</rt></ruby>かな', ["ホンカネ'"]);
        await api.handleVoicevox();
        check(calls.filter(url => url.pathname === '/audio_query').length === 1 &&
            calls.some(url => url.pathname === '/accent_phrases'), 'non-ruby mismatch skips level 2');
        setup('かな', ["カネ'"]);
        await api.handleVoicevox();
        check(calls.filter(url => url.pathname === '/audio_query').length === 1 &&
            state.panelMessage.vars.result.key === 'voicevoxMatched', 'kana-only correction uses level 3');
        for (const mode of ['unreachable', 'timeout', 'cancel', 'invalid', 'http']) {
            setup('かな', ["カナ'"]);
            failure = mode;
            const promise = api.handleVoicevox();
            check(state.refs.voicevoxButton.textContent === api.t('voicevoxCancel') && state.refs.saveButton.disabled,
                mode + ' displays cancel and disables save');
            if (mode === 'cancel') state.refs.voicevoxButton.click();
            await promise;
            const key = {unreachable: 'voicevoxUnreachable', timeout: 'voicevoxTimeout', cancel: 'voicevoxCancelled',
                invalid: 'voicevoxInvalidResponse', http: 'voicevoxEngineError'}[mode];
            check(state.panelMessage.key === key && !state.voicevoxJob && !state.refs.fileInput.disabled &&
                state.refs.voicevoxButton.textContent === 'VOICEVOX', mode + ' reports error and restores controls ' +
                JSON.stringify({message: state.panelMessage, busy: !!state.voicevoxJob, disabled: state.refs.fileInput.disabled}));
            if (mode === 'unreachable') check(state.refs.message.textContent.includes('then restart VOICEVOX'), 'restart guidance is shown');
        }
        setup('かな', ["カナ'"]);
        failure = 'stale';
        const stale = api.handleVoicevox();
        while (!pendingResolve) await new Promise(resolve => setTimeout(resolve, 5));
        root.textContent = 'ほか';
        api.ensureStateMatchesPage();
        pendingResolve();
        await stale;
        check(!state.selectedFile && !state.voicevoxJob, 'changed sentence discards a late response');
        for (const url of ['https://example.com', 'http://127.0.0.1.evil.test', 'file:///tmp',
            'http://user@localhost', 'http://localhost/path', 'http://localhost?target=remote']) {
            let rejected = false;
            try { api.validateVoicevoxUrl(url); } catch { rejected = true; }
            check(rejected, 'reject non-loopback or non-origin address ' + url);
        }
        for (const url of ['http://localhost:50021', 'https://127.0.0.1:443', 'http://[::1]:50021']) {
            check(Boolean(api.validateVoicevoxUrl(url)), 'accept loopback address ' + url);
        }
        setup('かな', ["カナ'"]);
        state.refs.voicevoxUrl.value = 'http://localhost:50022';
        state.refs.voicevoxUrl.dispatchEvent(new Event('change'));
        state.refs.voicevoxSpeed.value = '1.5';
        state.refs.voicevoxSpeed.dispatchEvent(new Event('change'));
        state.refs.voicevoxLeadIn.value = '0.8';
        state.refs.voicevoxLeadIn.dispatchEvent(new Event('change'));
        await api.handleVoicevox(true);
        check(state.panelMessage.key === 'voicevoxLoaded' && calls.length === 1, 'explicit Load voices only fetches speakers');
        check(api.getSetting(api.STORAGE_KEYS.VOICEVOX_URL) === 'http://localhost:50022' && api.getVoicevoxSpeed() === 1.5 &&
            api.getSetting(api.STORAGE_KEYS.VOICEVOX_LABEL) === 'Speaker(Normal)', 'engine voice label and speed persist');
        calls = [];
        await api.handleVoicevox();
        check(synthBody.speedScale === 1.5 && !calls.some(url => url.pathname === '/speakers'), 'cached voice and configured speed used');
        check(Math.abs(synthBody.prePhonemeLength - 0.8 * 1.5) < 1e-9 &&
            api.getSetting(api.STORAGE_KEYS.VOICEVOX_LEAD_IN) === 0.8,
            'lead-in setting persists and is scaled by speed to keep real seconds');
        setup('', []);
        await api.handleVoicevox();
        check(state.panelMessage.key === 'voicevoxNoSentence' && !calls.length, 'missing sentence makes no request');
    } finally {
        window.fetch = originalFetch;
        api.cancelVoicevox(false);
    }
}
