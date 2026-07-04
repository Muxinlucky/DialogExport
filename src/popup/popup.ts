import './popup.css';
import { DEFAULT_EXPORT_STATE } from '../core/constants';
import { buildExportFilePayload } from '../core/export-format';
import { buildPlatformConversationFilename } from '../core/filename';
import { conversationToMarkdown } from '../core/markdown';
import type {
  ConversationItem,
  DownloadResult,
  ExportFormat,
  ExportedConversation,
  ExportTaskState,
  PageInfo,
  RuntimeRequest,
  RuntimeResponse
} from '../core/types';
import type { PlatformId } from '../platforms';

const POPUP_STATE_KEY = 'dialogExportPopupState';

interface PopupPersistedState {
  platformId?: PlatformId;
  platformName?: string;
  url?: string;
  conversations: ConversationItem[];
  selectedIds: string[];
  exportFormat?: ExportFormat;
  taskState?: ExportTaskState;
  updatedAt: string;
}

const pageStatus = getElement<HTMLParagraphElement>('pageStatus');
const exportCurrentButton = getElement<HTMLButtonElement>('exportCurrentButton');
const scanHistoryButton = getElement<HTMLButtonElement>('scanHistoryButton');
const exportSelectedButton = getElement<HTMLButtonElement>('exportSelectedButton');
const stopButton = getElement<HTMLButtonElement>('stopButton');
const exportFormatSelect = getElement<HTMLSelectElement>('exportFormatSelect');
const selectAllButton = getElement<HTMLButtonElement>('selectAllButton');
const clearSelectionButton = getElement<HTMLButtonElement>('clearSelectionButton');
const invertSelectionButton = getElement<HTMLButtonElement>('invertSelectionButton');
const conversationList = getElement<HTMLElement>('conversationList');
const selectionSummary = getElement<HTMLElement>('selectionSummary');
const statusValue = getElement<HTMLElement>('statusValue');
const totalValue = getElement<HTMLElement>('totalValue');
const progressValue = getElement<HTMLElement>('progressValue');
const successValue = getElement<HTMLElement>('successValue');
const failedValue = getElement<HTMLElement>('failedValue');
const currentTitle = getElement<HTMLElement>('currentTitle');

let activeTab: chrome.tabs.Tab | null = null;
let activePageInfo: PageInfo | null = null;
let state: ExportTaskState = { ...DEFAULT_EXPORT_STATE, errors: [], results: [] };
let scannedConversations: ConversationItem[] = [];
let selectedConversationIds = new Set<string>();
let selectedExportFormat: ExportFormat = 'md';
let exportStatePollId: number | undefined;

void initializePopup();

exportCurrentButton.addEventListener('click', () => {
  void exportCurrentConversation();
});

scanHistoryButton.addEventListener('click', () => {
  void scanHistoryConversations();
});

exportSelectedButton.addEventListener('click', () => {
  void exportSelectedConversations();
});

stopButton.addEventListener('click', () => {
  void stopExportTask();
});

exportFormatSelect.addEventListener('change', () => {
  selectedExportFormat = normalizeExportFormat(exportFormatSelect.value);
  renderState();
});

selectAllButton.addEventListener('click', () => {
  selectedConversationIds = new Set(scannedConversations.map((conversation) => conversation.id));
  renderConversationList();
  renderState();
});

clearSelectionButton.addEventListener('click', () => {
  selectedConversationIds = new Set();
  renderConversationList();
  renderState();
});

invertSelectionButton.addEventListener('click', () => {
  selectedConversationIds = new Set(
    scannedConversations
      .filter((conversation) => !selectedConversationIds.has(conversation.id))
      .map((conversation) => conversation.id)
  );
  renderConversationList();
  renderState();
});

async function initializePopup(): Promise<void> {
  activeTab = await getActiveTab();
  const persistedState = await loadPersistedState();
  selectedExportFormat = normalizeExportFormat(persistedState?.exportFormat || exportFormatSelect.value);
  exportFormatSelect.value = selectedExportFormat;

  if (!activeTab?.id || !activeTab.url || !isHttpUrl(activeTab.url)) {
    setPageStatus('未识别支持的 AI 网页。');
    renderConversationList();
    renderState();
    return;
  }

  try {
    activePageInfo = await sendTabMessage<PageInfo>(activeTab.id, { type: 'PING_PLATFORM_PAGE' });
    const backgroundState = await sendRuntimeMessage<ExportTaskState>({ type: 'GET_EXPORT_TASK_STATE' });
    const isSamePlatform = persistedState?.platformId === activePageInfo.platformId;

    if (isSamePlatform && persistedState) {
      scannedConversations = persistedState.conversations || [];
      selectedConversationIds = new Set(
        (persistedState.selectedIds || []).filter((id) => scannedConversations.some((conversation) => conversation.id === id))
      );
    }

    state = normalizeDisplayState(
      backgroundState.status === 'idle' && isSamePlatform && persistedState?.taskState
        ? persistedState.taskState
        : backgroundState
    );
    setPageStatus(`已识别：${activePageInfo.platform}`);

    if (!activePageInfo.capabilities?.scanHistory) {
      setPageStatus(`已识别：${activePageInfo.platform}。当前平台暂不支持历史批量导出，可使用“导出当前对话”。`);
    }

    if (state.status === 'exporting') {
      startExportStatePolling();
    }
  } catch (error) {
    activePageInfo = null;
    setPageStatus(mapAccessError(error));
  } finally {
    renderConversationList();
    renderState();
  }
}

