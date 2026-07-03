import { matchesHost } from '../generic-adapter';
import type { PlatformAdapter } from '../types';
import { diagnoseDeepSeekCurrentPage, exportDeepSeekCurrentConversation } from './conversation';
import { scanDeepSeekHistoryConversations } from './sidebar';

export const deepseekAdapter: PlatformAdapter = {
  id: 'deepseek',
  name: 'DeepSeek',
  hostnames: ['chat.deepseek.com'],
  capabilities: { exportCurrentConversation: true, scanHistory: true, exportSelectedConversations: true },
  matchUrl(url: string) {
    return matchesHost(url, this.hostnames);
  },
  exportCurrentConversation: exportDeepSeekCurrentConversation,
  diagnoseCurrentPage: diagnoseDeepSeekCurrentPage,
  scanHistoryConversations: scanDeepSeekHistoryConversations
};
