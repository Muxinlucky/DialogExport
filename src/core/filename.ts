import { MAX_FILENAME_LENGTH } from './constants';

const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeFilenamePart(value: string, fallback = 'untitled-conversation'): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(ILLEGAL_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  if (!cleaned || RESERVED_NAMES.test(cleaned)) {
    return fallback;
  }

  return cleaned.slice(0, MAX_FILENAME_LENGTH).trim() || fallback;
}

export function formatTimestampForFilename(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

export function buildConversationFilename(index: number, title: string, date = new Date()): string {
  return buildPlatformConversationFilename('chatgpt', index, title, date);
}

export function buildPlatformConversationFilename(
  platformPrefix: string,
  index: number,
  title: string,
  date = new Date(),
  extension = 'md'
): string {
  const safePrefix = sanitizeFilenamePart(platformPrefix, 'ai').toLowerCase().replace(/\s+/g, '-');
  const safeTitle = sanitizeFilenamePart(title);
  const safeIndex = String(index).padStart(4, '0');
  const safeExtension = sanitizeFilenamePart(extension, 'md').toLowerCase().replace(/^\.+/, '') || 'md';
  return `${safePrefix}-${safeIndex}-${safeTitle}-${formatTimestampForFilename(date)}.${safeExtension}`;
}