async function exportCurrentConversation(): Promise<void> {
  if (!activeTab?.id || !activePageInfo?.capabilities?.exportCurrentConversation) {
    setPageStatus('当前页面暂不支持导出当前对话。');
    renderState();
    return;
  }

  try {
    state = {
      ...state,
      status: 'exporting',
      total: 1,
      current: 0,
      success: 0,
      failed: 0,
      currentTitle: '正在读取当前对话',
      currentUrl: activeTab.url,
      errors: [],
      results: []
    };
    renderState();

    const conversation = await sendTabMessage<ExportedConversation>(activeTab.id, {
      type: 'EXPORT_CURRENT_CONVERSATION'
    });

    if (conversation.messages.length === 0) {
      throw new Error('当前页面未检测到可导出的对话内容，请打开具体聊天页面后重试。');
    }

    const markdown = conversationToMarkdown(conversation);
    const exportFile = buildExportFilePayload(markdown, selectedExportFormat);
    const filename = buildPlatformConversationFilename(getPlatformFilenamePrefix(), 1, conversation.title, new Date(), exportFile.extension);
    await sendRuntimeMessage<DownloadResult>({
      type: 'DOWNLOAD_EXPORT_FILE',
      filename,
      content: exportFile.content,
      mimeType: exportFile.mimeType
    });

    state = {
      ...state,
      status: 'completed',
      current: 1,
      success: 1,
      failed: 0,
      currentTitle: conversation.title,
      currentUrl: conversation.url,
      results: [{
        title: conversation.title,
        url: conversation.url,
        filename,
        exportedAt: conversation.exportedAt
      }]
    };
    setPageStatus(`已下载：${filename}`);
  } catch (error) {
    const reason = mapExportError(error);
    state = {
      ...state,
      status: 'failed',
      current: 1,
      success: 0,
      failed: 1,
      errors: [{ title: activeTab.title, url: activeTab.url || '', reason }],
      results: []
    };
    setPageStatus(reason);
  } finally {
    renderState();
  }
}

