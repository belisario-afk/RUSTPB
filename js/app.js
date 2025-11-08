import { storage } from './storage.js';
import { getInitialTemplate } from './templates.js';
import { runValidators } from './validators.js';
import { ai } from './ai.js';
import { applyUnifiedDiff, estimateImpact, buildChangelogEntry } from './patcher.js';

let editor;
let currentFramework = 'oxide';
let lastAction = 'generate'; // for Ctrl/Cmd+Enter
let currentModelPref = 'auto';

const el = (id) => document.getElementById(id);
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function setStatus({ model, batch, tokens, costGuard }){
  el('statusModel').textContent = model || currentModelPref;
  el('statusBatch').textContent = batch ?? 0;
  el('statusTokens').textContent = tokens ?? ai.stats.lastTokens;
  el('statusCostGuard').textContent = costGuard ? 'ON' : 'OFF';
  const rc = el('requestCount');
  if (rc) rc.textContent = ai.stats.requests;
}

function toast(msg, type=''){
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.remove(); }, 4200);
}

async function initMonaco(){
  try{
    await window.monacoReady;
    editor = monaco.editor.create(el('editor'), {
      value: storage.getAutosave() || getInitialTemplate(currentFramework, {
        name: 'MyPlugin',
        author: 'YourName',
        version: '1.0.0'
      }),
      language: 'csharp',
      theme: 'vs-dark',
      automaticLayout: true,
      glyphMargin: true,
      fontSize: 14,
      minimap: { enabled: false }
    });
    editor.onDidChangeModelContent(() => {
      storage.setAutosave(editor.getValue());
      scheduleValidate();
    });
  }catch(e){
    console.error('Monaco failed, falling back to textarea editor', e);
    fallbackEditor();
  }
}

function fallbackEditor(){
  const host = el('editor');
  host.innerHTML = '';
  const ta = document.createElement('textarea');
  ta.style.cssText = 'width:100%;height:100%;background:#0a0d14;color:#e5e7eb;border:1px solid #2a3142;border-radius:6px;padding:10px;font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;';
  ta.value = storage.getAutosave() || getInitialTemplate(currentFramework, {
    name: 'MyPlugin',
    author: 'YourName',
    version: '1.0.0'
  });
  host.appendChild(ta);

  // Minimal editor shim
  editor = {
    getValue: () => ta.value,
    setValue: (v) => { ta.value = v; storage.setAutosave(v); },
    onDidChangeModelContent: (fn) => {
      ta.addEventListener('input', () => { storage.setAutosave(ta.value); fn?.(); });
    },
    revealLineInCenter: () => {},
    setPosition: () => {},
    focus: () => ta.focus()
  };
  // Trigger initial validate
  scheduleValidate();
}

let validateTimer;
function scheduleValidate(){
  clearTimeout(validateTimer);
  validateTimer = setTimeout(runChecksUI, 400);
}

function loadSettingsToUI(){
  const s = storage.getSettings();
  if (s.framework) { currentFramework = s.framework; el('frameworkSelect').value = s.framework; }
  if (s.model) { currentModelPref = s.model; el('modelSelect').value = s.model; }
  el('onlyUncertainToggle').checked = !!s.onlyUncertain;
  el('categoryOnlyToggle').checked = !!s.categoryOnly;
  el('maxFilesInput').value = s.maxFiles ?? 20;
  setStatus({ model: currentModelPref, costGuard: !!(s.onlyUncertain || s.categoryOnly) });
}

function saveSettingsFromUI(){
  const s = {
    framework: el('frameworkSelect').value,
    model: el('modelSelect').value,
    onlyUncertain: el('onlyUncertainToggle').checked,
    categoryOnly: el('categoryOnlyToggle').checked,
    maxFiles: parseInt(el('maxFilesInput').value || '20', 10)
  };
  storage.setSettings(s);
  currentFramework = s.framework;
  currentModelPref = s.model;
  setStatus({ model: currentModelPref, costGuard: !!(s.onlyUncertain || s.categoryOnly) });
}

