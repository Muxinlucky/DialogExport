export type ExportStatus =
  | 'idle'
  | 'collecting'
  | 'exporting'
  | 'stopped'
  | 'completed'
  | 'failed';

export type ExportFormat = 'md' | 'txt' | 'doc';

export interface ConversationItem {
  id: string;
  title: string;
  url: string;
  group?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'unknown';
  content: string;
}

export interface ExportedConversation {
  platform: string;
  title: string;
  url: string;
  exportedAt: string;
  messages: ChatMessage[];
}

export interface ExportError {
  title?: string;
  url: string;
  reason: string;
}

export interface ExportSuccessRecord {
  title: string;
  url: string;
  filename: string;
  exportedAt: string;
}

export interface ExportTaskState {
  status: ExportStatus;
  total: number;
  current: number;
  success: number;
  failed: number;
  currentTitle?: string;
  currentUrl?: string;
  errors: ExportError[];
  results: ExportSuccessRecord[];
}

export type RuntimeRequest =
  | { type: 'PING_PLATFORM_PAGE' }
  | { type: 'EXPORT_CURRENT_CONVERSATION' }
  | { type: 'COLLECT_SIDEBAR_CONVERSATIONS' }
  | { type: 'DOWNLOAD_MARKDOWN'; filename: string; markdown: string }
  | { type: 'DOWNLOAD_EXPORT_FILE'; filename: string; content: string; mimeType: string }
  | { type: 'START_SELECTED_CONVERSATION_EXPORT'; tabId: number; conversations: ConversationItem[]; platformId?: string; platformName?: string; format?: ExportFormat }
  | { type: 'STOP_EXPORT_TASK' }
  | { type: 'GET_EXPORT_TASK_STATE' };

export type RuntimeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface PageInfo {
  platform: string;
  platformId?: string;
  url: string;
  title: string;
  capabilities?: {
    exportCurrentConversation: boolean;
    scanHistory: boolean;
    exportSelectedConversations: boolean;
  };
}

export interface DownloadResult {
  downloadId: number;
}
