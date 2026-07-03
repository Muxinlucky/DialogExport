import { scanSidebarConversationsByConfig } from '../common/sidebar-scanner';

const allowedHostnames = ['claude.ai', 'claude.com'];

export function scanClaudeHistoryConversations() {
  return scanSidebarConversationsByConfig({
    platformId: 'claude',
    platformName: 'Claude',
    allowedHostnames,
    linkSelectors: [
      'a[href*="/chat/"]',
      'a[href^="/chat/"]',
      'a[href*="/project/"][href*="/chat/"]',
      'a[href*="/conversation"]',
      'a[href*="/session"]',
      'a[href*="/thread"]',
      'a[href*="chatId"]',
      'a[href*="conversationId"]',
      'a[href*="sessionId"]',
      'a[href*="threadId"]'
    ],
    containerSelectors: [
      'aside',
      'nav',
      'div[role="navigation"]',
      '[class*="sidebar" i]',
      '[class*="sider" i]',
      '[class*="history" i]',
      '[class*="recent" i]',
      '[class*="conversation" i]',
      '[class*="session" i]',
      '[class*="chat" i]',
      '[data-testid*="sidebar" i]',
      '[data-testid*="history" i]',
      '[data-testid*="recents" i]'
    ],
    includeHrefKeywords: [
      '/chat/',
      '/conversation',
      '/session',
      '/thread',
      'chatid',
      'conversationid',
      'sessionid',
      'threadid'
    ],
    excludeHrefKeywords: [
      '/new',
      '/create',
      '/setting',
      '/settings',
      '/profile',
      '/account',
      '/user',
      '/login',
      '/logout',
      '/help',
      '/download',
      '/pricing',
      '/privacy',
      '/terms',
      '/about',
      '/share',
      '/invite',
      '/upgrade',
      '/plans',
      '/billing',
      '/api',
      'login',
      'logout',
      'settings',
      'profile',
      'download',
      'billing'
    ],
    maxScrollTimes: 120,
    stableRoundLimit: 5,
    scrollDelayMs: 1000,
    noContainerError: 'Claude 未找到历史会话列表，请确认左侧历史栏已展开。',
    noResultError: 'Claude 未发现可导出的历史会话链接。可能该页面历史项不是普通链接，请确认左侧栏已展开后重试。',
    rootResolver: findClaudeHistoryRoot,
    validateCandidate({ url, title }) {
      if (isClaudeExcludedTitle(title)) {
        return `排除非历史入口标题：${title}`;
      }

      if (!isClaudeConversationUrl(url)) {
        return '排除非历史对话 URL';
      }

      return true;
    }
  });
}

function findClaudeHistoryRoot(): ParentNode | null {
  const titleElement = findTextElement(['Recents', 'Recent', 'Chats', 'History', '历史会话', '历史记录', '最近对话', '聊天记录']);

  if (!titleElement) {
    return null;
  }

  let current = titleElement.parentElement;

  while (current && current !== document.body) {
    if (current.querySelector('a[href*="/chat/"], a[href*="/conversation"], a[href*="/session"], a[href*="chatId"], a[href*="conversationId"]')) {
      return current;
    }

    current = current.parentElement;
  }

  return titleElement.closest('aside, nav, [role="navigation"]') || null;
}

function findTextElement(texts: string[]): HTMLElement | null {
  const elements = Array.from(document.querySelectorAll('aside *, nav *, [role="navigation"] *, [class*="sidebar" i] *'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement);

  return elements.find((element) => {
    const text = (element.innerText || element.textContent || '').trim();
    return texts.some((expected) => text === expected || text.includes(expected));
  }) || null;
}

function isClaudeConversationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/g, '');
    const lower = `${pathname}?${parsed.search}`.toLowerCase();

    if (pathname === '' || pathname === '/' || lower === '/chat' || lower === '/chat/') {
      return false;
    }

    if (/(login|logout|setting|settings|profile|account|user|help|download|pricing|privacy|terms|about|share|new|create|invite|upgrade|plans|billing|api)/i.test(lower)) {
      return false;
    }

    const id = extractClaudeConversationId(parsed);
    return Boolean(id && /[a-z0-9_-]{6,}/i.test(id));
  } catch {
    return false;
  }
}

function extractClaudeConversationId(parsed: URL): string | null {
  const projectChatMatch = parsed.pathname.match(/\/project\/[^/?#]+\/chat\/([^/?#]+)/i);

  if (projectChatMatch?.[1]) {
    return decodeURIComponent(projectChatMatch[1]);
  }

  const pathMatch = parsed.pathname.match(/\/(?:chat|conversation|session|thread)\/([^/?#]+)/i);

  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }

  for (const key of ['chatId', 'conversationId', 'sessionId', 'threadId', 'cid', 'id']) {
    const value = parsed.searchParams.get(key);

    if (value) {
      return value;
    }
  }

  return null;
}

function isClaudeExcludedTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, '').trim().toLowerCase();

  return [
    'claude',
    'newchat',
    'newconversation',
    'recents',
    'recent',
    'history',
    'chats',
    'projects',
    'settings',
    'profile',
    'upgrade',
    '新对话',
    '新建对话',
    '历史',
    '历史记录',
    '最近对话',
    '项目',
    '设置',
    '帮助',
    '登录',
    '个人中心'
  ].some((value) => normalized === value.toLowerCase());
}