function bindUI(){
  el('frameworkSelect').addEventListener('change', () => {
    saveSettingsFromUI();
    // If editor is empty or freshly generated, reload template
    if ((editor.getValue() || '').trim().length < 30) {
      editor.setValue(getInitialTemplate(currentFramework, {
        name: el('pluginNameInput').value || 'MyPlugin',
        author: el('authorInput').value || 'YourName',
        version: el('versionInput').value || '1.0.0'
      }));
    }
  });
  el('modelSelect').addEventListener('change', saveSettingsFromUI);
  el('onlyUncertainToggle').addEventListener('change', saveSettingsFromUI);
  el('categoryOnlyToggle').addEventListener('change', saveSettingsFromUI);
  el('maxFilesInput').addEventListener('input', saveSettingsFromUI);

  // Tabs
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      $$('.tabpane').forEach(p => p.classList.remove('active'));
      el('tab-' + tab).classList.add('active');
      if (tab === 'checks') runChecksUI();
    });
  });

  // Actions
  el('btnGenerate').addEventListener('click', onGenerate);
  el('btnRefine').addEventListener('click', onRefine);
  el('btnSuggestTests').addEventListener('click', onSuggestTests);
  el('btnExplain').addEventListener('click', onExplain);
  el('btnCreatePatch').addEventListener('click', onCreatePatch);

  el('qaGenerate').addEventListener('click', onGenerate);
  el('qaRefine').addEventListener('click', onRefine);
  el('qaPatch').addEventListener('click', onCreatePatch);
  el('qaTests').addEventListener('click', onSuggestTests);
  el('qaExplain').addEventListener('click', onExplain);

  // Patches
  el('btnDryRunPatch').addEventListener('click', () => applyPatchUI(true));
  el('btnApplyPatch').addEventListener('click', () => applyPatchUI(false));

  // History
  el('btnClearHistory').addEventListener('click', () => {
    storage.setHistory([]);
    renderHistory();
  });

  // API Key Modal
  el('btnApiKey').addEventListener('click', () => {
    el('apiKeyInput').value = storage.getApiKey();
    el('apiKeyModal').showModal();
  });
  el('btnSaveKey').addEventListener('click', (e) => {
    e.preventDefault();
    storage.setApiKey(el('apiKeyInput').value.trim());
    el('apiKeyModal').close();
    toast('API key saved');
  });
  el('btnClearKey').addEventListener('click', (e) => {
    e.preventDefault();
    storage.clearApiKey();
    el('apiKeyInput').value = '';
    toast('API key cleared');
  });

  // Snapshots
  el('btnSaveSnapshot').addEventListener('click', onSaveSnapshot);
  el('btnClearSnapshots').addEventListener('click', () => {
    storage.setSnapshots([]);
    renderSnapshots();
  });
  renderSnapshots();

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'){
      e.preventDefault();
      onSaveSnapshot();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter'){
      e.preventDefault();
      if (lastAction === 'generate') onGenerate();
      else if (lastAction === 'refine') onRefine();
      else if (lastAction === 'patch') onCreatePatch();
      else if (lastAction === 'tests') onSuggestTests();
      else if (lastAction === 'explain') onExplain();
    }
  });
}

