import { matchesHost } from '../generic-adapter';
import type { PlatformAdapter } from '../types';
import { diagnoseGeminiCurrentPage, exportGeminiCurrentConversation } from './conversation';
import { scanGeminiHistoryConversations } from './sidebar';

export const geminiAdapter: PlatformAdapter = {
  id: 'gemini',
  name: 'Gemini',
  hostnames: ['gemini.google.com'],
  capabilities: { exportCurrentConversation: true, scanHistory: true, exportSelectedConversations: true },
  matchUrl(url: string) {
    return matchesHost(url, this.hostnames);
  },
  exportCurrentConversation: exportGeminiCurrentConversation,
  diagnoseCurrentPage: diagnoseGeminiCurrentPage,
  scanHistoryConversations: scanGeminiHistoryConversations
};
