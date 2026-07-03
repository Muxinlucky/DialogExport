import { diagnoseCurrentPage, exportPlatformCurrentConversation } from '../common/generic-conversation';
import type { PlatformConversationConfig } from '../types';

const config: PlatformConversationConfig = {
  id: 'gemini',
  name: 'Gemini',
  parserName: 'gemini-parser',
  noMessageError: 'Gemini 当前页面未提取到对话消息。',
  messageSelectors: ['main message-content', 'main model-response', 'main user-query', 'message-content', 'model-response', 'user-query', '[class*="conversation"]', '[class*="response"]', '[class*="query"]'],
  userSelectors: ['user-query', '[class*="user-query"]', '[class*="query-container"]'],
  assistantSelectors: ['model-response', '[class*="model-response"]', '[class*="response-container"]'],
  titleSelectors: ['h1', '[data-test-id*="conversation-title"]'],
  titleCleanupPatterns: [/\s*[-|]\s*Gemini\s*$/i]
};

export function exportGeminiCurrentConversation() {
  return exportPlatformCurrentConversation(config);
}

export function diagnoseGeminiCurrentPage() {
  return diagnoseCurrentPage(config);
}