function renderSnapshots(){
  const list = el('snapshotList');
  list.innerHTML = '';
  const snaps = storage.getSnapshots();
  for (const s of snaps){
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <div class="meta">${new Date(s.ts).toLocaleString()}</div>
        <div class="meta">${s.note || ''}</div>
      </div>
      <div>
        <button class="btn small" data-act="restore">Restore</button>
        <button class="btn small" data-act="delete">Delete</button>
      </div>
    `;
    li.querySelector('[data-act="restore"]').addEventListener('click', () => {
      editor.setValue(s.content);
      toast('Snapshot restored');
      scheduleValidate();
    });
    li.querySelector('[data-act="delete"]').addEventListener('click', () => {
      const arr = storage.getSnapshots().filter(x => x.ts !== s.ts);
      storage.setSnapshots(arr);
      renderSnapshots();
    });
    list.appendChild(li);
  }
}

function onSaveSnapshot(){
  const content = editor.getValue();
  const note = (prompt('Optional note for this snapshot:') || '').trim();
  storage.addSnapshot({ ts: Date.now(), content, note });
  renderSnapshots();
  toast('Snapshot saved');
}

function renderHistory(){
  const hist = storage.getHistory();
  const box = el('outputHistory');
  box.innerHTML = '';
  for (const h of hist){
    const div = document.createElement('div');
    div.className = 'entry';
    div.innerHTML = `
      <div class="title">${h.title}</div>
      <div class="meta">${new Date(h.ts).toLocaleString()} · Model: ${h.model}</div>
      <pre>${escapeHtml(h.content || '')}</pre>
    `;
    box.appendChild(div);
  }
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function runChecksUI(){
  const code = editor.getValue();
  const results = runValidators(code, currentFramework);
  const box = el('checksList');
  box.innerHTML = '';
  for (const r of results){
    const item = document.createElement('div');
    item.className = 'item ' + (r.level === 'ok' ? 'ok' : r.level === 'warn' ? 'warn' : 'err');
    const loc = r.line ? `Line ${r.line}` : '';
    item.innerHTML = `<div class="msg">${r.msg}</div><div class="loc">${loc}</div>`;
    if (r.line){
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        editor.revealLineInCenter?.(r.line);
        editor.setPosition?.({ lineNumber: r.line, column: 1 });
        editor.focus?.();
      });
    }
    box.appendChild(item);
  }
}

function setBigChangeWarning(impact){
  const warn = el('bigChangeWarning');
  if (impact.touchedPct > 20 || impact.deletedPct > 10){
    warn.classList.remove('hidden');
  } else warn.classList.add('hidden');
}

function selectTab(name){
  $$('.tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === name));
  $$('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
}

// Build small code fragments around validator warnings/errors to reduce tokens
function buildUncertainFragments(code){
  const results = runValidators(code, currentFramework)
    .filter(r => (r.level === 'warn' || r.level === 'err') && r.line);
  if (!results.length) return '';
  const lines = code.split(/\r?\n/);
  const ranges = [];
  for (const r of results){
    const start = Math.max(1, r.line - 20);
    const end = Math.min(lines.length, r.line + 20);
    ranges.push([start, end]);
  }
  // merge overlapping ranges
  ranges.sort((a,b) => a[0]-b[0]);
  const merged = [];
  for (const rg of ranges){
    if (!merged.length || rg[0] > merged[merged.length-1][1] + 1) merged.push([...rg]);
    else merged[merged.length-1][1] = Math.max(merged[merged.length-1][1], rg[1]);
  }
  const parts = merged.map(([s,e]) => {
    const block = lines.slice(s-1, e).join('\n');
    return `// --- SNIPPET LINES ${s}-${e} ---
${block}
// --- END SNIPPET ---`;
  });
  return parts.join('\n\n');
}

function getSelectedHooks(){
  const sel = el('hooksSelect');
  return Array.from(sel.selectedOptions || []).map(o => o.value);
}

