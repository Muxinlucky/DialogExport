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
import { downloadMarkdown, downloadTextFile } from '../core/download';
import { buildExportFilePayload } from '../core/export-format';
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
  ExportFormat,
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
let activeExportFormat: ExportFormat = 'md';
let activeWorkerTabId: number | undefined;

const EXPORT_TASK_STORAGE_KEY = 'dialogExportBackgroundTask';

interface PersistedExportTask {
  state: ExportTaskState;
  stopRequested: boolean;
  activeRunId: number;
  platformId: string;
  platformName: string;
  exportFormat: ExportFormat;
  workerTabId?: number;
}

const stateLoadPromise = restorePersistedTask();

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

  if (request.type === 'DOWNLOAD_EXPORT_FILE') {
    void downloadTextFile(request.filename, request.content, request.mimeType)
      .then((result) => sendResponse(ok<DownloadResult>(result)))
      .catch((error: unknown) => sendResponse(fail(error, '下载失败')));
    return true;
  }

  if (request.type === 'START_SELECTED_CONVERSATION_EXPORT') {
    void startSelectedConversationExport(request.tabId, request.conversations, {
      platformId: request.platformId,
      platformName: request.platformName,
      format: request.format
    })
      .then((state) => sendResponse(ok(state)))
      .catch((error: unknown) => sendResponse(fail(error, '启动导出失败')));
    return true;
  }

  if (request.type === 'STOP_EXPORT_TASK') {
    void stopExportTask()
      .then((state) => sendResponse(ok(state)))
      .catch((error: unknown) => sendResponse(fail(error, '停止导出失败')));
    return true;
  }

  if (request.type === 'GET_EXPORT_TASK_STATE') {
    void stateLoadPromise
      .then(() => sendResponse(ok(exportState)))
      .catch((error: unknown) => sendResponse(fail(error, '读取导出状态失败')));
    return true;
  }

  return false;
});

async function restorePersistedTask(): Promise<void> {
  try {
    const values = await chrome.storage.session.get(EXPORT_TASK_STORAGE_KEY);
    const snapshot = values[EXPORT_TASK_STORAGE_KEY] as PersistedExportTask | undefined;

    if (!snapshot?.state) {
      return;
    }

    exportState = snapshot.state;
    stopRequested = snapshot.stopRequested;
    activeRunId = snapshot.activeRunId;
    activePlatformId = snapshot.platformId || 'chatgpt';
    activePlatformName = snapshot.platformName || 'ChatGPT';
    activeExportFormat = normalizeExportFormat(snapshot.exportFormat);
    activeWorkerTabId = snapshot.workerTabId;

    if (exportState.status === 'exporting' || exportState.status === 'stopping') {
      if (activeWorkerTabId) {
        await removeTabSafely(activeWorkerTabId);
      }

      activeWorkerTabId = undefined;
      stopRequested = false;
      exportState = {
        ...exportState,
        status: 'failed',
        currentTitle: '任务因浏览器后台重启而中断',
        errors: [
          ...exportState.errors,
          {
            title: exportState.currentTitle,
            url: exportState.currentUrl || '',
            reason: '浏览器后台服务已重启，任务已安全终止，请重新开始导出。'
          }
        ]
      };
      await persistTask();
    }
  } catch (error) {
    logger.warn('Failed to restore export task state', error);
    exportState = createInitialExportState();
  }
}

async function persistTask(): Promise<void> {
  const snapshot: PersistedExportTask = {
    state: exportState,
    stopRequested,
    activeRunId,
    platformId: activePlatformId,
    platformName: activePlatformName,
    exportFormat: activeExportFormat,
    workerTabId: activeWorkerTabId
  };

  try {
    await chrome.storage.session.set({ [EXPORT_TASK_STORAGE_KEY]: snapshot });
  } catch (error) {
    logger.warn('Failed to persist export task state', error);
  }
}

async function updateExportState(
  runId: number,
  updater: (state: ExportTaskState) => ExportTaskState
): Promise<boolean> {
  if (runId !== activeRunId) {
    return false;
  }

  exportState = updater(exportState);
  await persistTask();
  return true;
}

async function stopExportTask(): Promise<ExportTaskState> {
  await stateLoadPromise;

  if (exportState.status !== 'exporting' && exportState.status !== 'stopping') {
    return exportState;
  }

  stopRequested = true;
  exportState = { ...exportState, status: 'stopping' };
  await persistTask();
  return exportState;
}

async function startSelectedConversationExport(
  tabId: number,
  conversations: ConversationItem[],
  platform: { platformId?: string; platformName?: string; format?: ExportFormat }
): Promise<ExportTaskState> {
  await stateLoadPromise;

  if (exportState.status === 'exporting' || exportState.status === 'stopping') {
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
  activeExportFormat = normalizeExportFormat(platform.format);

  for (const conversation of conversations) {
    assertSupportedConversationUrl(conversation.url, activePlatformId);
  }

  exportState = {
    ...createInitialExportState(),
    status: 'exporting',
    total: conversations.length,
    currentTitle: conversations[0]?.title,
    currentUrl: conversations[0]?.url
  };

  await persistTask();

  void runSelectedConversationExport(runId, tabId, conversations);
  return exportState;
}

async function createWorkerTab(sourceTabId: number): Promise<chrome.tabs.Tab> {
  const sourceTab = await chrome.tabs.get(sourceTabId);
  const workerTab = await chrome.tabs.create({
    windowId: sourceTab.windowId,
    url: 'about:blank',
    active: false
  });

  if (!workerTab.id) {
    throw new Error('浏览器没有返回工作标签页 ID。');
  }

  return workerTab;
}

async function cleanupWorkerTab(runId: number): Promise<void> {
  if (runId !== activeRunId) {
    return;
  }

  const tabId = activeWorkerTabId;
  activeWorkerTabId = undefined;

  if (tabId) {
    await removeTabSafely(tabId);
  }

  await persistTask();
}

async function removeTabSafely(tabId: number): Promise<void> {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // The user may already have closed the temporary worker tab.
  }
}

