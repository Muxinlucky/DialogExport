import type { DownloadResult } from './types';

export async function downloadMarkdown(filename: string, markdown: string): Promise<DownloadResult> {
  return downloadTextFile(filename, markdown, 'text/markdown;charset=utf-8');
}

export async function downloadTextFile(filename: string, content: string, mimeType: string): Promise<DownloadResult> {
  const dataUrl = buildUtf8DataUrl(content, mimeType);
  return downloadDataUrl(filename, dataUrl);
}

export async function downloadBinaryFile(filename: string, bytes: Uint8Array, mimeType: string): Promise<DownloadResult> {
  return downloadDataUrl(filename, buildBinaryDataUrl(bytes, mimeType));
}

async function downloadDataUrl(filename: string, dataUrl: string): Promise<DownloadResult> {
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
  return buildBinaryDataUrl(bytes, mimeType);
}

export function buildBinaryDataUrl(bytes: Uint8Array, mimeType: string): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}
