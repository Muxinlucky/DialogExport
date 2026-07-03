import { diagnoseCurrentPage, exportPlatformCurrentConversation } from '../common/generic-conversation';
import type { PlatformConversationConfig } from '../types';

const config: PlatformConversationConfig = {
  id: 'doubao',
  name: '豆包 Doubao',
  parserName: 'doubao-parser',
  noMessageError: '豆包当前页面未提取到对话消息。',
  messageSelectors: ['main [class*="chat"]', 'main [class*="message"]', 'main [class*="conversation"]', 'main [class*="answer"]', 'main [class*="question"]', 'main [class*="markdown"]', 'main [class*="bubble"]', '[data-testid*="message"]'],
  userSelectors: ['[class*="user"]', '[class*="question"]'],
  assistantSelectors: ['[class*="assistant"]', '[class*="answer"]', '[class*="markdown"]'],
  titleSelectors: ['h1'],
  titleCleanupPatterns: [/\s*[-|]\s*豆包\s*$/]
};

export function exportDoubaoCurrentConversation() {
  return exportPlatformCurrentConversation(config);
}

export function diagnoseDoubaoCurrentPage() {
  return diagnoseCurrentPage(config);
}
