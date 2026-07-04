import type { ExportFormat } from './types';

export interface ExportFilePayload {
  extension: 'md' | 'txt' | 'doc';
  content: string;
  mimeType: string;
}

export function buildExportFilePayload(markdown: string, format: ExportFormat): ExportFilePayload {
  if (format === 'txt') {
    return {
      extension: 'txt',
      content: markdown,
      mimeType: 'text/plain;charset=utf-8'
    };
  }

  if (format === 'doc') {
    return {
      extension: 'doc',
      content: markdownToWordHtml(markdown),
      mimeType: 'application/msword;charset=utf-8'
    };
  }

  return {
    extension: 'md',
    content: markdown,
    mimeType: 'text/markdown;charset=utf-8'
  };
}

function markdownToWordHtml(markdown: string): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<title>DialogExport</title>',
    '<style>',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65;color:#172026;}',
    'pre{white-space:pre-wrap;font-family:Consolas,"Liberation Mono",monospace;font-size:11pt;}',
    '</style>',
    '</head>',
    '<body>',
    '<pre>',
    escapeHtml(markdown),
    '</pre>',
    '</body>',
    '</html>'
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
