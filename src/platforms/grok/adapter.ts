import { matchesHost } from '../generic-adapter';
import type { PlatformAdapter } from '../types';
import { diagnoseGrokCurrentPage, exportGrokCurrentConversation } from './conversation';
import { scanGrokHistoryConversations } from './sidebar';

export const grokAdapter: PlatformAdapter = {
  id: 'grok',
  name: 'Grok',
  hostnames: ['grok.com', 'x.com'],
  capabilities: { exportCurrentConversation: true, scanHistory: true, exportSelectedConversations: true },
  matchUrl(url: string) {
    if (!matchesHost(url, this.hostnames)) {
      return false;
    }

    try {
      const parsed = new URL(url);

      if (parsed.hostname === 'x.com' || parsed.hostname.endsWith('.x.com')) {
        return parsed.pathname === '/i/grok' || parsed.pathname.startsWith('/i/grok/');
      }

      return true;
    } catch {
      return false;
    }
  },
  exportCurrentConversation: exportGrokCurrentConversation,
  diagnoseCurrentPage: diagnoseGrokCurrentPage,
  scanHistoryConversations: scanGrokHistoryConversations
};
