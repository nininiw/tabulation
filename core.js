/* Shared by the admin and judge pages: criteria, formulas, and live sync with Firebase. */
'use strict';

/* ---------- Criteria for Judging (CDAP, LPU-Batangas) ---------- */
const CRITERIA = [
  {name:'Presentation', hint:'Poise, Bearing and Confidence', max:40},
  {name:'Appropriateness of the Outfit', hint:'', max:30},
  {name:'Attention to Details', hint:'Make-up, shoes, accessories', max:30}
];
const CATS = [
  {id:'uniform',   name:'School Uniform',   award:'Best in School Uniform'},
  {id:'corporate', name:'Corporate Attire', award:'Best in Corporate Attire'}
];
const PLACES = ['Power Dressing Icon 2026', 'Power Dressing Icon 1st Runner-up', 'Power Dressing Icon 2nd Runner-up'];
const G = {F:'Female', M:'Male'};
const DEFAULT_CFG = () => ({title:'Power Dressing Icon 2026', sub:'Career Development, Alumni and Placement',
  judges:[{id:'j1',name:'Judge 1'},{id:'j2',name:'Judge 2'},{id:'j3',name:'Judge 3'}],
  n:{F:7,M:7}, names:{F:[],M:[]}});

const T = {
  CFG: DEFAULT_CFG(),
  SCORES: {},          // "<judgeId>-<cat>" -> {F:{i:[...]}, M:{i:[...]}}
  fs: null, eventRef: null, eventCode: null, pinHash: null,
  onChange: () => {}, unsubs: []
};

/* ---------- Helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const catOf = id => CATS.find(c => c.id === id);
const fmt = v => v == null ? '—' : v.toFixed(2);
const ls = {
  get(k, d=null){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); }
function setSync(cls, text){ const s = $('sync'); if(!s) return; s.className = 'chip sync ' + cls; s.textContent = text; }
function showErr(id, t){ $(id).textContent = t; $(id).hidden = !t; }
function showBanner(t){ $('banner').textContent = t; $('banner').hidden = !t; }
function pills(el, items, cur, onPick, cls=''){
  el.innerHTML = items.map(([v, t]) => `<button class="pill ${cls} ${v === cur ? 'on' : ''}" data-v="${esc(v)}">${esc(t)}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => onPick(b.dataset.v));
}
const nameCell = (g, i) => { const nm = T.CFG.names[g]?.[i]; return `<td class="name">#${i + 1}${nm ? `<span>${esc(nm)}</span>` : ''}</td>`; };
const candLabel = (g, i) => { const nm = T.CFG.names[g]?.[i]; return `Contestant #${i + 1}${nm ? ' · ' + esc(nm) : ''}`; };
const rankBadge = r => r == null ? '<span class="muted">—</span>' : `<span class="rank ${r <= 3 ? 'r' + r : ''}">${r}</span>`;
const critHead = () => CRITERIA.map(c => `<th>${esc(c.name)}${c.hint ? `<span class="hint">${esc(c.hint)}</span>` : ''}<small>${c.max}%</small></th>`).join('');

/* ---------- Formulas ---------- */
function row(jid, c, g, i){ return T.SCORES[`${jid}-${c}`]?.[g]?.[i] || []; }
// TOTAL = SUM(criteria); blank until every criterion has a score
function judgeTotal(jid, c, g, i){
  const r = row(jid, c, g, i); let s = 0;
  for(let k = 0; k < CRITERIA.length; k++){ const v = r[k]; if(v == null || v === '' || isNaN(v)) return null; s += +v; }
  return s;
}
// AVERAGE = AVERAGE(all judges' totals); blank until every judge is done
function catAverage(c, g, i){
  if(!T.CFG.judges.length) return null;
  const t = T.CFG.judges.map(j => judgeTotal(j.id, c, g, i));
  return t.some(v => v == null) ? null : t.reduce((a, b) => a + b, 0) / t.length;
}
// RANK.EQ(value, range, 0): highest = 1, ties share a rank
function rankEq(vals){ return vals.map(v => v == null ? null : 1 + vals.filter(o => o != null && o > v + 1e-9).length); }
function catResults(c, g){ const avg = Array.from({length:T.CFG.n[g]}, (_, i) => catAverage(c, g, i)); return {avg, rank:rankEq(avg)}; }
// OVERALL: rank of AVERAGE(category ranks), lowest first; tie -> higher average score
function overall(g){
  const per = CATS.map(c => catResults(c.id, g));
  const rows = Array.from({length:T.CFG.n[g]}, (_, i) => {
    const ranks = per.map(p => p.rank[i]), avgs = per.map(p => p.avg[i]), ok = ranks.every(r => r != null);
    return {i, ranks, avgs, ok, meanRank: ok ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null,
            meanScore: ok ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null};
  });
  rows.forEach(r => { r.final = r.ok ? 1 + rows.filter(o => o.ok && (o.meanRank < r.meanRank - 1e-9 ||
      (Math.abs(o.meanRank - r.meanRank) < 1e-9 && o.meanScore > r.meanScore + 1e-9))).length : null; });
  return rows;
}
function countDone(jid, c){ let d = 0, t = 0; ['F','M'].forEach(g => { for(let i = 0; i < T.CFG.n[g]; i++){ t++; if(judgeTotal(jid, c, g, i) != null) d++; } }); return [d, t]; }

