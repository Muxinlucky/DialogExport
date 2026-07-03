import { diagnoseCurrentPage, exportPlatformCurrentConversation } from '../common/generic-conversation';
import type { PlatformConversationConfig } from '../types';

const config: PlatformConversationConfig = {
  id: 'qianwen',
  name: 'Qwen / 通义千问',
  parserName: 'qwen-parser',
  noMessageError: 'Qwen 当前页面未提取到对话消息，请打开具体对话页后重试。',
  messageSelectors: [
    'main article',
    '[role="main"] article',
    'article',
    'main [data-message-id]',
    '[role="main"] [data-message-id]',
    'main [data-testid*="message" i]',
    '[role="main"] [data-testid*="message" i]',
    'main [data-testid*="answer" i]',
    '[role="main"] [data-testid*="answer" i]',
    'main [data-testid*="query" i]',
    '[role="main"] [data-testid*="query" i]',
    'main [data-testid*="chat" i]',
    '[role="main"] [data-testid*="chat" i]',
    'main [class*="message" i]',
    '[role="main"] [class*="message" i]',
    'main [class*="chat" i]',
    '[role="main"] [class*="chat" i]',
    'main [class*="conversation" i]',
    '[role="main"] [class*="conversation" i]',
    'main [class*="answer" i]',
    '[role="main"] [class*="answer" i]',
    'main [class*="question" i]',
    '[role="main"] [class*="question" i]',
    'main [class*="markdown" i]',
    '[role="main"] [class*="markdown" i]',
    'main [class*="prose" i]',
    '[role="main"] [class*="prose" i]',
    'main [class*="bubble" i]',
    '[role="main"] [class*="bubble" i]',
    'main [class*="whitespace-pre-wrap" i]',
    '[role="main"] [class*="whitespace-pre-wrap" i]',
    'main [class*="break-words" i]',
    '[role="main"] [class*="break-words" i]',
    'main [class*="content" i]',
    '[role="main"] [class*="content" i]',
    'main [dir="auto"]',
    '[role="main"] [dir="auto"]',
    'main p',
    '[role="main"] p',
    'main li',
    '[role="main"] li',
    'main pre',
    '[role="main"] pre',
    'main code',
    '[role="main"] code'
  ],
  userSelectors: [
    '[class*="user" i]',
    '[class*="question" i]',
    '[data-role="user"]',
    '[data-author="user"]'
  ],
  assistantSelectors: [
    '[class*="assistant" i]',
    '[class*="answer" i]',
    '[class*="markdown" i]',
    '[class*="response" i]',
    '[data-role="assistant"]',
    '[data-author="assistant"]'
  ],
  titleSelectors: ['main h1', '[role="main"] h1', 'h1', 'title'],
  titleCleanupPatterns: [/\s*[-|]\s*(通义千问|Qwen|千问)\s*$/i]
};

export function exportQianwenCurrentConversation() {
  return exportPlatformCurrentConversation(config);
}

export function diagnoseQianwenCurrentPage() {
  return diagnoseCurrentPage(config);
}
