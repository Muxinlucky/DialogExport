export const SUPPORTED_CHATGPT_ORIGINS = [
  'https://chatgpt.com',
  'https://chat.openai.com'
] as const;

export const DEFAULT_EXPORT_STATE = {
  status: 'idle',
  total: 0,
  current: 0,
  success: 0,
  failed: 0,
  errors: [],
  results: []
} as const;

export const EXPORT_DELAY_MS = 1500;
export const CONVERSATION_LOAD_TIMEOUT_MS = 30000;
export const MAX_FILENAME_LENGTH = 120;
export const TAB_LOAD_TIMEOUT_MS = 30000;
export const CONVERSATION_RENDER_WAIT_MIN_MS = 1000;
export const CONVERSATION_RENDER_WAIT_MAX_MS = 2000;
export const CONTENT_MESSAGE_RETRY_LIMIT = 5;
export const CONTENT_MESSAGE_RETRY_DELAY_MS = 1000;
export const CONTENT_EXTRACTION_TIMEOUT_MS = 30000;
export const SIDEBAR_SCAN_MAX_SCROLLS = 120;
export const SIDEBAR_SCAN_STABLE_LIMIT = 5;
export const SIDEBAR_SCAN_MIN_WAIT_MS = 800;
export const SIDEBAR_SCAN_MAX_WAIT_MS = 1500;

export const CHATGPT_SELECTORS = {
  main: 'main',
  messages: '[data-message-author-role]',
  messageContentCandidates: [
    '[data-message-content-part]',
    '.markdown',
    '.whitespace-pre-wrap',
    '[class*="whitespace-pre-wrap"]'
  ],
  conversationTitleCandidates: [
    'main h1',
    'h1',
    '[data-testid="conversation-title"]'
  ],
  sidebarConversationLinks: [
    'nav a[href*="/c/"]',
    'aside a[href*="/c/"]',
    'a[href*="/c/"]'
  ],
  sidebarContainers: [
    'aside',
    'nav',
    'div[role="navigation"]'
  ],
  skippedContent: [
    'button',
    'svg',
    'script',
    'style',
    'noscript',
    '[aria-hidden="true"]'
  ],
  richMedia: {
    image: 'img',
    canvas: 'canvas',
    video: 'video',
    audio: 'audio',
    iframe: 'iframe',
    attachmentCandidates: [
      '[data-testid*="attachment"]',
      '[data-testid*="file"]',
      '[aria-label*="attachment" i]',
      '[aria-label*="file" i]'
    ]
  }
} as const;
