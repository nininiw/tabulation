/* Admin page: create/open an event, see every judge's scores, the computation and the winners. */
'use strict';

const ui = {view:ls.get('admin-view', 'sheets'), sheetJudge:null, sheetCat:'uniform', resCat:'uniform', confirm:null};
const VIEWS = ['start','sheets','results','winners','setup'];

let seed = null;          // made from the admin PIN on this device; needed to build judges' personal links
const links = {};         // judgeId -> personal link
const judgeLink = jid => links[jid] || '';
// Give every judge a personal link key; only its hash is stored with the event.
async function syncKeys(){
  if(!seed || !T.eventCode) return;
  const base = new URL('index.html', location.href).href.split('#')[0];
  let changed = false;
  for(const j of T.CFG.judges){
    const key = await judgeKey(seed, j.id), h = await sha(key);
    links[j.id] = `${base}#${T.eventCode}/${j.id}.${key}`;
    if(j.keyHash !== h){ j.keyHash = h; changed = true; }
  }
  if(changed) queueCfg();
}
function header(){
  $('evTitle').textContent = T.eventCode ? (T.CFG.title || 'Power Dressing Icon 2026') : 'Power Dressing Icon 2026';
  $('evSub').textContent = T.eventCode ? (T.CFG.sub || '') : 'Create an event or open one you already made';
  $('codeChip').hidden = !T.eventCode; if(T.eventCode) $('codeChip').textContent = 'Event code ' + T.eventCode;
  document.title = T.eventCode ? `Admin · ${T.CFG.title}` : 'Tabulation Admin';
}
function render(){
  header();
  const open = !!T.eventCode;
  $('nav').hidden = !open;
  const view = open ? ui.view : 'start';
  VIEWS.forEach(v => $('v-' + v).hidden = v !== view);
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
  ({start:() => {}, sheets:renderSheets, results:renderResults, winners:renderWinners, setup:renderSetup})[view]();
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { ui.view = b.dataset.v; ui.confirm = null; ls.set('admin-view', ui.view); render(); });

