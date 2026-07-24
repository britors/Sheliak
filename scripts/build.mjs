import {build} from 'esbuild';
import {cp, mkdir, rm} from 'node:fs/promises';

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

await Promise.all([
    cp(new URL('../metadata.json', import.meta.url), new URL('metadata.json', outdir)),
    cp(new URL('../stylesheet.css', import.meta.url), new URL('stylesheet.css', outdir)),
]);
