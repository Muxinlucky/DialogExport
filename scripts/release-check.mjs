import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import AdmZip from 'adm-zip';
import sharp from 'sharp';

const rootDir = process.cwd();
const manifestPath = resolve(rootDir, 'dist', 'manifest.json');
const distDir = resolve(rootDir, 'dist');
const sourceTargets = ['src', 'manifest.json', 'package.json'];
const distTargets = ['dist'];
const archivePath = resolve(rootDir, 'DialogExport-dist.zip');

const forbiddenPermissions = new Set(['cookies', 'history', 'webRequest', '<all_urls>']);
const removedPlatformHosts = [
  'aistudio.google.com',
  'copilot.microsoft.com',
  'perplexity.ai',
  'chat.mistral.ai',
  'yiyan.baidu.com',
  'chat.baidu.com'
];
const forbiddenImplementationMarkers = [
  'localStorage',
  'indexedDB',
  'IndexedDB',
  'JSZip',
  'new JSZip',
  '.zip('
];

function fail(message) {
  console.error(`Release check failed: ${message}`);
  process.exitCode = 1;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function walkFiles(path) {
  const absolute = resolve(rootDir, path);

  if (!existsSync(absolute)) {
    return [];
  }

  if (statSync(absolute).isFile()) {
    return [absolute];
  }

  const files = [];
  const entries = readdirSync(absolute, { withFileTypes: true });

  for (const entry of entries) {
    const child = join(absolute, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(relative(rootDir, child)));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }

  return files;
}

function scanFiles(targets, markers, label) {
  const files = targets.flatMap(walkFiles);

  for (const file of files) {
    const text = readFileSync(file, 'utf8');

    for (const marker of markers) {
      if (text.includes(marker)) {
        fail(`${label} contains forbidden marker "${marker}" in ${relative(rootDir, file)}`);
      }
    }
  }
}

if (!existsSync(distDir)) {
  fail('dist directory does not exist. Run npm run build first.');
}

if (!existsSync(manifestPath)) {
  fail('dist/manifest.json does not exist. Run npm run build first.');
} else {
  const manifest = readJson(manifestPath);
  const permissions = manifest.permissions || [];
  const hostPermissions = manifest.host_permissions || [];
  const contentMatches = (manifest.content_scripts || []).flatMap((script) => script.matches || []);
  const manifestText = JSON.stringify(manifest, null, 2);

  if (manifest.name !== 'Dialog-Export' && manifest.name !== '__MSG_extensionName__') {
    fail(`manifest name should be Dialog-Export or localized placeholder, got "${manifest.name}"`);
  }

  const packageJson = readJson(resolve(rootDir, 'package.json'));
  if (manifest.version !== packageJson.version) {
    fail(`manifest/package versions differ: ${manifest.version} vs ${packageJson.version}`);
  }

  for (const required of [
    'src/popup/popup.html',
    'src/background/service-worker.js',
    'src/content/index.js',
    'icons/icon128.png',
    '_locales/zh_CN/messages.json',
    '_locales/en/messages.json'
  ]) {
    if (!existsSync(join(distDir, required))) {
      fail(`dist is missing required file ${required}`);
    }
  }

  const iconMetadata = await sharp(join(distDir, 'icons', 'icon128.png')).metadata();
  if (iconMetadata.width !== 128 || iconMetadata.height !== 128 || (iconMetadata.channels || 0) < 4) {
    fail('dist/icons/icon128.png must be a 128x128 PNG with alpha padding.');
  }

  for (const permission of permissions) {
    if (forbiddenPermissions.has(permission)) {
      fail(`manifest requests forbidden permission "${permission}"`);
    }
  }

  for (const host of [...hostPermissions, ...contentMatches]) {
    if (host === '<all_urls>' || host.includes('<all_urls>')) {
      fail('manifest contains <all_urls>');
    }
  }

  for (const host of removedPlatformHosts) {
    if (manifestText.includes(host)) {
      fail(`manifest still contains removed host "${host}"`);
    }
  }

  console.log('Manifest permissions:', permissions.join(', '));
  console.log('Host permissions:', hostPermissions.join(', '));
}

scanFiles(sourceTargets, removedPlatformHosts, 'source');
scanFiles(distTargets, removedPlatformHosts, 'dist');
scanFiles(sourceTargets, forbiddenImplementationMarkers, 'source');
scanFiles(distTargets, forbiddenImplementationMarkers, 'dist');

if (process.argv.includes('--archive')) {
  if (!existsSync(archivePath)) {
    fail('DialogExport-dist.zip does not exist. Run npm run release first.');
  } else {
    const zip = new AdmZip(archivePath);
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory).map((entry) => entry.entryName);
    if (!entries.includes('manifest.json')) {
      fail('DialogExport-dist.zip must contain manifest.json at its root.');
    }
    if (entries.some((entry) => entry.startsWith('dist/'))) {
      fail('DialogExport-dist.zip must not contain a nested dist directory.');
    }
    console.log(`Archive contains ${entries.length} files with manifest at root.`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Release check passed.');
