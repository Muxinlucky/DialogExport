import { describe, expect, it } from 'vitest';
import { buildUtf8DataUrl } from '../src/core/download';
import { buildConversationFilename, sanitizeFilenamePart } from '../src/core/filename';
import { conversationToMarkdown } from '../src/core/markdown';
import { buildExportFilePayload } from '../src/core/export-format';

describe('filename handling', () => {
  it('removes Windows path characters and reserved names', () => {
    expect(sanitizeFilenamePart('  report:/2026?  ')).toBe('report 2026');
    expect(sanitizeFilenamePart('CON')).toBe('untitled-conversation');
  });

  it('builds stable platform filenames with the selected extension', () => {
    expect(buildConversationFilename(2, '测试对话', new Date(2026, 0, 2, 3, 4, 5))).toBe(
      'chatgpt-0002-测试对话-20260102-030405.md'
    );
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
