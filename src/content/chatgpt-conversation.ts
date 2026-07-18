import { CHATGPT_SELECTORS, CONVERSATION_LOAD_TIMEOUT_MS } from '../core/constants';
import { formatDateTime } from '../core/markdown';
import type { ChatMessage, ExportedConversation } from '../core/types';
import { domToMarkdown } from './dom-to-markdown';
import { getSidebarTitleForConversationUrl } from './chatgpt-sidebar';

export async function exportCurrentConversation(): Promise<ExportedConversation> {
  try {
    const messageElements = await waitForConversationMessages();
    const messages = messageElements
      .map((element) => extractMessage(element))
      .filter((message): message is ChatMessage => Boolean(message?.content.trim()));

    if (messages.length === 0) {
      throw new Error('当前页面没有识别到可导出的 ChatGPT 消息。');
    }

    return {
      platform: 'ChatGPT',
      title: getConversationTitle(),
      url: window.location.href,
      exportedAt: formatDateTime(),
      messages
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '导出当前 ChatGPT 对话失败。');
  }
}

function extractMessage(element: Element): ChatMessage | null {
  try {
    const role = normalizeRole(element.getAttribute('data-message-author-role'));
    const contentRoot = findMessageContentRoot(element);
    const content = domToMarkdown(contentRoot || element).trim();

    if (!content) {
      return null;
    }

    return { role, content };
  } catch {
    return null;
  }
}

async function waitForConversationMessages(): Promise<Element[]> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CONVERSATION_LOAD_TIMEOUT_MS) {
    const messages = Array.from(document.querySelectorAll(CHATGPT_SELECTORS.messages))
      .filter(isVisibleElement);

    if (messages.length > 0) {
      return messages;
    }

    await delay(300);
  }

  throw new Error('等待 ChatGPT 对话加载超时，请确认当前页面已经打开具体会话。');
}

function findMessageContentRoot(messageElement: Element): Element | null {
  for (const selector of CHATGPT_SELECTORS.messageContentCandidates) {
    try {
      const candidate = messageElement.querySelector(selector);
      if (candidate && candidate.textContent?.trim()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return messageElement;
}

function getConversationTitle(): string {
  const sidebarTitle = getSidebarTitleForConversationUrl(window.location.href);

  if (sidebarTitle) {
    return sidebarTitle;
  }

  for (const selector of CHATGPT_SELECTORS.conversationTitleCandidates) {
    try {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value) {
        return value;
      }
    } catch {
      continue;
    }
  }

  return cleanupDocumentTitle(document.title) || 'untitled-conversation';
}

function cleanupDocumentTitle(title: string): string {
  return title
    .replace(/\s*[-|]\s*ChatGPT\s*$/i, '')
    .replace(/^ChatGPT\s*[-|]\s*/i, '')
    .trim();
}

function normalizeRole(role: string | null): ChatMessage['role'] {
  if (role === 'user' || role === 'assistant' || role === 'system') {
    return role;
  }

  return 'unknown';
}

function isVisibleElement(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
