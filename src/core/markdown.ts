import type { ExportError, ExportedConversation } from './types';

export function formatDateTime(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function conversationToMarkdown(conversation: ExportedConversation): string {
  const title = conversation.title || 'untitled-conversation';
  const parts = [
    `# ${title}`,
    '',
    `平台：${conversation.platform}`,
    `导出时间：${conversation.exportedAt}`,
    `来源链接：${conversation.url}`,
    '',
    '---',
    ''
  ];

  for (const message of conversation.messages) {
    const heading = roleToHeading(message.role);
    parts.push(`## ${heading}`, '', message.content.trim(), '', '---', '');
  }

  return parts.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
}

export function buildIndexMarkdown(items: Array<{ index: number; title: string; filename: string; url: string }>): string {
  const lines = [
    '# ChatGPT 导出索引',
    '',
    `导出时间：${formatDateTime()}`,
    '',
    '| 序号 | 标题 | 文件名 | 原始链接 |',
    '| --- | --- | --- | --- |'
  ];

  for (const item of items) {
    lines.push(`| ${item.index} | ${escapeTableCell(item.title)} | ${escapeTableCell(item.filename)} | ${escapeTableCell(item.url)} |`);
  }

  return lines.join('\n') + '\n';
}

export function buildFailedMarkdown(errors: ExportError[]): string {
  const lines = [
    '# ChatGPT 导出失败记录',
    '',
    `导出时间：${formatDateTime()}`,
    '',
    '| 标题 | 链接 | 失败原因 |',
    '| --- | --- | --- |'
  ];

  for (const error of errors) {
    lines.push(`| ${escapeTableCell(error.title || '')} | ${escapeTableCell(error.url)} | ${escapeTableCell(error.reason)} |`);
  }

  return lines.join('\n') + '\n';
}

function roleToHeading(role: ExportedConversation['messages'][number]['role']): string {
  switch (role) {
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    default:
      return 'Unknown';
  }
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}
