import { diagnoseCurrentPage, exportPlatformCurrentConversation } from '../common/generic-conversation';
import type { PlatformConversationConfig } from '../types';

const config: PlatformConversationConfig = {
  id: 'deepseek',
  name: 'DeepSeek',
  parserName: 'deepseek-parser',
  noMessageError: 'DeepSeek 当前页面未提取到对话消息。',
  messageSelectors: ['main [class*="chat"]', 'main [class*="message"]', 'main [class*="markdown"]', 'main [class*="answer"]', 'main [class*="question"]', '[data-testid*="message"]'],
  userSelectors: ['[class*="user"]', '[class*="question"]'],
  assistantSelectors: ['[class*="assistant"]', '[class*="answer"]', '[class*="markdown"]'],
  titleSelectors: ['h1'],
  titleCleanupPatterns: [/\s*[-|]\s*DeepSeek\s*$/i]
};

export function exportDeepSeekCurrentConversation() {
  return exportPlatformCurrentConversation(config);
}

export function diagnoseDeepSeekCurrentPage() {
  return diagnoseCurrentPage(config);
}