/* ---------- Judges' scores ---------- */
function renderSheets(){
  const J = T.CFG.judges;
  $('progressTable').innerHTML = `<table><thead><tr><th style="text-align:left">Judge</th>${CATS.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>
    ${J.map(j => `<tr><td class="name">${esc(j.name)}</td>${CATS.map(c => { const [d, t] = countDone(j.id, c.id);
      return `<td><span class="status ${d === t ? 'done' : ''}">${d === t ? 'Complete' : `${d} of ${t}`}</span></td>`; }).join('')}</tr>`).join('')}
  </tbody></table>`;
  if(!J.find(j => j.id === ui.sheetJudge)) ui.sheetJudge = J[0]?.id ?? null;
  pills($('sheetJudge'), J.map(j => [j.id, j.name]), ui.sheetJudge, v => { ui.sheetJudge = v; renderSheets(); }, 'plum');
  pills($('sheetCat'), CATS.map(c => [c.id, c.name]), ui.sheetCat, v => { ui.sheetCat = v; renderSheets(); });
  if(!ui.sheetJudge){ $('sheetTables').innerHTML = '<div class="card plain"><div class="empty"><b>No judges yet</b>Add judges in Event Setup.</div></div>'; return; }
  const c = catOf(ui.sheetCat), jn = J.find(j => j.id === ui.sheetJudge).name;
  $('sheetTables').innerHTML = ['F','M'].map(g => {
    const body = Array.from({length:T.CFG.n[g]}, (_, i) => { const r = row(ui.sheetJudge, c.id, g, i);
      return `<tr>${nameCell(g, i)}${crit().map(cr => `<td class="num">${r[cr.id] ?? '<span class="muted">—</span>'}</td>`).join('')}
        <td class="tot">${judgeTotal(ui.sheetJudge, c.id, g, i) ?? '—'}</td></tr>`; }).join('');
    return `<div class="card ${g}"><h2>${G[g]} · ${esc(c.name)}<em>${esc(jn)}</em></h2><div class="scroll"><table>
      <thead><tr><th>No.</th>${critHead()}<th>Total<small>/${maxTotal()}</small></th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }).join('');
}

/* ---------- Computation ---------- */
function renderResults(){
  pills($('resCat'), CATS.map(c => [c.id, c.name]), ui.resCat, v => { ui.resCat = v; renderResults(); });
  const c = catOf(ui.resCat);
  $('resTables').innerHTML = ['F','M'].map(g => {
    const r = catResults(c.id, g);
    const body = Array.from({length:T.CFG.n[g]}, (_, i) => `<tr class="${r.rank[i] === 1 ? 'top' : ''}">${nameCell(g, i)}
      ${T.CFG.judges.map(j => `<td class="num">${judgeTotal(j.id, c.id, g, i) ?? '<span class="muted">—</span>'}</td>`).join('')}
      <td class="tot">${fmt(r.avg[i])}</td><td>${rankBadge(r.rank[i])}</td></tr>`).join('');
    return `<div class="card ${g}"><h2>${G[g]} · ${esc(c.name)}</h2><div class="scroll"><table>
      <thead><tr><th>No.</th>${T.CFG.judges.map(j => `<th>${esc(j.name)}</th>`).join('')}<th>Average</th><th>Rank</th></tr></thead>
      <tbody>${body}</tbody></table></div></div>`;
  }).join('');
  $('ovTables').innerHTML = ['F','M'].map(g => {
    const body = overall(g).map(r => `<tr class="${r.final === 1 ? 'top' : ''}">${nameCell(g, r.i)}
      ${CATS.map((_, x) => `<td class="num">${fmt(r.avgs[x])}</td><td class="num">${r.ranks[x] ?? '<span class="muted">—</span>'}</td>`).join('')}
      <td class="num">${fmt(r.meanRank)}</td><td>${rankBadge(r.final)}</td></tr>`).join('');
    return `<div class="card ${g}"><h2>${G[g]} · Overall</h2><div class="scroll"><table>
      <thead><tr><th>No.</th>${CATS.map(c => `<th>${esc(c.name)}<small>average</small></th><th>${esc(c.name)}<small>rank</small></th>`).join('')}<th>Ave. rank</th><th>Overall</th></tr></thead>
      <tbody>${body}</tbody></table></div></div>`;
  }).join('');
}

/* ---------- Winners ---------- */
function renderWinners(){
  const who = (g, list) => list.length ? list.map(i => candLabel(g, i)).join('<br>') : '<span class="muted">Pending</span>';
  let html = '<h3 class="sec">Power Dressing Icon</h3><div class="awards">';
  ['F','M'].forEach(g => {
    const ov = overall(g), allDone = ov.every(r => r.ok);
    PLACES.forEach((p, k) => {
      const w = ov.filter(r => r.final === k + 1);
      const text = w.length ? who(g, w.map(r => r.i)) : allDone ? '<span class="muted">None, tie in the place above</span>' : '<span class="muted">Pending</span>';
      html += `<div class="award ${g} ${k === 0 ? 'main' : ''}"><div class="t">${G[g]} · ${esc(p)}</div><div class="w">${text}</div>
        ${w.length ? `<div class="s">Average rank ${fmt(w[0].meanRank)} · average score ${fmt(w[0].meanScore)}</div>` : ''}</div>`;
    });
  });
  html += '</div><h3 class="sec">Special Citations</h3><div class="awards">';
  CATS.forEach(c => ['F','M'].forEach(g => {
    const r = catResults(c.id, g), w = r.rank.map((x, i) => x === 1 ? i : -1).filter(i => i >= 0);
    html += `<div class="award ${g}"><div class="t">${G[g]} · ${esc(c.award)}</div><div class="w">${who(g, w)}</div>${w.length ? `<div class="s">Average ${fmt(r.avg[w[0]])}</div>` : ''}</div>`;
  }));
  $('winners').innerHTML = html + '</div><p class="note">Winners appear once every judge has scored every contestant in both categories. Ties share a place.</p>';
}

/* ---------- Setup ---------- */
function renderSetup(){
  const setVal = (el, v) => { if(document.activeElement !== el) el.value = v; };
  setVal($('setTitle'), T.CFG.title); setVal($('setSub'), T.CFG.sub); setVal($('setNF'), T.CFG.n.F); setVal($('setNM'), T.CFG.n.M);
  $('rmJudge').disabled = T.CFG.judges.length <= 1;
  renderCriteria();
  if(!$('setJudges').contains(document.activeElement)){
    $('setJudges').innerHTML = T.CFG.judges.map((j, i) => `<div class="linkrow">
      <input id="jn-${esc(j.id)}" data-i="${i}" maxlength="40" value="${esc(j.name)}" aria-label="Judge ${i + 1} name">
      <code>${esc(judgeLink(j.id) || 'Preparing link…')}</code>
      <button class="btn plum sm" data-copy="${esc(j.id)}">Copy link</button></div>`).join('');
    $('setJudges').querySelectorAll('input').forEach(inp => inp.oninput = () => { T.CFG.judges[+inp.dataset.i].name = inp.value; header(); queueCfg(); });
    $('setJudges').querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(judgeLink(b.dataset.copy), b.previousElementSibling));
  }
  ['F','M'].forEach(g => {
    if($('setNames' + g).contains(document.activeElement)) return;
    $('setNames' + g).innerHTML = Array.from({length:T.CFG.n[g]}, (_, i) => `<label>Contestant #${i + 1}<input id="cn-${g}-${i}" data-i="${i}" maxlength="60" placeholder="Name (optional)" value="${esc(T.CFG.names[g]?.[i] || '')}"></label>`).join('');
    $('setNames' + g).querySelectorAll('input').forEach(inp => inp.oninput = () => { T.CFG.names[g] ??= []; T.CFG.names[g][+inp.dataset.i] = inp.value; queueCfg(); });
  });
  renderConfirms();
}
/* ---------- Criteria editor ---------- */
const anyScores = () => Object.values(T.SCORES).some(d => ['F','M'].some(g => Object.keys(d?.[g] || {}).length));
function critStatus(){
  const sum = maxTotal();
  $('critSum').textContent = `Total ${sum} points`;
  const msgs = [];
  if(sum !== 100) msgs.push(`The criteria add up to ${sum} points, not 100. Totals will be out of ${sum}.`);
  if(anyScores()) msgs.push('Judges have already entered scores. Changing points or removing a criterion changes their totals, and a newly added criterion must be scored by every judge before contestants are ranked again.');
  $('critWarn').textContent = msgs.join(' '); $('critWarn').hidden = !msgs.length;
}
function renderCriteria(){
  critStatus();
  if($('setCriteria').contains(document.activeElement)) return;
  const C = crit();
  $('setCriteria').innerHTML = C.map((c, i) => `<div class="critrow">
    <label>Criterion ${i + 1}<input id="crn-${esc(c.id)}" data-i="${i}" data-f="name" maxlength="60" value="${esc(c.name)}" placeholder="e.g. Presentation"></label>
    <label>Description<input id="crh-${esc(c.id)}" data-i="${i}" data-f="hint" maxlength="80" value="${esc(c.hint)}" placeholder="Optional, e.g. Poise, Bearing and Confidence"></label>
    <label>Max points<input id="crm-${esc(c.id)}" data-i="${i}" data-f="max" type="number" min="1" max="100" inputmode="numeric" value="${esc(c.max)}"></label>
    <button class="btn danger sm" data-rm="${esc(c.id)}" ${C.length <= 1 ? 'disabled' : ''}>Remove</button></div>`).join('')
    || '<div class="empty"><b>No criteria</b>Add at least one criterion.</div>';
  $('setCriteria').querySelectorAll('input').forEach(inp => inp.oninput = () => {
    const c = T.CFG.criteria[+inp.dataset.i], f = inp.dataset.f;
    if(f === 'max'){
      const v = parseInt(inp.value, 10), ok = v >= 1 && v <= 100;
      inp.classList.toggle('bad', !ok); if(!ok) return;
      c.max = v;
    }else c[f] = inp.value;
    critStatus(); queueCfg();
  });
  $('setCriteria').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { ui.confirm = 'crit:' + b.dataset.rm; renderConfirms(); });
}
$('addCrit').onclick = () => {
  T.CFG.criteria.push({id:'c' + Date.now().toString(36), name:'', hint:'', max:10});
  queueCfg(); renderCriteria();
  $('setCriteria').querySelector('.critrow:last-child input')?.focus();
};
$('resetCrit').onclick = () => { ui.confirm = 'critReset'; renderConfirms(); };

