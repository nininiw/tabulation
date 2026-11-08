/* Judge page: a judge only sees and fills in their own scoresheet, reached by their personal link. */
'use strict';

const ui = {judge:null, key:null, cat:ls.get('judge-cat', 'uniform')};
const badVals = {};   // input id -> out-of-range text not yet saved

function show(view){
  ['link','score'].forEach(v => $('v-' + v).hidden = v !== view);
  $('saveBar').hidden = view !== 'score';
  document.body.classList.toggle('has-savebar', view === 'score');
}
function header(){
  $('evTitle').textContent = T.CFG.title || 'Power Dressing Icon 2026';
  $('evSub').textContent = T.CFG.sub || '';
  const me = ui.ok ? T.CFG.judges.find(j => j.id === ui.judge) : null;
  $('judgeChip').hidden = !me; if(me) $('judgeChip').textContent = me.name;
  document.title = me ? `${me.name} · Scoresheet` : 'Judge Scoresheet';
}
function denied(msg){ ui.ok = false; header(); $('linkMsg').textContent = msg; show('link'); }

// Is this judge still on the panel, and does the key in the link match theirs?
async function verified(){
  const me = T.CFG.judges.find(j => j.id === ui.judge);
  return !!(me && me.keyHash && ui.key && await sha(ui.key) === me.keyHash);
}
async function render(){
  header();
  if(!T.eventCode || !ui.judge){ denied('Open the personal scoring link the organizer sent you. Each judge has their own link.'); return; }
  if(!(await verified())){ denied('This scoring link is not valid. Ask the organizer for your personal scoring link.'); return; }
  ui.ok = true; header(); show('score'); renderScore();
}

