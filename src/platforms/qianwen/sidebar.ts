import { SIDEBAR_SCAN_MAX_SCROLLS, SIDEBAR_SCAN_STABLE_LIMIT } from '../../core/constants';
import type { ConversationItem } from '../../core/types';
import { logger } from '../../core/logger';

const ALLOWED_HOSTNAMES = [
  'chat.qwen.ai',
  'qwen.ai',
  'www.qwen.ai',
  'chat.qwenlm.ai',
  'qwenlm.ai',
  'www.qwenlm.ai',
  'tongyi.aliyun.com',
  'www.tongyi.com',
  'tongyi.com',
  'qianwen.com',
  'www.qianwen.com'
];

const LINK_SELECTORS = [
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
  '[class*="sidebar" i]',
  '[class*="sider" i]',
  '[class*="history" i]',
  '[class*="conversation" i]',
  '[class*="chat" i]'
];

interface RejectedCandidate {
  title: string;
  href?: string;
  reason: string;
}

interface ClickableCandidateDebug {
  title: string;
  tag: string;
  role?: string;
  className?: string;
  hasOnClick: boolean;
  cursor: string;
}

interface QwenScanDebug {
  url: string;
  containerCandidates: number;
  linkCandidates: number;
  clickableCandidates: number;
  probedClickableCandidates: number;
  acceptedFromClickProbe: number;
  accepted: ConversationItem[];
  rejected: RejectedCandidate[];
  clickableSamples: ClickableCandidateDebug[];
  warnings: string[];
}

