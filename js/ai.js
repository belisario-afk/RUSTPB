// OpenAI integration with model fallback and streaming
// Default model: GPT-5 (gpt-5-mini or gpt-5-chat-latest). Fallback: gpt-4o, then gpt-4o-mini.
// Never delete or truncate user code: always request minimal, explicit unified diffs for patches.

import { storage } from './storage.js';
import { sleep, withBackoff } from './rateLimit.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const fallbackModels = [
  'gpt-5-mini',
  'gpt-5-chat-latest',
  'gpt-4o',
  'gpt-4o-mini'
];

export const ai = {
  stats: {
    requests: 0,
    lastTokens: 0
  },

  resolveModels(preferred){
    if (preferred && preferred !== 'auto') {
      return [preferred, ...fallbackModels.filter(m => m !== preferred)];
    }
    return [...fallbackModels];
  },

  getHeaders(){
    const key = storage.getApiKey();
    if (!key) throw new Error('Missing OpenAI API key');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    };
  },

  estimateTokens(str){
    // Rough: 1 token ≈ 4 chars
    return Math.ceil((str || '').length / 4);
  },

  async chatOnce({ model, messages, stream=false, responseFormatJson=true }){
    const body = {
      model,
      messages,
      stream: !!stream
    };

    // Some GPT-5 variants reject temperature/other params; we omit non-default temperature entirely
    if (responseFormatJson) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    // Handle unsupported response_format gracefully
    if (!res.ok) {
      if (res.status === 400 && responseFormatJson) {
        // Retry without response_format
        return this.chatOnce({ model, messages, stream, responseFormatJson: false });
      }
      const text = await res.text().catch(()=> '');
      const err = new Error(`OpenAI error ${res.status}: ${text}`);
      err.status = res.status;
      err.responseText = text;
      throw err;
    }
    return res;
  },

  async chatWithFallback({ modelPreference='auto', messages, requireJson=false, stream=false, onToken }) {
    const models = this.resolveModels(modelPreference);
    let lastErr = null;
    for (const m of models){
      try {
        this.stats.requests++;
        const tokenEstimate = this.estimateTokens(messages.map(mm => mm.content).join('\n'));
        this.stats.lastTokens = tokenEstimate;
        const res = await withBackoff(async () => await this.chatOnce({
          model: m, messages, stream, responseFormatJson: requireJson
        }), { retries: 2 });
        if (stream) {
          return await this._readStream(res, m, onToken);
        } else {
          const data = await res.json();
          console.debug('[OpenAI] model:', m, 'usage?', data?.usage, 'id?', data?.id);
          return { model: m, data };
        }
      } catch (e) {
        lastErr = e;
        console.warn(`[OpenAI] model ${m} failed:`, e?.message || e);
        if (e.status === 401 || e.status === 403) throw e; // stop on auth errors
        // continue to next model
        await sleep(200);
      }
    }
    throw lastErr || new Error('All model fallbacks failed');
  },

  async _readStream(res, model, onToken){
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    while (true){
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // ChatCompletions streams as server-sent events style "data: {json}"
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines){
        const m = line.match(/^data:\s*(.+)$/);
        if (!m) continue;
        if (m[1] === '[DONE]') continue;
        try{
          const json = JSON.parse(m[1]);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta){
            fullText += delta;
            onToken?.(delta);
          }
        } catch {}
      }
    }
    return { model, streamText: fullText };
  },

  // Prompts
  systemNonDestructive(framework){
    return {
      role: 'system',
      content:
`You are an expert Rust server plugin engineer. Target framework: ${framework === 'carbon' ? 'Carbon' : 'Oxide/uMod'}.
CRITICAL RULES:
- NEVER delete or truncate user code.
- Produce minimal, explicit patches (unified diff) for any fixes or improvements.
- If >20% lines would change, split into multiple small patches with rationale.
- If uncertain, ask for clarification.
- Respect framework-specific attributes and hook signatures.`
    };
  },

  async generatePlugin({ modelPreference, framework, description, meta, safetyMode, selectedHooks = [] }){
    const hookList = selectedHooks.length ? `\nHooks to consider: ${selectedHooks.join(', ')}` : '';
    const messages = [
      this.systemNonDestructive(framework),
      { role: 'user', content:
`Generate a minimal ${framework === 'carbon' ? 'Carbon' : 'Oxide/uMod'} C# plugin implementing:
"${description}"${hookList}

Metadata:
- Name: ${meta.name}
- Author: ${meta.author}
- Version: ${meta.version}
- Permissions: ${meta.permissions?.join(', ') || '(none)'}

Constraints:
- Include comments explaining each significant section.
- ${safetyMode ? 'Avoid sensitive operations and blocking calls; prefer safe patterns.' : 'Use standard patterns.'}
- Output ONLY the C# code block. Do NOT include explanations.`}
    ];
    const { model, data } = await this.chatWithFallback({
      modelPreference, messages, requireJson: false, stream: false
    });
    const text = data.choices?.[0]?.message?.content || '';
    return { model, text };
  },

  async refinePlugin({ modelPreference, framework, goals, currentCode, codeFragment='' }){
    const partialNote = codeFragment
      ? `Only modify within the provided snippets. Output a unified diff against the original file content; do not mass-rewrite.\n---BEGIN SNIPPETS---\n${codeFragment}\n---END SNIPPETS---`
      : 'Return a unified diff (git-style) with minimal changes.';
    const messages = [
      this.systemNonDestructive(framework),
      { role: 'user', content:
`Refine the following plugin with conservative changes for goals: ${goals.join(', ')}

${partialNote}

---BEGIN CURRENT CODE---
${currentCode}
---END CURRENT CODE---` }
    ];
    const { model, data } = await this.chatWithFallback({
      modelPreference, messages, requireJson: false, stream: false
    });
    return { model, diff: data.choices?.[0]?.message?.content || '' };
  },

  async createPatch({ modelPreference, framework, problem, currentCode, codeFragment='' }){
    const partialNote = codeFragment
      ? `Only touch code inside the snippets below. Produce the minimal unified diff applicable to the full file.\n---BEGIN SNIPPETS---\n${codeFragment}\n---END SNIPPETS---`
      : 'Produce the minimal unified diff applicable to the full file.';
    const messages = [
      this.systemNonDestructive(framework),
      { role: 'user', content:
`Create a unified diff (git style) that minimally fixes the problem described, without deleting or truncating user code.

Problem:
${problem}

Rules:
- Minimal explicit patches only.
- If >20% of lines would change, split into multiple small diffs; annotate each with a short rationale in comments starting with // PATCH NOTE:

${partialNote}

---BEGIN CURRENT CODE---
${currentCode}
---END CURRENT CODE---` }
    ];
    const { model, data } = await this.chatWithFallback({
      modelPreference, messages, requireJson: false, stream: false
    });
    return { model, diff: data.choices?.[0]?.message?.content || '' };
  },

  async suggestTests({ modelPreference, framework, currentCode, categoryOnly=false, codeFragment='' }){
    const scope = codeFragment ? `Focus only on these snippets:\n---SNIPPETS---\n${codeFragment}\n---END SNIPPETS---\n` : '';
    const brevity = categoryOnly ? 'Be terse. Prefer bullet points.' : 'Keep concise to save tokens.';
    const messages = [
      this.systemNonDestructive(framework),
      { role: 'user', content:
`Suggest a test plan for this ${framework} Rust plugin.
${scope}
Output JSON with keys:
- scenarios: array of scenario strings
- assertions: array of assertion strings
- manual_steps: array of in-game/manual steps

${brevity}

---CODE---
${currentCode}
---END---` }
    ];
    const { model, data } = await this.chatWithFallback({
      modelPreference, messages, requireJson: true, stream: false
    });
    const raw = data.choices?.[0]?.message?.content || '{}';
    let json = {};
    try { json = JSON.parse(raw); } catch { json = {}; }
    return { model, plan: json, raw };
  },

  async explainCode({ modelPreference, framework, currentCode, categoryOnly=false, codeFragment='', stream=false, onToken }){
    const scope = codeFragment ? `Focus only on these snippets:\n---SNIPPETS---\n${codeFragment}\n---END SNIPPETS---\n` : '';
    const brevity = categoryOnly ? 'Be very concise; summarize by category (hooks, permissions, data IO).' : 'Keep it concise.';
    const messages = [
      this.systemNonDestructive(framework),
      { role: 'user', content:
`Explain the following plugin. Focus on hooks used, permissions, and key behaviors. ${brevity}
${scope}
---CODE---
${currentCode}
---END---` }
    ];
    if (stream){
      return await this.chatWithFallback({ modelPreference, messages, requireJson: false, stream: true, onToken });
    } else {
      const { model, data } = await this.chatWithFallback({ modelPreference, messages, requireJson: false, stream: false });
      return { model, text: data.choices?.[0]?.message?.content || '' };
    }
  }
};