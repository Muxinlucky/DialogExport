import { matchesHost } from '../generic-adapter';
import type { PlatformAdapter } from '../types';
import { diagnoseQianwenCurrentPage, exportQianwenCurrentConversation } from './conversation';
import { scanQianwenHistoryConversations } from './sidebar';

export const qianwenAdapter: PlatformAdapter = {
  id: 'qianwen',
  name: 'Qwen / 通义千问',
  hostnames: [
    'chat.qwen.ai',
    'qwen.ai',
    'www.qwen.ai',
    'chat.qwenlm.ai',
    'qwenlm.ai',
    'www.qwenlm.ai',
    'tongyi.aliyun.com',
    'www.tongyi.com',
    'tongyi.com',
    'qianwen.com',
    'www.qianwen.com'
  ],
  capabilities: { exportCurrentConversation: true, scanHistory: true, exportSelectedConversations: true },
  matchUrl(url: string) {
    return matchesHost(url, this.hostnames);
  },
  exportCurrentConversation: exportQianwenCurrentConversation,
  diagnoseCurrentPage: diagnoseQianwenCurrentPage,
  scanHistoryConversations: scanQianwenHistoryConversations
};
