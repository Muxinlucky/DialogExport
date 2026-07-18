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
const CHATGPT_SESSION_ENDPOINT = '/api/auth/session';
const CHATGPT_PROJECTS_ENDPOINT = '/backend-api/gizmos/snorlax/sidebar';
const CHATGPT_PROJECT_SCAN_MAX_PAGES = 50;

interface ChatGptSessionResponse {
  accessToken?: string;
}

interface ChatGptProjectSidebarItem {
  gizmo?: {
    id?: string;
    display?: {
      name?: string;
    };
  };
}

interface ChatGptProjectSidebarResponse {
  items?: ChatGptProjectSidebarItem[];
  cursor?: string | null;
}

interface ChatGptProjectConversation {
  id?: string;
  title?: string | null;
}

interface ChatGptProjectConversationsResponse {
  items?: ChatGptProjectConversation[];
  cursor?: string | null;
}

export async function collectSidebarConversations(): Promise<ConversationItem[]> {
  try {
    const scrollContainer = findSidebarScrollContainer();

    if (!scrollContainer) {
      throw new Error('未找到 ChatGPT 侧边栏，请确认左侧历史栏已展开。');
    }

    const conversations = new Map<string, ConversationItem>();
    let stableScrollCount = 0;
    let lastCount = 0;

    collectVisibleConversations(document, conversations);
    await collectCollapsedProjectConversations(conversations);

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

async function collectCollapsedProjectConversations(conversations: Map<string, ConversationItem>): Promise<void> {
  try {
    const sessionResponse = await fetch(CHATGPT_SESSION_ENDPOINT, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    });

    if (!sessionResponse.ok) {
      return;
    }

    const session = await sessionResponse.json() as ChatGptSessionResponse;
    if (!session.accessToken) {
      return;
    }

    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      'Oai-Language': document.documentElement.lang || 'zh-CN'
    };
    const projects = await fetchAllProjects(headers);

    for (const project of projects) {
      await fetchProjectConversations(project.id, project.name, headers, conversations);
    }
  } catch (error) {
    // DOM scanning still returns regular and already-expanded project chats when
    // ChatGPT changes or temporarily rejects its private project-list endpoint.
    logger.debug('ChatGPT collapsed project scan fallback failed', error);
  }
}

interface ChatGptProject {
  id: string;
  name?: string;
}

async function fetchAllProjects(headers: Record<string, string>): Promise<ChatGptProject[]> {
  const projects = new Map<string, ChatGptProject>();
  let cursor: string | null = null;

  for (let page = 0; page < CHATGPT_PROJECT_SCAN_MAX_PAGES; page += 1) {
    const endpoint = cursor
      ? `${CHATGPT_PROJECTS_ENDPOINT}?cursor=${encodeURIComponent(cursor)}`
      : CHATGPT_PROJECTS_ENDPOINT;
    const response = await fetch(endpoint, { credentials: 'include', headers });

    if (!response.ok) {
      break;
    }

    const payload = await response.json() as ChatGptProjectSidebarResponse;
    for (const item of payload.items || []) {
      if (item.gizmo?.id) {
        projects.set(item.gizmo.id, { id: item.gizmo.id, name: item.gizmo.display?.name });
      }
    }

    cursor = payload.cursor || null;
    if (!cursor) {
      break;
    }
  }

  return Array.from(projects.values());
}

async function fetchProjectConversations(
  projectId: string,
  projectName: string | undefined,
  headers: Record<string, string>,
  conversations: Map<string, ConversationItem>
): Promise<void> {
  let cursor: string | null = '0';

  for (let page = 0; page < CHATGPT_PROJECT_SCAN_MAX_PAGES && cursor !== null; page += 1) {
    const endpoint = `/backend-api/gizmos/${encodeURIComponent(projectId)}/conversations?cursor=${encodeURIComponent(cursor)}`;
    const response = await fetch(endpoint, { credentials: 'include', headers });

    if (!response.ok) {
      break;
    }

    const payload = await response.json() as ChatGptProjectConversationsResponse;
    for (const item of payload.items || []) {
      if (!item.id) {
        continue;
      }

      addConversation(conversations, {
        id: item.id,
        title: item.title?.trim() || UNTITLED_CONVERSATION,
        url: `${window.location.origin}/g/${encodeURIComponent(projectId)}/c/${encodeURIComponent(item.id)}`,
        group: projectName?.trim() || undefined
      });
    }

    cursor = payload.cursor || null;
  }
}

function collectVisibleConversations(container: ParentNode, conversations: Map<string, ConversationItem>): void {
  const links = findConversationLinks(container);

  for (const link of links) {
    const item = conversationItemFromLink(link);

    if (!item) {
      continue;
    }

    addConversation(conversations, item);
  }
}

function addConversation(conversations: Map<string, ConversationItem>, item: ConversationItem): void {
  const idKey = `id:${item.id}`;
  const urlKey = `url:${item.url}`;
  const existing = conversations.get(idKey) || conversations.get(urlKey);

  if (existing) {
    if (!existing.group && item.group) {
      existing.group = item.group;
    }
    if (existing.title === UNTITLED_CONVERSATION && item.title !== UNTITLED_CONVERSATION) {
      existing.title = item.title;
    }
    return;
  }

  conversations.set(idKey, item);
  conversations.set(urlKey, item);
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
