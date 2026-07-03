import { matchesHost } from '../generic-adapter';
import type { PlatformAdapter } from '../types';
import { diagnoseClaudeCurrentPage, exportClaudeCurrentConversation } from './conversation';
import { scanClaudeHistoryConversations } from './sidebar';

export const claudeAdapter: PlatformAdapter = {
  id: 'claude',
  name: 'Claude',
  hostnames: ['claude.ai', 'claude.com'],
  capabilities: { exportCurrentConversation: true, scanHistory: true, exportSelectedConversations: true },
  matchUrl(url: string) {
    return matchesHost(url, this.hostnames);
  },
  exportCurrentConversation: exportClaudeCurrentConversation,
  diagnoseCurrentPage: diagnoseClaudeCurrentPage,
  scanHistoryConversations: scanClaudeHistoryConversations
};
