import { scanSidebarConversationsByConfig } from '../common/sidebar-scanner';

const allowedHostnames = ['yuanbao.tencent.com'];

export function scanYuanbaoHistoryConversations() {
  return scanSidebarConversationsByConfig({
    platformId: 'yuanbao',
    platformName: '腾讯元宝 Yuanbao',
    allowedHostnames,
    linkSelectors: [
      'a[href*="/chat"]',
      'a[href*="/c/"]',
      'a[href*="/conversation"]',
      'a[href*="/session"]',
      'a[href*="/thread"]',
      'a[href*="chatId"]',
      'a[href*="chat_id"]',
      'a[href*="conversationId"]',
      'a[href*="conversation_id"]',
      'a[href*="sessionId"]',
      'a[href*="session_id"]',
      'a[href*="threadId"]',
      'a[href*="thread_id"]',
      'a[href*="cid="]',
      'a[href*="id="]'
    ],
    containerSelectors: [
      'aside',
      'nav',
      'div[role="navigation"]',
      '[class*="sidebar" i]',
      '[class*="sider" i]',
      '[class*="history" i]',
      '[class*="conversation" i]',
      '[class*="session" i]',
      '[class*="chat" i]'
    ],
    includeHrefKeywords: [
      '/chat',
      '/c/',
      '/conversation',
      '/session',
      '/thread',
      'chatid',
      'chat_id',
      'conversationid',
      'conversation_id',
      'sessionid',
      'session_id',
      'threadid',
      'thread_id',
      'cid=',
      'id='
    ],
    excludeHrefKeywords: [
      '/login',
      '/logout',
      '/setting',
      '/settings',
      '/profile',
      '/user',
      '/help',
      '/download',
      '/pricing',
      '/privacy',
      '/terms',
      '/about',
      '/share',
      '/new',
      '/create',
      '/bot',
      '/agent',
      '/discover',
      '/explore',
      'login',
      'logout',
      'settings',
      'profile',
      'help',
      'download',
      'share'
    ],
    maxScrollTimes: 120,
    stableRoundLimit: 5,
    scrollDelayMs: 1000,
    noContainerError: '腾讯元宝未找到历史会话列表，请确认左侧历史栏已展开。',
    noResultError: '腾讯元宝未发现可导出的历史会话链接，请确认当前账号有历史对话并且左侧栏已加载。',
    rootResolver: findYuanbaoHistoryRoot,
    validateCandidate({ url, title }) {
      if (isYuanbaoExcludedTitle(title)) {
        return `排除非历史入口标题：${title}`;
      }

      if (!isYuanbaoConversationUrl(url)) {
        return '排除非历史对话 URL';
      }

      return true;
    }
  });
}

function findYuanbaoHistoryRoot(): ParentNode | null {
  const titleElement = findTextElement(['历史对话', '历史记录', '最近对话', '聊天记录']);

  if (!titleElement) {
    return null;
  }

  let current = titleElement.parentElement;

  while (current && current !== document.body) {
    if (current.querySelector('a[href*="/chat"], a[href*="/conversation"], a[href*="/session"], a[href*="/thread"], a[href*="chatId"], a[href*="conversationId"]')) {
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

function isYuanbaoConversationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/g, '');
    const lowerPath = pathname.toLowerCase();

    if (lowerPath === '' || lowerPath === '/' || lowerPath === '/chat') {
      return false;
    }

    if (/(login|logout|setting|settings|profile|user|help|download|pricing|privacy|terms|about|share|new|create|discover|explore)/i.test(`${lowerPath}?${parsed.search}`)) {
      return false;
    }

    const id = extractYuanbaoConversationId(parsed);
    return Boolean(id && /[a-z0-9_-]{6,}/i.test(id));
  } catch {
    return false;
  }
}

function extractYuanbaoConversationId(parsed: URL): string | null {
  const pathMatch = parsed.pathname.match(/\/(?:chat|c|conversation|session|thread)\/([^/?#]+)/i);

  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }

  for (const key of ['chatId', 'chat_id', 'conversationId', 'conversation_id', 'sessionId', 'session_id', 'threadId', 'thread_id', 'cid', 'id']) {
    const value = parsed.searchParams.get(key);

    if (value) {
      return value;
    }
  }

  return null;
}

function isYuanbaoExcludedTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, '').trim().toLowerCase();

  return [
    '腾讯元宝',
    '元宝',
    'yuanbao',
    '新对话',
    '新建对话',
    '历史',
    '历史记录',
    '设置',
    '帮助',
    '登录',
    '个人中心',
    '发现',
    '探索'
  ].some((value) => normalized === value.toLowerCase());
}