export async function scanQianwenHistoryConversations(): Promise<ConversationItem[]> {
  const debug: QwenScanDebug = {
    url: window.location.href,
    containerCandidates: 0,
    linkCandidates: 0,
    clickableCandidates: 0,
    probedClickableCandidates: 0,
    acceptedFromClickProbe: 0,
    accepted: [],
    rejected: [],
    clickableSamples: [],
    warnings: []
  };

  try {
    const root = findQianwenHistoryRoot(debug) || document;
    const container = findBestContainer(root, debug);

    if (!container) {
      collectClickableCandidates(root, debug);
      logQwenScanDebug(debug);
      throw new Error('Qwen 未找到历史会话列表，请确认左侧栏已展开。');
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
      await delay(1000);
    }

    debug.accepted = Array.from(accepted.values());

    if (debug.accepted.length === 0) {
      await probeClickableHistoryItems(root, container, accepted, debug);
      debug.accepted = Array.from(accepted.values());
    }

    if (debug.accepted.length === 0) {
      if (debug.clickableCandidates > 0) {
        debug.warnings.push('发现疑似历史项，但点击探测后仍未获得可用于批量导出的 URL。');
      }

      logQwenScanDebug(debug);
      throw new Error('Qwen 未发现可导出的历史会话链接。可能该页面历史项不是普通链接，请提供左侧历史列表 DOM 片段继续适配。');
    }

    logQwenScanDebug(debug);
    return debug.accepted;
  } catch (error) {
    if (debug.accepted.length === 0) {
      logQwenScanDebug(debug);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Qwen 扫描失败：未知错误');
  }
}

function collectLinkCandidates(root: ParentNode, accepted: Map<string, ConversationItem>, debug: QwenScanDebug): void {
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

    const validation = validateQwenConversationCandidate(url, title);

    if (validation !== true) {
      reject(debug, title, url, validation);
      continue;
    }

    const id = extractConversationId(url);

    if (!id) {
      reject(debug, title, url, '未找到可用会话 id');
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

function collectClickableCandidates(root: ParentNode, debug: QwenScanDebug): void {
  const candidates = getClickableHistoryCandidates(root);

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

async function probeClickableHistoryItems(
  root: ParentNode,
  container: HTMLElement,
  accepted: Map<string, ConversationItem>,
  debug: QwenScanDebug
): Promise<void> {
  const originalUrl = window.location.href;
  const seenCandidateKeys = new Set<string>();
  let stableRounds = 0;
  let previousSeenSize = 0;

  try {
    container.scrollTop = 0;
    await delay(200);
  } catch {
    // Some virtual lists do not expose a writable scrollTop. Continue with visible candidates.
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

    if (stableRounds >= SIDEBAR_SCAN_STABLE_LIMIT || isScrolledToBottom(container) || debug.probedClickableCandidates >= 80) {
      break;
    }

    scrollContainer(container);
    await delay(600);
  }

  if (window.location.href !== originalUrl && isSameOriginUrl(originalUrl, window.location.href)) {
    try {
      window.history.replaceState(window.history.state, document.title, originalUrl);
    } catch {
      // Restoring the address bar is best-effort; collected export URLs remain valid.
    }
  }
}

async function probeOneClickableHistoryItem(
  candidate: HTMLElement,
  originalUrl: string,
  accepted: Map<string, ConversationItem>,
  debug: QwenScanDebug
): Promise<void> {
  if (!candidate.isConnected || !isVisibleElement(candidate)) {
    return;
  }

  const title = extractElementText(candidate);

  if (!title || isQwenExcludedTitle(title)) {
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

  const validation = validateQwenConversationCandidate(url, title);

  if (validation !== true) {
    reject(debug, title, url, validation);
    return;
  }

  const id = extractConversationId(url);

  if (!id) {
    reject(debug, title, url, '点击后 URL 未找到可用会话 id');
    return;
  }

  if (!accepted.has(id) && !Array.from(accepted.values()).some((item) => normalizeUrlKey(item.url) === normalizeUrlKey(url))) {
    accepted.set(id, {
      id,
      title: title || 'untitled-conversation',
      url
    });
    debug.acceptedFromClickProbe += 1;
  }
}

function findQianwenHistoryRoot(debug: QwenScanDebug): ParentNode | null {
  const titleElement = findTextElement(['历史对话', '历史记录', '最近对话', '聊天记录']);

  if (!titleElement) {
    debug.warnings.push('未找到“历史对话/历史记录/最近对话/聊天记录”标题。');
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

function findBestContainer(root: ParentNode, debug: QwenScanDebug): HTMLElement | null {
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
    .map((element) => ({
      element,
      score: scoreContainer(element)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.element || null;
}

function scoreContainer(element: HTMLElement): number {
  const linkCount = queryElements<HTMLAnchorElement>(LINK_SELECTORS, element, HTMLAnchorElement).length;
  const clickableCount = getClickableHistoryCandidates(element).length;
  const scrollScore = element.scrollHeight > element.clientHeight + 20 ? 20 : 0;
  const semanticScore = /^(NAV|ASIDE)$/i.test(element.tagName) || element.getAttribute('role') === 'navigation' ? 10 : 0;

  return linkCount * 12 + clickableCount * 3 + scrollScore + semanticScore;
}

function validateQwenConversationCandidate(url: string, title: string): true | string {
  try {
    const parsed = new URL(url);
    const combined = `${parsed.pathname}?${parsed.searchParams.toString()}#${parsed.hash}`.toLowerCase();

    if (!ALLOWED_HOSTNAMES.some((hostname) => parsed.hostname === hostname || parsed.hostname.endsWith(`.${hostname}`))) {
      return '域名不属于 Qwen 支持范围';
    }

    if (isQwenExcludedTitle(title)) {
      return `排除非历史入口标题：${title}`;
    }

    if (/(login|logout|setting|settings|help|profile|pricing|download|docs|api|new|create|share|model|prompt|app|marketplace)/i.test(combined)) {
      return '排除非历史功能 URL';
    }

    if (!/(conversation|session|thread|chatid|chat_id|conversationid|conversation_id|sessionid|session_id|threadid|thread_id|cid=|id=|\/c\/|\/chat\/)/i.test(combined)) {
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

function extractConversationId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathMatch = parsed.pathname.match(/\/(?:chat|c|conversation|session|thread)\/([^/?#]+)/i);
    const hashMatch = parsed.hash.match(/\/(?:chat|c|conversation|session|thread)\/([^/?#]+)/i);
    const hashParamsText = parsed.hash.includes('?') ? parsed.hash.slice(parsed.hash.indexOf('?') + 1) : '';
    const hashParams = new URLSearchParams(hashParamsText);
    const id = pathMatch?.[1] ||
      hashMatch?.[1] ||
      getFirstParam(parsed.searchParams, ['chatId', 'chat_id', 'conversationId', 'conversation_id', 'sessionId', 'session_id', 'threadId', 'thread_id', 'cid', 'id']) ||
      getFirstParam(hashParams, ['chatId', 'chat_id', 'conversationId', 'conversation_id', 'sessionId', 'session_id', 'threadId', 'thread_id', 'cid', 'id']);

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

function isQwenExcludedTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, '').trim().toLowerCase();

  return [
    '新建对话',
    '新对话',
    '创建',
    '设置',
    '帮助',
    '登录',
    '模型',
    '应用',
    '探索',
    'api',
    '下载',
    '个人中心',
    'qwen',
    '通义千问'
  ].some((value) => normalized === value.toLowerCase());
}

function isPotentialClickableConversationElement(element: HTMLElement): boolean {
  const text = extractElementText(element);

  if (!text || text.length < 2 || text.length > 120 || isQwenExcludedTitle(text)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return element.getAttribute('role') === 'button' ||
    element.getAttribute('role') === 'listitem' ||
    style.cursor === 'pointer' ||
    Boolean((element as HTMLElement & { onclick?: unknown }).onclick);
}

function getClickableHistoryCandidates(root: ParentNode): HTMLElement[] {
  return queryElements<HTMLElement>(CLICKABLE_SELECTORS, root, HTMLElement)
    .filter((element) => isVisibleElement(element) && !isInsideMainOrComposer(element))
    .filter((element) => isPotentialClickableConversationElement(element));
}

function getClickableCandidateKey(element: HTMLElement): string {
  const text = extractElementText(element);
  const rect = element.getBoundingClientRect();
  const className = String(element.className || '').slice(0, 80);
  return `${text}|${element.tagName}|${className}|${Math.round(rect.top)}|${Math.round(rect.height)}`;
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

function reject(debug: QwenScanDebug, title: string, href: string | undefined, reason: string): void {
  if (debug.rejected.length < 60) {
    debug.rejected.push({
      title: title || 'untitled',
      href,
      reason
    });
  }
}

function logQwenScanDebug(debug: QwenScanDebug): void {
  logger.debug('qwen sidebar scan debug', {
    ...debug,
    rejected: debug.rejected.slice(0, 30),
    clickableSamples: debug.clickableSamples.slice(0, 10)
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
