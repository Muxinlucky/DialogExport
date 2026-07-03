import { scanSidebarConversationsByConfig } from '../common/sidebar-scanner';

const allowedHostnames = ['doubao.com', 'www.doubao.com'];

export function scanDoubaoHistoryConversations() {
  return scanSidebarConversationsByConfig({
    platformId: 'doubao',
    platformName: '豆包',
    allowedHostnames,
    linkSelectors: [
      'a[href*="/chat"]',
      'a[href*="/thread"]',
      'a[href*="conversation"]',
      'a[href*="session"]'
    ],
    containerSelectors: [
      'aside',
      'nav',
      'div[role="navigation"]',
      '[class*="sidebar" i]',
      '[class*="sider" i]',
      '[class*="history" i]',
      '[class*="conversation" i]',
      '[class*="thread" i]'
    ],
    includeHrefKeywords: ['/chat', '/thread', 'conversation', 'session'],
    excludeHrefKeywords: [
      'create-image',
      '/drive',
      '/bot',
      '/office',
      '/task',
      '/invite',
      '/login',
      '/logout',
      '/settings',
      '/setting',
      '/profile',
      '/user',
      '/help',
      '/download',
      '/pricing',
      '/privacy',
      '/terms',
      '/about',
      '/discover',
      '/explore'
    ],
    maxScrollTimes: 120,
    stableRoundLimit: 5,
    scrollDelayMs: 1000,
    noContainerError: '豆包未找到历史会话列表，请确认左侧栏已展开。',
    noResultError: '豆包未发现历史会话，请确认当前账号有历史对话并已加载侧边栏。',
    rootResolver: findDoubaoHistoryRoot,
    validateCandidate({ url, title }) {
      if (isDoubaoExcludedNavTitle(title)) {
        return `排除顶部功能入口标题：${title}`;
      }

      if (!isDoubaoConversationUrl(url)) {
        return '排除非历史对话 URL';
      }

      return true;
    }
  });
}

function findDoubaoHistoryRoot(): ParentNode | null {
  const titleElement = findTextElement(['历史对话', '历史记录']);

  if (!titleElement) {
    return null;
  }

  let current = titleElement.parentElement;

  while (current && current !== document.body) {
    if (current.querySelector('a[href*="/chat"], a[href*="/thread"], a[href*="conversation"], a[href*="session"]')) {
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

function isDoubaoConversationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/g, '');
    const lowerPath = pathname.toLowerCase();

    if (lowerPath === '/chat' || lowerPath === '') {
      return false;
    }

    if (/(create-image|drive|\/bot(?:\/|$)|office|task|settings|login|logout|profile|invite|download|pricing|help)/i.test(lowerPath)) {
      return false;
    }

    const chatMatch = pathname.match(/^\/chat\/([^/?#]+)$/i);
    const threadMatch = pathname.match(/^\/thread\/([^/?#]+)$/i);
    const conversationMatch = pathname.match(/^\/(?:conversation|session)\/([^/?#]+)$/i);
    const id = chatMatch?.[1] || threadMatch?.[1] || conversationMatch?.[1] || parsed.searchParams.get('conversationId') || parsed.searchParams.get('sessionId');

    return Boolean(id && /[a-z0-9_-]{6,}/i.test(id));
  } catch {
    return false;
  }
}

function isDoubaoExcludedNavTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, '').trim();
  return [
    '豆包',
    '新对话',
    '新办公任务',
    'AI创作',
    '云盘',
    '更多'
  ].includes(normalized);
}
