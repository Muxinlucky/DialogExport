import { CHATGPT_SELECTORS } from '../core/constants';

const INLINE_TAGS = new Set(['A', 'CODE', 'EM', 'I', 'STRONG', 'B', 'SPAN']);

export function domToMarkdown(root: Element): string {
  return normalizeMarkdown(convertNode(root, { listDepth: 0, orderedIndex: 0 })).trim();
}

interface ConvertContext {
  listDepth: number;
  orderedIndex: number;
}

function convertNode(node: Node, context: ConvertContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as Element;
  const tagName = element.tagName;

  if (shouldSkipElement(element)) {
    return '';
  }

  if (matchesAny(element, CHATGPT_SELECTORS.richMedia.attachmentCandidates)) {
    return '[附件内容，当前版本暂不导出]';
  }

  switch (tagName) {
    case 'IMG':
      return '[图片内容，当前版本暂不导出]';
    case 'CANVAS':
      return '[Canvas 内容，当前版本暂不导出]';
    case 'VIDEO':
    case 'AUDIO':
    case 'IFRAME':
      return '[特殊内容，当前版本暂不导出]';
    case 'BR':
      return '\n';
    case 'PRE':
      return convertPre(element);
    case 'CODE':
      return convertInlineCode(element);
    case 'A':
      return convertLink(element, context);
    case 'P':
      return block(convertChildren(element, context));
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      return convertHeading(element, context);
    case 'UL':
      return convertList(element, false, context);
    case 'OL':
      return convertList(element, true, context);
    case 'LI':
      return convertListItem(element, false, context, context.orderedIndex);
    case 'BLOCKQUOTE':
      return convertBlockquote(element, context);
    case 'TABLE':
      return convertTable(element);
    case 'THEAD':
    case 'TBODY':
    case 'TR':
    case 'TH':
    case 'TD':
      return convertChildren(element, context);
    case 'STRONG':
    case 'B':
      return wrapInline('**', convertChildren(element, context));
    case 'EM':
    case 'I':
      return wrapInline('*', convertChildren(element, context));
    default:
      return convertGeneric(element, context);
  }
}

function convertChildren(element: Element, context: ConvertContext): string {
  return Array.from(element.childNodes)
    .map((child) => convertNode(child, context))
    .join('');
}

function convertGeneric(element: Element, context: ConvertContext): string {
  const content = convertChildren(element, context);
  if (!content.trim()) {
    return '';
  }

  return INLINE_TAGS.has(element.tagName) ? content : block(content);
}

function convertPre(element: Element): string {
  const codeElement = element.querySelector('code');
  const rawCode = (codeElement || element).textContent || '';
  const language = detectCodeLanguage(codeElement || element);
  const fence = longestBacktickFence(rawCode);
  return `\n\n${fence}${language}\n${rawCode.replace(/\n+$/g, '')}\n${fence}\n\n`;
}

function convertInlineCode(element: Element): string {
  if (element.closest('pre')) {
    return element.textContent || '';
  }

  const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  const longestRun = (text.match(/`+/g) || []).reduce((max, value) => Math.max(max, value.length), 0);
  const delimiter = '`'.repeat(longestRun + 1);
  const padding = /^`|`$|^\s|\s$/.test(text) ? ' ' : '';
  return `${delimiter}${padding}${text}${padding}${delimiter}`;
}

function convertLink(element: Element, context: ConvertContext): string {
  const href = (element as HTMLAnchorElement).href;
  const text = convertChildren(element, context).trim() || href;

  if (!href) {
    return text;
  }

  const safeHref = href.replace(/>/g, '%3E');
  return `[${text.replace(/\]/g, '\\]')}](<${safeHref}>)`;
}

function convertHeading(element: Element, context: ConvertContext): string {
  const level = Number(element.tagName.slice(1));
  const text = convertChildren(element, context).trim();
  return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : '';
}

function convertList(element: Element, ordered: boolean, context: ConvertContext): string {
  const items = Array.from(element.children).filter((child) => child.tagName === 'LI');
  const lines = items.map((item, index) =>
    convertListItem(item, ordered, { ...context, listDepth: context.listDepth + 1 }, index + 1)
  );
  return `\n${lines.join('\n')}\n`;
}

function convertListItem(element: Element, ordered: boolean, context: ConvertContext, orderedIndex: number): string {
  const indent = '  '.repeat(Math.max(context.listDepth - 1, 0));
  const marker = ordered ? `${orderedIndex}. ` : '- ';
  const content = Array.from(element.childNodes)
    .map((child) => convertNode(child, context))
    .join('')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n/g, `\n${indent}  `);

  return `${indent}${marker}${content}`;
}

function convertBlockquote(element: Element, context: ConvertContext): string {
  const text = convertChildren(element, context)
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  return text ? `\n\n${text}\n\n` : '';
}

function convertTable(element: Element): string {
  const rows = Array.from(element.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll('th,td')).map((cell) =>
      normalizeInline((cell.textContent || '').trim()).replace(/\|/g, '\\|')
    )
  );

  if (rows.length === 0) {
    return '';
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => padCells(row, columnCount));
  const [header, ...body] = normalizedRows;
  const separator = Array.from({ length: columnCount }, () => '---');
  const tableRows = [header, separator, ...body].map((row) => `| ${row.join(' | ')} |`);
  return `\n\n${tableRows.join('\n')}\n\n`;
}

function shouldSkipElement(element: Element): boolean {
  return matchesAny(element, CHATGPT_SELECTORS.skippedContent);
}

function matchesAny(element: Element, selectors: readonly string[]): boolean {
  return selectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });
}

function block(content: string): string {
  const trimmed = content.trim();
  return trimmed ? `\n\n${trimmed}\n\n` : '';
}

function wrapInline(wrapper: string, content: string): string {
  const trimmed = content.trim();
  return trimmed ? `${wrapper}${trimmed}${wrapper}` : '';
}

function detectCodeLanguage(element: Element): string {
  const className = element.getAttribute('class') || '';
  const match = className.match(/language-([a-z0-9_+-]+)/i);
  return match?.[1] || '';
}

function longestBacktickFence(text: string): string {
  const matches = text.match(/`{3,}/g) || [];
  const longest = matches.reduce((max, value) => Math.max(max, value.length), 2);
  return '`'.repeat(longest + 1);
}

function padCells(row: string[], count: number): string[] {
  return [...row, ...Array.from({ length: Math.max(count - row.length, 0) }, () => '')];
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/^\s+|\s+$/g, '');
}

function normalizeInline(text: string): string {
  return text.replace(/\s+/g, ' ');
}
