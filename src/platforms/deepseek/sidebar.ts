import { SIDEBAR_SCAN_MAX_SCROLLS, SIDEBAR_SCAN_STABLE_LIMIT } from '../../core/constants';
import type { ConversationItem } from '../../core/types';
import { logger } from '../../core/logger';

const ALLOWED_HOSTNAMES = ['chat.deepseek.com'];

const LINK_SELECTORS = [
  'a[href*="/a/chat/s/"]',
  'a[href*="/chat/s/"]',
  'a[href*="/chat/"]',
  'a[href^="/a/chat/s/"]',
  'a[href^="/chat/s/"]',
  'a[href^="/chat/"]',
  'a[href*="/conversation"]',
  'a[href*="/session"]',
  'a[href*="/thread"]',
  'a[href*="chatId"]',
  'a[href*="conversationId"]',
  'a[href*="sessionId"]',
  'a[href*="threadId"]'
];

const CLICKABLE_SELECTORS = [
  '[role="button"]',
  '[role="listitem"]',
  'li',
  'aside div',
  'nav div',
  'div[role="navigation"] div',
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
  '[class*="sidebar" i]',
  '[class*="sider" i]',
  '[class*="history" i]',
  '[class*="recent" i]',
  '[class*="conversation" i]',
  '[class*="session" i]',
  '[class*="chat" i]'
];

interface DeepSeekScanDebug {
  url: string;
  containerCandidates: number;
  linkCandidates: number;
  clickableCandidates: number;
  probedClickableCandidates: number;
  acceptedFromLinks: number;
  acceptedFromClickProbe: number;
  accepted: ConversationItem[];
  rejected: Array<{ title: string; href?: string; reason: string }>;
  clickableSamples: Array<{ title: string; tag: string; className?: string; role?: string; cursor: string }>;
  warnings: string[];
}

export async function scanDeepSeekHistoryConversations(): Promise<ConversationItem[]> {
  const debug: DeepSeekScanDebug = {
    url: window.location.href,
    containerCandidates: 0,
    linkCandidates: 0,
    clickableCandidates: 0,
    probedClickableCandidates: 0,
    acceptedFromLinks: 0,
    acceptedFromClickProbe: 0,
    accepted: [],
    rejected: [],
    clickableSamples: [],
    warnings: []
  };

  try {
    const root = findDeepSeekSidebarRoot() || document;
    const container = findBestContainer(root, debug);

    if (!container) {
      collectClickableCandidates(root, debug);
      logDeepSeekScanDebug(debug);
      throw new Error('DeepSeek 未找到历史会话列表，请确认左侧历史栏已展开。');
    }

    const accepted = new Map<string, ConversationItem>();
    let stableRounds = 0;
    let previousSize = 0;

    for (let round = 0; round <= SIDEBAR_SCAN_MAX_SCROLLS; round += 1) {
      collectLinkCandidates(root, accepted, debug);
      collectClickableCandidates(root, debug);

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
      await delay(800);
    }

    debug.acceptedFromLinks = accepted.size;

    // DeepSeek date-grouped history often exposes only the current item as a link.
    // Probe visible sidebar items when link extraction is clearly incomplete.
    if (accepted.size <= 1) {
      await probeClickableHistoryItems(root, container, accepted, debug);
    }

    debug.accepted = Array.from(accepted.values());

    if (debug.accepted.length === 0) {
      logDeepSeekScanDebug(debug);
      throw new Error('DeepSeek 未发现可导出的历史会话链接。可能历史项不是普通链接，请确认左侧栏已展开后重试。');
    }

    logDeepSeekScanDebug(debug);
    return debug.accepted;
  } catch (error) {
    if (debug.accepted.length === 0) {
      logDeepSeekScanDebug(debug);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error('DeepSeek 扫描历史会话失败。');
  }
}

function collectLinkCandidates(root: ParentNode, accepted: Map<string, ConversationItem>, debug: DeepSeekScanDebug): void {
  const links = queryElements<HTMLAnchorElement>(LINK_SELECTORS, root, HTMLAnchorElement);
  debug.linkCandidates = Math.max(debug.linkCandidates, links.length);

  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const url = normalizeUrl(href);
    const title = extractTitle(link);

    if (!url) {
      reject(debug, title, href, 'URL 无法规范化');
      continue;
    }

    const validation = validateDeepSeekConversationCandidate(url, title);

    if (validation !== true) {
      reject(debug, title, url, validation);
      continue;
    }

    addAccepted(accepted, url, title || 'untitled-conversation');
  }
}

function collectClickableCandidates(root: ParentNode, debug: DeepSeekScanDebug): void {
  const candidates = getClickableHistoryCandidates(root);
  debug.clickableCandidates = Math.max(debug.clickableCandidates, candidates.length);
  debug.clickableSamples = candidates.slice(0, 12).map((element) => ({
    title: extractElementText(element),
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role') || undefined,
    className: String(element.className || '').slice(0, 120) || undefined,
    cursor: window.getComputedStyle(element).cursor
  }));
}

