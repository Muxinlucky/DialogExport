import { scanSidebarConversationsByConfig } from '../common/sidebar-scanner';

const allowedHostnames = ['kimi.com', 'www.kimi.com', 'kimi.moonshot.cn'];

export function scanKimiHistoryConversations() {
  return scanSidebarConversationsByConfig({
    platformId: 'kimi',
    platformName: 'Kimi',
    allowedHostnames,
    linkSelectors: [
      'a[href*="/chat/"]',
      'a[href^="/chat/"]',
      'a[href*="/c/"]',
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
      '[class*="chat" i]'
    ],
    includeHrefKeywords: [
      '/chat/',
      '/c/',
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
      '/agent',
      '/bot',
      '/app',
      '/apps',
      '/explore',
      '/discover',
      '/setting',
      '/settings',
      '/profile',
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
      'login',
      'logout',
      'settings',
      'profile',
      'download'
    ],
    maxScrollTimes: 120,
    stableRoundLimit: 5,
    scrollDelayMs: 1000,
    noContainerError: 'Kimi 未找到历史会话列表，请确认左侧历史栏已展开。',
    noResultError: 'Kimi 未发现可导出的历史会话链接。可能该页面历史项不是普通链接，请确认左侧栏已展开后重试。',
    rootResolver: findKimiHistoryRoot,
    validateCandidate({ url, title }) {
      if (isKimiExcludedTitle(title)) {
        return `排除非历史入口标题：${title}`;
      }

      if (!isKimiConversationUrl(url)) {
        return '排除非历史对话 URL';
      }

      return true;
    }
  });
}

function findKimiHistoryRoot(): ParentNode | null {
  const titleElement = findTextElement(['历史会话', '历史记录', '最近对话', '聊天记录', 'History', 'Recent', 'Chats']);

  if (!titleElement) {
    return null;
  }

  let current = titleElement.parentElement;

  while (current && current !== document.body) {
    if (current.querySelector('a[href*="/chat/"], a[href*="/conversation"], a[href*="/session"], a[href*="/thread"], a[href*="chatId"], a[href*="conversationId"]')) {
      return current;
    }

    current = current.parentElement;
  }

  return titleElement.closest('aside, nav, [role="navigation"]') || null;
}

function findTextElement(texts: string[]): HTMLElement | null {
  const elements = Array.from(document.querySelectorAll('aside *, nav *, [role="navigation"] *'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement);

  return elements.find((element) => {
    const text = (element.innerText || element.textContent || '').trim();
    return texts.some((expected) => text === expected || text.includes(expected));
  }) || null;
}

function isKimiConversationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/g, '');
    const lower = `${pathname}?${parsed.search}`.toLowerCase();

    if (pathname === '' || pathname === '/' || lower === '/chat' || lower === '/chat/') {
      return false;
    }

    if (/(login|logout|setting|settings|profile|user|help|download|pricing|privacy|terms|about|share|new|create|agent|bot|app|apps|explore|discover|invite)/i.test(lower)) {
      return false;
    }

    const id = extractKimiConversationId(parsed);
    return Boolean(id && /[a-z0-9_-]{6,}/i.test(id));
  } catch {
    return false;
  }
}

function extractKimiConversationId(parsed: URL): string | null {
  const pathMatch = parsed.pathname.match(/\/(?:chat|c|conversation|session|thread)\/([^/?#]+)/i);

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

function isKimiExcludedTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, '').trim().toLowerCase();

  return [
    'kimi',
    'newchat',
    'newconversation',
    'history',
    'recent',
    'settings',
    'profile',
    'explore',
    'discover',
    '新对话',
    '新建对话',
    '历史',
    '历史记录',
    '设置',
    '帮助',
    '登录',
    '个人中心',
    '探索'
  ].some((value) => normalized === value.toLowerCase());
}
