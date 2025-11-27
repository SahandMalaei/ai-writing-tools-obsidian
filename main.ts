import {
  App,
  addIcon,
  Editor,
  MarkdownRenderer,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  Platform
} from "obsidian";

type AIWHSettings = {
  openrouterApiKey: string;
  modelDictionary: string;
  modelCorrection: string;
  apiEndpoint: string;
};

const DEFAULT_SETTINGS: AIWHSettings = {
  openrouterApiKey: "",
  modelDictionary: "google/gemini-2.5-flash-lite",
  modelCorrection: "google/gemini-2.5-flash",
  apiEndpoint: "https://openrouter.ai/api/v1/chat/completions"
};

enum TaskKind {
  Dictionary = "Dictionary",
  Correction = "Correction",
}

const ICON_DEFINE = "aiwh-define";
const ICON_CORRECT = "aiwh-correct";

export default class AIWritingHelper extends Plugin {
  settings: AIWHSettings;

  async onload() {
    await this.loadSettings();
    this.registerIcons();

    // Commands (also useful for hotkeys)
    this.addCommand({
      id: "aiwh-dictionary",
      name: "Define",
      icon: ICON_DEFINE,
      editorCallback: (editor) => this.runTask(TaskKind.Dictionary, editor),
    });
    this.addCommand({
      id: "aiwh-correction",
      name: "Correct",
      icon: ICON_CORRECT,
      editorCallback: (editor) => this.runTask(TaskKind.Correction, editor),
    });

    // Context (right-click) editor menu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor /* , view */) => {
        const hasSelection = !!editor.getSelection();
        if (!hasSelection) return;

        menu.addItem((item) =>
          item
            .setTitle("Define")
            .setIcon(ICON_DEFINE)
            .onClick(() => this.runTask(TaskKind.Dictionary, editor))
        );
        menu.addItem((item) =>
          item
            .setTitle("Correct")
            .setIcon(ICON_CORRECT)
            .onClick(() => this.runTask(TaskKind.Correction, editor))
        );
      })
    );

    // Settings UI
    this.addSettingTab(new AIWHSettingTab(this.app, this));

    console.log("AI Writing Helper loaded");
  }

  onunload() {
    console.log("AI Writing Helper unloaded");
  }

  async runTask(kind: TaskKind, editor: Editor) {
    const selection = editor.getSelection().trim();
    if (!selection) {
      new Notice("Select some text first.");
      return;
    }
    if (!this.settings.openrouterApiKey) {
      new Notice("Set your OpenRouter API key in settings.");
      return;
    }

    const doc = editor.getValue();
    // Grab some context around the selection (bounded)
    const cursorFrom = editor.getCursor("from");
    const cursorTo = editor.getCursor("to");
    const fromPos = editor.posToOffset(cursorFrom);
    const toPos = editor.posToOffset(cursorTo);

    const LEFT = Math.max(0, fromPos - 40);
    const RIGHT = Math.min(doc.length, toPos + 40);
    const leftCtx = doc.slice(LEFT, fromPos);
    const rightCtx = doc.slice(toPos, RIGHT);

    this.showPopoverAtSelection("Working...");

    try {
      const model = this.getModelFor(kind);
      const prompt = buildPrompt(kind, selection, leftCtx, rightCtx, doc);
      const md = await callOpenRouterChat({
        apiKey: this.settings.openrouterApiKey,
        model,
        system: SYSTEM_PROMPT,
        user: prompt,
        endpoint: this.settings.apiEndpoint || DEFAULT_SETTINGS.apiEndpoint,
      });

      await this.updatePopoverMarkdown(md);
    } catch (e: any) {
      const msg = String(e?.message || e);
      await this.updatePopoverMarkdown(
        `**Error**\n\n\`\`\`\n${msg}\n\`\`\`\n\nCheck API key, model name, or rate limits.`
      );
    }
  }

  getModelFor(kind: TaskKind): string {
    switch (kind) {
      case TaskKind.Dictionary:
        return this.settings.modelDictionary || DEFAULT_SETTINGS.modelDictionary;
      case TaskKind.Correction:
        return this.settings.modelCorrection || DEFAULT_SETTINGS.modelCorrection;
    }
    return DEFAULT_SETTINGS.modelDictionary;
  }

  // --- Popup UI ---

  popoverEl: HTMLElement | null = null;
  contentEl: HTMLElement | null = null;
  selectionRect: DOMRect | null = null;

  showPopoverAtSelection(initialMarkdown: string) {
    this.destroyPopover();

    this.selectionRect = getSelectionRect();
    const container = createDiv({ cls: "aiwh-popover" });
    const header = container.createDiv({ cls: "aiwh-header" });
    header.setText("AI Writing Helper");

    const content = container.createDiv();
    this.popoverEl = container;
    this.contentEl = content;

    // Actions
    const actions = container.createDiv({ cls: "aiwh-actions" });
    const copyBtn = createEl("button", { text: "Copy" });
    const closeBtn = createEl("button", { text: "Close" });
    actions.appendChild(copyBtn);
    actions.appendChild(closeBtn);

    copyBtn.addEventListener("click", async () => {
      if (!content) return;
      // Copy raw markdown (source text)
      const raw = content.getAttribute("data-raw-markdown") || content.textContent || "";
      await navigator.clipboard.writeText(raw);
      new Notice("Copied");
    });

    closeBtn.addEventListener("click", () => this.destroyPopover());

    // Attach and position after render so dimensions are accurate
    document.body.appendChild(container);
    this.repositionPopover();
    this.updatePopoverMarkdown(initialMarkdown);
    // Destroy on Escape
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") this.destroyPopover();
    };
    window.addEventListener("keydown", esc, { once: true });
    const outsideClick = (ev: MouseEvent) => {
        if (!container.contains(ev.target as Node)) {
            this.destroyPopover();
            document.removeEventListener("mousedown", outsideClick);
        }
    };
    setTimeout(() => {
        document.addEventListener("mousedown", outsideClick);
    }, 0);
  }

  async updatePopoverMarkdown(markdown: string) {
    if (!this.popoverEl || !this.contentEl) return;
    this.contentEl.empty();
    this.contentEl.setAttribute("data-raw-markdown", markdown);
    await MarkdownRenderer.renderMarkdown(
      markdown,
      this.contentEl,
      "",
      this
    );
    this.repositionPopover();
  }

  destroyPopover() {
    if (this.popoverEl) {
      this.popoverEl.remove();
      this.popoverEl = null;
      this.contentEl = null;
    }
  }

  repositionPopover() {
    if (!this.popoverEl) return;
    const rect = this.selectionRect;
    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const margin = 8;
    const safeBottom = Platform.isMobile ? viewportHeight * 0.5 : 24;

    // If not yet rendered, give it a max width so measurement is stable
    this.popoverEl.style.maxWidth = "560px";
    this.popoverEl.style.position = "fixed";

    const desiredLeft = Math.max(margin, (rect?.left ?? 80));
    const desiredTop = (rect?.bottom ?? 80) + margin;

    const { offsetWidth, offsetHeight } = this.popoverEl;
    const maxLeft = Math.max(margin, viewportWidth - offsetWidth - margin);
    const maxTop = Math.max(margin, viewportHeight - offsetHeight - safeBottom);

    const left = Math.min(desiredLeft, maxLeft);
    const top = Math.min(desiredTop, maxTop);

    this.popoverEl.style.left = `${left}px`;
    this.popoverEl.style.top = `${top}px`;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  registerIcons() {
    addIcon(
      ICON_DEFINE,
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z"/></svg>`
    );
    addIcon(
      ICON_CORRECT,
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>`
    );
  }
}

// --- Settings tab ---

class AIWHSettingTab extends PluginSettingTab {
  plugin: AIWritingHelper;

  constructor(app: App, plugin: AIWritingHelper) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "AI Writing Helper - Settings" });

    new Setting(containerEl)
      .setName("API Endpoint")
      .setDesc("Defaults to the OpenRouter chat completions endpoint.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.apiEndpoint)
          .setValue(this.plugin.settings.apiEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.apiEndpoint = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Stored locally in this vault.")
      .addText((text) =>
        text
          .setPlaceholder("sk-or-v1-...")
          .setValue(this.plugin.settings.openrouterApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openrouterApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model: Dictionary")
      .setDesc("Default: google/gemini-2.5-flash-lite")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.modelDictionary)
          .setValue(this.plugin.settings.modelDictionary)
          .onChange(async (value) => {
            this.plugin.settings.modelDictionary = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model: Correction")
      .setDesc("Default: google/gemini-2.5-flash")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.modelCorrection)
          .setValue(this.plugin.settings.modelCorrection)
          .onChange(async (value) => {
            this.plugin.settings.modelCorrection = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}

// --- Helpers & API ---

const SYSTEM_PROMPT = `You are a precise, concise English assistant for an Obsidian plugin.
Write Markdown. Never use HTML. Prefer short, tidy outputs.`;

function trimForTokens(s: string, maxChars: number) {
  if (s.length <= maxChars) return s;
  const half = Math.floor(maxChars / 2);
  return s.slice(0, half) + "\n...\n" + s.slice(s.length - half);
}

function buildPrompt(
  kind: TaskKind,
  selection: string,
  leftCtx: string,
  rightCtx: string,
  _fullDoc: string
): string {
  const L = trimForTokens(leftCtx, 50);
  const R = trimForTokens(rightCtx, 50);

  if (kind === TaskKind.Dictionary) {
    return [
      `Task: Define the selected text as a context-aware dictionary entry.`,
      `Selection:\n"""${selection}"""`,
      `Left context:\n"""${L}"""`,
      `Right context:\n"""${R}"""`,
      `Output strictly in this Markdown format (1-line fields):`,
      `***[Word(s)]*** (v./n./etc.) [Phonetic alphabet pronunciation American US English] ([English alphabet pronunciation help American US English])`,
      `***Definition:*** [1-line definition]`,
      `***Synonyms:*** [Up to 3 synonyms, separated by commas]`,
      `***Etymology:*** [1-line explanation of etymology]`,
      `If POS/pronunciation are unclear, make your best brief guess (or use "--").`
    ].join("\n\n");
  }

  if (kind === TaskKind.Correction) {
    return [
      `Task: Check whether the selection is correct English. Provide only a corrected version (non-destructive) and a 1-2 bullet rationale. If it's already correct and high quality, just say "Correct.".`,
      `Selection:\n"""${selection}"""`,
      `Left context:\n"""${L}"""`,
      `Right context:\n"""${R}"""`,
      `Output Markdown like:\n`,
      `**Corrected:** <single best corrected version>`,
      `- Reason 1`,
      `- Reason 2 (optional)`,
      `Do not rewrite more than necessary. Keep tone and meaning.`,
    ].join("\n\n");
  }

  throw new Error("Unsupported task kind");
}

async function callOpenRouterChat(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  endpoint: string;
}): Promise<string> {
  const body = {
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user }
    ],
    temperature: 0.2,
    max_tokens: 600
  };

  const endpoint = opts.endpoint?.trim() || DEFAULT_SETTINGS.apiEndpoint;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${opts.apiKey}`,
      // Optional headers improve routing at OpenRouter; harmless if not set:
      "HTTP-Referer": "obsidian://ai-writing-helper",
      "X-Title": "AI Writing Helper for Obsidian"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${txt}`);
  }
  const json = await res.json();
  const content: string =
    json?.choices?.[0]?.message?.content?.trim?.() ?? "";
  if (!content) throw new Error("Empty completion.");
  return content;
}

function getSelectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[rects.length - 1];
  const rect = range.getBoundingClientRect();
  return rect ?? null;
}