async function probeClickableHistoryItems(
  root: ParentNode,
  container: HTMLElement,
  accepted: Map<string, ConversationItem>,
  debug: DeepSeekScanDebug
): Promise<void> {
  const originalUrl = window.location.href;
  const seenCandidateKeys = new Set<string>();
  let stableRounds = 0;
  let previousSeenSize = 0;

  try {
    container.scrollTop = 0;
    await delay(200);
  } catch {
    // Continue with visible candidates.
  }

  for (let round = 0; round <= SIDEBAR_SCAN_MAX_SCROLLS; round += 1) {
    const candidates = getClickableHistoryCandidates(root)
      .filter((element) => {
        const key = getClickableCandidateKey(element);

        if (!key || seenCandidateKeys.has(key)) {
          return false;
        }

        seenCandidateKeys.add(key);
        return true;
      })
      .slice(0, 20);

    for (const candidate of candidates) {
      await probeOneClickableHistoryItem(candidate, originalUrl, accepted, debug);
    }

    if (seenCandidateKeys.size === previousSeenSize) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
      previousSeenSize = seenCandidateKeys.size;
    }

    if (stableRounds >= SIDEBAR_SCAN_STABLE_LIMIT || isScrolledToBottom(container) || debug.probedClickableCandidates >= 120) {
      break;
    }

    scrollContainer(container);
    await delay(600);
  }

  restoreUrlIfPossible(originalUrl);
}

async function probeOneClickableHistoryItem(
  candidate: HTMLElement,
  originalUrl: string,
  accepted: Map<string, ConversationItem>,
  debug: DeepSeekScanDebug
): Promise<void> {
  if (!candidate.isConnected || !isVisibleElement(candidate)) {
    return;
  }

  const title = extractElementText(candidate);

  if (!title || isDeepSeekExcludedTitle(title)) {
    return;
  }

  debug.probedClickableCandidates += 1;
  const beforeUrl = window.location.href;

  try {
    candidate.scrollIntoView({ block: 'center', inline: 'nearest' });
    await delay(80);
    candidate.click();
  } catch {
    reject(debug, title, undefined, '点击历史候选项失败');
    return;
  }

  const changedUrl = await waitForUrlChange(beforeUrl, 1500);
  const url = changedUrl || window.location.href;

  if (!changedUrl || url === beforeUrl || url === originalUrl) {
    reject(debug, title, undefined, '点击后页面 URL 未变化，无法用于批量导出');
    return;
  }

  const validation = validateDeepSeekConversationCandidate(url, title);

  if (validation !== true) {
    reject(debug, title, url, validation);
    return;
  }

  if (addAccepted(accepted, url, title || 'untitled-conversation')) {
    debug.acceptedFromClickProbe += 1;
  }
}

