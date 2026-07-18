import type { ChatMessage } from '../../core/types';
import { domToMarkdown } from '../../content/dom-to-markdown';

const EXCLUDED_SELECTORS = [
  'nav',
  'aside',
  'header',
  'footer',
  'textarea',
  'input',
  'button',
  'form',
  '[contenteditable="true"]',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  '[data-testid*="sidebar" i]',
  '[class*="sidebar" i]',
  '[class*="side-bar" i]',
  '[class*="history" i]',
  '[class*="prompt" i]',
  '[class*="suggest" i]',
  '[class*="recommend" i]',
  '[class*="toolbar" i]',
  '[class*="actions" i]',
  '[class*="composer" i]',
  '[class*="input" i]'
];

const UI_TEXTS = new Set([
  '复制',
  '重新生成',
  '分享',
  '点赞',
  '踩',
  '发送',
  '停止',
  '编辑',
  '删除',
  '重试',
  'regenerate',
  'copy',
  'share',
  'like',
  'dislike',
  'send',
  'stop',
  'retry',
  'edit',
  'delete'
]);

export function isVisibleElement(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

export function isExcludedElement(element: Element): boolean {
  return EXCLUDED_SELECTORS.some((selector) => matchesSelector(element, selector) || Boolean(element.closest(selector)));
}

export function getVisibleText(element: Element): string {
  if (!isVisibleElement(element) || isExcludedElement(element)) {
    return '';
  }

  return normalizeMessageText(element.textContent || '');
}

export function nodeToMarkdown(element: Element): string {
  if (!isVisibleElement(element) || isExcludedElement(element)) {
    return '';
  }

  return normalizeMessageText(domToMarkdown(element));
}

export function normalizeMessageText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export function isUiOnlyText(text: string): boolean {
  const normalized = normalizeMessageText(text).toLowerCase();
  return !normalized || UI_TEXTS.has(normalized);
}

export function dedupeMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const message of messages) {
    const content = normalizeMessageText(message.content);

    if (!content || isUiOnlyText(content)) {
      continue;
    }

    result.push({ ...message, content });
  }

  return result;
}

export function dedupeCandidateElements(elements: Element[]): Element[] {
  const unique = uniqueElements(elements);

  return unique.filter((element, index) => {
    const text = normalizeMessageText(element.textContent || '');

    if (!text) {
      return true;
    }

    return !unique.some((other, otherIndex) => {
      if (index === otherIndex || !other.contains(element)) {
        return false;
      }

      return normalizeMessageText(other.textContent || '') === text;
    });
  });
}

export function findMainContentRoots(): Element[] {
  const selectors = [
    'main',
    '[role="main"]',
    'article',
    '[class*="chat" i]',
    '[class*="conversation" i]',
    '[class*="thread" i]',
    '[class*="scroll" i]'
  ];

  return uniqueElements(queryAllSafe(selectors))
    .filter((element) => isVisibleElement(element) && !isExcludedElement(element));
}

export function findMessageCandidates(root: Element): Element[] {
  const selectors = [
    'article',
    '[data-message-id]',
    '[data-testid*="message" i]',
    '[data-testid*="answer" i]',
    '[data-testid*="query" i]',
    '[class*="message" i]',
    '[class*="chat-message" i]',
    '[class*="conversation" i]',
    '[class*="answer" i]',
    '[class*="question" i]',
    '[class*="response" i]',
    '[class*="markdown" i]',
    '[class*="bubble" i]',
    '[class*="segment" i]',
    'message-content',
    'model-response',
    'user-query'
  ];

  return uniqueElements(queryAllSafe(selectors, root))
    .filter((element) => isVisibleElement(element) && !isExcludedElement(element) && getVisibleText(element).length > 10);
}

export function queryAllSafe(selectors: string[], root: ParentNode = document): Element[] {
  const elements: Element[] = [];

  for (const selector of selectors) {
    try {
      elements.push(...Array.from(root.querySelectorAll(selector)));
    } catch {
      continue;
    }
  }

  return elements;
}

export function matchesAny(element: Element, selectors: string[]): boolean {
  return selectors.some((selector) => matchesSelector(element, selector));
}

export function detectRoleFromElement(
  element: Element,
  userSelectors: string[] = [],
  assistantSelectors: string[] = []
): ChatMessage['role'] {
  if (matchesAny(element, userSelectors)) {
    return 'user';
  }

  if (matchesAny(element, assistantSelectors)) {
    return 'assistant';
  }

  const attributes = [
    element.getAttribute('data-message-author-role'),
    element.getAttribute('data-role'),
    element.getAttribute('data-author'),
    element.getAttribute('aria-label'),
    element.getAttribute('class')
  ].filter(Boolean).join(' ').toLowerCase();

  if (/(user|human|you|me|question|query|用户|提问|我)/i.test(attributes)) {
    return 'user';
  }

  if (/(assistant|model|bot|ai|agent|answer|response|reply|claude|gemini|grok|deepseek|kimi|doubao|qwen|qianwen|yuanbao|助手|回答|回复)/i.test(attributes)) {
    return 'assistant';
  }

  return 'unknown';
}

export function uniqueElements(elements: Element[]): Element[] {
  return Array.from(new Set(elements));
}

function matchesSelector(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}
