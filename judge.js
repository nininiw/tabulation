/* Judge page: a judge only sees and fills in their own scoresheet. */
'use strict';

const ui = {judge:null, cat:ls.get('judge-cat', 'uniform')};
const badVals = {};   // input id -> out-of-range text not yet saved

function show(view){ ['code','who','score'].forEach(v => $('v-' + v).hidden = v !== view); }
function header(){
  $('evTitle').textContent = T.CFG.title || 'Power Dressing Icon 2026';
  $('evSub').textContent = T.CFG.sub || '';
  const me = T.CFG.judges.find(j => j.id === ui.judge);
  $('judgeChip').hidden = !me; if(me) $('judgeChip').textContent = me.name;
  document.title = me ? `${me.name} · Scoresheet` : 'Judge Scoresheet';
}
function setHash(){ const h = T.eventCode + (ui.judge ? '/' + ui.judge : ''); if(location.hash.slice(1) !== h) history.replaceState(null, '', '#' + h); }

function render(){
  header();
  if(!T.eventCode){ show('code'); return; }
  if(!T.CFG.judges.find(j => j.id === ui.judge)){ ui.judge = null; renderWho(); show('who'); return; }
  show('score'); renderScore();
}
function renderWho(){
  $('whoList').innerHTML = T.CFG.judges.map(j => `<button data-id="${esc(j.id)}">${esc(j.name)}</button>`).join('')
    || '<div class="empty"><b>No judges yet</b>The organizer has not added judges.</div>';
  $('whoList').querySelectorAll('button').forEach(b => b.onclick = () => {
    ui.judge = b.dataset.id; ls.set('judge-id-' + T.eventCode, ui.judge); setHash(); render();
  });
}
function renderScore(){
  const me = T.CFG.judges.find(j => j.id === ui.judge);
  $('meName').textContent = me.name;
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
  $('critNote').textContent = 'Score each criterion up to its maximum: ' + crit().map(cr => `${cr.name || 'Untitled'} up to ${cr.max}`).join(', ') + '. Scores save automatically as you type.';
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
  progress(); queueScore(key);
}

// Live updates without disturbing the box being typed in.
// If the admin changed the criteria, redraw the sheet and put the cursor back.
let critSig = '';
T.onChange = () => {
  const a = document.activeElement, sig = JSON.stringify(crit());
  const critChanged = critSig !== '' && sig !== critSig; critSig = sig;
  if(!$('v-score').hidden && a && a.classList.contains('sc') && !critChanged){
    header();
    document.querySelectorAll('input.sc').forEach(inp => {
      if(inp === a || inp.classList.contains('bad')) return;
      const v = row(ui.judge, ui.cat, inp.dataset.g, +inp.dataset.i)[inp.dataset.k] ?? '';
      if(inp.value !== String(v)) inp.value = v;
    });
    return;
  }
  const focusId = a?.classList.contains('sc') ? a.id : null;
  render();
  if(focusId) $(focusId)?.focus();
  if(critChanged && !$('v-score').hidden) toast('The organizer updated the criteria');
};

$('switchJudge').onclick = e => { e.preventDefault(); ui.judge = null; ls.del('judge-id-' + T.eventCode); setHash(); render(); };
$('codeForm').onsubmit = async e => {
  e.preventDefault(); showErr('codeErr', '');
  const code = cleanCode($('codeInput').value);
  if(code.length < 8){ showErr('codeErr', 'Event codes are 8 characters. Check the code and try again.'); return; }
  try{
    if(!(await openEvent(code))){ showErr('codeErr', 'No event uses that code. Check it with the organizer.'); return; }
    ls.set('judge-event', code); ui.judge = ls.get('judge-id-' + code); setHash(); render();
  }catch(err){ console.error(err); showErr('codeErr', 'Could not reach the server. Check your internet connection and try again.'); }
};

async function start(){
  const [hc, hj] = location.hash.slice(1).split('/');
  const code = cleanCode(hc) || ls.get('judge-event');
  if(!code){ render(); return; }
  try{
    if(await openEvent(code)){
      ls.set('judge-event', code);
      ui.judge = hj || ls.get('judge-id-' + code);
      if(hj) ls.set('judge-id-' + code, hj);
      setHash();
    }else{ ls.del('judge-event'); showErr('codeErr', 'The event in this link no longer exists. Check the code with the organizer.'); }
  }catch(e){ console.error(e); showErr('codeErr', 'Could not reach the server. Check your internet connection and reload.'); }
  render();
}
window.addEventListener('hashchange', () => { if(T.fs) start(); });

(async () => {
  try{ await connect(); setSync('live', 'Online'); }
  catch(e){
    console.error(e); setSync('warn', 'Offline'); show('code');
    showBanner(e.message === 'not-configured' ? 'The online database is not set up yet. Ask the organizer to add the Firebase settings.'
      : 'Could not connect. Check your internet connection and reload the page.');
    return;
  }
  start();
})();
