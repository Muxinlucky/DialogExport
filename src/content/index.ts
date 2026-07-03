import { getPlatformAdapterForUrl } from '../platforms';
import type { PageInfo, RuntimeRequest, RuntimeResponse } from '../core/types';

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
  const adapter = getPlatformAdapterForUrl(window.location.href);

  if (request.type === 'PING_PLATFORM_PAGE') {
    if (!adapter) {
      sendResponse(fail('当前页面不是已支持的 AI 网页。'));
      return false;
    }

    sendResponse(ok<PageInfo>({
      platform: adapter.name,
      platformId: adapter.id,
      url: window.location.href,
      title: document.title || adapter.name,
      capabilities: adapter.capabilities
    }));
    return false;
  }

  if (request.type === 'EXPORT_CURRENT_CONVERSATION') {
    if (!adapter?.capabilities.exportCurrentConversation) {
      sendResponse(fail('当前平台暂不支持导出当前对话。'));
      return false;
    }

    void adapter.exportCurrentConversation()
      .then((conversation) => sendResponse(ok(conversation)))
      .catch((error: unknown) => sendResponse(fail(error)));
    return true;
  }

  if (request.type === 'COLLECT_SIDEBAR_CONVERSATIONS') {
    if (!adapter?.capabilities.scanHistory || !adapter.scanHistoryConversations) {
      sendResponse(fail('当前平台暂不支持历史会话扫描。'));
      return false;
    }

    void adapter.scanHistoryConversations()
      .then((conversations) => sendResponse(ok(conversations)))
      .catch((error: unknown) => sendResponse(fail(error)));
    return true;
  }

  return false;
});

function ok<T>(data: T): RuntimeResponse<T> {
  return { ok: true, data };
}

function fail(error: unknown): RuntimeResponse<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error || '未知错误')
  };
}
