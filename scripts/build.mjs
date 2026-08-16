import {build} from 'esbuild';
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

const outdir = new URL('../dist/', import.meta.url);

await rm(outdir, {recursive: true, force: true});
await mkdir(outdir, {recursive: true});

await build({
    entryPoints: [new URL('../src/extension.ts', import.meta.url).pathname],
    outfile: new URL('extension.js', outdir).pathname,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['gi://*', 'resource://*'],
    sourcemap: false,
    legalComments: 'none',
});

await build({
    entryPoints: [new URL('../src/prefs.ts', import.meta.url).pathname],
    outfile: new URL('prefs.js', outdir).pathname,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['gi://*', 'resource://*'],
    sourcemap: false,
    legalComments: 'none',
});

await Promise.all([
    cp(new URL('../metadata.json', import.meta.url), new URL('metadata.json', outdir)),
    cp(new URL('../stylesheet.css', import.meta.url), new URL('stylesheet.css', outdir)),
    cp(new URL('../prefs.css', import.meta.url), new URL('prefs.css', outdir)),
    mkdir(new URL('schemas/', outdir), {recursive: true}),
    cp(new URL('../schemas/org.gnome.shell.extensions.sheliak.gschema.xml', import.meta.url),
        new URL('schemas/org.gnome.shell.extensions.sheliak.gschema.xml', outdir)),
    cp(new URL('../icons/', import.meta.url), new URL('icons/', outdir), {recursive: true}),
]);

for (const catalogFile of await readdir(new URL('../po/', import.meta.url))) {
    if (!catalogFile.endsWith('.json'))
        continue;
    const languageTag = catalogFile.slice(0, -5);
    const language = languageTag.replace('-', '_');
    const translations = JSON.parse(await readFile(
        new URL(`../po/${catalogFile}`, import.meta.url), 'utf8'));
    const escapePo = value => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
    const entries = Object.entries(translations)
        .map(([msgid, msgstr]) => `msgid "${escapePo(msgid)}"\nmsgstr "${escapePo(msgstr)}"\n`)
        .join('\n');
    const po = `msgid ""\nmsgstr ""\n` +
        `"Project-Id-Version: Sheliak 1.12.0\\n"\n` +
        `"Language: ${language}\\n"\n` +
        `"Content-Type: text/plain; charset=UTF-8\\n"\n` +
        `"Content-Transfer-Encoding: 8bit\\n"\n\n${entries}`;
    const poPath = new URL(`${language}.po`, outdir);
    await writeFile(poPath, po);
    const localeDir = new URL(`locale/${language}/LC_MESSAGES/`, outdir);
    await mkdir(localeDir, {recursive: true});
    await execFileAsync('msgfmt', [
        '--check',
        '--output-file', new URL('sheliak.mo', localeDir).pathname,
        poPath.pathname,
    ]);
}

await execFileAsync('glib-compile-schemas', [new URL('schemas/', outdir).pathname]);
