import { matchesHost } from '../generic-adapter';
import type { PlatformAdapter } from '../types';
import { diagnoseKimiCurrentPage, exportKimiCurrentConversation } from './conversation';
import { scanKimiHistoryConversations } from './sidebar';

export const kimiAdapter: PlatformAdapter = {
  id: 'kimi',
  name: 'Kimi',
  hostnames: ['kimi.com', 'www.kimi.com', 'kimi.moonshot.cn'],
  capabilities: { exportCurrentConversation: true, scanHistory: true, exportSelectedConversations: true },
  matchUrl(url: string) {
    return matchesHost(url, this.hostnames);
  },
  exportCurrentConversation: exportKimiCurrentConversation,
  diagnoseCurrentPage: diagnoseKimiCurrentPage,
  scanHistoryConversations: scanKimiHistoryConversations
};
