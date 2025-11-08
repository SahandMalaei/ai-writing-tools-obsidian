"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AIWritingHelper
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  openrouterApiKey: "",
  modelDictionary: "google/gemini-2.5-flash-lite-002",
  modelCorrection: "google/gemini-2.5-flash-lite-002",
  modelExplanation: "google/gemini-2.5-flash-lite-002"
};
var AIWritingHelper = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    // --- Popup UI ---
    this.popoverEl = null;
    this.contentEl = null;
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "aiwh-dictionary",
      name: "Dictionary: Define selection (context-aware)",
      editorCallback: (editor) => this.runTask("Dictionary" /* Dictionary */, editor)
    });
    this.addCommand({
      id: "aiwh-correction",
      name: "Check & suggest corrected English (non-destructive)",
      editorCallback: (editor) => this.runTask("Correction" /* Correction */, editor)
    });
    this.addCommand({
      id: "aiwh-explain",
      name: "Explain selection in document context",
      editorCallback: (editor) => this.runTask("Explanation" /* Explanation */, editor)
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const hasSelection = !!editor.getSelection();
        if (!hasSelection) return;
        menu.addItem(
          (item) => item.setTitle("AI: Dictionary (context-aware)").setIcon("book").onClick(() => this.runTask("Dictionary" /* Dictionary */, editor))
        );
        menu.addItem(
          (item) => item.setTitle("AI: Check & Correct (non-destructive)").setIcon("check").onClick(() => this.runTask("Correction" /* Correction */, editor))
        );
        menu.addItem(
          (item) => item.setTitle("AI: Explain in context").setIcon("help-circle").onClick(() => this.runTask("Explanation" /* Explanation */, editor))
        );
      })
    );
    this.addSettingTab(new AIWHSettingTab(this.app, this));
    console.log("AI Writing Helper loaded");
  }
  onunload() {
    console.log("AI Writing Helper unloaded");
  }
  async runTask(kind, editor) {
    const selection = editor.getSelection().trim();
    if (!selection) {
      new import_obsidian.Notice("Select some text first.");
      return;
    }
    if (!this.settings.openrouterApiKey) {
      new import_obsidian.Notice("Set your OpenRouter API key in settings.");
      return;
    }
    const doc = editor.getValue();
    const cursorFrom = editor.getCursor("from");
    const cursorTo = editor.getCursor("to");
    const fromPos = editor.posToOffset(cursorFrom);
    const toPos = editor.posToOffset(cursorTo);
    const LEFT = Math.max(0, fromPos - 1200);
    const RIGHT = Math.min(doc.length, toPos + 1200);
    const leftCtx = doc.slice(LEFT, fromPos);
    const rightCtx = doc.slice(toPos, RIGHT);
    const surrounding = `${leftCtx}[${selection}]${rightCtx}`;
    this.showPopoverAtSelection("Working\u2026");
    try {
      const model = this.getModelFor(kind);
      const prompt = buildPrompt(kind, selection, leftCtx, rightCtx, doc);
      const md = await callOpenRouterChat({
        apiKey: this.settings.openrouterApiKey,
        model,
        system: SYSTEM_PROMPT,
        user: prompt
      });
      await this.updatePopoverMarkdown(md);
    } catch (e) {
      const msg = String(e?.message || e);
      await this.updatePopoverMarkdown(
        `**Error**

\`\`\`
${msg}
\`\`\`

Check API key, model name, or rate limits.`
      );
    }
  }
  getModelFor(kind) {
    switch (kind) {
      case "Dictionary" /* Dictionary */:
        return this.settings.modelDictionary || DEFAULT_SETTINGS.modelDictionary;
      case "Correction" /* Correction */:
        return this.settings.modelCorrection || DEFAULT_SETTINGS.modelCorrection;
      case "Explanation" /* Explanation */:
        return this.settings.modelExplanation || DEFAULT_SETTINGS.modelExplanation;
    }
  }
  showPopoverAtSelection(initialMarkdown) {
    this.destroyPopover();
    const rect = getSelectionRect();
    const container = createDiv({ cls: "aiwh-popover" });
    const header = container.createDiv({ cls: "aiwh-header" });
    header.setText("AI Writing Helper");
    const content = container.createDiv();
    this.popoverEl = container;
    this.contentEl = content;
    const actions = container.createDiv({ cls: "aiwh-actions" });
    const copyBtn = createEl("button", { text: "Copy" });
    const closeBtn = createEl("button", { text: "Close" });
    actions.appendChild(copyBtn);
    actions.appendChild(closeBtn);
    copyBtn.addEventListener("click", async () => {
      if (!content) return;
      const raw = content.getAttribute("data-raw-markdown") || content.textContent || "";
      await navigator.clipboard.writeText(raw);
      new import_obsidian.Notice("Copied");
    });
    closeBtn.addEventListener("click", () => this.destroyPopover());
    const margin = 6;
    const top = Math.min(
      window.innerHeight - 20,
      (rect?.bottom ?? 80) + margin
    );
    const left = Math.min(
      window.innerWidth - 560,
      Math.max(8, rect?.left ?? 80)
    );
    container.style.top = `${top}px`;
    container.style.left = `${left}px`;
    document.body.appendChild(container);
    this.updatePopoverMarkdown(initialMarkdown);
    const esc = (ev) => {
      if (ev.key === "Escape") this.destroyPopover();
    };
    window.addEventListener("keydown", esc, { once: true });
  }
  async updatePopoverMarkdown(markdown) {
    if (!this.popoverEl || !this.contentEl) return;
    this.contentEl.empty();
    this.contentEl.setAttribute("data-raw-markdown", markdown);
    await import_obsidian.MarkdownRenderer.renderMarkdown(
      markdown,
      this.contentEl,
      "",
      this
    );
  }
  destroyPopover() {
    if (this.popoverEl) {
      this.popoverEl.remove();
      this.popoverEl = null;
      this.contentEl = null;
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var AIWHSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AI Writing Helper \u2013 Settings" });
    new import_obsidian.Setting(containerEl).setName("OpenRouter API Key").setDesc("Stored locally in this vault.").addText(
      (text) => text.setPlaceholder("sk-or-v1-...").setValue(this.plugin.settings.openrouterApiKey).onChange(async (value) => {
        this.plugin.settings.openrouterApiKey = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Model: Dictionary").setDesc("Default: google/gemini-2.5-flash-lite").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.modelDictionary).setValue(this.plugin.settings.modelDictionary).onChange(async (value) => {
        this.plugin.settings.modelDictionary = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Model: Correction").setDesc("Default: google/gemini-2.5-flash-lite").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.modelCorrection).setValue(this.plugin.settings.modelCorrection).onChange(async (value) => {
        this.plugin.settings.modelCorrection = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Model: Explanation").setDesc("Default: google/gemini-2.5-flash-lite").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.modelExplanation).setValue(this.plugin.settings.modelExplanation).onChange(async (value) => {
        this.plugin.settings.modelExplanation = value.trim();
        await this.plugin.saveSettings();
      })
    );
  }
};
var SYSTEM_PROMPT = `You are a precise, concise English assistant for an Obsidian plugin.
Write Markdown. Never use HTML. Prefer short, tidy outputs.`;
function trimForTokens(s, maxChars) {
  if (s.length <= maxChars) return s;
  const half = Math.floor(maxChars / 2);
  return s.slice(0, half) + "\n\u2026\n" + s.slice(s.length - half);
}
function buildPrompt(kind, selection, leftCtx, rightCtx, fullDoc) {
  const L = trimForTokens(leftCtx, 2e3);
  const R = trimForTokens(rightCtx, 2e3);
  const DOC = trimForTokens(fullDoc, 6e3);
  if (kind === "Dictionary" /* Dictionary */) {
    return [
      `Task: Define the selected text as a context-aware dictionary entry.`,
      `Selection:
"""${selection}"""`,
      `Left context:
"""${L}"""`,
      `Right context:
"""${R}"""`,
      `Document context (truncated):
"""${DOC}"""`,
      `Output strictly in this Markdown format (1-line fields):`,
      `[Word(s)] (v./n./etc.) [Phonetic alphabet pronunciation] ([English alphabet pronunciation help])`,
      `***Definition:*** [1-line definition]`,
      `***Synonyms:*** [Up to 3 synonyms, separated by commas]`,
      `***Etymology:*** [1-line explanation of etymology]`,
      `If POS/pronunciation are unclear, make your best brief guess (or use \u201C\u2014\u201D).`
    ].join("\n\n");
  }
  if (kind === "Correction" /* Correction */) {
    return [
      `Task: Check whether the selection is correct English. Provide only a corrected version (non-destructive) and a 1-2 bullet rationale.`,
      `Selection:
"""${selection}"""`,
      `Left context:
"""${L}"""`,
      `Right context:
"""${R}"""`,
      `Document context (truncated):
"""${DOC}"""`,
      `Output Markdown like:
`,
      `**Corrected:** <single best corrected version>`,
      `- Reason 1`,
      `- Reason 2 (optional)`,
      `Do not rewrite more than necessary. Keep tone and meaning.`
    ].join("\n\n");
  }
  return [
    `Task: Explain the meaning of the selected text in the context of this document. Keep it concise and actionable.`,
    `Selection:
"""${selection}"""`,
    `Left context:
"""${L}"""`,
    `Right context:
"""${R}"""`,
    `Document context (truncated):
"""${DOC}"""`,
    `Output Markdown with short sections:
`,
    `**What it means**: <1\u20132 sentences>`,
    `**Why it\u2019s written this way**: <1\u20132 bullets>`,
    `**Possible alternatives**: <up to 3 short options in bullets>`
  ].join("\n\n");
}
async function callOpenRouterChat(opts) {
  const body = {
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user }
    ],
    temperature: 0.2,
    max_tokens: 600
  };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
  const content = json?.choices?.[0]?.message?.content?.trim?.() ?? "";
  if (!content) throw new Error("Empty completion.");
  return content;
}
function getSelectionRect() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[rects.length - 1];
  const rect = range.getBoundingClientRect();
  return rect ?? null;
}
//# sourceMappingURL=main.js.map
