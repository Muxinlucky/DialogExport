import { formatTimestampForFilename } from './filename';
import { formatDateTime } from './markdown';
import type { ExportError, ExportStatus, ExportSuccessRecord } from './types';

const UNTITLED_CONVERSATION = 'untitled-conversation';

export function buildIndexMarkdown(params: {
  exportedAt: string;
  status: ExportStatus;
  total: number;
  success: number;
  failed: number;
  results: ExportSuccessRecord[];
  platformName?: string;
}): string {
  const platformName = params.platformName || 'ChatGPT';
  const title = params.status === 'stopped'
    ? `# ${platformName} 部分导出索引`
    : `# ${platformName} 导出索引`;

  const lines = [
    title,
    '',
    `导出时间：${params.exportedAt}`,
    `任务状态：${params.status}`,
    `选择导出：${params.total} 个`,
    `成功：${params.success} 个`,
    `失败：${params.failed} 个`,
    '',
    '---',
    ''
  ];

  if (params.results.length === 0) {
    lines.push('本次没有成功导出的对话。', '');
    return lines.join('\n');
  }

  lines.push(
    '| 序号 | 标题 | 文件名 | 原始链接 | 导出时间 |',
    '|---|---|---|---|---|'
  );

  params.results.forEach((result, index) => {
    lines.push(
      `| ${index + 1} | ${escapeMarkdownTableCell(result.title || UNTITLED_CONVERSATION)} | ${escapeMarkdownTableCell(result.filename)} | ${escapeMarkdownTableCell(result.url)} | ${escapeMarkdownTableCell(result.exportedAt)} |`
    );
  });

  return lines.join('\n') + '\n';
}

export function buildFailedMarkdown(params: {
  exportedAt: string;
  status: ExportStatus;
  errors: ExportError[];
  platformName?: string;
}): string {
  const platformName = params.platformName || 'ChatGPT';
  const lines = [
    `# ${platformName} 导出失败报告`,
    '',
    `导出时间：${params.exportedAt}`,
    `任务状态：${params.status}`,
    `失败数量：${params.errors.length}`,
    '',
    '---',
    '',
    '| 序号 | 标题 | 原始链接 | 失败原因 |',
    '|---|---|---|---|'
  ];

  params.errors.forEach((error, index) => {
    lines.push(
      `| ${index + 1} | ${escapeMarkdownTableCell(error.title || UNTITLED_CONVERSATION)} | ${escapeMarkdownTableCell(error.url)} | ${escapeMarkdownTableCell(error.reason || 'unknown error')} |`
    );
  });

  return lines.join('\n') + '\n';
}

export function escapeMarkdownTableCell(value: string): string {
  return value
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
    .trim();
}

export function buildReportFilename(type: 'index' | 'failed', date = new Date(), platformPrefix = 'chatgpt'): string {
  return `${platformPrefix}-export-${type}-${formatTimestampForFilename(date)}.md`;
}

export function getReportExportedAt(date = new Date()): string {
  return formatDateTime(date);
}
