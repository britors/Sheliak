import {build} from 'esbuild';
import {cp, mkdir, rm} from 'node:fs/promises';
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

await execFileAsync('glib-compile-schemas', [new URL('schemas/', outdir).pathname]);
