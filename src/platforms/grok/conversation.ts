import { CONVERSATION_LOAD_TIMEOUT_MS } from '../../core/constants';
import { formatDateTime } from '../../core/markdown';
import type { ChatMessage, ExportedConversation } from '../../core/types';
import { domToMarkdown } from '../../content/dom-to-markdown';
import type { PageDiagnosis } from '../types';

const GROK_NO_MESSAGE_ERROR = 'Grok 当前页面未提取到对话消息，请打开具体对话页后重试。';

const ROOT_SELECTORS = [
  'main',
  '[role="main"]',
  'article',
  '[data-testid="primaryColumn"]',
  '[data-testid*="grok" i]',
  '[class*="grok" i]',
  '[class*="chat" i]',
  '[class*="conversation" i]'
];

const MESSAGE_SELECTORS = [
  'article',
  '[data-message-id]',
  '[data-testid*="conversation" i]',
  '[data-testid*="message" i]',
  '[data-testid*="chat" i]',
  '[data-testid*="response" i]',
  '[data-testid*="answer" i]',
  '[data-testid*="cellInnerDiv" i]',
  '[class*="message" i]',
  '[class*="chat-message" i]',
  '[class*="response" i]',
  '[class*="answer" i]',
  '[class*="markdown" i]',
  '[class*="prose" i]',
  '[class*="bubble" i]',
  '[class*="whitespace-pre-wrap" i]',
  '[class*="break-words" i]'
];

const FALLBACK_TEXT_SELECTORS = [
  'main p',
  '[role="main"] p',
  'main li',
  '[role="main"] li',
  'main pre',
  '[role="main"] pre',
  'main [dir="auto"]',
  '[role="main"] [dir="auto"]'
];

const EXCLUDED_SELECTORS = [
  'nav',
  'aside',
  'header',
  'footer',
  'textarea',
  'input',
  'button',
  'form',
  'script',
  'style',
  'noscript',
  '[contenteditable="true"]',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="search"]',
  '[aria-hidden="true"]',
  '[aria-label*="Trending" i]',
  '[aria-label*="Search" i]',
  '[data-testid*="sidebar" i]',
  '[data-testid*="composer" i]',
  '[data-testid*="prompt" i]',
  '[class*="sidebar" i]',
  '[class*="composer" i]',
  '[class*="input" i]',
  '[class*="toolbar" i]',
  '[class*="actions" i]'
];

const UI_ONLY_TEXTS = new Set([
  'copy',
  'copied',
  'share',
  'retry',
  'regenerate',
  'like',
  'dislike',
  'edit',
  'delete',
  'send',
  'stop',
  'new chat',
  'history',
  'settings',
  'upgrade',
  'sign in',
  'log in',
  '复制',
  '已复制',
  '分享',
  '重试',
  '重新生成',
  '点赞',
  '点踩',
  '编辑',
  '删除',
  '发送',
  '停止',
  '新对话',
  '历史',
  '设置'
]);

export async function exportGrokCurrentConversation(): Promise<ExportedConversation> {
  const messages = await waitForGrokMessages();

  if (messages.length === 0) {
    throw new Error(GROK_NO_MESSAGE_ERROR);
  }

  return {
    platform: 'Grok',
    title: getGrokTitle(),
    url: window.location.href,
    exportedAt: formatDateTime(),
    messages
  };
}

export async function diagnoseGrokCurrentPage(): Promise<PageDiagnosis> {
  const roots = findGrokRoots();
  const candidates = findGrokMessageCandidates(roots);
  const messages = extractGrokMessages();
  const warnings: string[] = [];

  if (roots.length === 0) {
    warnings.push('未找到 Grok 主聊天区域。');
  }

  if (candidates.length === 0) {
    warnings.push('未找到 Grok 候选消息节点。');
  }

  if (messages.length === 0) {
    warnings.push(GROK_NO_MESSAGE_ERROR);
  }

  return {
    platformId: 'grok',
    platformName: 'Grok',
    url: window.location.href,
    parser: 'grok-dom-parser',
    rootCandidateCount: roots.length,
    messageCandidateCount: candidates.length,
    extractedMessageCount: messages.length,
    previews: messages.slice(0, 3).map((message) => ({
      role: message.role,
      text: message.content.replace(/\s+/g, ' ').slice(0, 80)
    })),
    warnings
  };
}

async function waitForGrokMessages(): Promise<ChatMessage[]> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CONVERSATION_LOAD_TIMEOUT_MS) {
    const messages = extractGrokMessages();

    if (messages.length > 0) {
      return messages;
    }

    await delay(300);
  }

  return [];
}

function extractGrokMessages(): ChatMessage[] {
  const roots = findGrokRoots();
  const primaryCandidates = findGrokMessageCandidates(roots);
  const fallbackCandidates = primaryCandidates.length > 0 ? [] : queryElements(FALLBACK_TEXT_SELECTORS);
  const candidates = pruneNestedCandidates(uniqueElements([...primaryCandidates, ...fallbackCandidates]))
    .filter(isLikelyMessageElement)
    .sort(compareDocumentOrder);
  const messages = candidates
    .map((element, index) => extractMessage(element, index))
    .filter((message): message is ChatMessage => Boolean(message));

  return inferUnknownRoles(dedupeMessages(messages));
}

