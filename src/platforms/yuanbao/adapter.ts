import { matchesHost } from '../generic-adapter';
import type { PlatformAdapter } from '../types';
import { diagnoseYuanbaoCurrentPage, exportYuanbaoCurrentConversation } from './conversation';
import { scanYuanbaoHistoryConversations } from './sidebar';

export const yuanbaoAdapter: PlatformAdapter = {
  id: 'yuanbao',
  name: '腾讯元宝 Yuanbao',
  hostnames: ['yuanbao.tencent.com'],
  capabilities: { exportCurrentConversation: true, scanHistory: true, exportSelectedConversations: true },
  matchUrl(url: string) {
    return matchesHost(url, this.hostnames);
  },
  exportCurrentConversation: exportYuanbaoCurrentConversation,
  diagnoseCurrentPage: diagnoseYuanbaoCurrentPage,
  scanHistoryConversations: scanYuanbaoHistoryConversations
};
