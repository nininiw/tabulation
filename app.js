/* Pageant Tabulation — criteria, weights and formulas follow TABULATION.xlsx */
'use strict';

const CATS = [
  {id:'smart', name:'Smart Casual', award:'Best in Smart Casual', crit:[
    ['Visual Impact',30],['Fit & Grooming',30],['Poise & Personality',40]]},
  {id:'corporate', name:'Corporate Attire', award:'Best in Corporate Attire', crit:[
    ['Executive Impact',40],['Technical Fit & Grooming',30],['Poise & Carriage',30]]},
  {id:'spokes', name:'Spokesmodel', award:'Best Spokesmodel', crit:[
    ['Interview / Public Speaking',40],['Stage Presentation / Walk',20],['Overall Aesthetic / Fit',20],['Personality / Connection',20]]}
];
const G = {F:'Female', M:'Male'};
const DEFAULT_CFG = () => ({title:'Pageant Tabulation', sub:'Official scoring & results',
  judges:[{id:'j1',name:'Judge 1'},{id:'j2',name:'Judge 2'},{id:'j3',name:'Judge 3'}],
  n:{F:7,M:7}, names:{F:[],M:[]}});

/* ---------- State ---------- */
let CFG = DEFAULT_CFG();
let SCORES = {};                 // "<judgeId>-<cat>" -> {F:{i:[...]}, M:{i:[...]}}
let fs = null, eventRef = null, eventCode = null, pinHash = null;
let mode = 'local';              // 'cloud' | 'local'
let organizer = false;
const ui = {view:'score', judge:null, cat:'smart', resCat:'smart', confirm:null};
const unsubs = [];

const ls = {
  get(k, d=null){ try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const catOf = id => CATS.find(c => c.id === id);
const fmt = v => v == null ? '—' : v.toFixed(2);
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); }
function setSync(cls, text){ const s = $('sync'); s.className = 'chip sync ' + cls; s.textContent = text; }
function showBanner(t){ $('banner').textContent = t; $('banner').hidden = !t; }
function showErr(id, t){ $(id).textContent = t; $(id).hidden = !t; }

function row(jid, c, g, i){ return SCORES[`${jid}-${c}`]?.[g]?.[i] || []; }

/* ---------- Tabulation formulas ---------- */
// TOTAL = SUM(criteria) — blank if any criterion is blank
function judgeTotal(jid, c, g, i){
  const r = row(jid, c, g, i), n = catOf(c).crit.length; let s = 0;
  for(let k = 0; k < n; k++){ const v = r[k]; if(v == null || v === '' || isNaN(v)) return null; s += +v; }
  return s;
}
// AVE = AVERAGE(judge totals) — only when every judge is complete
function catAverage(c, g, i){
  if(!CFG.judges.length) return null;
  const t = CFG.judges.map(j => judgeTotal(j.id, c, g, i));
  return t.some(v => v == null) ? null : t.reduce((a, b) => a + b, 0) / t.length;
}
// RANK.EQ(value, range, 0)
function rankEq(vals){ return vals.map(v => v == null ? null : 1 + vals.filter(o => o != null && o > v + 1e-9).length); }
function catResults(c, g){ const avg = Array.from({length:CFG.n[g]}, (_, i) => catAverage(c, g, i)); return {avg, rank:rankEq(avg)}; }
function overall(g){
  const per = CATS.map(c => catResults(c.id, g));
  const rows = Array.from({length:CFG.n[g]}, (_, i) => {
    const ranks = per.map(p => p.rank[i]), avgs = per.map(p => p.avg[i]), ok = ranks.every(r => r != null);
    return {i, ranks, ok, meanRank: ok ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null,
            meanScore: ok ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null};
  });
  rows.forEach(r => { r.final = r.ok ? 1 + rows.filter(o => o.ok && (o.meanRank < r.meanRank - 1e-9 ||
      (Math.abs(o.meanRank - r.meanRank) < 1e-9 && o.meanScore > r.meanScore + 1e-9))).length : null; });
  return rows;
}

