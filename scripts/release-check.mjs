import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const rootDir = process.cwd();
const manifestPath = resolve(rootDir, 'dist', 'manifest.json');
const distDir = resolve(rootDir, 'dist');
const sourceTargets = ['src', 'manifest.json', 'package.json'];
const distTargets = ['dist'];

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

  if (manifest.name !== 'Dialog-Export') {
    fail(`manifest name should be Dialog-Export, got "${manifest.name}"`);
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

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Release check passed.');