async function scanHistoryConversations(): Promise<void> {
  if (!activeTab?.id || !activePageInfo?.capabilities?.scanHistory) {
    setPageStatus('当前平台暂不支持历史会话扫描。');
    renderState();
    return;
  }

  try {
    state = {
      ...state,
      status: 'collecting',
      total: scannedConversations.length,
      current: 0,
      success: 0,
      failed: 0,
      currentTitle: '正在扫描历史会话',
      currentUrl: activeTab.url,
      errors: [],
      results: []
    };
    renderState();
    setPageStatus('正在扫描左侧历史会话...');

    const conversations = await sendTabMessage<ConversationItem[]>(activeTab.id, {
      type: 'COLLECT_SIDEBAR_CONVERSATIONS'
    });

    scannedConversations = conversations;
    selectedConversationIds = new Set(conversations.map((conversation) => conversation.id));

    state = {
      ...state,
      status: 'completed',
      total: conversations.length,
      current: 0,
      success: 0,
      failed: 0,
      currentTitle: `已发现 ${conversations.length} 个历史会话`,
      currentUrl: activeTab.url
    };
    setPageStatus(`扫描完成：发现 ${conversations.length} 个历史会话。`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : '扫描历史会话失败';
    state = {
      ...state,
      status: 'failed',
      total: scannedConversations.length,
      current: 0,
      success: 0,
      failed: 0,
      currentTitle: '-',
      errors: [{ title: activeTab.title, url: activeTab.url || '', reason }],
      results: []
    };
    setPageStatus(reason);
  } finally {
    renderConversationList();
    renderState();
  }
}

async function exportSelectedConversations(): Promise<void> {
  if (!activeTab?.id || !activePageInfo?.capabilities?.exportSelectedConversations) {
    setPageStatus('当前平台暂不支持导出选中历史会话。');
    renderState();
    return;
  }

  const selectedConversations = getSelectedConversations();

  if (selectedConversations.length === 0) {
    setPageStatus('请先选择要导出的历史会话。');
    renderState();
    return;
  }

  try {
    state = await sendRuntimeMessage<ExportTaskState>({
      type: 'START_SELECTED_CONVERSATION_EXPORT',
      tabId: activeTab.id,
      conversations: selectedConversations,
      platformId: activePageInfo.platformId,
      platformName: activePageInfo.platform,
      format: selectedExportFormat
    });
    setPageStatus(`开始导出 ${selectedConversations.length} 个选中对话...`);
    startExportStatePolling();
    renderState();
  } catch (error) {
    setPageStatus(error instanceof Error ? error.message : '启动导出失败。');
    renderState();
  }
}

async function stopExportTask(): Promise<void> {
  try {
    state = await sendRuntimeMessage<ExportTaskState>({ type: 'STOP_EXPORT_TASK' });
    setPageStatus('已请求停止导出，当前会话处理完成后不会继续打开下一个。');
  } catch (error) {
    setPageStatus(error instanceof Error ? error.message : '停止导出失败。');
  } finally {
    renderState();
  }
}

function startExportStatePolling(): void {
  if (exportStatePollId !== undefined) {
    window.clearInterval(exportStatePollId);
  }

  exportStatePollId = window.setInterval(() => {
    void refreshExportState();
  }, 700);

  void refreshExportState();
}

async function refreshExportState(): Promise<void> {
  try {
    const nextState = await sendRuntimeMessage<ExportTaskState>({ type: 'GET_EXPORT_TASK_STATE' });
    state = normalizeDisplayState(nextState);

    if (state.status === 'completed') {
      setPageStatus(`导出完成：成功 ${state.success} 个，失败 ${state.failed} 个。`);
      stopExportStatePolling();
    } else if (state.status === 'stopped') {
      setPageStatus(`导出已停止：成功 ${state.success} 个，失败 ${state.failed} 个。`);
      stopExportStatePolling();
    } else if (state.status === 'failed') {
      stopExportStatePolling();
    }

    renderState();
  } catch {
    stopExportStatePolling();
  }
}

function stopExportStatePolling(): void {
  if (exportStatePollId !== undefined) {
    window.clearInterval(exportStatePollId);
    exportStatePollId = undefined;
  }
}

function renderConversationList(): void {
  selectionSummary.textContent = `已选择 ${getSelectedCount()} / 共 ${scannedConversations.length} 个`;
  conversationList.textContent = '';

  if (scannedConversations.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'emptyList';
    empty.textContent = activePageInfo?.capabilities?.scanHistory
      ? '扫描后会在这里显示历史会话。'
      : '当前平台暂不支持历史会话列表。';
    conversationList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const conversation of scannedConversations) {
    const label = document.createElement('label');
    label.className = 'conversationItem';
    label.title = conversation.title;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedConversationIds.has(conversation.id);
    checkbox.dataset.conversationId = conversation.id;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedConversationIds.add(conversation.id);
      } else {
        selectedConversationIds.delete(conversation.id);
      }

      renderConversationList();
      renderState();
    });

    const body = document.createElement('span');
    body.className = 'conversationItemBody';

    const title = document.createElement('span');
    title.className = 'conversationTitle';
    title.textContent = conversation.title || 'untitled-conversation';

    const url = document.createElement('span');
    url.className = 'conversationUrl';
    url.textContent = shortenUrl(conversation.url);

    body.append(title, url);
    label.append(checkbox, body);
    fragment.append(label);
  }

  conversationList.append(fragment);
}

function renderState(): void {
  selectionSummary.textContent = `已选择 ${getSelectedCount()} / 共 ${scannedConversations.length} 个`;
  statusValue.textContent = state.status;
  totalValue.textContent = String(state.total);
  progressValue.textContent = `${state.current} / ${state.total}`;
  successValue.textContent = String(state.success);
  failedValue.textContent = String(state.failed);
  currentTitle.textContent = `当前处理：${state.currentTitle || '-'}`;
  updateButtonStates();
  void persistPopupState();
}

function updateButtonStates(): void {
  const isCollecting = state.status === 'collecting';
  const isExporting = state.status === 'exporting';
  const hasScannedResults = scannedConversations.length > 0;
  const hasSelection = getSelectedCount() > 0;
  const capabilities = activePageInfo?.capabilities;

  exportCurrentButton.disabled = !capabilities?.exportCurrentConversation || isCollecting || isExporting;
  scanHistoryButton.disabled = !capabilities?.scanHistory || isCollecting || isExporting;
  exportSelectedButton.disabled = !capabilities?.exportSelectedConversations || isCollecting || isExporting || !hasScannedResults || !hasSelection;
  stopButton.disabled = !isExporting;
  exportFormatSelect.disabled = isCollecting || isExporting;
  selectAllButton.disabled = isCollecting || isExporting || !hasScannedResults;
  clearSelectionButton.disabled = isCollecting || isExporting || !hasScannedResults;
  invertSelectionButton.disabled = isCollecting || isExporting || !hasScannedResults;
}

