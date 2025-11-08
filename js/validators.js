// Lightweight heuristics for C# Rust plugins
export function runValidators(code, framework='oxide'){
  const results = [];
  const lines = code.split(/\r?\n/);

  // 1) Class inheritance
  const inheritsOxide = /class\s+\w+\s*:\s*RustPlugin\b/.test(code);
  const inheritsCarbon = /class\s+\w+\s*:\s*CarbonPlugin\b/.test(code);
  if (framework === 'oxide') {
    if (inheritsOxide) ok("Class derives from RustPlugin");
    else warn("Class should derive from RustPlugin for Oxide/uMod");
  } else {
    if (inheritsCarbon) ok("Class derives from CarbonPlugin");
    else warn("Class should derive from CarbonPlugin for Carbon");
  }

  // 2) Info/Plugin attributes
  const hasInfo = /\[(Info|Plugin)\s*\(/.test(code);
  if (!hasInfo) warn("Missing [Info(...)] (Oxide) or [Plugin(...)] (Carbon) attribute near class");

  // 3) Permission registration
  const hasPermConst = /const\s+string\s+\w*\s*PERM/i.test(code) || /"myplugin\.use"/i.test(code);
  const permRegistered = /permission\.RegisterPermission\s*\(/i.test(code);
  if (hasPermConst && !permRegistered) warn("Permission constant detected but no permission.RegisterPermission(...) found");

  // 4) Hooks sanity
  const hooks = [
    { name: 'OnServerInitialized', sig: /void\s+OnServerInitialized\s*\(\s*\)/ },
    { name: 'OnPlayerInit', sig: /void\s+OnPlayerInit\s*\(\s*BasePlayer\s+\w+\s*\)/ },
    { name: 'OnPlayerDisconnected', sig: /void\s+OnPlayerDisconnected\s*\(\s*BasePlayer\s+\w+,\s*string\s+\w+\s*\)/ },
    { name: 'OnPlayerChat', sig: /(void|object)\s+OnPlayerChat\s*\(\s*BasePlayer\s+\w+,\s*string\s+\w+\s*\)/ }
  ];
  for (const h of hooks) {
    if (code.includes(h.name)) {
      if (!h.sig.test(code)) warn(`${h.name} appears but the method signature may be incorrect`);
      else ok(`${h.name} signature looks OK`);
    }
  }

  // 5) Obvious main-thread blocking warnings
  if (/Thread\.Sleep\s*\(/.test(code) || /\bTask\.Wait\(\)/.test(code) || /\.Result\b/.test(code))
    warn("Potential blocking calls detected (Thread.Sleep/Task.Wait/.Result). Consider async or timers to avoid blocking the main thread.");

  // 6) TODOs and placeholders
  const todoCount = (code.match(/TODO/gi) || []).length;
  if (todoCount > 0) warn(`Found ${todoCount} TODO notes. Ensure they are resolved before production.`);

  // 7) Basic syntax check cues
  const unbalancedBraces = (code.match(/{/g)||[]).length !== (code.match(/}/g)||[]).length;
  if (unbalancedBraces) err("Unbalanced curly braces detected.");

  // 8) Missing ChatCommand attribute when command method present
  if (/void\s+Cmd\w+\s*\(\s*BasePlayer/.test(code) && !/\[ChatCommand\(/.test(code)) warn("Command-like method found but missing [ChatCommand(...)] attribute.");

  // 9) Link to lines if possible: find first match index
  function ok(msg){ results.push({ level:'ok', msg, line: guessLine(msg) }); }
  function warn(msg){ results.push({ level:'warn', msg, line: guessLine(msg) }); }
  function err(msg){ results.push({ level:'err', msg, line: guessLine(msg) }); }

  function guessLine(keyword){
    const k = String(keyword).split(' ')[0];
    for (let i=0;i<lines.length;i++){
      if (lines[i].includes(k)) return i+1;
    }
    return null;
  }

  return results;
}