// Heuristic: is the text likely a C# Rust plugin?
function isLikelyCSharpPlugin(text){
  if (!text) return false;
  const t = String(text);
  return /class\s+\w+\s*:\s*(RustPlugin|CarbonPlugin)\b/.test(t)
      || /\[(Info|Plugin)\s*\(/.test(t)
      || /\busing\s+Oxide\.Core\b/.test(t)
      || /\busing\s+Carbon\.Core\b/.test(t);
}

function postHistory(title, content, model){
  storage.addHistory({ ts: Date.now(), title, model, content });
  renderHistory();
}

async function onGenerate(){
  lastAction = 'generate';
  selectTab('output');
  const descriptionBase = el('promptInput').value.trim();
  if (!descriptionBase) return toast('Please describe your plugin.');
  const selectedHooks = getSelectedHooks();
  const hooksText = selectedHooks.length ? `Target hooks: ${selectedHooks.join(', ')}.` : '';
  const description = [descriptionBase, hooksText].filter(Boolean).join(' ');
  const meta = {
    name: el('pluginNameInput').value.trim() || 'MyPlugin',
    author: el('authorInput').value.trim() || 'YourName',
    version: el('versionInput').value.trim() || '1.0.0',
    permissions: (el('permissionsInput').value || '').split(',').map(s=>s.trim()).filter(Boolean)
  };

  try{
    const { model, text } = await ai.generatePlugin({
      modelPreference: el('modelSelect').value,
      framework: currentFramework,
      description,
      meta,
      safetyMode: el('safetyModeToggle').checked,
      selectedHooks
    });

    const codeBlock = extractCodeBlock(text);
    if (codeBlock && isLikelyCSharpPlugin(codeBlock)) {
      editor.setValue(codeBlock);
      scheduleValidate();
      setStatus({ model });
      el('tokenEstimate').textContent = ai.stats.lastTokens;
      postHistory('Generate Plugin', text, model);
      toast('Plugin generated');
      selectTab('editor');
    } else {
      // Clarification or non-code response — keep editor unchanged
      postHistory('Clarification needed', text, model);
      setStatus({ model });
      el('tokenEstimate').textContent = ai.stats.lastTokens;
      toast('Model asked for clarification. See Output.', 'error');
      selectTab('output');
    }
  }catch(e){
    handleAiError(e);
  }
}

function extractCodeBlock(text){
  const m = text?.match(/```(?:csharp|cs)?\s*([\s\S]*?)```/i);
  return m ? m[1] : null;
}

async function onRefine(){
  lastAction = 'refine';
  selectTab('patches');
  const goalsInput = prompt('Refine goals (comma-separated): performance, reliability, security, anti-cheat') || '';
  const goals = goalsInput.split(',').map(s=>s.trim()).filter(Boolean);
  const code = editor.getValue();
  if (!code.trim()) return toast('No code to refine.');
  const settings = storage.getSettings();
  const fragments = settings.onlyUncertain ? buildUncertainFragments(code) : '';

  try{
    const { model, diff } = await ai.refinePlugin({
      modelPreference: el('modelSelect').value,
      framework: currentFramework,
      goals: goals.length ? goals : ['reliability'],
      currentCode: code,
      codeFragment: fragments
    });

    if (!/^\s*(?:@@\s*-\d+|\s*diff --git)/m.test(diff)) {
      postHistory('Clarification needed (Refine)', diff, model);
      toast('Model asked for clarification. See Output.', 'error');
      selectTab('output');
      return;
    }

    el('patchPreview').value = diff;
    const impact = estimateImpact(code, diff);
    el('tokenEstimate').textContent = ai.stats.lastTokens;
    setBigChangeWarning(impact);
    postHistory('Refine/Improve', diff, model);
    setStatus({ model });
    toast('Refine diff ready');
  }catch(e){
    handleAiError(e);
  }
}

async function onCreatePatch(){
  lastAction = 'patch';
  selectTab('patches');
  const problem = prompt('Describe the problem to fix (be specific):') || '';
  const code = editor.getValue();
  if (!code.trim()) return toast('No code to patch.');
  const settings = storage.getSettings();
  const fragments = settings.onlyUncertain ? buildUncertainFragments(code) : '';

  try{
    const { model, diff } = await ai.createPatch({
      modelPreference: el('modelSelect').value,
      framework: currentFramework,
      problem,
      currentCode: code,
      codeFragment: fragments
    });

    if (!/^\s*(?:@@\s*-\d+|\s*diff --git)/m.test(diff)) {
      postHistory('Clarification needed (Patch)', diff, model);
      toast('Model asked for clarification. See Output.', 'error');
      selectTab('output');
      return;
    }

    el('patchPreview').value = diff;
    const impact = estimateImpact(code, diff);
    el('tokenEstimate').textContent = ai.stats.lastTokens;
    setBigChangeWarning(impact);
    postHistory('Create Patch', diff, model);
    setStatus({ model });
    toast('Patch diff ready');
  }catch(e){
    handleAiError(e);
  }
}

async function onSuggestTests(){
  lastAction = 'tests';
  selectTab('output');
  const code = editor.getValue();
  if (!code.trim()) return toast('No code to analyze.');
  const settings = storage.getSettings();
  const fragments = settings.onlyUncertain ? buildUncertainFragments(code) : '';

  try{
    const { model, plan, raw } = await ai.suggestTests({
      modelPreference: el('modelSelect').value,
      framework: currentFramework,
      currentCode: code,
      categoryOnly: !!settings.categoryOnly,
      codeFragment: fragments
    });

    if (!plan || (!plan.scenarios && !plan.assertions && !plan.manual_steps)) {
      // Probably a clarifying question or non-JSON response
      postHistory('Clarification needed (Tests)', raw || '(no data)', model);
      toast('Model asked for clarification. See Output.', 'error');
      return;
    }

    postHistory('Suggest Tests', JSON.stringify(plan, null, 2), model);
    setStatus({ model });
    el('tokenEstimate').textContent = ai.stats.lastTokens;
    toast('Test plan generated');
  }catch(e){
    handleAiError(e);
  }
}

async function onExplain(){
  lastAction = 'explain';
  selectTab('output');
  const code = editor.getValue();
  if (!code.trim()) return toast('No code to explain.');
  const settings = storage.getSettings();
  const fragments = settings.onlyUncertain ? buildUncertainFragments(code) : '';

  try{
    let text = '';
    await ai.explainCode({
      modelPreference: el('modelSelect').value,
      framework: currentFramework,
      currentCode: code,
      categoryOnly: !!settings.categoryOnly,
      codeFragment: fragments,
      stream: true,
      onToken: (t) => {
        text += t;
        setStreamingHistory('Explain Code', text);
      }
    });
    postHistory('Explain Code', text, el('modelSelect').value);
    setStatus({ model: el('modelSelect').value });
    el('tokenEstimate').textContent = ai.stats.lastTokens;
  }catch(e){
    handleAiError(e);
  }
}

function setStreamingHistory(title, content){
  const box = el('outputHistory');
  let live = box.querySelector('.entry[data-live="1"]');
  if (!live){
    live = document.createElement('div');
    live.className = 'entry';
    live.setAttribute('data-live','1');
    live.innerHTML = `<div class="title">${title}</div><div class="meta">Streaming...</div><pre></pre>`;
    box.prepend(live);
  }
  live.querySelector('pre').textContent = content;
}

function applyPatchUI(dry){
  const diff = el('patchPreview').value;
  if (!diff.trim()) return toast('No patch to apply.');
  const code = editor.getValue();
  const impact = estimateImpact(code, diff);
  setBigChangeWarning(impact);
  if (!dry && (impact.touchedPct > 20 || impact.deletedPct > 10)){
    const ok = confirm(`This patch touches ${impact.touchedPct.toFixed(1)}% of lines and deletes ${impact.deletedPct.toFixed(1)}%. Apply anyway?`);
    if (!ok) return;
  }
  const { changed, result, manual } = applyUnifiedDiff(code, diff, { dryRun: dry });
  if (dry){
    toast(manual.length ? `Dry-run: ${manual.length} hunks need manual merge` : 'Dry-run OK: patch applies cleanly');
  }else{
    if (manual.length) toast(`${manual.length} hunks need manual merge (not applied)`, 'error');
    if (changed){
      editor.setValue(result);
      const entry = buildChangelogEntry({ title: 'Applied Patch', diffText: diff, impact });
      addChangelog(entry);
      toast('Patch applied');
      selectTab('changelog');
      scheduleValidate();
    }else{
      toast('No changes applied (patch may be empty or mismatched)');
    }
  }
}

function addChangelog(entry){
  storage.addChangelog(entry);
  renderChangelog();
}

function renderChangelog(){
  const cl = storage.getChangelog();
  const ul = el('changelogList');
  ul.innerHTML = '';
  for (const c of cl){
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="meta">${new Date(c.timestamp).toLocaleString()}</div>
      <div class="title">${c.title}</div>
      <div class="meta">${c.summary}</div>
      <pre class="diff">${escapeHtml(c.diff)}</pre>
    `;
    ul.appendChild(li);
  }
}

// Error handling
function handleAiError(e){
  console.error('[AI Error]', e);
  const status = e?.status;
  if (status === 401 || status === 403) toast('Auth error (401/403). Check your API key.', 'error');
  else if (status === 429) toast('Rate limited. Retrying may help soon.', 'error');
  else if (status === 400 && /unsupported/i.test(e?.responseText || '')) toast('Model rejected params; we automatically retried.', 'error');
  else toast(`AI error: ${e?.message || e}`, 'error');
  setStatus({}); // refresh counters
}

// Bootstrap
(async function main(){
  loadSettingsToUI();
  await initMonaco();
  bindUI();
  renderHistory();
  renderChangelog();
  scheduleValidate();
})();