import { SIDEBAR_SCAN_MAX_SCROLLS, SIDEBAR_SCAN_STABLE_LIMIT } from '../../core/constants';
import type { ConversationItem } from '../../core/types';

const ALLOWED_HOSTNAMES = ['grok.com', 'x.com'];

const LINK_SELECTORS = [
  'a[href*="/chat/"]',
  'a[href*="/c/"]',
  'a[href*="/conversation"]',
  'a[href*="/session"]',
  'a[href*="/i/grok"]',
  'a[href*="chatId"]',
  'a[href*="chat_id"]',
  'a[href*="conversationId"]',
  'a[href*="conversation_id"]',
  'a[href*="sessionId"]',
  'a[href*="session_id"]'
];

const CLICKABLE_SELECTORS = [
  '[role="button"]',
  '[role="listitem"]',
  'li',
  'div[class*="history" i]',
  'div[class*="conversation" i]',
  'div[class*="session" i]',
  'div[class*="chat" i]',
  'div[class*="item" i]'
];

const CONTAINER_SELECTORS = [
  'aside',
  'nav',
  'div[role="navigation"]',
  '[data-testid*="sidebar" i]',
  '[class*="sidebar" i]',
  '[class*="history" i]',
  '[class*="conversation" i]',
  '[class*="chat" i]'
];

interface RejectedCandidate {
  title: string;
  href?: string;
  reason: string;
}

interface GrokScanDebug {
  url: string;
  containerCandidates: number;
  linkCandidates: number;
  clickableCandidates: number;
  accepted: ConversationItem[];
  rejected: RejectedCandidate[];
  clickableSamples: Array<{
    title: string;
    tag: string;
    role?: string;
    className?: string;
    hasOnClick: boolean;
    cursor: string;
  }>;
  warnings: string[];
}

export async function scanGrokHistoryConversations(): Promise<ConversationItem[]> {
  const debug: GrokScanDebug = {
    url: window.location.href,
    containerCandidates: 0,
    linkCandidates: 0,
    clickableCandidates: 0,
    accepted: [],
    rejected: [],
    clickableSamples: [],
    warnings: []
  };

  const root = findGrokHistoryRoot(debug) || document;
  const container = findBestContainer(root, debug);
  const accepted = new Map<string, ConversationItem>();
  let stableRounds = 0;
  let previousSize = 0;

  for (let round = 0; round <= SIDEBAR_SCAN_MAX_SCROLLS; round += 1) {
    collectLinkCandidates(root, accepted, debug);
    collectClickableCandidates(root, debug);

    if (!container) {
      break;
    }

    if (accepted.size === previousSize) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
      previousSize = accepted.size;
    }

    if (stableRounds >= SIDEBAR_SCAN_STABLE_LIMIT || isScrolledToBottom(container)) {
      break;
    }

    scrollContainer(container);
    await delay(1000);
  }

  debug.accepted = Array.from(accepted.values());
  logGrokScanDebug(debug);

  if (debug.accepted.length === 0) {
    if (!container) {
      throw new Error('Grok 未找到历史会话列表，请确认左侧历史栏已展开。');
    }

    if (debug.clickableCandidates > 0) {
      throw new Error('Grok 未发现可导出的历史会话链接。可能网页版历史项不是普通链接，请展开控制台查看 grok sidebar scan debug。');
    }

    throw new Error('Grok 未发现历史会话，请确认当前账号有历史对话并且侧边栏已加载。');
  }

  return debug.accepted;
}

function collectLinkCandidates(root: ParentNode, accepted: Map<string, ConversationItem>, debug: GrokScanDebug): void {
  const links = queryElements<HTMLAnchorElement>(LINK_SELECTORS, root, HTMLAnchorElement);
  debug.linkCandidates = Math.max(debug.linkCandidates, links.length);

  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const url = normalizeUrl(href);
    const title = extractTitle(link);

    if (!url) {
      reject(debug, title, href, 'URL 无法规范化。');
      continue;
    }

    const validation = validateGrokConversationCandidate(url, title);

    if (validation !== true) {
      reject(debug, title, url, validation);
      continue;
    }

    const id = extractGrokConversationId(url);

    if (!id) {
      reject(debug, title, url, '未找到可用会话 id。');
      continue;
    }

    if (!accepted.has(id) && !Array.from(accepted.values()).some((item) => normalizeUrlKey(item.url) === normalizeUrlKey(url))) {
      accepted.set(id, {
        id,
        title: title || 'untitled-conversation',
        url
      });
    }
  }
}