function getSelectedConversations(): ConversationItem[] {
  return scannedConversations.filter((conversation) => selectedConversationIds.has(conversation.id));
}

function getSelectedCount(): number {
  return getSelectedConversations().length;
}

function normalizeDisplayState(nextState: ExportTaskState): ExportTaskState {
  if (nextState.total === 0 && scannedConversations.length > 0 && nextState.status !== 'exporting') {
    return {
      ...nextState,
      total: scannedConversations.length
    };
  }

  return nextState;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function sendTabMessage<T>(tabId: number, request: RuntimeRequest): Promise<T> {
  let firstError: unknown;

  try {
    return await sendTabMessageOnce<T>(tabId, request);
  } catch (error) {
    firstError = error;
  }

  if (shouldRetryWithInjection(firstError)) {
    await tryInjectContentScript(tabId);
    await delay(300);

    try {
      return await sendTabMessageOnce<T>(tabId, request);
    } catch (error) {
      throw new Error(mapAccessError(error));
    }
  }

  throw new Error(mapAccessError(firstError));
}

async function sendTabMessageOnce<T>(tabId: number, request: RuntimeRequest): Promise<T> {
  const response = await chrome.tabs.sendMessage<RuntimeRequest, RuntimeResponse<T>>(tabId, request);

  if (!response?.ok) {
    throw new Error(response?.error || '未知错误');
  }

  return response.data;
}

async function sendRuntimeMessage<T>(request: RuntimeRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage<RuntimeRequest, RuntimeResponse<T>>(request);
  if (!response?.ok) {
    throw new Error(response?.error || '扩展后台未返回结果。');
  }

  return response.data;
}

async function tryInjectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/index.js']
    });
  } catch {
    // Some pages are not injectable or already have the content script loaded.
  }
}

function shouldRetryWithInjection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /receiving end|message channel|could not establish|cannot access|Cannot access/i.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mapAccessError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');

  if (/receiving end|message channel|could not establish|cannot access|Cannot access/i.test(message)) {
    return '扩展无法访问当前页面，请确认该域名已加入 manifest host_permissions，并重新加载扩展。';
  }

  if (/不是已支持的 AI|未识别|not supported/i.test(message)) {
    return '当前页面不是已支持的 AI 网页。';
  }

  return message || '未知错误';
}

function mapExportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');

  if (!message || /unknown error|未知错误/i.test(message)) {
    return '已识别当前平台，但未提取到对话消息，请打开具体聊天页面后重试。';
  }

  if (/没有可导出|未检测到|未提取到|no message|empty/i.test(message)) {
    return message;
  }

  if (/receiving end|message channel|cannot access|Cannot access/i.test(message)) {
    return '扩展无法访问当前页面，请确认该域名已加入 manifest host_permissions，并重新加载扩展。';
  }

  return message;
}

async function loadPersistedState(): Promise<PopupPersistedState | null> {
  try {
    const values = await getPopupStorage().get(POPUP_STATE_KEY);
    const value = values[POPUP_STATE_KEY] as PopupPersistedState | undefined;
    return value || null;
  } catch {
    return null;
  }
}

async function persistPopupState(): Promise<void> {
  if (!activePageInfo?.platformId) {
    return;
  }

  const payload: PopupPersistedState = {
    platformId: activePageInfo.platformId as PlatformId,
    platformName: activePageInfo.platform,
    url: activePageInfo.url,
    conversations: scannedConversations,
    selectedIds: Array.from(selectedConversationIds),
    exportFormat: selectedExportFormat,
    taskState: state,
    updatedAt: new Date().toISOString()
  };

  try {
    await getPopupStorage().set({ [POPUP_STATE_KEY]: payload });
  } catch {
    // Persistence is a convenience feature; the popup should stay usable if storage fails.
  }
}

function getPopupStorage(): chrome.storage.StorageArea {
  return chrome.storage.session || chrome.storage.local;
}

function getPlatformFilenamePrefix(): string {
  return activePageInfo?.platformId || activePageInfo?.platform.toLowerCase().replace(/\s+/g, '-') || 'ai';
}

function normalizeExportFormat(value: unknown): ExportFormat {
  return value === 'txt' || value === 'doc' ? value : 'md';
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function setPageStatus(message: string): void {
  pageStatus.textContent = message;
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing popup element: ${id}`);
  }

  return element as T;
}
