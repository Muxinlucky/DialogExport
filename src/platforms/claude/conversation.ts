import { diagnoseCurrentPage, exportPlatformCurrentConversation } from '../common/generic-conversation';
import type { PlatformConversationConfig } from '../types';

const config: PlatformConversationConfig = {
  id: 'claude',
  name: 'Claude',
  parserName: 'claude-parser',
  noMessageError: 'Claude 当前页面未提取到对话消息。',
  messageSelectors: ['main article', '[role="main"] article', '[data-testid*="message"]', '[class*="message"]', '[class*="prose"]', '[class*="font-claude-message"]'],
  userSelectors: ['[data-testid*="user-message"]', '[class*="user-message"]'],
  assistantSelectors: ['[data-testid*="assistant-message"]', '[class*="assistant-message"]', '[class*="font-claude-message"]'],
  titleSelectors: ['h1', '[data-testid*="conversation-title"]'],
  titleCleanupPatterns: [/\s*[-|]\s*Claude\s*$/i]
};

export function exportClaudeCurrentConversation() {
  return exportPlatformCurrentConversation(config);
}

export function diagnoseClaudeCurrentPage() {
  return diagnoseCurrentPage(config);
}
