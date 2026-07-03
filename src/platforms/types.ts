import type { ConversationItem, ExportedConversation } from '../core/types';
import type { ChatMessage } from '../core/types';

export type PlatformId =
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'grok'
  | 'deepseek'
  | 'kimi'
  | 'doubao'
  | 'qianwen'
  | 'yuanbao';

export interface PlatformCapabilities {
  exportCurrentConversation: boolean;
  scanHistory: boolean;
  exportSelectedConversations: boolean;
}

export interface PlatformAdapter {
  id: PlatformId;
  name: string;
  hostnames: string[];
  capabilities: PlatformCapabilities;
  matchUrl(url: string): boolean;
  exportCurrentConversation(): Promise<ExportedConversation>;
  diagnoseCurrentPage?(): Promise<PageDiagnosis>;
  scanHistoryConversations?(): Promise<ConversationItem[]>;
}

export interface GenericConversationOptions {
  id: PlatformId;
  name: string;
  messageSelectors: string[];
  userSelectors?: string[];
  assistantSelectors?: string[];
  titleSelectors?: string[];
  titleCleanupPatterns?: RegExp[];
}

export interface PageDiagnosis {
  platformId: PlatformId;
  platformName: string;
  url: string;
  parser: string;
  rootCandidateCount: number;
  messageCandidateCount: number;
  extractedMessageCount: number;
  previews: Array<{
    role: ChatMessage['role'];
    text: string;
  }>;
  warnings: string[];
}

export interface PlatformConversationConfig extends GenericConversationOptions {
  parserName: string;
  noMessageError: string;
}
