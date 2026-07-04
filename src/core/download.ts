import type { DownloadResult } from './types';

export async function downloadMarkdown(filename: string, markdown: string): Promise<DownloadResult> {
  return downloadTextFile(filename, markdown, 'text/markdown;charset=utf-8');
}

export async function downloadTextFile(filename: string, content: string, mimeType: string): Promise<DownloadResult> {
  const dataUrl = `data:${mimeType},${encodeURIComponent(content)}`;
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: 'uniquify'
  });

  return { downloadId };
}