/* ---------- Rendering ---------- */
function pills(el, items, cur, onPick, cls=''){
  el.innerHTML = items.map(([v, t]) => `<button class="pill ${cls} ${v === cur ? 'on' : ''}" data-v="${esc(v)}">${esc(t)}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => onPick(b.dataset.v));
}
const rankBadge = r => r == null ? '<span class="muted">—</span>' : `<span class="rank ${r <= 3 ? 'r' + r : ''}">${r}</span>`;
const nameCell = (g, i) => { const nm = CFG.names[g]?.[i]; return `<td class="name">#${i + 1}${nm ? `<span>${esc(nm)}</span>` : ''}</td>`; };
const candLabel = (g, i) => { const nm = CFG.names[g]?.[i]; return `Candidate #${i + 1}${nm ? ' · ' + esc(nm) : ''}`; };
function countDone(jid, c){ let d = 0, t = 0; ['F','M'].forEach(g => { for(let i = 0; i < CFG.n[g]; i++){ t++; if(judgeTotal(jid, c, g, i) != null) d++; } }); return [d, t]; }

function renderScore(){
  if(!CFG.judges.find(j => j.id === ui.judge)) ui.judge = CFG.judges[0]?.id ?? null;
  pills($('judgePills'), CFG.judges.map(j => [j.id, j.name || 'Unnamed judge']), ui.judge, v => { ui.judge = v; ls.set('tab-judge', v); renderScore(); }, 'plum');
  pills($('catPills'), CATS.map(c => [c.id, c.name]), ui.cat, v => { ui.cat = v; renderScore(); });
  if(!ui.judge){ $('scoreTables').innerHTML = `<div class="card plain"><div class="empty"><b>No judges yet</b>Add judges in Setup to start scoring.</div></div>`; $('scoreProgress').textContent = ''; return; }
  const c = catOf(ui.cat), jname = CFG.judges.find(j => j.id === ui.judge).name;
  $('scoreTables').innerHTML = ['F','M'].map(g => {
    const head = c.crit.map(([n, w]) => `<th>${esc(n)}<small>${w}%</small></th>`).join('');
    const body = Array.from({length:CFG.n[g]}, (_, i) => {
      const r = row(ui.judge, c.id, g, i), t = judgeTotal(ui.judge, c.id, g, i);
      return `<tr>${nameCell(g, i)}${c.crit.map(([n, w], k) => `<td><input class="sc" id="in-${g}-${i}-${k}" type="number" inputmode="decimal" min="0" max="${w}" step="0.5"
        data-g="${g}" data-i="${i}" data-k="${k}" value="${r[k] ?? ''}" aria-label="${G[g]} #${i + 1} ${esc(n)}, out of ${w}"></td>`).join('')}
        <td class="tot" id="t-${g}-${i}">${t ?? '—'}</td></tr>`;
    }).join('');
    return `<div class="card ${g}"><h2>${G[g]} · ${esc(c.name)}<em>${esc(jname)}</em></h2><div class="scroll"><table>
      <thead><tr><th>No.</th>${head}<th>Total<small>/100</small></th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }).join('');
  const [d, t] = countDone(ui.judge, c.id); $('scoreProgress').textContent = `${d} of ${t} candidates complete`;
  $('scoreTables').querySelectorAll('input.sc').forEach(inp => {
    inp.oninput = () => onScoreInput(inp, c);
    inp.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); const all = [...document.querySelectorAll('input.sc')]; all[all.indexOf(inp) + 1]?.focus(); } };
  });
}

function onScoreInput(inp, c){
  const g = inp.dataset.g, i = +inp.dataset.i, k = +inp.dataset.k, max = c.crit[k][1];
  const v = inp.value === '' ? null : parseFloat(inp.value);
  const bad = v != null && (isNaN(v) || v < 0 || v > max);
  inp.classList.toggle('bad', bad); inp.title = bad ? `Enter a score from 0 to ${max}` : '';
  if(bad) return;
  const key = `${ui.judge}-${c.id}`;
  SCORES[key] ??= {F:{}, M:{}}; SCORES[key][g] ??= {};
  const r = [...(SCORES[key][g][i] || [])]; while(r.length < c.crit.length) r.push(null); r[k] = v;
  SCORES[key][g][i] = r;
  $(`t-${g}-${i}`).textContent = judgeTotal(ui.judge, c.id, g, i) ?? '—';
  const [d, t] = countDone(ui.judge, c.id); $('scoreProgress').textContent = `${d} of ${t} candidates complete`;
  queueScore(key);
}

function renderResults(){
  pills($('resCatPills'), CATS.map(c => [c.id, c.name]), ui.resCat, v => { ui.resCat = v; renderResults(); });
  const c = catOf(ui.resCat);
  $('resTables').innerHTML = ['F','M'].map(g => {
    const r = catResults(c.id, g);
    const body = Array.from({length:CFG.n[g]}, (_, i) => `<tr class="${r.rank[i] === 1 ? 'top' : ''}">${nameCell(g, i)}
      ${CFG.judges.map(j => `<td class="num">${judgeTotal(j.id, c.id, g, i) ?? '<span class="muted">—</span>'}</td>`).join('')}
      <td class="tot">${fmt(r.avg[i])}</td><td>${rankBadge(r.rank[i])}</td></tr>`).join('');
    return `<div class="card ${g}"><h2>${G[g]} · ${esc(c.name)}</h2><div class="scroll"><table>
      <thead><tr><th>No.</th>${CFG.judges.map(j => `<th>${esc(j.name)}</th>`).join('')}<th>Average</th><th>Rank</th></tr></thead>
      <tbody>${body}</tbody></table></div></div>`;
  }).join('');
}

function renderOverall(){
  $('ovTables').innerHTML = ['F','M'].map(g => {
    const body = overall(g).map(r => `<tr class="${r.final === 1 ? 'top' : ''}">${nameCell(g, r.i)}
      ${r.ranks.map(x => `<td class="num">${x ?? '<span class="muted">—</span>'}</td>`).join('')}
      <td class="num">${fmt(r.meanRank)}</td><td>${rankBadge(r.final)}</td></tr>`).join('');
    return `<div class="card ${g}"><h2>${G[g]} · Overall</h2><div class="scroll"><table>
      <thead><tr><th>No.</th>${CATS.map(c => `<th>${esc(c.name)}<small>rank</small></th>`).join('')}<th>Ave. rank</th><th>Overall</th></tr></thead>
      <tbody>${body}</tbody></table></div></div>`;
  }).join('');
  const who = (g, list) => list.length ? list.map(i => candLabel(g, i)).join('<br>') : '<span class="muted">Pending</span>';
  let html = '';
  ['F','M'].forEach(g => { html += `<div class="award ${g}"><div class="t">${G[g]} · Overall Winner</div><div class="w">${who(g, overall(g).filter(r => r.final === 1).map(r => r.i))}</div></div>`; });
  CATS.forEach(c => ['F','M'].forEach(g => {
    const r = catResults(c.id, g), w = r.rank.map((x, i) => x === 1 ? i : -1).filter(i => i >= 0);
    html += `<div class="award ${g}"><div class="t">${G[g]} · ${esc(c.award)}</div><div class="w">${who(g, w)}</div>${w.length ? `<div class="s">Average ${fmt(r.avg[w[0]])}</div>` : ''}</div>`;
  }));
  $('awards').innerHTML = html;
}

function shareUrl(){ return location.origin + location.pathname + '#' + eventCode; }
function renderSetup(){
  $('shareCard').hidden = mode !== 'cloud';
  if(mode === 'cloud') $('shareLink').textContent = shareUrl();
  $('leaveRow').hidden = mode !== 'cloud';
  $('unlockCard').hidden = organizer;
  $('setupBody').hidden = !organizer;
  if(!organizer) return;
  const setVal = (el, v) => { if(document.activeElement !== el) el.value = v; };
  setVal($('setTitle'), CFG.title); setVal($('setSub'), CFG.sub); setVal($('setNF'), CFG.n.F); setVal($('setNM'), CFG.n.M);
  $('rmJudge').disabled = CFG.judges.length <= 1;
  if(!$('setJudges').contains(document.activeElement)){
    $('setJudges').innerHTML = CFG.judges.map((j, i) => `<label>Judge ${i + 1}<input id="jn-${j.id}" data-i="${i}" maxlength="40" value="${esc(j.name)}"></label>`).join('');
    $('setJudges').querySelectorAll('input').forEach(inp => inp.oninput = () => { CFG.judges[+inp.dataset.i].name = inp.value; queueCfg(); });
  }
  ['F','M'].forEach(g => {
    if($('setNames' + g).contains(document.activeElement)) return;
    $('setNames' + g).innerHTML = Array.from({length:CFG.n[g]}, (_, i) => `<label>Candidate #${i + 1}<input id="cn-${g}-${i}" data-i="${i}" maxlength="60" placeholder="Optional name" value="${esc(CFG.names[g]?.[i] || '')}"></label>`).join('');
    $('setNames' + g).querySelectorAll('input').forEach(inp => inp.oninput = () => { CFG.names[g] ??= []; CFG.names[g][+inp.dataset.i] = inp.value; queueCfg(); });
  });
  renderConfirms();
}
function renderConfirms(){
  $('rmConfirm').innerHTML = ui.confirm === 'rm' ? `<div class="confirm">Remove ${esc(CFG.judges.at(-1)?.name)} and all of their scores?
    <button class="btn solid-danger" id="rmYes">Remove judge</button><button class="btn ghost" id="cNo1">Cancel</button></div>` : '';
  $('clearConfirm').innerHTML = ui.confirm === 'clear' ? `<div class="confirm">Erase every judge's scores for this event? This cannot be undone.
    <button class="btn solid-danger" id="clearYes">Erase all scores</button><button class="btn ghost" id="cNo2">Cancel</button></div>` : '';
  if($('rmYes')) $('rmYes').onclick = removeJudge;
  if($('clearYes')) $('clearYes').onclick = clearScores;
  ['cNo1','cNo2'].forEach(id => { if($(id)) $(id).onclick = () => { ui.confirm = null; renderConfirms(); }; });
}

function renderHeader(){
  $('evTitle').textContent = CFG.title || 'Pageant Tabulation'; $('evSub').textContent = CFG.sub || '';
  document.title = CFG.title || 'Pageant Tabulation';
  $('codeChip').hidden = !eventCode; if(eventCode) $('codeChip').textContent = 'Event code ' + eventCode;
}
function render(){
  renderHeader();
  const joined = mode === 'local' || !!eventCode;
  $('nav').hidden = !joined;
  if(!joined){ ['score','results','overall','setup'].forEach(v => $('v-' + v).hidden = true); $('v-join').hidden = false; return; }
  $('v-join').hidden = true;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === ui.view));
  ['score','results','overall','setup'].forEach(v => $('v-' + v).hidden = v !== ui.view);
  ({score:renderScore, results:renderResults, overall:renderOverall, setup:renderSetup})[ui.view]();
}
// Remote updates: don't disturb the field being typed in
function softRender(){
  const a = document.activeElement;
  if(a && a.tagName === 'INPUT' && (a.classList.contains('sc') || $('v-setup').contains(a))){
    if(ui.view === 'score'){
      const c = catOf(ui.cat);
      document.querySelectorAll('input.sc').forEach(inp => {
        if(inp === a || inp.classList.contains('bad')) return;
        const v = row(ui.judge, c.id, inp.dataset.g, +inp.dataset.i)[+inp.dataset.k] ?? '';
        if(inp.value !== String(v)) inp.value = v;
      });
      ['F','M'].forEach(g => { for(let i = 0; i < CFG.n[g]; i++){ const el = $(`t-${g}-${i}`); if(el) el.textContent = judgeTotal(ui.judge, c.id, g, i) ?? '—'; } });
    }
    renderHeader(); return;
  }
  render();
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { ui.view = b.dataset.v; ui.confirm = null; ls.set('tab-view', ui.view); render(); });

