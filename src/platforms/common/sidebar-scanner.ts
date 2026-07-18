import {
  SIDEBAR_SCAN_MAX_SCROLLS,
  SIDEBAR_SCAN_STABLE_LIMIT
} from '../../core/constants';
import type { ConversationItem } from '../../core/types';
import type { PlatformId } from '../types';
import { logger } from '../../core/logger';

export interface SidebarScanConfig {
  platformId: PlatformId;
  platformName: string;
  allowedHostnames: string[];
  linkSelectors: string[];
  containerSelectors: string[];
  excludeHrefKeywords: string[];
  includeHrefKeywords: string[];
  maxScrollTimes?: number;
  stableRoundLimit?: number;
  scrollDelayMs?: number;
  noContainerError?: string;
  noResultError?: string;
  rootResolver?: () => ParentNode | null;
  validateCandidate?: (candidate: {
    url: string;
    title: string;
    link: HTMLAnchorElement;
  }) => true | string;
}

interface ScanRecord {
  item: ConversationItem;
  urlKey: string;
}

export async function scanSidebarConversationsByConfig(config: SidebarScanConfig): Promise<ConversationItem[]> {
  try {
    const root = config.rootResolver?.() || document;
    const container = findBestScrollContainer(config, root);

    if (!container) {
      throw new Error(config.noContainerError || `${config.platformName} 未找到历史会话列表，请确认左侧栏已展开。`);
    }

    const records = new Map<string, ScanRecord>();
    let stableRounds = 0;
    let previousSize = 0;
    const maxScrollTimes = config.maxScrollTimes ?? SIDEBAR_SCAN_MAX_SCROLLS;
    const stableRoundLimit = config.stableRoundLimit ?? SIDEBAR_SCAN_STABLE_LIMIT;
    const scrollDelayMs = config.scrollDelayMs ?? 1000;

    for (let round = 0; round <= maxScrollTimes; round += 1) {
      collectConversationLinks(config, records, root);

      if (records.size === previousSize) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
        previousSize = records.size;
      }

      if (stableRounds >= stableRoundLimit || isScrolledToBottom(container)) {
        break;
      }

      scrollContainer(container);
      await delay(scrollDelayMs);
    }

    const conversations = Array.from(records.values()).map((record) => record.item);
    logger.debug(`${config.platformName} scanned conversations`, conversations);

    if (conversations.length === 0) {
      throw new Error(config.noResultError || `${config.platformName} 未发现历史会话，请确认当前账号有历史对话并已加载侧边栏。`);
    }

    return conversations;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(`${config.platformName} 扫描历史会话失败。`);
  }
}

function collectConversationLinks(config: SidebarScanConfig, records: Map<string, ScanRecord>, root: ParentNode): void {
  const links = queryLinks(config.linkSelectors, root);

  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const url = normalizeConversationUrl(href);
    const rawTitle = extractTitle(link);

    if (!url || !isAllowedUrl(url, config) || isExcludedUrl(url, config) || !isIncludedUrl(url, config)) {
      logRejectedCandidate(config, rawTitle, href, 'URL 不符合平台会话规则');
      continue;
    }

    const customValidation = config.validateCandidate?.({ url, title: rawTitle, link });

    if (customValidation !== undefined && customValidation !== true) {
      logRejectedCandidate(config, rawTitle, url, customValidation);
      continue;
    }

    const title = rawTitle;
    const id = extractConversationId(url) || stableIdFromUrl(url);

    if (!id) {
      continue;
    }

    const item: ConversationItem = {
      id,
      title: title || 'untitled-conversation',
      url
    };
    const urlKey = normalizeUrlKey(url);

    if (!records.has(id) && !Array.from(records.values()).some((record) => record.urlKey === urlKey)) {
      records.set(id, { item, urlKey });
    }
  }
}