async function runSelectedConversationExport(runId: number, tabId: number, conversations: ConversationItem[]): Promise<void> {
  try {
    const workerTab = await createWorkerTab(tabId);
    activeWorkerTabId = workerTab.id;
    await persistTask();

    if (!activeWorkerTabId) {
      throw new Error('无法创建批量导出的工作标签页。');
    }

    for (let index = 0; index < conversations.length; index += 1) {
      if (isStopped(runId)) {
        await finishExportTask(runId, 'stopped');
        return;
      }

      const item = conversations[index];
      await updateExportState(runId, (state) => ({
        ...state,
        status: 'exporting',
        currentTitle: item.title,
        currentUrl: item.url
      }));

      try {
        await openConversationInTab(activeWorkerTabId, item.url);
        await sleep(randomRenderWaitMs());

        const conversation = await extractConversationWithRetry(activeWorkerTabId);
        const title = conversation.title || item.title || 'untitled-conversation';
        const exportedConversation: ExportedConversation = {
          ...conversation,
          title,
          url: item.url
        };

        if (exportedConversation.messages.length === 0) {
          throw new Error('当前对话没有可导出的消息。');
        }

        const markdown = conversationToMarkdown(exportedConversation);
        const exportFile = buildExportFilePayload(markdown, activeExportFormat);
        const filename = buildPlatformConversationFilename(activePlatformId, index + 1, title, new Date(), exportFile.extension);

        if (!markdown.trim()) {
          throw new Error('当前对话生成的 Markdown 为空。');
        }

        await downloadTextFile(filename, exportFile.content, exportFile.mimeType);

        await updateExportState(runId, (state) => ({
          ...state,
          success: state.success + 1,
          results: [
            ...state.results,
            {
              title,
              url: item.url,
              filename,
              exportedAt: exportedConversation.exportedAt
            }
          ]
        }));
      } catch (error) {
        await updateExportState(runId, (state) => ({
          ...state,
          failed: state.failed + 1,
          errors: [
            ...state.errors,
            {
              title: item.title,
              url: item.url,
              reason: error instanceof Error ? error.message : '导出失败'
            }
          ]
        }));
      } finally {
        await updateExportState(runId, (state) => ({
          ...state,
          current: Math.min(index + 1, state.total)
        }));
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
    await updateExportState(runId, (state) => ({
      ...state,
      status: stopRequested ? 'stopped' : 'failed',
      errors: [
        ...state.errors,
        {
          url: state.currentUrl || '',
          title: state.currentTitle,
          reason: error instanceof Error ? error.message : '批量导出任务异常中断'
        }
      ]
    }));

    await downloadReportsSafely(exportState.status);
  } finally {
    await cleanupWorkerTab(runId);
  }
}

async function finishExportTask(runId: number, status: Extract<ExportStatus, 'completed' | 'stopped'>): Promise<void> {
  if (runId !== activeRunId) {
    return;
  }

  await updateExportState(runId, (state) => ({
    ...state,
    status,
    currentTitle: status === 'completed' ? '导出完成' : state.currentTitle
  }));

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
  await chrome.tabs.update(tabId, { url, active: false });
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

    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
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

function assertSupportedConversationUrl(url: string, expectedPlatformId: string): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`历史会话链接无效：${url}`);
  }

  if (parsed.protocol !== 'https:' || inferPlatformPrefix(url) !== expectedPlatformId) {
    throw new Error(`历史会话链接不属于当前平台：${parsed.hostname}`);
  }
}

function inferPlatformPrefix(url?: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const hostname = new URL(url).hostname;

    if (matchesHostname(hostname, 'doubao.com')) {
      return 'doubao';
    }

    if (
      matchesHostname(hostname, 'qwen.ai') ||
      matchesHostname(hostname, 'qwenlm.ai') ||
      matchesHostname(hostname, 'tongyi.aliyun.com') ||
      matchesHostname(hostname, 'tongyi.com') ||
      matchesHostname(hostname, 'qianwen.com')
    ) {
      return 'qianwen';
    }

    if (matchesHostname(hostname, 'gemini.google.com')) {
      return 'gemini';
    }

    if (matchesHostname(hostname, 'yuanbao.tencent.com')) {
      return 'yuanbao';
    }

    if (matchesHostname(hostname, 'kimi.com') || matchesHostname(hostname, 'kimi.moonshot.cn')) {
      return 'kimi';
    }

    if (matchesHostname(hostname, 'chat.deepseek.com')) {
      return 'deepseek';
    }

    if (matchesHostname(hostname, 'claude.ai') || matchesHostname(hostname, 'claude.com')) {
      return 'claude';
    }

    if (matchesHostname(hostname, 'grok.com') || matchesHostname(hostname, 'x.com')) {
      return 'grok';
    }

    if (matchesHostname(hostname, 'chatgpt.com') || matchesHostname(hostname, 'chat.openai.com')) {
      return 'chatgpt';
    }
  } catch {
    return null;
  }

  return null;
}

function matchesHostname(hostname: string, base: string): boolean {
  return hostname === base || hostname.endsWith(`.${base}`);
}

function sanitizePlatformPrefix(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'ai';
}

function normalizeExportFormat(value: unknown): ExportFormat {
  return value === 'txt' || value === 'doc' ? value : 'md';
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