function findDeepSeekSidebarRoot(): ParentNode | null {
  const direct = Array.from(document.querySelectorAll('aside, nav, [role="navigation"], [class*="sidebar" i], [class*="sider" i]'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement && isVisibleElement(element))
    .map((element) => ({ element, score: scoreContainer(element) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.element;

  return direct || null;
}

function findBestContainer(root: ParentNode, debug: DeepSeekScanDebug): HTMLElement | null {
  const containers = queryElements<HTMLElement>(CONTAINER_SELECTORS, root, HTMLElement)
    .filter((element) => isVisibleElement(element));
  const linkParents = queryElements<HTMLAnchorElement>(LINK_SELECTORS, root, HTMLAnchorElement)
    .flatMap((link) => getScrollableAncestors(link));
  const clickableParents = queryElements<HTMLElement>(CLICKABLE_SELECTORS, root, HTMLElement)
    .slice(0, 80)
    .flatMap((element) => getScrollableAncestors(element));
  const candidates = uniqueElements([...containers, ...linkParents, ...clickableParents]);

  debug.containerCandidates = candidates.length;

  return candidates
    .map((element) => ({ element, score: scoreContainer(element) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.element || null;
}

function scoreContainer(element: HTMLElement): number {
  const linkCount = queryElements<HTMLAnchorElement>(LINK_SELECTORS, element, HTMLAnchorElement).length;
  const clickableCount = getClickableHistoryCandidates(element).length;
  const scrollScore = element.scrollHeight > element.clientHeight + 20 ? 20 : 0;
  const semanticScore = /^(NAV|ASIDE)$/i.test(element.tagName) || element.getAttribute('role') === 'navigation' ? 10 : 0;
  return linkCount * 12 + clickableCount * 4 + scrollScore + semanticScore;
}

function validateDeepSeekConversationCandidate(url: string, title: string): true | string {
  try {
    const parsed = new URL(url);
    const combined = `${parsed.pathname}?${parsed.searchParams.toString()}#${parsed.hash}`.toLowerCase();

    if (!ALLOWED_HOSTNAMES.some((hostname) => parsed.hostname === hostname || parsed.hostname.endsWith(`.${hostname}`))) {
      return '域名不属于 DeepSeek 支持范围';
    }

    if (isDeepSeekExcludedTitle(title)) {
      return `排除非历史入口标题：${title}`;
    }

    if (/(login|logout|setting|settings|profile|user|help|download|pricing|privacy|terms|about|share|new|create|agent|bot|app|apps|explore|discover|invite)/i.test(combined)) {
      return '排除非历史功能 URL';
    }

    if (!/(\/a\/chat\/s\/|\/chat\/s\/|\/chat\/|conversation|session|thread|chatid|conversationid|sessionid|threadid|cid=|id=)/i.test(combined)) {
      return 'URL 不包含会话特征';
    }

    if (!extractConversationId(url)) {
      return 'URL 不包含可识别会话 id';
    }

    return true;
  } catch {
    return 'URL 解析失败';
  }
}

function addAccepted(accepted: Map<string, ConversationItem>, url: string, title: string): boolean {
  const id = extractConversationId(url);

  if (!id) {
    return false;
  }

  const normalized = normalizeUrlKey(url);

  if (accepted.has(id) || Array.from(accepted.values()).some((item) => normalizeUrlKey(item.url) === normalized)) {
    return false;
  }

  accepted.set(id, { id, title, url });
  return true;
}

function extractConversationId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathMatch = parsed.pathname.match(/\/(?:a\/chat\/s|chat\/s|chat|conversation|session|thread)\/([^/?#]+)/i);
    const id = pathMatch?.[1] || getFirstParam(parsed.searchParams, ['chatId', 'conversationId', 'sessionId', 'threadId', 'cid', 'id']);
    return id && /[a-z0-9_-]{6,}/i.test(id) ? decodeURIComponent(id) : null;
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

function getClickableHistoryCandidates(root: ParentNode): HTMLElement[] {
  return queryElements<HTMLElement>(CLICKABLE_SELECTORS, root, HTMLElement)
    .filter((element) => isVisibleElement(element) && !isInsideMainOrComposer(element))
    .filter((element) => isPotentialClickableConversationElement(element));
}

function isPotentialClickableConversationElement(element: HTMLElement): boolean {
  const text = extractElementText(element);

  if (!text || text.length < 2 || text.length > 120 || isDeepSeekExcludedTitle(text) || isDateGroupTitle(text)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return element.getAttribute('role') === 'button' ||
    element.getAttribute('role') === 'listitem' ||
    style.cursor === 'pointer' ||
    Boolean((element as HTMLElement & { onclick?: unknown }).onclick);
}

function isDeepSeekExcludedTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, '').trim().toLowerCase();

  return [
    'deepseek',
    'newchat',
    'newconversation',
    'history',
    'recent',
    'settings',
    'profile',
    'explore',
    'discover',
    '开启新对话',
    '新对话',
    '新建对话',
    '历史',
    '历史记录',
    '设置',
    '帮助',
    '登录',
    '个人中心',
    '搜索'
  ].some((value) => normalized === value.toLowerCase());
}

function isDateGroupTitle(text: string): boolean {
  const normalized = text.trim();
  return /^(今天|昨天|前天|本周|上周|更早|\d{4}-\d{2}|\d{4}年\d{1,2}月)$/i.test(normalized);
}

function getClickableCandidateKey(element: HTMLElement): string {
  const text = extractElementText(element);
  const rect = element.getBoundingClientRect();
  return `${text}|${element.tagName}|${String(element.className || '').slice(0, 80)}|${Math.round(rect.top)}|${Math.round(rect.height)}`;
}

function isInsideMainOrComposer(element: Element): boolean {
  return Boolean(element.closest('main, [role="main"], textarea, input, form, [contenteditable="true"], [class*="composer" i], [class*="input" i]'));
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

async function waitForUrlChange(beforeUrl: string, timeoutMs: number): Promise<string | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (window.location.href !== beforeUrl) {
      return window.location.href;
    }

    await delay(100);
  }

  return null;
}

function restoreUrlIfPossible(originalUrl: string): void {
  if (window.location.href === originalUrl || !isSameOriginUrl(originalUrl, window.location.href)) {
    return;
  }

  try {
    window.history.replaceState(window.history.state, document.title, originalUrl);
  } catch {
    // Best effort only.
  }
}

function isSameOriginUrl(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
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

function reject(debug: DeepSeekScanDebug, title: string, href: string | undefined, reason: string): void {
  if (debug.rejected.length < 80) {
    debug.rejected.push({ title: title || 'untitled', href, reason });
  }
}

function logDeepSeekScanDebug(debug: DeepSeekScanDebug): void {
  logger.debug('deepseek sidebar scan debug', {
    ...debug,
    rejected: debug.rejected.slice(0, 40),
    clickableSamples: debug.clickableSamples.slice(0, 12)
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
