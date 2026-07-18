import { describe, expect, it } from 'vitest';
import { buildUtf8DataUrl } from '../src/core/download';
import { buildConversationFilename, sanitizeFilenamePart } from '../src/core/filename';
import { conversationToMarkdown } from '../src/core/markdown';
import { buildExportFilePayload } from '../src/core/export-format';
import { buildArchiveEntryPath, buildArchiveFilename } from '../src/core/archive';

describe('filename handling', () => {
  it('removes Windows path characters and reserved names', () => {
    expect(sanitizeFilenamePart('  report:/2026?  ')).toBe('report 2026');
    expect(sanitizeFilenamePart('CON')).toBe('untitled-conversation');
  });

  it('builds stable platform filenames with the selected extension', () => {
    expect(buildConversationFilename(2, '测试对话', new Date(2026, 0, 2, 3, 4, 5))).toBe(
      '测试对话.md'
    );
  });

  it('keeps conversation filenames compact', () => {
    expect(buildConversationFilename(1, '这是一个非常长的对话标题'.repeat(8))).toBe(
      `${'这是一个非常长的对话标题'.repeat(8).slice(0, 48)}.md`
    );
  });

  it('puts project files in folders and disambiguates duplicate titles', () => {
    const usedPaths = new Set<string>();
    expect(buildArchiveEntryPath('论文', '第一天', 'md', usedPaths)).toBe('论文/第一天.md');
    expect(buildArchiveEntryPath('论文', '第一天', 'md', usedPaths)).toBe('论文/第一天 (2).md');
    expect(buildArchiveEntryPath(undefined, '第一天', 'md', usedPaths)).toBe('第一天.md');
  });

  it('builds a timestamped ZIP filename', () => {
    expect(buildArchiveFilename('chatgpt', new Date(2026, 0, 2, 3, 4, 5))).toBe('chatgpt-export-20260102-030405.zip');
  });
});

describe('export formatting', () => {
  const conversation = {
    platform: 'Test',
    title: 'A title',
    url: 'https://example.com/c/1',
    exportedAt: '2026-01-02 03:04:05',
    messages: [
      { role: 'user' as const, content: 'same' },
      { role: 'user' as const, content: 'same' },
      { role: 'assistant' as const, content: 'answer' }
    ]
  };

  it('keeps legitimate repeated messages', () => {
    const markdown = conversationToMarkdown(conversation);
    expect(markdown.match(/## User/g)).toHaveLength(2);
  });

  it('escapes Word-compatible output as HTML', () => {
    const payload = buildExportFilePayload('# <unsafe>', 'doc');
    expect(payload.extension).toBe('doc');
    expect(payload.content).toContain('&lt;unsafe&gt;');
  });

  it('uses compact UTF-8 base64 data URLs', () => {
    const url = buildUtf8DataUrl('你好', 'text/plain;charset=utf-8');
    expect(url).toMatch(/^data:text\/plain;charset=utf-8;base64,/);
    expect(atob(url.split(',')[1])).toBe('ä½ å¥½');
  });
});