/* ---------- Firebase ---------- */
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ALPH[b % ALPH.length]).join('');
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function hashPin(code, pin){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code + ':' + pin));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
async function connect(){
  const cfg = window.FIREBASE_CONFIG;
  if(!cfg || !cfg.apiKey || /^PASTE/.test(cfg.apiKey) || !window.firebase) throw new Error('not-configured');
  if(!firebase.apps.length) firebase.initializeApp(cfg);
  await firebase.auth().signInAnonymously();
  T.fs = firebase.firestore();
}
function applyEvent(d){ T.CFG = {...DEFAULT_CFG(), ...(d.config || {})}; T.CFG.names ??= {F:[], M:[]}; T.pinHash = d.pinHash || null; }
async function openEvent(code){
  closeEvent();
  const ref = T.fs.collection('events').doc(code);
  const snap = await ref.get();
  if(!snap.exists) return false;
  T.eventCode = code; T.eventRef = ref; applyEvent(snap.data());
  T.unsubs.push(ref.onSnapshot(s => {
    if(!s.exists || cfgDirty || cfgWriting) return;
    applyEvent(s.data()); T.onChange('config');
  }, onDbError));
  T.unsubs.push(ref.collection('scores').onSnapshot(qs => {
    const seen = new Set();
    qs.docs.forEach(d => { seen.add(d.id); if(dirty.has(d.id) || writing.has(d.id)) return; T.SCORES[d.id] = d.data(); });
    Object.keys(T.SCORES).forEach(k => { if(!seen.has(k) && !dirty.has(k) && !writing.has(k)) delete T.SCORES[k]; });
    if(!dirty.size && !cfgDirty) setSync('live', 'Live · all changes saved');
    T.onChange('scores');
  }, onDbError));
  return true;
}
function closeEvent(){ T.unsubs.splice(0).forEach(u => u()); T.eventCode = null; T.eventRef = null; T.SCORES = {}; T.CFG = DEFAULT_CFG(); }
function onDbError(e){ console.error(e); setSync('warn', 'Connection lost. Reload the page'); }

/* ---------- Saving (debounced, one write at a time per document) ---------- */
const dirty = new Set(), writing = new Set(), timers = {};
let cfgTimer = null, cfgDirty = false, cfgWriting = false;
function queueScore(key){
  dirty.add(key); setSync('warn', 'Saving…');
  clearTimeout(timers[key]); timers[key] = setTimeout(() => flushScore(key), 400);
}
async function flushScore(key){
  if(writing.has(key)){ timers[key] = setTimeout(() => flushScore(key), 300); return; }
  dirty.delete(key); writing.add(key);
  try{
    await T.eventRef.collection('scores').doc(key).set(JSON.parse(JSON.stringify(T.SCORES[key] || {F:{}, M:{}})));
    if(!dirty.size && !cfgDirty) setSync('live', 'Live · all changes saved');
  }catch(e){
    console.error(e); dirty.add(key); setSync('warn', 'Not saved yet, retrying');
    timers[key] = setTimeout(() => flushScore(key), 2500 + Math.random() * 1000);
  }finally{ writing.delete(key); }
}
function queueCfg(){
  cfgDirty = true; setSync('warn', 'Saving…');
  clearTimeout(cfgTimer); cfgTimer = setTimeout(flushCfg, 500);
}
async function flushCfg(){
  if(cfgWriting){ cfgTimer = setTimeout(flushCfg, 300); return; }
  cfgDirty = false; cfgWriting = true;
  try{ await T.eventRef.set({config: JSON.parse(JSON.stringify(T.CFG))}, {merge:true}); if(!dirty.size) setSync('live', 'Live · all changes saved'); }
  catch(e){ console.error(e); cfgDirty = true; setSync('warn', 'Setup not saved, retrying'); cfgTimer = setTimeout(flushCfg, 3000); }
  finally{ cfgWriting = false; }
}
function hasUnsaved(){ return dirty.size > 0 || writing.size > 0 || cfgDirty || cfgWriting; }
window.addEventListener('beforeunload', e => { if(hasUnsaved()){ e.preventDefault(); e.returnValue = ''; } });