/* ---------- Saving ---------- */
const dirty = new Set(), writing = new Set(), timers = {};
let cfgTimer = null, cfgDirty = false, cfgWriting = false;

function saveLocal(){ ls.set('tab-local', {CFG, SCORES}); }
function queueScore(key){
  if(mode === 'local'){ saveLocal(); setSync('', 'Saved on this device'); return; }
  dirty.add(key); setSync('warn', 'Saving…');
  clearTimeout(timers[key]); timers[key] = setTimeout(() => flushScore(key), 500);
}
async function flushScore(key){
  if(writing.has(key)){ timers[key] = setTimeout(() => flushScore(key), 300); return; }
  dirty.delete(key); writing.add(key);
  try{
    await eventRef.collection('scores').doc(key).set(JSON.parse(JSON.stringify(SCORES[key] || {F:{}, M:{}})));
    if(!dirty.size && !cfgDirty) setSync('live', 'Live · all changes saved');
  }catch(e){
    console.error(e); dirty.add(key); setSync('warn', 'Not saved yet, retrying');
    timers[key] = setTimeout(() => flushScore(key), 2500 + Math.random() * 1000);
  }finally{ writing.delete(key); }
}
function queueCfg(){
  renderHeader();
  if(mode === 'local'){ saveLocal(); return; }
  cfgDirty = true; setSync('warn', 'Saving…');
  clearTimeout(cfgTimer); cfgTimer = setTimeout(flushCfg, 500);
}
async function flushCfg(){
  if(cfgWriting){ cfgTimer = setTimeout(flushCfg, 300); return; }
  cfgDirty = false; cfgWriting = true;
  try{ await eventRef.set({config: JSON.parse(JSON.stringify(CFG))}, {merge:true}); if(!dirty.size) setSync('live', 'Live · all changes saved'); }
  catch(e){ console.error(e); cfgDirty = true; setSync('warn', 'Setup not saved, retrying'); cfgTimer = setTimeout(flushCfg, 3000); }
  finally{ cfgWriting = false; }
}

