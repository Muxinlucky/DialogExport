import { describe, expect, it, vi } from 'vitest';
import { domToMarkdown } from '../src/content/dom-to-markdown';
import { dedupeCandidateElements, dedupeMessages } from '../src/platforms/common/dom-utils';
import {
  collectSidebarConversations,
  getSidebarTitleForConversationUrl,
  parseChatGptConversationUrl
} from '../src/content/chatgpt-sidebar';

describe('DOM conversion', () => {
  it('handles backticks, links, lists and tables', () => {
    document.body.innerHTML = `
      <article>
        <p><code>a \`\` b</code> <a href="https://example.com/a_(b)">link</a></p>
        <ul><li>one</li><li>two</li></ul>
        <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
      </article>`;

    const markdown = domToMarkdown(document.querySelector('article')!);
    expect(markdown).toContain('```a `` b```');
    expect(markdown).toContain('[link](<https://example.com/a_(b)>)');
    expect(markdown).toContain('| A | B |');
  });

  it('removes nested selector duplicates but preserves separate equal messages', () => {
    document.body.innerHTML = '<div id="a">same</div><div id="b">same</div><div id="outer"><span>nested</span></div>';
    const outer = document.querySelector('#outer')!;
    expect(dedupeCandidateElements([document.querySelector('#a')!, document.querySelector('#b')!, outer, outer.firstElementChild!])).toHaveLength(3);
    expect(dedupeMessages([
      { role: 'user', content: 'same' },
      { role: 'user', content: 'same' }
    ])).toHaveLength(2);
  });
});

describe('ChatGPT project conversations', () => {
  it('keeps project conversation paths while extracting their conversation id', () => {
    expect(parseChatGptConversationUrl('https://chatgpt.com/g/g-p-project/c/conversation-1')).toEqual({
      id: 'conversation-1',
      url: 'https://chatgpt.com/g/g-p-project/c/conversation-1'
    });
  });

  it('uses the current renamed title from a project link', () => {
    document.body.innerHTML = `
      <nav>
        <a href="https://chatgpt.com/g/g-p-project/c/conversation-1"><span>一战</span><button>更多</button></a>
      </nav>`;

    expect(getSidebarTitleForConversationUrl('https://chatgpt.com/g/g-p-project/c/conversation-1')).toBe('一战');
  });

  it('expands collapsed project sections while scanning and restores them afterwards', async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([{ width: 200, height: 200 } as DOMRect] as unknown as DOMRectList);

    document.body.innerHTML = `
      <aside>
        <div id="projects" style="height: 200px; overflow-y: auto">
          <button id="project" aria-expanded="false">
            <svg aria-label="folder"></svg><span>论文</span>
          </button>
          <div id="projectContent" hidden></div>
        </div>
      </aside>`;

    const project = document.querySelector<HTMLButtonElement>('#project')!;
    const content = document.querySelector<HTMLDivElement>('#projectContent')!;
    project.addEventListener('click', () => {
      const expanded = project.getAttribute('aria-expanded') === 'true';
      project.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      content.hidden = expanded;
      content.innerHTML = expanded
        ? ''
        : '<a href="https://chatgpt.com/c/project-conversation"><span>项目会话</span></a>';
    });

    Object.defineProperties(document.querySelector('#projects'), {
      clientHeight: { value: 200 },
      scrollHeight: { value: 200, configurable: true },
      scrollTop: { value: 0, writable: true, configurable: true }
    });

    try {
      const conversations = await collectSidebarConversations();

      expect(conversations.map((item) => item.id)).toContain('project-conversation');
      expect(project.getAttribute('aria-expanded')).toBe('false');
    } finally {
      rectSpy.mockRestore();
    }
  });
});