function renderScore(){
  const me = T.CFG.judges.find(j => j.id === ui.judge);
  pills($('catPills'), CATS.map(c => [c.id, c.name]), ui.cat, v => { ui.cat = v; ls.set('judge-cat', v); for(const k in badVals) delete badVals[k]; renderScore(); });
  const c = catOf(ui.cat) || CATS[0]; ui.cat = c.id;
  $('scoreTables').innerHTML = ['F','M'].map(g => {
    const body = Array.from({length:T.CFG.n[g]}, (_, i) => {
      const r = row(ui.judge, c.id, g, i), t = judgeTotal(ui.judge, c.id, g, i);
      return `<tr>${nameCell(g, i)}${crit().map(cr => { const v = r[cr.id];
        return `<td><input class="sc ${v != null && v > cr.max ? 'bad' : ''}" id="in-${g}-${i}-${esc(cr.id)}" type="number" inputmode="decimal" min="0" max="${cr.max}" step="0.5"
        data-g="${g}" data-i="${i}" data-k="${esc(cr.id)}" value="${v ?? ''}" aria-label="${G[g]} #${i + 1} ${esc(cr.name)}, out of ${cr.max}"></td>`; }).join('')}
        <td class="tot" id="t-${g}-${i}">${t ?? '—'}</td></tr>`;
    }).join('');
    return `<div class="card ${g}"><h2>${G[g]} · ${esc(c.name)}<em>${esc(me.name)}</em></h2><div class="scroll"><table>
      <thead><tr><th>No.</th>${critHead()}<th>Total<small>/${maxTotal()}</small></th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }).join('');
  $('critNote').textContent = 'Score each criterion up to its maximum: ' + crit().map(cr => `${cr.name || 'Untitled'} up to ${cr.max}`).join(', ') + '.';
  progress();
  // keep out-of-range entries visible (and red) across redraws so the judge can correct them
  for(const [id, v] of Object.entries(badVals)){ const el = $(id); if(el){ el.value = v; el.classList.add('bad'); } }
  $('scoreTables').querySelectorAll('input.sc').forEach(inp => {
    inp.oninput = () => onInput(inp, c);
    inp.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); const all = [...document.querySelectorAll('input.sc')]; all[all.indexOf(inp) + 1]?.focus(); } };
  });
}
function progress(){ const [d, t] = countDone(ui.judge, ui.cat); $('scoreProgress').textContent = `${d} of ${t} contestants scored`; }

function onInput(inp, c){
  const g = inp.dataset.g, i = +inp.dataset.i, cid = inp.dataset.k, cr = crit().find(x => x.id === cid);
  if(!cr) return;
  const v = inp.value === '' ? null : parseFloat(inp.value);
  const bad = v != null && (isNaN(v) || v < 0 || v > cr.max);
  inp.classList.toggle('bad', bad); inp.title = bad ? `Enter a score from 0 to ${cr.max}` : '';
  if(bad){ badVals[inp.id] = inp.value; return; }
  delete badVals[inp.id];
  const key = `${ui.judge}-${c.id}`;
  T.SCORES[key] ??= {F:{}, M:{}}; T.SCORES[key][g] ??= {};
  T.SCORES[key][g][i] = {...row(ui.judge, c.id, g, i), [cid]: v};
  $(`t-${g}-${i}`).textContent = judgeTotal(ui.judge, c.id, g, i) ?? '—';
  setSaveState('Saving automatically…', '');
  progress(); queueScore(key);
}

/* ---------- Save button ---------- */
function setSaveState(text, cls){ const s = $('saveState'); s.textContent = text; s.className = 'savestate ' + cls; }
const timeNow = () => new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
$('saveBtn').onclick = async () => {
  const btn = $('saveBtn');
  const red = document.querySelectorAll('input.sc.bad').length;
  const keys = CATS.map(c => `${ui.judge}-${c.id}`).filter(k => T.SCORES[k]);
  if(!keys.length && !red){ setSaveState('Nothing to save yet. Enter your scores first.', 'warn'); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  try{
    if(keys.length) await saveNow(keys);
    if(red){ setSaveState(`Saved at ${timeNow()}, except ${red} score${red > 1 ? 's' : ''} in red. Fix ${red > 1 ? 'them' : 'it'} and save again.`, 'warn'); toast('Fix the scores in red'); }
    else { setSaveState(`All scores saved at ${timeNow()}`, 'ok'); toast('Scores saved'); }
  }catch(e){
    console.error(e);
    setSaveState('Could not reach the server. Your scores are kept on this page and will save when the connection is back.', 'warn');
  }finally{ btn.disabled = false; btn.textContent = 'Save scores'; }
};

// Live updates without disturbing the box being typed in.
// If the admin changed the criteria or the judges, redraw and put the cursor back.
let sig = '';
T.onChange = async () => {
  const a = document.activeElement, s = JSON.stringify([crit(), T.CFG.judges]);
  const changed = sig !== '' && s !== sig; sig = s;
  if(!$('v-score').hidden && a && a.classList.contains('sc') && !changed){
    header();
    document.querySelectorAll('input.sc').forEach(inp => {
      if(inp === a || inp.classList.contains('bad')) return;
      const v = row(ui.judge, ui.cat, inp.dataset.g, +inp.dataset.i)[inp.dataset.k] ?? '';
      if(inp.value !== String(v)) inp.value = v;
    });
    return;
  }
  const focusId = a?.classList.contains('sc') ? a.id : null;
  await render();
  if(focusId) $(focusId)?.focus();
};

/* ---------- Start: the personal link is #EVENTCODE/judgeId.key ---------- */
async function start(){
  let [hc, hj] = location.hash.slice(1).split('/');
  let code = cleanCode(hc), [jid, key] = String(hj || '').split('.');
  if(!code || !jid || !key){                       // reopened without the link: use the one saved on this device
    const saved = ls.get('judge-link');
    if(saved){ code = saved.code; jid = saved.jid; key = saved.key; }
  }
  if(!code || !jid || !key){ denied('Open the personal scoring link the organizer sent you. Each judge has their own link.'); return; }
  ui.judge = jid; ui.key = key;
  try{
    if(!(await openEvent(code))){ ls.del('judge-link'); denied('The event in this link no longer exists. Check with the organizer.'); return; }
  }catch(e){ console.error(e); denied('Could not reach the server. Check your internet connection and reload.'); return; }
  if(await verified()){
    ls.set('judge-link', {code, jid, key});
    const h = `${code}/${jid}.${key}`; if(location.hash.slice(1) !== h) history.replaceState(null, '', '#' + h);
  }
  await render();
}
window.addEventListener('hashchange', () => { if(T.fs) start(); });

(async () => {
  try{ await connect(); setSync('live', 'Online'); }
  catch(e){
    console.error(e); setSync('warn', 'Offline'); denied('Could not connect. Check your internet connection and reload the page.');
    if(e.message === 'not-configured') showBanner('The online database is not set up yet. Ask the organizer to add the Firebase settings.');
    return;
  }
  start();
})();
