import { cp, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { isAddress } from 'ethers';
import { compileFolio } from './compile.mjs';

const defaultContract = process.env.FOLIO_AEVUM_CONTRACT?.trim() ?? '';
if (defaultContract && !isAddress(defaultContract)) {
  throw new Error('FOLIO_AEVUM_CONTRACT must be a valid Aevum contract address.');
}

await mkdir('dist', { recursive: true });
await writeFile('src/contract.generated.json', JSON.stringify(await compileFolio()));
await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'esm',
  target: ['es2022', 'safari16'],
  outfile: 'dist/app.js',
  minify: true,
  define: { __FOLIO_DEFAULT_CONTRACT__: JSON.stringify(defaultContract) },
  legalComments: 'linked',
  loader: { '.svg': 'text', '.woff2': 'file' },
  assetNames: 'assets/[name]-[hash]',
});
await cp('src/index.html', 'dist/index.html');
await cp('src/style.css', 'dist/style.css');
await cp('assets', 'dist/assets', { recursive: true });
