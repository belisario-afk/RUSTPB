# Rust Plugin Studio (AI)

Create, refine, and debug C# plugins for Rust by Facepunch targeting Oxide/uMod or Carbon frameworks. 100% client‑side. Bring Your Own OpenAI API key. All AI fixes are applied as explicit, conservative patches. Never delete or truncate user code.

- Live Editor: Monaco (C# syntax highlighting)
- AI: OpenAI GPT‑5 by default (fallback to gpt‑4o, gpt‑4o‑mini)
- Non‑destructive patches using unified diffs
- Lightweight validators and safety checks
- Deployable to GitHub Pages, no build step

## Screenshots

- Editor + Left Panel
- Output & Patches tabs
- Tests/Checks
- Changelog

(Place screenshots in `/assets/` and reference them here.)

## How it works

- Entirely static website; no servers involved.
- You set your OpenAI API key in the app (BYO key modal). The key is stored in your browser’s `localStorage`, never sent anywhere except directly to OpenAI’s API.
- When you request “Generate”, “Refine”, “Explain”, “Patch” or “Suggest Tests”, the app sends minimal prompts and your current code (when applicable) to the OpenAI API.
- “Create Patch” and “Refine/Improve” always request unified diffs. The site parses and dry‑runs each hunk. If a hunk fails to match cleanly, it’s flagged for manual merge. Large changes (>20% lines touched or >10% deletions) require confirmation.
- Validators provide basic C# and Rust plugin heuristic checks (structure, attributes, permissions, hook signatures, main‑thread blocking patterns).

## Privacy

- Your API key is stored only in your browser (localStorage). You can clear it anytime in the BYO Key dialog.
- Zero telemetry. All data lives on your device and calls go directly from your browser to OpenAI.

## Cost Guard

- Options include:
  - “Only send uncertain changes to AI”
  - “Category‑only output” summaries
  - A “Max files per operation” cap (default 20)
- The status bar shows an estimated token count per request and total requests for the session.
- Tips to reduce cost:
  - Use the cheaper fallback model (gpt‑4o‑mini) when appropriate.
  - Enable category‑only output for summaries.
  - Keep prompts concise; paste only the needed parts.

## Getting Started

1) Clone or download this repository.
2) Open `index.html` locally or host via GitHub Pages.
3) Click “BYO API Key” in the top bar and paste your OpenAI API key (starts with `sk-...`).
4) Choose framework (Oxide/uMod or Carbon) and a model preference (Auto recommended).
5) Describe your plugin and click “Generate”.

### Demo flow

1. Choose Oxide in the top bar.
2. The editor loads a minimal Oxide plugin template.
3. In “Describe your plugin”, write a short feature (e.g., “/home teleport with cooldown and permissions”).
4. Click “Generate Plugin”.
5. Open the “Tests/Checks” tab to see initial validators.
6. Click “Create Patch” and describe a small change (e.g., “Add /sethome with 30s cooldown; deny without permission myplugin.use”).
7. Review the unified diff in “Patches” and “Dry‑Run” it; if clean, “Apply Patch”.
8. See the “Changelog” tab updated with a summary and raw diff.

## Keyboard Shortcuts

- Ctrl/Cmd+Enter: Run the last action (Generate/Refine/Patch/Tests/Explain)
- Ctrl/Cmd+S: Save a snapshot

## BYO Key and Models

- Default model is GPT‑5 (prefers `gpt‑5‑mini` or `gpt‑5‑chat‑latest`). The app automatically falls back to `gpt‑4o`, then `gpt‑4o‑mini` if needed.
- Some GPT‑5 variants reject non‑default parameters. The app omits temperature and retries without `response_format` if necessary.

## Monaco

- Loaded via CDN by default for convenience.
- For offline/local hosting: see `/lib/monaco/README.txt` for instructions to bundle Monaco locally.

## diff‑match‑patch

- This repository includes a minimal comparable patch library at `lib/diff-match-patch.min.js` for conservative block matching.
- If you prefer the official Google diff‑match‑patch JS library, replace that file with the official minified build; `patcher.js` uses only basic matching semantics and unified diff parsing.

## Deployment to GitHub Pages

Option A: Settings → Pages  
- Branch: `main`  
- Folder: `/ (root)`  
- Save. Your site will be available at `https://<user>.github.io/<repo>/`.

Option B: GitHub Actions (buildless)  
- Ensure this repo has `.github/workflows/pages.yml`.
- Push to `main`. Actions will publish automatically.

## Legal / EULA Notes

- This tool is unofficial and not affiliated with Facepunch, Oxide/uMod, or Carbon.
- Users must comply with Facepunch/Rust server modding policies, and Oxide/Carbon licenses.
- Generated code is your responsibility. Review before deploying to production servers.

## License

MIT — see [LICENSE](./LICENSE).