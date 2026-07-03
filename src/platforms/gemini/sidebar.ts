import { scanSidebarConversationsByConfig } from '../common/sidebar-scanner';

const allowedHostnames = ['gemini.google.com'];

export function scanGeminiHistoryConversations() {
  return scanSidebarConversationsByConfig({
    platformId: 'gemini',
    platformName: 'Gemini',
    allowedHostnames,
    linkSelectors: [
      'a[href*="/app/"]',
      'a[href^="/app/"]',
      'a[href*="conversation"]',
      'a[href*="chat"]'
    ],
    containerSelectors: [
      'aside',
      'nav',
      'mat-sidenav',
      'bard-sidenav',
      'div[role="navigation"]',
      '[class*="sidenav" i]',
      '[class*="side-nav" i]',
      '[class*="sidebar" i]',
      '[class*="history" i]',
      '[class*="recent" i]',
      '[class*="conversation" i]',
      '[class*="chat" i]',
      'body'
    ],
    includeHrefKeywords: ['/app/'],
    excludeHrefKeywords: [
      '/app/extensions',
      '/app/settings',
      '/app/privacy',
      '/app/activity',
      '/app/about',
      '/app/help',
      '/app/download',
      '/app/upgrade',
      '/app/share',
      '/app/new',
      'settings',
      'privacy',
      'activity',
      'extensions',
      'help',
      'download',
      'upgrade',
      'share',
      'login',
      'logout'
    ],
    maxScrollTimes: 120,
    stableRoundLimit: 5,
    scrollDelayMs: 1000,
    noContainerError: 'Gemini 未找到历史会话列表，请确认左侧历史栏已展开。',
    noResultError: 'Gemini 未发现可导出的历史会话链接，请确认当前账号有历史对话并且左侧栏已加载。',
    rootResolver: findGeminiHistoryRoot,
    validateCandidate({ url, title }) {
      if (isGeminiExcludedTitle(title)) {
        return `排除非历史入口标题：${title}`;
      }

      if (!isGeminiConversationUrl(url)) {
        return '排除非历史对话 URL';
      }

      return true;
    }
  });
}

function findGeminiHistoryRoot(): ParentNode | null {
  const titleElement = findTextElement(['Recent', 'Chats', 'History', '最近', '历史', '聊天记录']);

  if (!titleElement) {
    return null;
  }

  let current = titleElement.parentElement;

  while (current && current !== document.body) {
    if (current.querySelector('a[href*="/app/"]')) {
      return current;
    }

    current = current.parentElement;
  }

  return titleElement.closest('aside, nav, mat-sidenav, bard-sidenav, [role="navigation"]') || null;
}

function findTextElement(texts: string[]): HTMLElement | null {
  const elements = Array.from(document.querySelectorAll('aside *, nav *, mat-sidenav *, bard-sidenav *, [role="navigation"] *'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement);

  return elements.find((element) => {
    const text = (element.innerText || element.textContent || '').trim();
    return texts.some((expected) => text === expected || text.includes(expected));
  }) || null;
}

function isGeminiConversationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/g, '');
    const match = pathname.match(/^\/app\/([^/?#]+)$/i);
    const id = match?.[1] ? decodeURIComponent(match[1]) : '';

    if (!id || id.toLowerCase() === 'app') {
      return false;
    }

    if (/(settings|privacy|activity|extensions|help|download|upgrade|share|new|about|apps|gems|explore)/i.test(id)) {
      return false;
    }

    return /[a-z0-9_-]{6,}/i.test(id);
  } catch {
    return false;
  }
}

function isGeminiExcludedTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, '').trim().toLowerCase();

  return [
    'gemini',
    'newchat',
    'newconversation',
    'recent',
    'history',
    'settings',
    'extensions',
    'activity',
    'help',
    'upgrade',
    '新对话',
    '历史',
    '设置'
  ].includes(normalized);
}
