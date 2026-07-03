import type { DownloadResult } from './types';

export async function downloadMarkdown(filename: string, markdown: string): Promise<DownloadResult> {
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: 'uniquify'
  });

  return { downloadId };
}
