import { exportCurrentConversation } from '../../content/chatgpt-conversation';
import { collectSidebarConversations } from '../../content/chatgpt-sidebar';
import { diagnoseWithParser } from '../common/generic-conversation';
import { matchesHost } from '../generic-adapter';
import type { PageDiagnosis, PlatformConversationConfig } from '../types';
import type { PlatformAdapter } from '../types';

const chatgptDiagnosisConfig: PlatformConversationConfig = {
  id: 'chatgpt',
  name: 'ChatGPT',
  parserName: 'chatgpt-parser',
  noMessageError: 'ChatGPT 当前页面未提取到对话消息。',
  messageSelectors: ['[data-message-author-role]', '[data-message-content-part]', 'main article', '.markdown'],
  userSelectors: ['[data-message-author-role="user"]'],
  assistantSelectors: ['[data-message-author-role="assistant"]'],
  titleSelectors: ['main h1', 'h1', '[data-testid="conversation-title"]'],
  titleCleanupPatterns: [/\s*[-|]\s*ChatGPT\s*$/i]
};

export const chatgptAdapter: PlatformAdapter = {
  id: 'chatgpt',
  name: 'ChatGPT',
  hostnames: ['chatgpt.com', 'chat.openai.com'],
  capabilities: {
    exportCurrentConversation: true,
    scanHistory: true,
    exportSelectedConversations: true
  },
  matchUrl(url: string) {
    return matchesHost(url, this.hostnames);
  },
  exportCurrentConversation,
  diagnoseCurrentPage(): Promise<PageDiagnosis> {
    return diagnoseWithParser(chatgptDiagnosisConfig, exportCurrentConversation);
  },
  scanHistoryConversations: collectSidebarConversations
};
