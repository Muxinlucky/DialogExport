import { exportGenericCurrentConversation } from './common/generic-conversation';
import type { GenericConversationOptions, PlatformAdapter, PlatformCapabilities, PlatformId } from './types';

const CURRENT_ONLY_CAPABILITIES: PlatformCapabilities = {
  exportCurrentConversation: true,
  scanHistory: false,
  exportSelectedConversations: false
};

export function createGenericCurrentOnlyAdapter(config: {
  id: PlatformId;
  name: string;
  hostnames: string[];
  messageSelectors: string[];
  userSelectors?: string[];
  assistantSelectors?: string[];
  titleSelectors?: string[];
  titleCleanupPatterns?: RegExp[];
}): PlatformAdapter {
  const options: GenericConversationOptions = {
    id: config.id,
    name: config.name,
    messageSelectors: config.messageSelectors,
    userSelectors: config.userSelectors,
    assistantSelectors: config.assistantSelectors,
    titleSelectors: config.titleSelectors,
    titleCleanupPatterns: config.titleCleanupPatterns
  };

  return {
    id: config.id,
    name: config.name,
    hostnames: config.hostnames,
    capabilities: CURRENT_ONLY_CAPABILITIES,
    matchUrl(url: string) {
      return matchesHost(url, config.hostnames);
    },
    exportCurrentConversation() {
      return exportGenericCurrentConversation(options);
    }
  };
}

export function matchesHost(url: string, hostnames: string[]): boolean {
  try {
    const parsed = new URL(url);
    return hostnames.some((hostname) => parsed.hostname === hostname || parsed.hostname.endsWith(`.${hostname}`));
  } catch {
    return false;
  }
}
