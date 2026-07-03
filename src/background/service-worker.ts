import {
  CONTENT_EXTRACTION_TIMEOUT_MS,
  CONTENT_MESSAGE_RETRY_DELAY_MS,
  CONTENT_MESSAGE_RETRY_LIMIT,
  CONVERSATION_RENDER_WAIT_MAX_MS,
  CONVERSATION_RENDER_WAIT_MIN_MS,
  DEFAULT_EXPORT_STATE,
  EXPORT_DELAY_MS,
  TAB_LOAD_TIMEOUT_MS
} from '../core/constants';
import { downloadMarkdown } from '../core/download';
import { buildPlatformConversationFilename } from '../core/filename';
import { logger } from '../core/logger';
import { conversationToMarkdown } from '../core/markdown';
import {
  buildFailedMarkdown,
  buildIndexMarkdown,
  buildReportFilename,
  getReportExportedAt
} from '../core/report';
import { sleep } from '../core/sleep';
import type {
  ConversationItem,
  DownloadResult,
  ExportedConversation,
  ExportStatus,
  ExportTaskState,
  RuntimeRequest,
  RuntimeResponse
} from '../core/types';

let exportState: ExportTaskState = createInitialExportState();
let stopRequested = false;
let activeRunId = 0;
let activePlatformId = 'chatgpt';
let activePlatformName = 'ChatGPT';

chrome.runtime.onInstalled.addListener(() => {
  logger.info('Dialog-Export installed');
});

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
  if (request.type === 'DOWNLOAD_MARKDOWN') {
    void downloadMarkdown(request.filename, request.markdown)
      .then((result) => sendResponse(ok<DownloadResult>(result)))
      .catch((error: unknown) => sendResponse(fail(error, '下载失败')));
    return true;
  }

  if (request.type === 'START_SELECTED_CONVERSATION_EXPORT') {
    void startSelectedConversationExport(request.tabId, request.conversations, {
      platformId: request.platformId,
      platformName: request.platformName
    })
      .then((state) => sendResponse(ok(state)))
      .catch((error: unknown) => sendResponse(fail(error, '启动导出失败')));
    return true;
  }

  if (request.type === 'STOP_EXPORT_TASK') {
    stopRequested = true;
    exportState = { ...exportState, status: 'stopped' };
    sendResponse(ok(exportState));
    return false;
  }

  if (request.type === 'GET_EXPORT_TASK_STATE') {
    sendResponse(ok(exportState));
    return false;
  }

  return false;
});

async function startSelectedConversationExport(
  tabId: number,
  conversations: ConversationItem[],
  platform: { platformId?: string; platformName?: string }
): Promise<ExportTaskState> {
  if (exportState.status === 'exporting') {
    return exportState;
  }

  if (conversations.length === 0) {
    throw new Error('请至少选择一个要导出的对话。');
  }

  stopRequested = false;
  activeRunId += 1;
  const runId = activeRunId;
  activePlatformId = sanitizePlatformPrefix(platform.platformId || inferPlatformPrefix(conversations[0]?.url) || 'chatgpt');
  activePlatformName = platform.platformName || activePlatformId;

  exportState = {
    ...createInitialExportState(),
    status: 'exporting',
    total: conversations.length,
    currentTitle: conversations[0]?.title,
    currentUrl: conversations[0]?.url
  };

  void runSelectedConversationExport(runId, tabId, conversations);
  return exportState;
}

async function runSelectedConversationExport(runId: number, tabId: number, conversations: ConversationItem[]): Promise<void> {
  try {
    for (let index = 0; index < conversations.length; index += 1) {
      if (isStopped(runId)) {
        await finishExportTask(runId, 'stopped');
        return;
      }

      const item = conversations[index];
      exportState = {
        ...exportState,
        status: 'exporting',
        currentTitle: item.title,
        currentUrl: item.url
      };

      try {
        await openConversationInTab(tabId, item.url);
        await sleep(randomRenderWaitMs());

        const conversation = await extractConversationWithRetry(tabId);
        const title = conversation.title || item.title || 'untitled-conversation';
        const exportedConversation: ExportedConversation = {
          ...conversation,
          title,
          url: item.url
        };

        if (exportedConversation.messages.length === 0) {
          throw new Error('当前对话没有可导出的消息。');
        }

        const filename = buildPlatformConversationFilename(activePlatformId, index + 1, title);
        const markdown = conversationToMarkdown(exportedConversation);

        if (!markdown.trim()) {
          throw new Error('当前对话生成的 Markdown 为空。');
        }

        await downloadMarkdown(filename, markdown);

        exportState = {
          ...exportState,
          success: exportState.success + 1,
          results: [
            ...exportState.results,
            {
              title,
              url: item.url,
              filename,
              exportedAt: exportedConversation.exportedAt
            }
          ]
        };
      } catch (error) {
        exportState = {
          ...exportState,
          failed: exportState.failed + 1,
          errors: [
            ...exportState.errors,
            {
              title: item.title,
              url: item.url,
              reason: error instanceof Error ? error.message : '导出失败'
            }
          ]
        };
      } finally {
        exportState = {
          ...exportState,
          current: Math.min(index + 1, exportState.total)
        };
      }

      if (isStopped(runId)) {
        await finishExportTask(runId, 'stopped');
        return;
      }

      if (index < conversations.length - 1) {
        await sleep(EXPORT_DELAY_MS);
      }
    }

    await finishExportTask(runId, stopRequested ? 'stopped' : 'completed');
  } catch (error) {
    exportState = {
      ...exportState,
      status: stopRequested ? 'stopped' : 'failed',
      errors: [
        ...exportState.errors,
        {
          url: exportState.currentUrl || '',
          title: exportState.currentTitle,
          reason: error instanceof Error ? error.message : '批量导出任务异常中断'
        }
      ]
    };

    await downloadReportsSafely(exportState.status);
  }
}