function findBestScrollContainer(config: SidebarScanConfig, root: ParentNode): HTMLElement | null {
  const configured = queryElements(config.containerSelectors, root)
    .filter((element): element is HTMLElement => element instanceof HTMLElement);
  const linkParents = queryLinks(config.linkSelectors, root)
    .flatMap((link) => getScrollableAncestors(link));
  const candidates = uniqueElements([...configured, ...linkParents]);

  return candidates
    .map((element) => ({ element, score: scoreContainer(element, config) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.element || null;
}

function scoreContainer(element: HTMLElement, config: SidebarScanConfig): number {
  const links = queryLinks(config.linkSelectors, element)
    .filter((link) => {
      const href = link.getAttribute('href') || '';
      const url = normalizeConversationUrl(href);
      return !!url && isAllowedUrl(url, config) && !isExcludedUrl(url, config) && isIncludedUrl(url, config);
    });
  const scrollScore = element.scrollHeight > element.clientHeight + 20 ? 20 : 0;
  const semanticScore = /^(NAV|ASIDE)$/i.test(element.tagName) || element.getAttribute('role') === 'navigation' ? 10 : 0;

  return links.length * 10 + scrollScore + semanticScore;
}

function queryLinks(selectors: string[], root: ParentNode = document): HTMLAnchorElement[] {
  return queryElements(selectors, root)
    .filter((element): element is HTMLAnchorElement => element instanceof HTMLAnchorElement);
}

function queryElements(selectors: string[], root: ParentNode = document): Element[] {
  const elements: Element[] = [];

  for (const selector of selectors) {
    try {
      elements.push(...Array.from(root.querySelectorAll(selector)));
    } catch {
      continue;
    }
  }

  return uniqueElements(elements);
}

function getScrollableAncestors(element: Element): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current = element.parentElement;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const isScrollable = /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`);

    if (isScrollable || current.scrollHeight > current.clientHeight + 20) {
      ancestors.push(current);
    }

    current = current.parentElement;
  }

  return ancestors;
}

function normalizeConversationUrl(href: string): string | null {
  try {
    return new URL(href, window.location.href).toString();
  } catch {
    return null;
  }
}

function isAllowedUrl(url: string, config: SidebarScanConfig): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && config.allowedHostnames.some((hostname) => parsed.hostname === hostname || parsed.hostname.endsWith(`.${hostname}`));
  } catch {
    return false;
  }
}

function isIncludedUrl(url: string, config: SidebarScanConfig): boolean {
  const lower = url.toLowerCase();
  return config.includeHrefKeywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function isExcludedUrl(url: string, config: SidebarScanConfig): boolean {
  const lower = url.toLowerCase();
  return config.excludeHrefKeywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function extractTitle(link: HTMLAnchorElement): string {
  const aria = link.getAttribute('aria-label')?.trim();
  const title = link.getAttribute('title')?.trim();
  const text = link.innerText?.trim() || link.textContent?.trim() || '';
  return cleanupTitle(text || title || aria || '');
}

function cleanupTitle(title: string): string {
  return title
    .replace(/\s+/g, ' ')
    .replace(/^(打开|进入|继续|查看)\s*/g, '')
    .trim()
    .slice(0, 160);
}

function extractConversationId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathMatch = parsed.pathname.match(/\/(?:chat|thread|bot|conversation|session|c)\/([^/?#]+)/i);

    if (pathMatch?.[1]) {
      return decodeURIComponent(pathMatch[1]);
    }

    for (const key of ['chatId', 'conversationId', 'sessionId', 'threadId', 'id']) {
      const value = parsed.searchParams.get(key);

      if (value) {
        return value;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function stableIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}${parsed.search}`.replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-');
  } catch {
    return url.replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-');
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

function logRejectedCandidate(config: SidebarScanConfig, title: string, href: string, reason: string): void {
  logger.debug(`${config.platformName} rejected sidebar candidate`, {
    title: title || 'untitled',
    href,
    reason
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
