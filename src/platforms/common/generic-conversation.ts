import { CONVERSATION_LOAD_TIMEOUT_MS } from '../../core/constants';
import { formatDateTime } from '../../core/markdown';
import type { ChatMessage, ExportedConversation } from '../../core/types';
import type { GenericConversationOptions, PageDiagnosis, PlatformConversationConfig } from '../types';
import {
  dedupeMessages,
  detectRoleFromElement,
  findMainContentRoots,
  findMessageCandidates,
  getVisibleText,
  isExcludedElement,
  isUiOnlyText,
  isVisibleElement,
  nodeToMarkdown,
  queryAllSafe,
  uniqueElements
} from './dom-utils';

export async function exportGenericCurrentConversation(options: GenericConversationOptions): Promise<ExportedConversation> {
  const messages = await waitForMessages(options);

  if (messages.length === 0) {
    throw new Error(`当前页面未检测到可导出的 ${options.name} 对话内容，请打开具体聊天页面后重试。`);
  }

  return {
    platform: options.name,
    title: getConversationTitle(options),
    url: window.location.href,
    exportedAt: formatDateTime(),
    messages
  };
}

export async function exportPlatformCurrentConversation(config: PlatformConversationConfig): Promise<ExportedConversation> {
  const specializedMessages = extractMessagesWithSelectors(config);

  if (specializedMessages.length > 0) {
    return {
      platform: config.name,
      title: getConversationTitle(config),
      url: window.location.href,
      exportedAt: formatDateTime(),
      messages: specializedMessages
    };
  }

  try {
    return await exportGenericCurrentConversation(config);
  } catch {
    throw new Error(config.noMessageError);
  }
}

export async function diagnoseCurrentPage(config: PlatformConversationConfig): Promise<PageDiagnosis> {
  return diagnoseWithParser(config, () => exportPlatformCurrentConversation(config));
}

export async function diagnoseWithParser(
  config: PlatformConversationConfig,
  parser: () => Promise<ExportedConversation>
): Promise<PageDiagnosis> {
  const rootCandidates = findMainContentRoots();
  const messageCandidates = uniqueElements([
    ...queryAllSafe(config.messageSelectors),
    ...rootCandidates.flatMap((root) => findMessageCandidates(root))
  ]).filter((element) => isVisibleElement(element) && !isExcludedElement(element));
  const warnings = buildWarnings(rootCandidates.length, messageCandidates.length, 0);
  let messages: ChatMessage[] = [];

  try {
    const conversation = await parser();
    messages = dedupeMessages(conversation.messages);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'parser 执行失败。');
  }

  if (messages.length > 0 && messageCandidates.length === 0) {
    warnings.push('候选节点统计为空，但平台解析器成功提取消息。');
  }

  if (messages.length === 0 && warnings.length === 0) {
    warnings.push('当前页面未检测到已加载的对话消息，请打开具体历史对话后重试。');
  }

  return {
    platformId: config.id,
    platformName: config.name,
    url: window.location.href,
    parser: config.parserName,
    rootCandidateCount: rootCandidates.length,
    messageCandidateCount: messageCandidates.length,
    extractedMessageCount: messages.length,
    previews: messages.slice(0, 3).map((message) => ({
      role: message.role,
      text: message.content.replace(/\s+/g, ' ').slice(0, 80)
    })),
    warnings: finalizeWarnings(warnings, messages.length)
  };
}

async function waitForMessages(options: GenericConversationOptions): Promise<ChatMessage[]> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CONVERSATION_LOAD_TIMEOUT_MS) {
    const messages = extractMessagesWithSelectors(options);

    if (messages.length > 0) {
      return messages;
    }

    await delay(300);
  }

  return [];
}

function extractMessagesWithSelectors(options: GenericConversationOptions): ChatMessage[] {
  const roots = findMainContentRoots();
  const scopedElements = roots.flatMap((root) => [
    ...queryAllSafe(options.messageSelectors, root),
    ...queryAllSafe(options.userSelectors || [], root),
    ...queryAllSafe(options.assistantSelectors || [], root),
    ...findMessageCandidates(root)
  ]);
  const globalElements = [
    ...queryAllSafe(options.messageSelectors),
    ...queryAllSafe(options.userSelectors || []),
    ...queryAllSafe(options.assistantSelectors || [])
  ];
  const candidates = uniqueElements([...scopedElements, ...globalElements])
    .filter((element) => isVisibleElement(element) && !isExcludedElement(element));

  return dedupeMessages(candidates.map((element) => extractMessageFromElement(element, options)).filter(Boolean) as ChatMessage[]);
}

function extractMessageFromElement(element: Element, options: GenericConversationOptions): ChatMessage | null {
  const markdown = nodeToMarkdown(element);
  const text = getVisibleText(element);

  if (!markdown || !text || isUiOnlyText(text)) {
    return null;
  }

  return {
    role: detectRoleFromElement(element, options.userSelectors, options.assistantSelectors),
    content: markdown
  };
}

function getConversationTitle(options: GenericConversationOptions): string {
  for (const selector of options.titleSelectors || []) {
    try {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value) {
        return cleanupTitle(value, options);
      }
    } catch {
      continue;
    }
  }

  return cleanupTitle(document.title, options) || 'untitled-conversation';
}

function cleanupTitle(title: string, options: GenericConversationOptions): string {
  let cleaned = title.trim();

  for (const pattern of options.titleCleanupPatterns || []) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  return cleaned;
}

function buildWarnings(rootCount: number, candidateCount: number, messageCount: number): string[] {
  const warnings: string[] = [];

  if (rootCount === 0) {
    warnings.push('未找到明显的主内容区域。');
  }

  if (candidateCount === 0) {
    warnings.push('未找到候选消息节点。');
  }

  if (messageCount === 0 && rootCount === 0 && candidateCount === 0) {
    warnings.push('当前页面未检测到已加载的对话消息，请打开具体历史对话后重试。');
  }

  return warnings;
}

function finalizeWarnings(warnings: string[], messageCount: number): string[] {
  const result = Array.from(new Set(warnings));

  if (messageCount > 0) {
    return result.filter((warning) => !warning.startsWith('当前页面未检测到已加载的对话消息'));
  }

  return result.length > 0 ? result : ['未提取到有效消息文本。'];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
