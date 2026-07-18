import {
  CHATGPT_SELECTORS,
  SIDEBAR_SCAN_MAX_SCROLLS,
  SIDEBAR_SCAN_MAX_WAIT_MS,
  SIDEBAR_SCAN_MIN_WAIT_MS,
  SIDEBAR_SCAN_STABLE_LIMIT,
  SUPPORTED_CHATGPT_ORIGINS
} from '../core/constants';
import type { ConversationItem } from '../core/types';
import { logger } from '../core/logger';

const UNTITLED_CONVERSATION = 'untitled-conversation';

export async function collectSidebarConversations(): Promise<ConversationItem[]> {
  try {
    const scrollContainer = findSidebarScrollContainer();

    if (!scrollContainer) {
      throw new Error('未找到 ChatGPT 侧边栏，请确认左侧历史栏已展开。');
    }

    const conversations = new Map<string, ConversationItem>();
    let stableScrollCount = 0;
    let lastCount = 0;

    collectVisibleConversations(scrollContainer, conversations);

    for (let scrollIndex = 0; scrollIndex < SIDEBAR_SCAN_MAX_SCROLLS; scrollIndex += 1) {
      if (conversations.size > lastCount) {
        stableScrollCount = 0;
        lastCount = conversations.size;
      } else {
        stableScrollCount += 1;
      }

      if (stableScrollCount >= SIDEBAR_SCAN_STABLE_LIMIT || isScrolledToBottom(scrollContainer)) {
        break;
      }

      scrollContainer.scrollTop = Math.min(
        scrollContainer.scrollTop + Math.max(scrollContainer.clientHeight * 0.85, 320),
        scrollContainer.scrollHeight
      );
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

      await sleep(randomWaitMs());
      collectVisibleConversations(scrollContainer, conversations);
    }

    collectVisibleConversations(scrollContainer, conversations);

    const result = Array.from(new Set(conversations.values()));

    if (result.length === 0) {
      throw new Error('未发现历史会话，请确认当前账号有历史对话并且侧边栏已加载。');
    }

    logger.debug('scanned ChatGPT sidebar conversations', result);
    return result;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '扫描 ChatGPT 历史会话失败。');
  }
}

function collectVisibleConversations(container: Element, conversations: Map<string, ConversationItem>): void {
  const links = findConversationLinks(container);

  for (const link of links) {
    const item = conversationItemFromLink(link);

    if (!item) {
      continue;
    }

    const idKey = `id:${item.id}`;
    const urlKey = `url:${item.url}`;

    if (conversations.has(idKey) || conversations.has(urlKey)) {
      continue;
    }

    conversations.set(idKey, item);
    conversations.set(urlKey, item);
  }
}

function findConversationLinks(container: Element): HTMLAnchorElement[] {
  const selector = CHATGPT_SELECTORS.sidebarConversationLinks.join(',');
  return Array.from(container.querySelectorAll<HTMLAnchorElement>(selector)).filter((link) => {
    const href = link.getAttribute('href');
    return Boolean(href && parseConversationUrl(href));
  });
}

function conversationItemFromLink(link: HTMLAnchorElement): ConversationItem | null {
  const parsed = parseConversationUrl(link.getAttribute('href') || link.href);

  if (!parsed) {
    return null;
  }

  return {
    id: parsed.id,
    title: getLinkTitle(link),
    url: parsed.url
  };
}

function parseConversationUrl(href: string): { id: string; url: string } | null {
  try {
    const url = new URL(href, window.location.origin);

    if (!SUPPORTED_CHATGPT_ORIGINS.includes(url.origin as (typeof SUPPORTED_CHATGPT_ORIGINS)[number])) {
      return null;
    }

    const match = url.pathname.match(/\/c\/([^/?#]+)/);

    if (!match?.[1]) {
      return null;
    }

    return {
      id: decodeURIComponent(match[1]),
      url: `${url.origin}/c/${match[1]}`
    };
  } catch {
    return null;
  }
}

function getLinkTitle(link: HTMLAnchorElement): string {
  const text = (link.innerText || link.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();

  return text || UNTITLED_CONVERSATION;
}

function findSidebarScrollContainer(): HTMLElement | null {
  const candidates = new Set<HTMLElement>();

  for (const selector of CHATGPT_SELECTORS.sidebarContainers) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (isVisibleElement(element)) {
        candidates.add(element);
        collectScrollableDescendants(element, candidates);
      }
    }
  }

  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/c/"]')) {
    if (!parseConversationUrl(link.getAttribute('href') || link.href)) {
      continue;
    }

    collectCandidateAncestors(link, candidates);
  }

  if (candidates.size === 0) {
    return null;
  }

  return Array.from(candidates)
    .map((element) => ({ element, score: scoreSidebarCandidate(element) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.element || null;
}

function collectScrollableDescendants(root: HTMLElement, candidates: Set<HTMLElement>): void {
  const descendants = Array.from(root.querySelectorAll<HTMLElement>('*'));

  for (const element of descendants) {
    if (isVisibleElement(element) && isPotentialScrollContainer(element)) {
      candidates.add(element);
    }
  }
}

function collectCandidateAncestors(link: HTMLElement, candidates: Set<HTMLElement>): void {
  let current = link.parentElement;
  let depth = 0;

  while (current && current !== document.body && depth < 10) {
    if (isVisibleElement(current) && (isPotentialScrollContainer(current) || hasNavigationRole(current))) {
      candidates.add(current);
    }

    current = current.parentElement;
    depth += 1;
  }
}

function scoreSidebarCandidate(element: HTMLElement): number {
  const linkCount = findConversationLinks(element).length;
  const scrollScore = isPotentialScrollContainer(element) ? 5000 : 0;
  const semanticScore = hasNavigationRole(element) ? 1500 : 0;

  if (linkCount === 0 && semanticScore === 0) {
    return 0;
  }

  return linkCount * 10000 + scrollScore + semanticScore + Math.min(element.scrollHeight, 4000);
}

function hasNavigationRole(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  return tagName === 'aside' || tagName === 'nav' || element.getAttribute('role') === 'navigation';
}

function isPotentialScrollContainer(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const canScroll = element.scrollHeight > element.clientHeight + 8;
  return canScroll && overflowY !== 'clip';
}

function isScrolledToBottom(element: HTMLElement): boolean {
  return element.scrollTop + element.clientHeight >= element.scrollHeight - 8;
}

function isVisibleElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function randomWaitMs(): number {
  return SIDEBAR_SCAN_MIN_WAIT_MS + Math.floor(Math.random() * (SIDEBAR_SCAN_MAX_WAIT_MS - SIDEBAR_SCAN_MIN_WAIT_MS + 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
