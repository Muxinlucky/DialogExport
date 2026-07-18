import type { DownloadResult } from './types';

export async function downloadMarkdown(filename: string, markdown: string): Promise<DownloadResult> {
  return downloadTextFile(filename, markdown, 'text/markdown;charset=utf-8');
}

export async function downloadTextFile(filename: string, content: string, mimeType: string): Promise<DownloadResult> {
  const dataUrl = buildUtf8DataUrl(content, mimeType);
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: 'uniquify'
  });

  return { downloadId };
}

export function buildUtf8DataUrl(content: string, mimeType: string): string {
  const bytes = new TextEncoder().encode(content);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}
