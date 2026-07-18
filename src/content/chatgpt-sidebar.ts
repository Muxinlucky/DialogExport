import {
  CHATGPT_SELECTORS,
  SIDEBAR_SCAN_MAX_SCROLLS,
  SIDEBAR_SCAN_MAX_WAIT_MS,
  SIDEBAR_SCAN_MIN_WAIT_MS,
  SIDEBAR_SCAN_STABLE_LIMIT,
  SIDEBAR_SECTION_EXPAND_WAIT_MS,
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
    const collapsedSections = await expandCollapsedSections(scrollContainer);
    let stableScrollCount = 0;
    let lastCount = 0;

    try {
      collectVisibleConversations(document, conversations);

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
        collectVisibleConversations(document, conversations);
      }

      collectVisibleConversations(document, conversations);
    } finally {
      await restoreCollapsedSections(collapsedSections);
    }

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

interface CollapsedSectionSnapshot {
  element: HTMLElement;
  parent: HTMLElement | null;
  label: string;
}

/**
 * ChatGPT virtualizes project contents and does not render their conversation
 * links until the project row is expanded. Open only rows that were collapsed
 * when the scan started, then restore those rows after collection.
 */
async function expandCollapsedSections(scrollContainer: HTMLElement): Promise<CollapsedSectionSnapshot[]> {
  const snapshots = findCollapsedSectionToggles(scrollContainer).map((element) => ({
    element,
    parent: element.parentElement,
    label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 80) || 'section'
  }));

  for (const snapshot of snapshots) {
    if (!snapshot.element.isConnected || snapshot.element.getAttribute('aria-expanded') !== 'false') {
      continue;
    }

    snapshot.element.click();
    await waitForSectionExpansion(snapshot.element);
  }

  return snapshots;
}

async function restoreCollapsedSections(snapshots: CollapsedSectionSnapshot[]): Promise<void> {
  for (const snapshot of snapshots.reverse()) {
    const element = snapshot.element.isConnected
      ? snapshot.element
      : findReplacementCollapsedToggle(snapshot);

    if (!element || element.getAttribute('aria-expanded') !== 'true') {
      continue;
    }

    element.click();
    await sleep(Math.min(SIDEBAR_SECTION_EXPAND_WAIT_MS, 250));
  }
}

function findCollapsedSectionToggles(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(
    '[aria-expanded="false"]'
  ));

  return candidates.filter((element) => {
    if (!isVisibleElement(element) || !isProjectSectionToggle(element)) {
      return false;
    }

    // A conversation row can contain an aria-expanded control for its menu;
    // only expand controls that are not themselves conversation links.
    return !element.closest('a[href*="/c/"]');
  });
}

function isProjectSectionToggle(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role') || '';
  const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`.toLowerCase();
  const hasFolderIcon = Boolean(element.querySelector('svg, [data-icon*="folder" i], [class*="folder" i]'));
  const isButtonLike = tagName === 'button' || role === 'button' || typeof (element as HTMLElement & { click?: unknown }).click === 'function';

  if (!isButtonLike) {
    return false;
  }

  // Prefer semantic folder/project labels, but also accept the generic folder
  // row used by current ChatGPT builds where the visible label is arbitrary.
  return hasFolderIcon || /project|项目|folder|文件夹|workspace|工作区|group|分组/i.test(label);
}

async function waitForSectionExpansion(element: HTMLElement): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < SIDEBAR_SECTION_EXPAND_WAIT_MS) {
    if (!element.isConnected || element.getAttribute('aria-expanded') === 'true') {
      await sleep(80);
      return;
    }
    await sleep(80);
  }
}

function findReplacementCollapsedToggle(snapshot: CollapsedSectionSnapshot): HTMLElement | null {
  const parent = snapshot.parent;
  if (!parent?.isConnected) {
    return null;
  }

  return Array.from(parent.querySelectorAll<HTMLElement>('[aria-expanded="true"]'))
    .find((element) => {
      if (!isProjectSectionToggle(element)) {
        return false;
      }

      const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      return !snapshot.label || label.includes(snapshot.label.toLowerCase());
    }) || null;
}

function collectVisibleConversations(container: ParentNode, conversations: Map<string, ConversationItem>): void {
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

function findConversationLinks(container: ParentNode): HTMLAnchorElement[] {
  const selector = CHATGPT_SELECTORS.sidebarConversationLinks.join(',');
  return Array.from(container.querySelectorAll<HTMLAnchorElement>(selector)).filter((link) => {
    const href = link.getAttribute('href');
    return Boolean(href && parseChatGptConversationUrl(href));
  });
}

function conversationItemFromLink(link: HTMLAnchorElement): ConversationItem | null {
  const parsed = parseChatGptConversationUrl(link.getAttribute('href') || link.href);

  if (!parsed) {
    return null;
  }

  return {
    id: parsed.id,
    title: getLinkTitle(link),
    url: parsed.url
  };
}

export function parseChatGptConversationUrl(href: string): { id: string; url: string } | null {
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
      url: `${url.origin}${url.pathname}`
    };
  } catch {
    return null;
  }
}

export function getSidebarTitleForConversationUrl(href: string): string | null {
  const currentConversation = parseChatGptConversationUrl(href);

  if (!currentConversation) {
    return null;
  }

  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/c/"]')) {
    const linkedConversation = parseChatGptConversationUrl(link.getAttribute('href') || link.href);

    if (linkedConversation?.id === currentConversation.id) {
      const title = getLinkTitle(link);
      return title === UNTITLED_CONVERSATION ? null : title;
    }
  }

  return null;
}

function getLinkTitle(link: HTMLAnchorElement): string {
  const titleRoot = link.cloneNode(true) as HTMLElement;
  titleRoot.querySelectorAll('button, [role="button"], svg, [aria-hidden="true"]').forEach((element) => element.remove());
  const text = (titleRoot.innerText || titleRoot.textContent || link.getAttribute('title') || link.getAttribute('aria-label') || '')
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
    if (!parseChatGptConversationUrl(link.getAttribute('href') || link.href)) {
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
