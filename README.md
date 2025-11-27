# AI Writing Tools: Proofreader and Context-Aware Dictionary for Obsidian

AI Writing Tools is an Obsidian plugin built to make in-note reading and editing more seamless. It includes proofreading and dictionary functionality directly in the editor, on desktop and mobile. I use Obsidian as my main writing and note-taking tool, and as a non-native English speaker, I built this plugin to help improve my English writing skills.

Key benefits of the `Define` and `Correct` tools:
1. Definitions are generated **in context** of the surrounding text, not just the isolated selection.
2. Works with phrases, idioms, technical jargon, and fictional terms.
3. Corrections are minimal and explain the rationale; tone is preserved.
4. Mobile toolbar buttons include dedicated options for `Correct` and `Define`.

![Demo](demo.gif)

## How to Use

1. Download [the latest release of this plugin](https://github.com/SahandMalaei/ai-writing-tools-obsidian/releases/latest) and extract it into your vault at `.obsidian/plugins/ai-writing-tools` (create the folder if it does not exist).
2. In Obsidian, enable **Settings → Community Plugins → AI Writing Tools**.
3. Open **Settings → AI Writing Tools**:
   - Paste your OpenRouter (or compatible) API key.
   - (Optional) Set a custom API endpoint if you prefer a different provider.
   - Adjust models for Dictionary and Correction if needed.
4. Select text in the editor, then:
   - Desktop: Right-click → `Define` or `Correct`, or use the command palette.
   - Mobile: Use the toolbar icons above the keyboard for `Define` or `Correct`.
5. A popup appears with the result; use the built-in **Copy** button if you want to paste it elsewhere.

## What's Next?
1. History/log of lookups and corrections inside the vault.
2. Optional tone/style controls for corrections.
3. Additional language support beyond English.

License: GPLv3
