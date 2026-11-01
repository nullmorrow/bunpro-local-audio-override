import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Resolve from ESLint so its pinned dependency also works with pnpm's layout.
const require = createRequire(import.meta.url);
const espree = createRequire(require.resolve('eslint'))('espree');

const sourcePath = process.argv[2] || fileURLToPath(new URL('../bunpro_local_audio_override.user.js', import.meta.url));
const ast = espree.parse(readFileSync(sourcePath, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' });
const languages = ['en', 'zh-CN', 'zh-TW', 'ja', 'es', 'id', 'fr'];
const issues = [];
const tables = [];
const propertyName = property => property.key.type === 'Identifier' ? property.key.name : property.key.value;

function objectEntries(object, label) {
    const entries = new Map();
    for (const property of object.properties) {
        if (property.type !== 'Property' || property.computed) {
            issues.push(`${label}: expected a static property`);
            continue;
        }
        const key = propertyName(property);
        if (entries.has(key)) issues.push(`${label}/${key}: duplicate key`);
        entries.set(key, property.value);
    }
    return entries;
}

function findTables(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && /I18N$/.test(node.id.name)) {
        const initializer = node.init;
        const object = initializer?.type === 'ObjectExpression' ? initializer
            : initializer?.type === 'CallExpression' && initializer.callee.type === 'MemberExpression'
                && initializer.callee.object.name === 'Object' && initializer.callee.property.name === 'freeze'
                ? initializer.arguments[0] : null;
        if (object?.type === 'ObjectExpression') tables.push([node.id.name, object]);
        else issues.push(`${node.id.name}: expected an object literal`);
    }
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(findTables);
        else if (value && typeof value === 'object') findTables(value);
    }
}

function placeholders(node, label) {
    if (node.type !== 'Literal' || typeof node.value !== 'string') {
        issues.push(`${label}: expected a string literal`);
        return [];
    }
    return [...new Set([...node.value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]))].sort();
}

findTables(ast);
if (!tables.length) issues.push('No I18N tables found');
if (tables.length > 1) issues.push(`Expected one I18N table, found ${tables.length}`);
for (const [name, object] of tables) {
    const translations = objectEntries(object, name);
    for (const language of languages) {
        if (!translations.has(language)) issues.push(`${name}/${language}: missing language`);
    }
    const english = translations.get('en');
    if (english?.type !== 'ObjectExpression') {
        issues.push(`${name}/en: expected an English object literal`);
        continue;
    }
    const reference = objectEntries(english, `${name}/en`);
    const expectedPlaceholders = new Map([...reference].map(([key, value]) =>
        [key, placeholders(value, `${name}/en/${key}`)]));
    for (const [language, translation] of translations) {
        if (translation.type !== 'ObjectExpression') {
            issues.push(`${name}/${language}: expected an object literal`);
            continue;
        }
        const entries = objectEntries(translation, `${name}/${language}`);
        for (const key of reference.keys()) {
            if (!entries.has(key)) issues.push(`${name}/${language}/${key}: missing key`);
        }
        for (const [key, value] of entries) {
            if (!reference.has(key)) issues.push(`${name}/${language}/${key}: extra key`);
            else if (JSON.stringify(placeholders(value, `${name}/${language}/${key}`))
                !== JSON.stringify(expectedPlaceholders.get(key))) {
                issues.push(`${name}/${language}/${key}: placeholders differ from en`);
            }
        }
    }
}
if (issues.length) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
} else {
    console.log(`i18n: ${tables.length} tables, ${languages.length} languages; keys and placeholders match en.`);
}