function findGrokRoots(): Element[] {
  const roots = queryElements(ROOT_SELECTORS)
    .filter((element) => isVisibleElement(element) && !isExcludedElement(element, { allowSelfRoot: true }));

  if (roots.length > 0) {
    return pruneNestedRoots(roots);
  }

  return document.body ? [document.body] : [];
}

function findGrokMessageCandidates(roots: Element[]): Element[] {
  return uniqueElements(roots.flatMap((root) => queryElements(MESSAGE_SELECTORS, root)))
    .filter((element) => isVisibleElement(element) && !isExcludedElement(element));
}

function extractMessage(element: Element, index: number): ChatMessage | null {
  const markdown = normalizeText(domToMarkdown(element));
  const text = normalizeText(element.textContent || '');

  if (!markdown || !text || isUiOnlyText(markdown)) {
    return null;
  }

  return {
    role: detectGrokRole(element, index),
    content: markdown
  };
}

function detectGrokRole(element: Element, index: number): ChatMessage['role'] {
  const attributes = collectRoleAttributes(element).toLowerCase();

  if (/(user|human|you|me|prompt|question|query|sender|request|用户|提问|问题)/i.test(attributes)) {
    return 'user';
  }

  if (/(assistant|grok|bot|ai|model|answer|response|reply|markdown|助手|回答|回复)/i.test(attributes)) {
    return 'assistant';
  }

  const closestUser = element.closest('[data-role="user"], [data-author="user"], [class*="user" i], [class*="prompt" i], [class*="question" i]');
  const closestAssistant = element.closest('[data-role="assistant"], [data-author="assistant"], [class*="assistant" i], [class*="grok" i], [class*="response" i], [class*="answer" i]');

  if (closestUser) {
    return 'user';
  }

  if (closestAssistant) {
    return 'assistant';
  }

  return index % 2 === 0 ? 'user' : 'assistant';
}

function collectRoleAttributes(element: Element): string {
  const attributes = [
    element.getAttribute('data-testid'),
    element.getAttribute('data-role'),
    element.getAttribute('data-author'),
    element.getAttribute('data-message-author-role'),
    element.getAttribute('aria-label'),
    element.getAttribute('class')
  ];
  const parent = element.parentElement;

  if (parent) {
    attributes.push(parent.getAttribute('data-testid'), parent.getAttribute('aria-label'), parent.getAttribute('class'));
  }

  return attributes.filter(Boolean).join(' ');
}

function inferUnknownRoles(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0 || !messages.every((message) => message.role === 'unknown')) {
    return messages;
  }

  return messages.map((message, index) => ({
    ...message,
    role: index % 2 === 0 ? 'user' : 'assistant'
  }));
}

function dedupeMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const result: ChatMessage[] = [];

  for (const message of messages) {
    const content = normalizeText(message.content);
    const key = `${message.role}:${content}`;

    if (!content || isUiOnlyText(content) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ ...message, content });
  }

  return result;
}

function pruneNestedCandidates(elements: Element[]): Element[] {
  return elements.filter((element) => {
    const text = normalizeText(element.textContent || '');
    const childCandidates = elements
      .filter((candidate) => candidate !== element && element.contains(candidate))
      .map((candidate) => normalizeText(candidate.textContent || ''))
      .filter(Boolean);

    if (childCandidates.length >= 2) {
      return false;
    }

    if (childCandidates.length === 1 && childCandidates[0].length >= text.length * 0.75) {
      return false;
    }

    return true;
  });
}

function pruneNestedRoots(elements: Element[]): Element[] {
  return elements.filter((element) => {
    const parentRoot = elements.find((candidate) => candidate !== element && candidate.contains(element));
    return !parentRoot || element.matches('main, [role="main"], article');
  });
}

function isLikelyMessageElement(element: Element): boolean {
  if (!isVisibleElement(element) || isExcludedElement(element)) {
    return false;
  }

  const text = normalizeText(element.textContent || '');

  if (!text || text.length < 2 || isUiOnlyText(text)) {
    return false;
  }

  if (element.matches('main, body, [role="main"]') && text.length > 500) {
    return false;
  }

  return true;
}

function isExcludedElement(element: Element, options: { allowSelfRoot?: boolean } = {}): boolean {
  return EXCLUDED_SELECTORS.some((selector) => {
    if (options.allowSelfRoot && matchesSelector(element, selector)) {
      return false;
    }

    return matchesSelector(element, selector) || Boolean(element.closest(selector));
  });
}

function isVisibleElement(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function isUiOnlyText(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();

  if (!normalized || UI_ONLY_TEXTS.has(normalized)) {
    return true;
  }

  return /^(copy|share|retry|regenerate|like|dislike|edit|delete)(\s*[·•|]\s*)*$/i.test(normalized);
}

function getGrokTitle(): string {
  const selectors = ['main h1', '[role="main"] h1', 'h1'];

  for (const selector of selectors) {
    const title = document.querySelector(selector)?.textContent?.trim();

    if (title) {
      return cleanupTitle(title);
    }
  }

  return cleanupTitle(document.title) || 'untitled-conversation';
}

function cleanupTitle(title: string): string {
  return normalizeText(title)
    .replace(/\s*[-|]\s*Grok\s*$/i, '')
    .replace(/\s*[-|]\s*X\s*$/i, '')
    .trim() || 'untitled-conversation';
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

function uniqueElements<T extends Element>(elements: T[]): T[] {
  return Array.from(new Set(elements));
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function compareDocumentOrder(a: Element, b: Element): number {
  if (a === b) {
    return 0;
  }

  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function matchesSelector(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