async function copy(text, el){
  try{ await navigator.clipboard.writeText(text); toast('Link copied'); }
  catch(e){ const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Press Ctrl/Cmd+C to copy'); }
}
function renderConfirms(){
  $('rmConfirm').innerHTML = ui.confirm === 'rm' ? `<div class="confirm">Remove ${esc(T.CFG.judges.at(-1)?.name)} and all of their scores?
    <button class="btn solid-danger" id="rmYes">Remove judge</button><button class="btn ghost" id="cNo1">Cancel</button></div>` : '';
  $('clearConfirm').innerHTML = ui.confirm === 'clear' ? `<div class="confirm">Erase every judge's scores for this event? This cannot be undone.
    <button class="btn solid-danger" id="clearYes">Erase all scores</button><button class="btn ghost" id="cNo2">Cancel</button></div>` : '';
  const cc = ui.confirm?.startsWith('crit:') ? T.CFG.criteria.find(c => 'crit:' + c.id === ui.confirm) : null;
  $('critConfirm').innerHTML = cc ? `<div class="confirm">Remove the criterion “${esc(cc.name || 'Untitled')}”? Totals will no longer include it.
    <button class="btn solid-danger" id="critYes">Remove criterion</button><button class="btn ghost" id="cNo3">Cancel</button></div>`
    : ui.confirm === 'critReset' ? `<div class="confirm">Replace the current criteria with the CDAP criteria (Presentation 40, Appropriateness of the Outfit 30, Attention to Details 30)?
    <button class="btn solid-danger" id="critYes">Restore criteria</button><button class="btn ghost" id="cNo3">Cancel</button></div>` : '';
  if($('critYes')) $('critYes').onclick = () => {
    if(cc) T.CFG.criteria = T.CFG.criteria.filter(c => c !== cc); else T.CFG.criteria = DEFAULT_CRITERIA();
    ui.confirm = null; queueCfg(); renderSetup(); toast(cc ? 'Criterion removed' : 'CDAP criteria restored');
  };
  if($('cNo3')) $('cNo3').onclick = () => { ui.confirm = null; renderConfirms(); };
  if($('rmYes')) $('rmYes').onclick = removeJudge;
  if($('clearYes')) $('clearYes').onclick = clearScores;
  ['cNo1','cNo2'].forEach(id => { if($(id)) $(id).onclick = () => { ui.confirm = null; renderConfirms(); }; });
}
$('setTitle').oninput = e => { T.CFG.title = e.target.value; header(); queueCfg(); };
$('setSub').oninput = e => { T.CFG.sub = e.target.value; header(); queueCfg(); };
['F','M'].forEach(g => $('setN' + g).onchange = e => { T.CFG.n[g] = Math.max(1, Math.min(30, parseInt(e.target.value) || 1)); e.target.value = T.CFG.n[g]; queueCfg(); renderSetup(); });
$('addJudge').onclick = async () => { T.CFG.judges.push({id:'j' + Date.now().toString(36), name:`Judge ${T.CFG.judges.length + 1}`}); await syncKeys(); queueCfg(); renderSetup(); };
$('rmJudge').onclick = () => { ui.confirm = 'rm'; renderConfirms(); };
$('clearAll').onclick = () => { ui.confirm = 'clear'; renderConfirms(); };
async function removeJudge(){
  const j = T.CFG.judges.pop(); ui.confirm = null; queueCfg();
  for(const c of CATS){ const k = `${j.id}-${c.id}`; delete T.SCORES[k]; try{ await T.eventRef.collection('scores').doc(k).delete(); }catch(e){} }
  render(); toast(`Removed ${j.name}`);
}
async function clearScores(){
  ui.confirm = null; const keys = Object.keys(T.SCORES); T.SCORES = {};
  for(const k of keys){ try{ await T.eventRef.collection('scores').doc(k).delete(); }catch(e){} }
  render(); toast('All scores erased');
}
$('leave').onclick = () => { ls.del('admin-event'); ls.del('admin-seed-' + T.eventCode); seed = null; closeEvent(); history.replaceState(null, '', location.pathname); render(); };

/* ---------- Exports ---------- */
function download(name, text, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function buildCsv(){
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`, C = T.CFG, L = [q(C.title)];
  CATS.forEach(c => ['F','M'].forEach(g => {
    L.push('', q(`${G[g].toUpperCase()} · ${c.name.toUpperCase()} · SCORESHEETS`));
    L.push(['Judge','No.','Name', ...crit().map(cr => `${cr.name} (${cr.max} pts)`), 'Total'].map(q).join(','));
    C.judges.forEach(j => { for(let i = 0; i < C.n[g]; i++){ const r = row(j.id, c.id, g, i); L.push([j.name, i + 1, C.names[g]?.[i] || '', ...crit().map(cr => r[cr.id]), judgeTotal(j.id, c.id, g, i)].map(q).join(',')); } });
    const res = catResults(c.id, g);
    L.push('', q(`${G[g].toUpperCase()} · ${c.name.toUpperCase()} · RESULTS`));
    L.push(['No.','Name', ...C.judges.map(j => j.name), 'Average', 'Rank'].map(q).join(','));
    for(let i = 0; i < C.n[g]; i++) L.push([i + 1, C.names[g]?.[i] || '', ...C.judges.map(j => judgeTotal(j.id, c.id, g, i)), res.avg[i] == null ? '' : res.avg[i].toFixed(2), res.rank[i]].map(q).join(','));
  }));
  ['F','M'].forEach(g => {
    L.push('', q(`${G[g].toUpperCase()} · OVERALL`));
    L.push(['No.','Name', ...CATS.map(c => c.name + ' Rank'), 'Average Rank', 'Overall', 'Title'].map(q).join(','));
    overall(g).forEach(r => L.push([r.i + 1, C.names[g]?.[r.i] || '', ...r.ranks, r.meanRank == null ? '' : r.meanRank.toFixed(2), r.final, PLACES[r.final - 1] || ''].map(q).join(',')));
  });
  return '﻿' + L.join('\r\n');
}
$('expCsv').onclick = () => download(`${(T.CFG.title || 'tabulation').replace(/[^\w-]+/g, '-')}-results.csv`, buildCsv(), 'text/csv');
$('expJson').onclick = () => download('tabulation-backup.json', JSON.stringify({code:T.eventCode, config:T.CFG, scores:T.SCORES}, null, 2), 'application/json');

/* ---------- Create / open ---------- */
async function enter(code, s){
  seed = s; ls.set('admin-event', code); ls.set('admin-seed-' + code, s); ls.del('admin-ok-' + code);
  await syncKeys();
  if(location.hash.slice(1) !== code) history.replaceState(null, '', '#' + code);
  render();
}
$('newForm').onsubmit = async e => {
  e.preventDefault(); showErr('newErr', '');
  const title = $('newTitle').value.trim(), pin = $('newPin').value.trim();
  if(!/^\d{4,12}$/.test(pin)){ showErr('newErr', 'Use a PIN of 4 to 12 digits.'); return; }
  const code = newCode();
  try{
    await T.fs.collection('events').doc(code).set({config:{...DEFAULT_CFG(), title: title || 'Power Dressing Icon 2026'}, pinHash: await hashPin(code, pin), created: Date.now()});
    await openEvent(code); ui.view = 'setup'; await enter(code, await linkSeed(code, pin));
    toast('Event created. Copy each judge their link.');
  }catch(err){ console.error(err); showErr('newErr', 'Could not create the event. Check your internet connection and the Firebase setup.'); }
};
$('openForm').onsubmit = async e => {
  e.preventDefault(); showErr('openErr', '');
  const code = cleanCode($('openCode').value), pin = $('openPin').value.trim();
  if(code.length < 8){ showErr('openErr', 'Event codes are 8 characters.'); return; }
  try{
    if(!(await openEvent(code))){ showErr('openErr', 'No event uses that code.'); return; }
    if(await hashPin(code, pin) !== T.pinHash){ closeEvent(); showErr('openErr', 'That PIN is not correct for this event.'); return; }
    $('openPin').value = ''; await enter(code, await linkSeed(code, pin));
  }catch(err){ console.error(err); showErr('openErr', 'Could not reach the server. Check your internet connection.'); }
};

// Live updates: redraw, but leave a setup field alone while it's being typed in
T.onChange = async () => {
  await syncKeys();
  const a = document.activeElement;
  if(ui.view === 'setup' && a && a.tagName === 'INPUT' && $('v-setup').contains(a)){ header(); return; }
  render();
};

(async () => {
  try{ await connect(); setSync('live', 'Online'); }
  catch(e){
    console.error(e); setSync('warn', 'Offline'); render();
    showBanner(e.message === 'not-configured' ? 'The online database is not set up. Add your Firebase settings to firebase-config.js.'
      : 'Could not connect to the online database. Check the internet connection, and that Anonymous sign-in is enabled in Firebase.');
    return;
  }
  const code = cleanCode(location.hash.slice(1)) || ls.get('admin-event');
  const savedSeed = code && ls.get('admin-seed-' + code);
  if(savedSeed){
    try{ if(await openEvent(code)){ await enter(code, savedSeed); return; } }catch(err){ console.error(err); }
    ls.del('admin-event');
  }else if(code){ $('openCode').value = code; }
  render();
})();
