import { chatgptAdapter } from './chatgpt/adapter';
import { claudeAdapter } from './claude/adapter';
import { geminiAdapter } from './gemini/adapter';
import { grokAdapter } from './grok/adapter';
import { deepseekAdapter } from './deepseek/adapter';
import { kimiAdapter } from './kimi/adapter';
import { doubaoAdapter } from './doubao/adapter';
import { qianwenAdapter } from './qianwen/adapter';
import { yuanbaoAdapter } from './yuanbao/adapter';
import type { PlatformAdapter, PlatformId } from './types';

export const platformAdapters: PlatformAdapter[] = [
  chatgptAdapter,
  claudeAdapter,
  geminiAdapter,
  grokAdapter,
  deepseekAdapter,
  kimiAdapter,
  doubaoAdapter,
  qianwenAdapter,
  yuanbaoAdapter
];

export function getPlatformAdapterForUrl(url: string): PlatformAdapter | null {
  return platformAdapters.find((adapter) => adapter.matchUrl(url)) || null;
}

export function getPlatformAdapterById(id: PlatformId): PlatformAdapter | null {
  return platformAdapters.find((adapter) => adapter.id === id) || null;
}

export function getSupportedOrigins(): string[] {
  return platformAdapters.flatMap((adapter) => adapter.hostnames.map((hostname) => `https://${hostname}`));
}

export type { PageDiagnosis, PlatformAdapter, PlatformCapabilities, PlatformId } from './types';