function collectClickableCandidates(root: ParentNode, debug: GrokScanDebug): void {
  const candidates = queryElements<HTMLElement>(CLICKABLE_SELECTORS, root, HTMLElement)
    .filter((element) => isVisibleElement(element) && !isInsideMainOrComposer(element))
    .filter((element) => isPotentialClickableConversationElement(element));

  debug.clickableCandidates = Math.max(debug.clickableCandidates, candidates.length);
  debug.clickableSamples = candidates.slice(0, 10).map((element) => ({
    title: extractElementText(element),
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role') || undefined,
    className: String(element.className || '').slice(0, 120) || undefined,
    hasOnClick: Boolean((element as HTMLElement & { onclick?: unknown }).onclick),
    cursor: window.getComputedStyle(element).cursor
  }));
}

function findGrokHistoryRoot(debug: GrokScanDebug): ParentNode | null {
  const titleElement = findTextElement(['History', 'Chats', 'Recent', 'Conversations', '历史', '历史对话', '最近']);

  if (!titleElement) {
    debug.warnings.push('未找到 History/Chats/Recent/历史 标题，已回退到全页面链接扫描。');
    return null;
  }

  let current = titleElement.parentElement;

  while (current && current !== document.body) {
    if (hasHistoryCandidate(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return titleElement.closest('aside, nav, [role="navigation"]') || null;
}

function findBestContainer(root: ParentNode, debug: GrokScanDebug): HTMLElement | null {
  const containers = queryElements<HTMLElement>(CONTAINER_SELECTORS, root, HTMLElement)
    .filter((element) => isVisibleElement(element));
  const linkParents = queryElements<HTMLAnchorElement>(LINK_SELECTORS, root, HTMLAnchorElement)
    .flatMap((link) => getScrollableAncestors(link));
  const clickableParents = queryElements<HTMLElement>(CLICKABLE_SELECTORS, root, HTMLElement)
    .slice(0, 50)
    .flatMap((element) => getScrollableAncestors(element));
  const candidates = uniqueElements([...containers, ...linkParents, ...clickableParents]);

  debug.containerCandidates = candidates.length;

  return candidates
    .map((element) => ({ element, score: scoreContainer(element) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.element || null;
}

function scoreContainer(element: HTMLElement): number {
  const linkCount = queryElements<HTMLAnchorElement>(LINK_SELECTORS, element, HTMLAnchorElement)
    .filter((link) => {
      const url = normalizeUrl(link.getAttribute('href') || '');
      return Boolean(url && validateGrokConversationCandidate(url, extractTitle(link)) === true);
    }).length;
  const clickableCount = queryElements<HTMLElement>(CLICKABLE_SELECTORS, element, HTMLElement)
    .filter((candidate) => isPotentialClickableConversationElement(candidate)).length;
  const scrollScore = element.scrollHeight > element.clientHeight + 20 ? 20 : 0;
  const semanticScore = /^(NAV|ASIDE)$/i.test(element.tagName) || element.getAttribute('role') === 'navigation' ? 10 : 0;

  return linkCount * 12 + clickableCount * 3 + scrollScore + semanticScore;
}

function validateGrokConversationCandidate(url: string, title: string): true | string {
  try {
    const parsed = new URL(url);
    const combined = `${parsed.pathname}?${parsed.searchParams.toString()}#${parsed.hash}`.toLowerCase();

    if (!ALLOWED_HOSTNAMES.some((hostname) => parsed.hostname === hostname || parsed.hostname.endsWith(`.${hostname}`))) {
      return '域名不属于 Grok 支持范围。';
    }

    if (isGrokExcludedTitle(title)) {
      return `排除非历史入口标题：${title}`;
    }

    if (/(login|logout|settings|setting|profile|pricing|download|docs|api|new|create|share|help|terms|privacy|search|explore|upgrade|billing)/i.test(combined)) {
      return '排除非历史功能 URL。';
    }

    if (!extractGrokConversationId(url)) {
      return 'URL 不包含可识别会话 id。';
    }

    return true;
  } catch {
    return 'URL 解析失败。';
  }
}

function extractGrokConversationId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathMatch = parsed.pathname.match(/\/(?:chat|c|conversation|session)\/([^/?#]+)/i);
    const xGrokMatch = parsed.pathname.match(/\/i\/grok\/([^/?#]+)/i);
    const hashMatch = parsed.hash.match(/\/(?:chat|c|conversation|session|i\/grok)\/([^/?#]+)/i);
    const hashParamsText = parsed.hash.includes('?') ? parsed.hash.slice(parsed.hash.indexOf('?') + 1) : '';
    const hashParams = new URLSearchParams(hashParamsText);
    const id = pathMatch?.[1] ||
      xGrokMatch?.[1] ||
      hashMatch?.[1] ||
      getFirstParam(parsed.searchParams, ['conversationId', 'conversation_id', 'chatId', 'chat_id', 'sessionId', 'session_id', 'threadId', 'thread_id', 'cid', 'id']) ||
      getFirstParam(hashParams, ['conversationId', 'conversation_id', 'chatId', 'chat_id', 'sessionId', 'session_id', 'threadId', 'thread_id', 'cid', 'id']);

    return id && /[a-z0-9_-]{6,}/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

function getFirstParam(params: URLSearchParams, names: string[]): string | null {
  for (const name of names) {
    const value = params.get(name);

    if (value) {
      return value;
    }
  }

  return null;
}

function isGrokExcludedTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, '').trim().toLowerCase();

  return [
    'grok',
    'newchat',
    'history',
    'chats',
    'recent',
    'explore',
    'settings',
    'upgrade',
    'signin',
    'login',
    'help',
    '新对话',
    '历史',
    '设置'
  ].includes(normalized);
}

function isPotentialClickableConversationElement(element: HTMLElement): boolean {
  const text = extractElementText(element);

  if (!text || text.length < 2 || text.length > 140 || isGrokExcludedTitle(text)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return element.getAttribute('role') === 'button' ||
    element.getAttribute('role') === 'listitem' ||
    style.cursor === 'pointer' ||
    Boolean((element as HTMLElement & { onclick?: unknown }).onclick);
}

function isInsideMainOrComposer(element: Element): boolean {
  return Boolean(element.closest('main, [role="main"], textarea, input, form, [contenteditable="true"], [class*="composer" i], [class*="input" i]'));
}

function hasHistoryCandidate(root: ParentNode): boolean {
  return Boolean(
    queryElements<HTMLAnchorElement>(LINK_SELECTORS, root, HTMLAnchorElement).length ||
    queryElements<HTMLElement>(CLICKABLE_SELECTORS, root, HTMLElement).length
  );
}

function findTextElement(texts: string[]): HTMLElement | null {
  const elements = Array.from(document.querySelectorAll('aside *, nav *, [role="navigation"] *'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement);

  return elements.find((element) => {
    const text = extractElementText(element);
    return texts.some((expected) => text === expected || text.includes(expected));
  }) || null;
}

function queryElements<T extends Element>(
  selectors: string[],
  root: ParentNode,
  ctor: { new (...args: never[]): T }
): T[] {
  const elements: Element[] = [];

  for (const selector of selectors) {
    try {
      elements.push(...Array.from(root.querySelectorAll(selector)));
    } catch {
      continue;
    }
  }

  return uniqueElements(elements).filter((element): element is T => element instanceof ctor);
}

function getScrollableAncestors(element: Element): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current = element.parentElement;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);

    if (/(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`) || current.scrollHeight > current.clientHeight + 20) {
      ancestors.push(current);
    }

    current = current.parentElement;
  }

  return ancestors;
}

function normalizeUrl(href: string): string | null {
  try {
    const parsed = new URL(href, window.location.href);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractTitle(link: HTMLAnchorElement): string {
  return cleanupText(link.innerText || link.textContent || link.getAttribute('title') || link.getAttribute('aria-label') || '');
}

function extractElementText(element: Element): string {
  return cleanupText(element.textContent || '');
}

function cleanupText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function isVisibleElement(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function scrollContainer(container: HTMLElement): void {
  const distance = Math.max(container.clientHeight * 0.85, 360);
  container.scrollTop = Math.min(container.scrollTop + distance, container.scrollHeight);
}

function isScrolledToBottom(container: HTMLElement): boolean {
  return container.scrollTop + container.clientHeight >= container.scrollHeight - 8;
}

function uniqueElements<T extends Element>(elements: T[]): T[] {
  return Array.from(new Set(elements));
}

function reject(debug: GrokScanDebug, title: string, href: string | undefined, reason: string): void {
  if (debug.rejected.length < 60) {
    debug.rejected.push({
      title: title || 'untitled',
      href,
      reason
    });
  }
}

function logGrokScanDebug(debug: GrokScanDebug): void {
  console.log('[Dialog-Export] grok sidebar scan debug', {
    ...debug,
    rejected: debug.rejected.slice(0, 30),
    clickableSamples: debug.clickableSamples.slice(0, 10)
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
