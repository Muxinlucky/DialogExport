import { MAX_CONVERSATION_FILENAME_TITLE_LENGTH } from './constants';
import { sanitizeFilenamePart } from './filename';

export interface ArchiveEntry {
  path: string;
  content: Uint8Array;
}

export function buildArchiveEntryPath(group: string | undefined, title: string, extension: string, usedPaths: Set<string>): string {
  const safeTitle = sanitizeFilenamePart(title).slice(0, MAX_CONVERSATION_FILENAME_TITLE_LENGTH).trim();
  const safeExtension = sanitizeFilenamePart(extension, 'md').toLowerCase().replace(/^\.+/, '') || 'md';
  const safeGroup = group ? sanitizeFilenamePart(group).slice(0, 60).trim() : '';
  const directory = safeGroup ? `${safeGroup}/` : '';
  const basePath = `${directory}${safeTitle}.${safeExtension}`;

  if (!usedPaths.has(basePath)) {
    usedPaths.add(basePath);
    return basePath;
  }

  let duplicateIndex = 2;
  let candidate = `${directory}${safeTitle} (${duplicateIndex}).${safeExtension}`;
  while (usedPaths.has(candidate)) {
    duplicateIndex += 1;
    candidate = `${directory}${safeTitle} (${duplicateIndex}).${safeExtension}`;
  }
  usedPaths.add(candidate);
  return candidate;
}

export function buildArchiveFilename(platformPrefix: string, date = new Date()): string {
  const safePrefix = sanitizeFilenamePart(platformPrefix, 'ai').toLowerCase().replace(/\s+/g, '-');
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('')
    + '-' + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('');
  return `${safePrefix}-export-${timestamp}.zip`;
}