async function removeJudge(){
  const j = CFG.judges.pop(); ui.confirm = null;
  const keys = CATS.map(c => `${j.id}-${c.id}`); keys.forEach(k => delete SCORES[k]);
  queueCfg();
  if(mode === 'cloud') for(const k of keys){ try{ await eventRef.collection('scores').doc(k).delete(); }catch(e){} }
  render(); toast(`Removed ${j.name}`);
}
async function clearScores(){
  ui.confirm = null; const keys = Object.keys(SCORES); SCORES = {};
  if(mode === 'cloud') for(const k of keys){ try{ await eventRef.collection('scores').doc(k).delete(); }catch(e){} }
  else saveLocal();
  render(); toast('All scores erased');
}

/* ---------- Setup inputs ---------- */
$('setTitle').oninput = e => { CFG.title = e.target.value; queueCfg(); };
$('setSub').oninput = e => { CFG.sub = e.target.value; queueCfg(); };
['F','M'].forEach(g => $('setN' + g).onchange = e => { CFG.n[g] = Math.max(1, Math.min(30, parseInt(e.target.value) || 1)); e.target.value = CFG.n[g]; queueCfg(); renderSetup(); });
$('addJudge').onclick = () => { CFG.judges.push({id:'j' + Date.now().toString(36), name:`Judge ${CFG.judges.length + 1}`}); queueCfg(); renderSetup(); };
$('rmJudge').onclick = () => { ui.confirm = 'rm'; renderConfirms(); };
$('clearAll').onclick = () => { ui.confirm = 'clear'; renderConfirms(); };
$('copyLink').onclick = async () => {
  try{ await navigator.clipboard.writeText(shareUrl()); toast('Link copied'); }
  catch(e){ const r = document.createRange(); r.selectNodeContents($('shareLink')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Press Ctrl/Cmd+C to copy'); }
};
$('leaveEvent').onclick = () => {
  unsubs.splice(0).forEach(u => u()); ls.del('tab-event'); eventCode = null; eventRef = null; organizer = false;
  CFG = DEFAULT_CFG(); SCORES = {}; history.replaceState(null, '', location.pathname); setSync('live', 'Online'); render();
};

/* ---------- Exports ---------- */
function download(name, text, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function buildCsv(){
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const L = [q(CFG.title)];
  CATS.forEach(c => ['F','M'].forEach(g => {
    const r = catResults(c.id, g);
    L.push('', q(`${G[g].toUpperCase()} CATEGORY ${c.name.toUpperCase()}`));
    L.push(['No.','Name', ...CFG.judges.map(j => j.name), 'Average', 'Rank'].map(q).join(','));
    for(let i = 0; i < CFG.n[g]; i++) L.push([i + 1, CFG.names[g]?.[i] || '', ...CFG.judges.map(j => judgeTotal(j.id, c.id, g, i)), r.avg[i] == null ? '' : r.avg[i].toFixed(2), r.rank[i]].map(q).join(','));
  }));
  ['F','M'].forEach(g => {
    L.push('', q(`${G[g].toUpperCase()} CATEGORY OVERALL`));
    L.push(['No.','Name', ...CATS.map(c => c.name + ' Rank'), 'Average Rank', 'Overall'].map(q).join(','));
    overall(g).forEach(r => L.push([r.i + 1, CFG.names[g]?.[r.i] || '', ...r.ranks, r.meanRank == null ? '' : r.meanRank.toFixed(2), r.final].map(q).join(',')));
  });
  return '﻿' + L.join('\r\n');
}
$('expCsv').onclick = () => download('tabulation-results.csv', buildCsv(), 'text/csv');
$('expJson').onclick = () => download('tabulation-backup.json', JSON.stringify({config:CFG, scores:SCORES}, null, 2), 'application/json');

/* ---------- Events (cloud) ---------- */
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ALPH[b % ALPH.length]).join('');
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function hashPin(code, pin){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code + ':' + pin));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

async function openEvent(code){
  unsubs.splice(0).forEach(u => u());
  const ref = fs.collection('events').doc(code);
  const snap = await ref.get();
  if(!snap.exists) return false;
  eventCode = code; eventRef = ref; ls.set('tab-event', code);
  if(location.hash.slice(1) !== code) history.replaceState(null, '', '#' + code);
  organizer = ls.get('tab-org-' + code) === true;
  applyEvent(snap.data());
  unsubs.push(ref.onSnapshot(s => {
    if(!s.exists || cfgDirty || cfgWriting) return;
    applyEvent(s.data()); softRender();
  }, onDbError));
  unsubs.push(ref.collection('scores').onSnapshot(qs => {
    const seen = new Set();
    qs.docs.forEach(d => { seen.add(d.id); if(dirty.has(d.id) || writing.has(d.id)) return; SCORES[d.id] = d.data(); });
    Object.keys(SCORES).forEach(k => { if(!seen.has(k) && !dirty.has(k) && !writing.has(k)) delete SCORES[k]; });
    if(!dirty.size && !cfgDirty) setSync('live', 'Live · all changes saved');
    softRender();
  }, onDbError));
  render();
  return true;
}
function applyEvent(d){ CFG = {...DEFAULT_CFG(), ...(d.config || {})}; CFG.names ??= {F:[], M:[]}; pinHash = d.pinHash || null; }
function onDbError(e){ console.error(e); setSync('warn', 'Connection lost. Reload the page'); }

$('joinForm').onsubmit = async e => {
  e.preventDefault(); showErr('joinErr', '');
  const code = cleanCode($('joinCode').value);
  if(code.length < 8){ showErr('joinErr', 'Event codes are 8 characters. Check the code and try again.'); return; }
  try{ if(!(await openEvent(code))) showErr('joinErr', 'No event uses that code. Check it with the organizer.'); }
  catch(err){ console.error(err); showErr('joinErr', 'Could not reach the server. Check your internet connection and try again.'); }
};
$('newForm').onsubmit = async e => {
  e.preventDefault(); showErr('newErr', '');
  const title = $('newTitle').value.trim(), pin = $('newPin').value.trim();
  if(!/^\d{4,12}$/.test(pin)){ showErr('newErr', 'Use a PIN of 4 to 12 digits.'); return; }
  const code = newCode(), cfg = {...DEFAULT_CFG(), title: title || 'Pageant Tabulation'};
  try{
    await fs.collection('events').doc(code).set({config: cfg, pinHash: await hashPin(code, pin), created: Date.now()});
    ls.set('tab-org-' + code, true);
    ui.view = 'setup';
    await openEvent(code);
    toast('Event created. Share the link with your judges.');
  }catch(err){ console.error(err); showErr('newErr', 'Could not create the event. Check your internet connection and the Firebase setup.'); }
};
$('unlockForm').onsubmit = async e => {
  e.preventDefault(); showErr('unlockErr', '');
  const h = await hashPin(eventCode, $('unlockPin').value.trim());
  if(h !== pinHash){ showErr('unlockErr', 'That PIN is not correct.'); return; }
  organizer = true; ls.set('tab-org-' + eventCode, true); $('unlockPin').value = ''; renderSetup();
};

/* ---------- Boot ---------- */
(async function boot(){
  ui.view = ls.get('tab-view', 'score'); ui.judge = ls.get('tab-judge', null);
  const cfg = window.FIREBASE_CONFIG;
  const cloudReady = cfg && cfg.apiKey && !/^PASTE/.test(cfg.apiKey) && window.firebase;
  if(!cloudReady){
    mode = 'local'; organizer = true;
    const l = ls.get('tab-local'); if(l){ CFG = {...DEFAULT_CFG(), ...l.CFG}; SCORES = l.SCORES || {}; }
    setSync('', 'Single-device mode');
    showBanner(window.firebase ? 'Online sync is not set up yet, so scores are saved in this browser only. Add your Firebase settings to firebase-config.js to let judges score from their own devices.'
                               : 'Could not load the online sync service, so scores are saved in this browser only.');
    render(); return;
  }
  mode = 'cloud'; setSync('warn', 'Connecting…'); render();
  try{
    firebase.initializeApp(cfg);
    await firebase.auth().signInAnonymously();
    fs = firebase.firestore();
    try{ await fs.enablePersistence({synchronizeTabs:true}); }catch(e){}
    setSync('live', 'Online');
  }catch(e){
    console.error(e); setSync('warn', 'Offline');
    showBanner('Could not connect to the online database. Check the internet connection, and that Anonymous sign-in is enabled in Firebase.');
    return;
  }
  const code = cleanCode(location.hash.slice(1)) || ls.get('tab-event');
  if(code){
    try{ if(!(await openEvent(code))){ ls.del('tab-event'); render(); showErr('joinErr', 'The event in this link no longer exists.'); } }
    catch(e){ console.error(e); render(); }
  } else render();
})();
window.addEventListener('hashchange', () => { const c = cleanCode(location.hash.slice(1)); if(fs && c && c !== eventCode) openEvent(c).catch(console.error); });
