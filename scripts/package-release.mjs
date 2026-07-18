import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const rootDir = process.cwd();
const distDir = resolve(rootDir, 'dist');
const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));
const releaseDir = resolve(rootDir, 'release');

if (!existsSync(distDir) || !existsSync(join(distDir, 'manifest.json'))) {
  throw new Error('dist/manifest.json is missing. Run npm run build first.');
}

mkdirSync(releaseDir, { recursive: true });

function addDirectory(zip, directory, prefix = '') {
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    const archivePath = prefix ? `${prefix}/${entry}` : entry;

    if (statSync(absolute).isDirectory()) {
      addDirectory(zip, absolute, archivePath);
    } else {
      zip.addLocalFile(absolute, prefix);
    }
  }
}

function writeArchive(path) {
  const zip = new AdmZip();
  addDirectory(zip, distDir);
  zip.writeZip(path);
}

writeArchive(resolve(rootDir, 'DialogExport-dist.zip'));
writeArchive(join(releaseDir, `DialogExport-store-v${manifest.version}.zip`));
console.log(`Created release archives for Dialog-Export v${manifest.version}.`);
