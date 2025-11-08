const KEY_PREFIX = 'rpsai:';
const KEY_API = KEY_PREFIX + 'openai_key';
const KEY_SETTINGS = KEY_PREFIX + 'settings';
const KEY_AUTOSAVE = KEY_PREFIX + 'autosave';
const KEY_SNAPSHOTS = KEY_PREFIX + 'snapshots';
const KEY_HISTORY = KEY_PREFIX + 'history';
const KEY_CHANGELOG = KEY_PREFIX + 'changelog';

export const storage = {
  getApiKey(){ return localStorage.getItem(KEY_API) || ''; },
  setApiKey(v){ localStorage.setItem(KEY_API, v || ''); },
  clearApiKey(){ localStorage.removeItem(KEY_API); },

  getSettings(){
    try { return JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}'); }
    catch { return {}; }
  },
  setSettings(obj){
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(obj || {}));
  },

  getAutosave(){ return localStorage.getItem(KEY_AUTOSAVE) || ''; },
  setAutosave(text){ localStorage.setItem(KEY_AUTOSAVE, text || ''); },

  getSnapshots(){
    try { return JSON.parse(localStorage.getItem(KEY_SNAPSHOTS) || '[]'); }
    catch { return []; }
  },
  addSnapshot(snap){
    const arr = storage.getSnapshots();
    arr.unshift(snap);
    localStorage.setItem(KEY_SNAPSHOTS, JSON.stringify(arr.slice(0, 100)));
  },
  setSnapshots(arr){
    localStorage.setItem(KEY_SNAPSHOTS, JSON.stringify(arr || []));
  },

  getHistory(){
    try { return JSON.parse(localStorage.getItem(KEY_HISTORY) || '[]'); }
    catch { return []; }
  },
  setHistory(arr){
    localStorage.setItem(KEY_HISTORY, JSON.stringify(arr || []));
  },
  addHistory(entry){
    const arr = storage.getHistory();
    arr.unshift(entry);
    storage.setHistory(arr.slice(0, 200));
  },

  getChangelog(){
    try { return JSON.parse(localStorage.getItem(KEY_CHANGELOG) || '[]'); }
    catch { return []; }
  },
  addChangelog(entry){
    const arr = storage.getChangelog();
    arr.unshift(entry);
    localStorage.setItem(KEY_CHANGELOG, JSON.stringify(arr.slice(0, 500)));
  }
};