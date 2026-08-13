import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';

const sourceFiles = readdirSync('src').filter(file => file.endsWith('.ts'));
const sources = sourceFiles.map(file => readFileSync(`src/${file}`, 'utf8')).join('\n');
const sourceKeys = new Set([...sources.matchAll(/_\('([^']+)'\)/g)].map(match => match[1]));
sourceKeys.add('Native Lyra ecosystem dock for GNOME Shell');

for (const locale of ['pt-BR', 'es-ES', 'zh-CN']) {
    const catalog = JSON.parse(readFileSync(`po/${locale}.json`, 'utf8'));
    assert.deepEqual(new Set(Object.keys(catalog)), sourceKeys, `${locale} key parity`);
}
assert.deepEqual(JSON.parse(readFileSync('po/en-US.json', 'utf8')), {});

const cases = [
    ['en_US.UTF-8', 'Applications'],
    ['pt_BR.UTF-8', 'Aplicativos'],
    ['es_ES.UTF-8', 'Aplicaciones'],
    ['zh_CN.UTF-8', '应用程序'],
    ['fr_FR.UTF-8', 'Applications'],
];
for (const [lang, expected] of cases) {
    const env = {...process.env, LANG: lang, TEXTDOMAIN: 'sheliak',
        TEXTDOMAINDIR: resolve('dist/locale')};
    delete env.LC_ALL;
    delete env.LANGUAGE;
    const actual = execFileSync('gettext', ['Applications'], {encoding: 'utf8', env});
    assert.equal(actual, expected, `LANG=${lang}`);
}

const precedenceCases = [
    [{LANG: 'es_ES.UTF-8', LC_MESSAGES: 'pt_BR.UTF-8'}, 'Aplicativos'],
    [{LANG: 'es_ES.UTF-8', LC_MESSAGES: 'pt_BR.UTF-8', LC_ALL: 'zh_CN.UTF-8'}, '应用程序'],
    [{LANG: 'en_US.UTF-8', LC_MESSAGES: 'pt_BR.UTF-8@custom'}, 'Aplicativos'],
];
for (const [localeEnv, expected] of precedenceCases) {
    const env = {...process.env};
    delete env.LC_ALL;
    delete env.LC_MESSAGES;
    delete env.LANGUAGE;
    Object.assign(env, localeEnv, {
        TEXTDOMAIN: 'sheliak',
        TEXTDOMAINDIR: resolve('dist/locale'),
    });
    const actual = execFileSync('gettext', ['Applications'], {encoding: 'utf8', env});
    assert.equal(actual, expected, JSON.stringify(localeEnv));
}

for (const locale of ['en_US', 'pt_BR', 'es_ES', 'zh_CN']) {
    const mo = `dist/locale/${locale}/LC_MESSAGES/sheliak.mo`;
    assert.doesNotThrow(() => execFileSync('msgunfmt', [mo]));
}

const metadata = JSON.parse(readFileSync('metadata.json', 'utf8'));
assert.equal(metadata['gettext-domain'], 'sheliak');
assert.match(readFileSync('src/showAppsButton.ts', 'utf8'), /accessible_name: _\('Show Applications'\)/);
assert.match(readFileSync('src/trashIcon.ts', 'utf8'), /accessible_name: _\('Trash'\)/);
assert.match(sources, /_\('Source Code'\), 'applications-engineering-symbolic'/);
assert.match(sources, /_\('Report an Issue'\), 'dialog-warning-symbolic'/);
assert.doesNotMatch(sources, /(?:title|subtitle|label|text|accessible_name|hint_text):\s*['"][^'"]*[À-ÿ]/);

const spec = readFileSync('packaging/sheliak.spec', 'utf8');
assert.match(spec, /dist\/locale/);
assert.match(spec, /extensions\/sheliak@lyraos\.org\/locale/);
const makefile = readFileSync('Makefile', 'utf8');
assert.match(makefile, /dist\/locale/);

for (const css of ['stylesheet.css', 'prefs.css']) {
    const contents = readFileSync(css, 'utf8');
    assert.doesNotMatch(contents, /@font-face/);
    assert.match(contents, /Noto Sans CJK SC/);
}

console.log(`i18n: ${sourceKeys.size} keys, 8 locale/fallback cases, packaging and accessibility OK`);
