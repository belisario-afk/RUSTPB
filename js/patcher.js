// Unified diff parsing and conservative patching
// IMPORTANT: Never delete or truncate user code. Produce minimal, explicit patches.
// If uncertain, ask for clarification or split changes.

function parseUnifiedDiff(diffText){
  // Supports unified diff with multiple hunks
  const lines = diffText.replace(/\r\n/g, '\n').split('\n');
  const hunks = [];
  let i = 0;
  while (i < lines.length){
    const m = lines[i].match(/^@@\s*-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s*@@/);
    if (!m){ i++; continue; }
    const header = lines[i++];
    const hunk = { header, lines: [] };
    while (i < lines.length){
      const l = lines[i];
      if (/^@@\s*-\d+/.test(l)) break;
      if (/^diff --git /.test(l)) break;
      hunk.lines.push(l);
      i++;
    }
    hunks.push(hunk);
  }
  return hunks;
}

function hunkToBlocks(hunk){
  const oldLines = [];
  const newLines = [];
  const contextBefore = [];
  const contextAfter = [];
  let seenChange = false;

  for (const l of hunk.lines){
    if (l.startsWith(' ')){
      if (!seenChange) contextBefore.push(l.slice(1));
      else contextAfter.push(l.slice(1));
      oldLines.push(l.slice(1));
      newLines.push(l.slice(1));
    } else if (l.startsWith('-')){
      oldLines.push(l.slice(1));
      seenChange = true;
    } else if (l.startsWith('+')){
      newLines.push(l.slice(1));
      seenChange = true;
    } else {
      // unknown; treat as context
      oldLines.push(l);
      newLines.push(l);
    }
  }
  return {
    oldBlock: oldLines.join('\n'),
    newBlock: newLines.join('\n'),
    contextBefore: contextBefore.slice(-3).join('\n'), // last few context lines
    contextAfter: contextAfter.slice(0,3).join('\n')   // first few after lines
  };
}

function normalizeWs(s){ return s.replace(/[ \t]+/g, ' ').trim(); }

function findBestIndex(haystack, needle, contextBefore, contextAfter){
  // Try exact
  let idx = haystack.indexOf(needle);
  if (idx !== -1) return idx;

  // Try whitespace-normalized
  const H = normalizeWs(haystack);
  const N = normalizeWs(needle);
  idx = H.indexOf(N);
  if (idx !== -1){
    // approximate convert normalized index back by searching plain needle's first line around contexts
    // Fallback: try matching lines
    const lines = needle.split('\n');
    if (lines.length){
      const first = lines[0];
      const pos = haystack.indexOf(first);
      if (pos !== -1) return pos;
    }
  }

  // Try contextual anchoring
  if (contextBefore){
    const cbIdx = haystack.indexOf(contextBefore);
    if (cbIdx !== -1){
      const searchStart = cbIdx + contextBefore.length;
      const tail = haystack.slice(searchStart);
      const nidx = tail.indexOf(needle);
      if (nidx !== -1) return searchStart + nidx;
    }
  }
  if (contextAfter){
    const caIdx = haystack.indexOf(contextAfter);
    if (caIdx !== -1){
      const head = haystack.slice(0, caIdx);
      const nidx = head.lastIndexOf(needle);
      if (nidx !== -1) return nidx;
    }
  }

  return -1;
}

export function estimateImpact(original, diffText){
  const hunks = parseUnifiedDiff(diffText);
  const totalLines = original.split(/\r?\n/).length;
  let added = 0, removed = 0, touchedLines = 0;

  for (const h of hunks){
    for (const l of h.lines){
      if (l.startsWith('+')) added++;
      else if (l.startsWith('-')) removed++;
    }
  }
  touchedLines = added + removed; // conservative approximation
  const touchedPct = totalLines ? (touchedLines / totalLines) * 100 : 0;
  const deletedPct = totalLines ? (removed / totalLines) * 100 : 0;
  return { totalLines, added, removed, touchedLines, touchedPct, deletedPct };
}

export function applyUnifiedDiff(original, diffText, { dryRun = false } = {}){
  const hunks = parseUnifiedDiff(diffText);
  let text = original;
  const manual = [];
  for (const h of hunks){
    const { oldBlock, newBlock, contextBefore, contextAfter } = hunkToBlocks(h);
    const idx = findBestIndex(text, oldBlock, contextBefore, contextAfter);
    if (idx === -1){
      manual.push({ header: h.header, reason: 'Context not found; needs manual merge' });
      continue;
    }
    if (!dryRun){
      text = text.slice(0, idx) + newBlock + text.slice(idx + oldBlock.length);
    }
  }
  const changed = text !== original;
  return { changed, result: text, manual };
}

export function buildChangelogEntry({ title, diffText, impact }){
  const ts = new Date().toISOString();
  return {
    title,
    timestamp: ts,
    summary: `+${impact.added}/-${impact.removed}, touched ${impact.touchedLines} lines (${impact.touchedPct.toFixed(1)}%)`,
    diff: diffText
  };
}