async function finishExportTask(runId: number, status: Extract<ExportStatus, 'completed' | 'stopped'>): Promise<void> {
  if (runId !== activeRunId) {
    return;
  }

  exportState = {
    ...exportState,
    status,
    currentTitle: status === 'completed' ? '导出完成' : exportState.currentTitle
  };

  await downloadReportsSafely(status);
}

async function downloadReportsSafely(status: ExportStatus): Promise<void> {
  try {
    const reportDate = new Date();
    const exportedAt = getReportExportedAt(reportDate);
    const indexMarkdown = buildIndexMarkdown({
      exportedAt,
      status,
      total: exportState.total,
      success: exportState.success,
      failed: exportState.failed,
      results: exportState.results,
      platformName: activePlatformName
    });

    await downloadMarkdown(buildReportFilename('index', reportDate, activePlatformId), indexMarkdown);

    if (exportState.errors.length > 0) {
      const failedMarkdown = buildFailedMarkdown({
        exportedAt,
        status,
        errors: exportState.errors,
        platformName: activePlatformName
      });
      await downloadMarkdown(buildReportFilename('failed', reportDate, activePlatformId), failedMarkdown);
    }
  } catch (error) {
    logger.warn('Failed to download export report', error);
  }
}

async function openConversationInTab(tabId: number, url: string): Promise<void> {
  await chrome.tabs.update(tabId, { url, active: true });
  await waitForTabComplete(tabId);
}

async function waitForTabComplete(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);

  if (tab.status === 'complete') {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('等待会话页面加载超时。'));
    }, TAB_LOAD_TIMEOUT_MS);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        globalThis.clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function extractConversationWithRetry(tabId: number): Promise<ExportedConversation> {
  let lastError: unknown;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= CONTENT_MESSAGE_RETRY_LIMIT; attempt += 1) {
    const remainingMs = CONTENT_EXTRACTION_TIMEOUT_MS - (Date.now() - startedAt);

    if (remainingMs <= 0) {
      break;
    }

    try {
      const conversation = await withTimeout(
        sendTabMessage<ExportedConversation>(tabId, {
          type: 'EXPORT_CURRENT_CONVERSATION'
        }),
        remainingMs,
        '提取当前会话消息超时。'
      );

      if (conversation.messages.length === 0) {
        throw new Error('当前对话没有可导出的消息。');
      }

      return conversation;
    } catch (error) {
      lastError = error;

      if (attempt === 1) {
        await tryInjectContentScript(tabId);
      }

      if (attempt < CONTENT_MESSAGE_RETRY_LIMIT) {
        await sleep(CONTENT_MESSAGE_RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : '无法从当前会话页面提取消息。');
}

async function tryInjectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/index.js']
    });
  } catch {
    // The content script may already be present or the tab may not be injectable yet.
  }
}

async function sendTabMessage<T>(tabId: number, request: RuntimeRequest): Promise<T> {
  const response = await chrome.tabs.sendMessage<RuntimeRequest, RuntimeResponse<T>>(tabId, request);

  if (!response?.ok) {
    throw new Error(response?.error || '当前页面未准备好，请刷新页面后重试。');
  }

  return response.data;
}

function createInitialExportState(): ExportTaskState {
  return {
    ...DEFAULT_EXPORT_STATE,
    errors: [],
    results: []
  };
}

function isStopped(runId: number): boolean {
  return stopRequested || runId !== activeRunId;
}

function randomRenderWaitMs(): number {
  return CONVERSATION_RENDER_WAIT_MIN_MS + Math.floor(Math.random() * (CONVERSATION_RENDER_WAIT_MAX_MS - CONVERSATION_RENDER_WAIT_MIN_MS + 1));
}

function inferPlatformPrefix(url?: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const hostname = new URL(url).hostname;

    if (hostname.includes('doubao.com')) {
      return 'doubao';
    }

    if (
      hostname.includes('qwen.ai') ||
      hostname.includes('qwenlm.ai') ||
      hostname.includes('tongyi') ||
      hostname.includes('qianwen')
    ) {
      return 'qianwen';
    }

    if (hostname.includes('gemini.google.com')) {
      return 'gemini';
    }

    if (hostname.includes('yuanbao.tencent.com')) {
      return 'yuanbao';
    }

    if (hostname.includes('kimi.com') || hostname.includes('kimi.moonshot.cn')) {
      return 'kimi';
    }

    if (hostname.includes('chat.deepseek.com')) {
      return 'deepseek';
    }

    if (hostname.includes('claude.ai') || hostname.includes('claude.com')) {
      return 'claude';
    }

    if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) {
      return 'chatgpt';
    }
  } catch {
    return null;
  }

  return null;
}

function sanitizePlatformPrefix(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'ai';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

function ok<T>(data: T): RuntimeResponse<T> {
  return { ok: true, data };
}

function fail(error: unknown, fallback: string): RuntimeResponse<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback
  };
}
