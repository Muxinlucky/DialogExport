import { diagnoseCurrentPage, exportPlatformCurrentConversation } from '../common/generic-conversation';
import type { PlatformConversationConfig } from '../types';

const config: PlatformConversationConfig = {
  id: 'yuanbao',
  name: '腾讯元宝 Yuanbao',
  parserName: 'yuanbao-parser',
  noMessageError: '腾讯元宝当前页面未提取到对话消息。',
  messageSelectors: ['main [class*="chat"]', 'main [class*="message"]', 'main [class*="conversation"]', 'main [class*="answer"]', 'main [class*="question"]', 'main [class*="markdown"]', 'main [class*="bubble"]', '[data-testid*="message"]'],
  userSelectors: ['[class*="user"]', '[class*="question"]'],
  assistantSelectors: ['[class*="assistant"]', '[class*="answer"]', '[class*="markdown"]'],
  titleSelectors: ['h1'],
  titleCleanupPatterns: [/\s*[-|]\s*(腾讯元宝|元宝|Yuanbao)\s*$/i]
};

export function exportYuanbaoCurrentConversation() {
  return exportPlatformCurrentConversation(config);
}

export function diagnoseYuanbaoCurrentPage() {
  return diagnoseCurrentPage(config);
}
