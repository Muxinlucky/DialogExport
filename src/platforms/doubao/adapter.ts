import { matchesHost } from '../generic-adapter';
import type { PlatformAdapter } from '../types';
import { diagnoseDoubaoCurrentPage, exportDoubaoCurrentConversation } from './conversation';
import { scanDoubaoHistoryConversations } from './sidebar';

export const doubaoAdapter: PlatformAdapter = {
  id: 'doubao',
  name: '豆包 Doubao',
  hostnames: ['doubao.com', 'www.doubao.com'],
  capabilities: { exportCurrentConversation: true, scanHistory: true, exportSelectedConversations: true },
  matchUrl(url: string) {
    return matchesHost(url, this.hostnames);
  },
  exportCurrentConversation: exportDoubaoCurrentConversation,
  diagnoseCurrentPage: diagnoseDoubaoCurrentPage,
  scanHistoryConversations: scanDoubaoHistoryConversations
};
