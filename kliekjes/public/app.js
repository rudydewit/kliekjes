'use strict';

const $ = (sel) => document.querySelector(sel);
const el = {
  login: $('#login'), app: $('#app'), list: $('#list'), empty: $('#empty'),
  stats: $('#stats'), search: $('#search'), toast: $('#toast'), offline: $('#offline'),
  editor: $('#editor'), detail: $('#detail'), history: $('#history'),
  photoPreview: $('#photo-preview'), photoHint: $('#photo-hint'),
};

const state = { items: [], archived: [], who: localStorage.getItem('who') || '', editing: null, photo: undefined };

/* ------------------------------------------------------------------ util */

const MS_DAY = 86400000;
const todayStr = () => new Date().toISOString().slice(0, 10);

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / MS_DAY);
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' });
}

function freshness(item) {
  if (!item.best_before) return { label: `${daysBetween(item.frozen_on, todayStr())} dagen in de vriezer`, tone: 'fine', pct: 0 };
  const left = daysBetween(todayStr(), item.best_before);
  const span = Math.max(1, daysBetween(item.frozen_on, item.best_before));
  const pct = Math.min(100, Math.max(0, ((span - left) / span) * 100));
  if (left < 0) return { label: `${Math.abs(left)} dagen over datum`, tone: 'over', pct: 100 };
  if (left === 0) return { label: 'Vandaag opeten', tone: 'soon', pct };
  if (left <= 21) return { label: `Nog ${left} ${left === 1 ? 'dag' : 'dagen'}`, tone: 'soon', pct };
  return { label: `Beste voor ${fmtDate(item.best_before)}`, tone: 'fine', pct };
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.toast.hidden = true; }, 2600);
}

/* ------------------------------------------------------------------- api */

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) { showLogin(); throw new Error('Niet ingelogd.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
  return data;
}

/* ------------------------------------------------------------------ boot */

async function boot() {
  const session = await api('api/session').catch(() => ({ authed: false }));
  if (session.who && !state.who) {
    state.who = session.who;
    localStorage.setItem('who', session.who);
  }
  if (session.version) {
    document.getElementById('version').textContent = `Kliekjes ${session.version}`;
  }
  if (!session.authed) return showLogin();
  showApp();
  const cached = localStorage.getItem('items');
  if (cached) { state.items = JSON.parse(cached); render(); }
  await refresh();
}

function showLogin() {
  el.login.hidden = false;
  el.app.hidden = true;
  $('#login-who').value = state.who;
}

function showApp() {
  el.login.hidden = true;
  el.app.hidden = false;
}

async function refresh() {
  try {
    const data = await api('api/items');
    state.items = data.items;
    state.archived = data.archived;
    localStorage.setItem('items', JSON.stringify(data.items));
    el.offline.hidden = true;
  } catch (err) {
    if (err.message !== 'Niet ingelogd.') el.offline.hidden = false;
  }
  render();
}

/* ---------------------------------------------------------------- render */

function render() {
  const term = el.search.value.trim().toLowerCase();
  const items = term
    ? state.items.filter((i) => (i.name + ' ' + i.location + ' ' + i.notes).toLowerCase().includes(term))
    : state.items;

  el.list.innerHTML = '';
  items.forEach((item) => el.list.appendChild(card(item)));

  el.empty.hidden = items.length > 0;
  if (term && !items.length) {
    el.empty.querySelector('.empty-title').textContent = 'Niets gevonden.';
    el.empty.querySelector('p:last-child').textContent = 'Probeer een ander woord.';
  } else {
    el.empty.querySelector('.empty-title').textContent = 'De vriezer is leeg.';
    el.empty.querySelector('p:last-child').textContent = 'Maak een foto van je eerste kliekje.';
  }

  const portions = state.items.reduce((sum, i) => sum + i.portions, 0);
  const urgent = state.items.filter((i) => freshness(i).tone !== 'fine').length;
  el.stats.textContent = state.items.length
    ? `${state.items.length} gerechten · ${portions} porties${urgent ? ` · ${urgent} moet${urgent === 1 ? '' : 'en'} op` : ''}`
    : '';
}

function card(item) {
  const f = freshness(item);
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.className = 'card';
  btn.innerHTML = `
    ${item.photo
      ? `<img class="card-photo" src="photos/${item.photo}" alt="" loading="lazy">`
      : '<div class="card-photo blank">◍</div>'}
    <div class="card-main">
      <div class="card-name"></div>
      <div class="card-tag ${f.tone}"></div>
      <div class="card-meta"></div>
    </div>
    <div class="portions">${item.portions}×</div>
    <div class="bar"><i class="${f.tone}" style="width:${f.pct}%"></i></div>`;
  btn.querySelector('.card-name').textContent = item.name;
  btn.querySelector('.card-tag').textContent = f.label;
  btn.querySelector('.card-meta').textContent =
    [item.location, `ingevroren ${fmtDate(item.frozen_on)}`].filter(Boolean).join(' · ');
  btn.addEventListener('click', () => openDetail(item.id));
  li.appendChild(btn);
  return li;
}

/* ---------------------------------------------------------------- detail */

function openDetail(id) {
  const item = state.items.find((i) => i.id === id) || state.archived.find((i) => i.id === id);
  if (!item) return;
  state.editing = item.id;
  const f = freshness(item);

  el.detail.querySelector('h2').textContent = item.archived_at ? 'Opgegeten' : 'In de vriezer';
  $('#detail-body').innerHTML = `
    <div class="hero">${item.photo
      ? `<img src="photos/${item.photo}" alt="">`
      : '<div class="hero-empty">Geen foto</div>'}</div>
    <h3 class="detail-name"></h3>
    <div class="facts">
      <div class="fact"><span>Porties</span><span>${item.portions}</span></div>
      <div class="fact"><span>Plek</span><span class="v-loc"></span></div>
      <div class="fact"><span>Ingevroren</span><span>${fmtDate(item.frozen_on)}</span></div>
      <div class="fact"><span>Beste voor</span><span>${fmtDate(item.best_before)} · ${f.label}</span></div>
      ${item.notes ? '<div class="fact"><span>Notitie</span><span class="v-notes"></span></div>' : ''}
      ${item.created_by ? '<div class="fact"><span>Ingevroren door</span><span class="v-by"></span></div>' : ''}
    </div>
    ${item.archived_at
      ? '<button class="btn btn-secondary" id="restore-btn">Terugzetten in de vriezer</button>'
      : '<button class="btn btn-primary" id="take-btn">Eén portie eruit</button>'}`;

  $('#detail-body').querySelector('.detail-name').textContent = item.name;
  $('#detail-body').querySelector('.v-loc').textContent = item.location || '—';
  if (item.notes) $('#detail-body').querySelector('.v-notes').textContent = item.notes;
  if (item.created_by) $('#detail-body').querySelector('.v-by').textContent = item.created_by;

  const take = $('#take-btn');
  if (take) take.addEventListener('click', () => takePortion(item));
  const restore = $('#restore-btn');
  if (restore) restore.addEventListener('click', () => restoreItem(item));

  open(el.detail);
}

async function takePortion(item) {
  try {
    const { item: updated } = await api(`api/items/${item.id}/take`, {
      method: 'POST', body: { amount: 1, who: state.who },
    });
    close(el.detail);
    await refresh();
    toast(updated.archived_at
      ? `${item.name} is op.`
      : `Nog ${updated.portions} ${updated.portions === 1 ? 'portie' : 'porties'} ${item.name}.`);
  } catch (err) { toast(err.message); }
}

async function restoreItem(item) {
  try {
    await api(`api/items/${item.id}/restore`, { method: 'POST', body: { portions: 1, who: state.who } });
    close(el.detail); close(el.history);
    await refresh();
    toast(`${item.name} staat weer in de lijst.`);
  } catch (err) { toast(err.message); }
}

/* ---------------------------------------------------------------- editor */

function openEditor(item) {
  state.editing = item ? item.id : null;
  state.photo = undefined;

  $('#editor-title').textContent = item ? 'Kliekje wijzigen' : 'Nieuw kliekje';
  $('#f-name').value = item ? item.name : '';
  $('#f-portions').value = item ? item.portions : 2;
  $('#f-location').value = item ? item.location : '';
  $('#f-frozen').value = item ? item.frozen_on : todayStr();
  $('#f-best').value = item && item.best_before ? item.best_before : addMonths(todayStr(), 3);
  $('#f-notes').value = item ? item.notes : '';
  $('#delete-btn').hidden = !item;

  setPreview(item && item.photo ? `photos/${item.photo}` : null);
  renderQuickDates();
  open(el.editor);
}

function renderQuickDates() {
  const wrap = $('#quick-best');
  wrap.innerHTML = '';
  [[1, '1 maand'], [3, '3 maanden'], [6, '6 maanden'], [12, '1 jaar']].forEach(([m, label]) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = label;
    const target = addMonths($('#f-frozen').value || todayStr(), m);
    b.setAttribute('aria-pressed', String($('#f-best').value === target));
    b.addEventListener('click', () => {
      $('#f-best').value = addMonths($('#f-frozen').value || todayStr(), m);
      renderQuickDates();
    });
    wrap.appendChild(b);
  });
}

function setPreview(src) {
  el.photoPreview.hidden = !src;
  el.photoHint.hidden = !!src;
  $('#photo-clear').hidden = !src;
  $('#btn-camera').textContent = src ? 'Opnieuw' : 'Foto maken';
  $('#btn-gallery').textContent = src ? 'Andere kiezen' : 'Uit galerij';
  if (src) el.photoPreview.src = src;
}

/* Twee losse velden: eentje vraagt de camera, eentje de galerij. Android kiest
   anders zelf welk van de twee je krijgt. */
async function handlePick(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    state.photo = await shrink(file);
    setPreview(state.photo);
  } catch { toast('Deze foto lukte niet. Probeer een andere.'); }
  e.target.value = '';
}

$('#photo-camera').addEventListener('change', handlePick);
$('#photo-gallery').addEventListener('change', handlePick);
$('#btn-gallery').addEventListener('click', () => $('#photo-gallery').click());

/* ------------------------------------------------------------ camera ---
   Het capture-attribuut is een verzoek dat Android mag negeren; dan krijg je
   alsnog de fotokiezer. Met getUserMedia openen we de camera zelf. Dat vereist
   wel een beveiligde verbinding (https of localhost) — lukt het niet, dan
   vallen we terug op het invoerveld. */

let camStream = null;
let camFacing = 'environment';

function cameraAvailable() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function openCamera() {
  if (!cameraAvailable()) {
    toast('Live camera vereist een https-verbinding. Je krijgt de fotokiezer.');
    $('#photo-camera').click();
    return;
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: camFacing, width: { ideal: 1920 } },
      audio: false,
    });
  } catch (err) {
    if (err && err.name === 'NotAllowedError') {
      toast('Geen toegang tot de camera. Je krijgt de fotokiezer.');
    } else {
      toast('Camera niet beschikbaar. Je krijgt de fotokiezer.');
    }
    $('#photo-camera').click();
    return;
  }
  $('#cam-video').srcObject = camStream;
  open($('#camera'));
}

function closeCamera() {
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  camStream = null;
  $('#cam-video').srcObject = null;
  close($('#camera'));
}

function grabFrame(video, max = 1280, quality = 0.75) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

$('#btn-camera').addEventListener('click', openCamera);
$('#cam-cancel').addEventListener('click', closeCamera);

$('#cam-shoot').addEventListener('click', () => {
  const video = $('#cam-video');
  if (!video.videoWidth) return toast('De camera is nog aan het opstarten.');
  state.photo = grabFrame(video);
  setPreview(state.photo);
  closeCamera();
});

$('#cam-flip').addEventListener('click', async () => {
  camFacing = camFacing === 'environment' ? 'user' : 'environment';
  closeCamera();
  await openCamera();
});

$('#photo-clear').addEventListener('click', () => { state.photo = null; setPreview(null); });

function shrink(file, max = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

$('#save-btn').addEventListener('click', async () => {
  const name = $('#f-name').value.trim();
  if (!name) return toast('Geef het gerecht een naam.');

  const body = {
    name,
    portions: Number($('#f-portions').value) || 0,
    location: $('#f-location').value.trim(),
    frozen_on: $('#f-frozen').value || todayStr(),
    best_before: $('#f-best').value || null,
    notes: $('#f-notes').value.trim(),
    who: state.who,
  };
  if (state.photo !== undefined) body.photo = state.photo;

  try {
    if (state.editing) await api(`api/items/${state.editing}`, { method: 'PATCH', body });
    else await api('api/items', { method: 'POST', body });
    close(el.editor); close(el.detail);
    await refresh();
    toast(state.editing ? 'Wijzigingen bewaard.' : `${name} ligt in de vriezer.`);
  } catch (err) { toast(err.message); }
});

$('#delete-btn').addEventListener('click', async () => {
  if (!state.editing || !confirm('Dit kliekje definitief verwijderen?')) return;
  try {
    await api(`api/items/${state.editing}?who=${encodeURIComponent(state.who)}`, { method: 'DELETE' });
    close(el.editor); close(el.detail);
    await refresh();
    toast('Verwijderd.');
  } catch (err) { toast(err.message); }
});

$('#edit-btn').addEventListener('click', () => {
  const item = state.items.find((i) => i.id === state.editing) || state.archived.find((i) => i.id === state.editing);
  if (item) openEditor(item);
});

$('#f-frozen').addEventListener('change', renderQuickDates);

/* --------------------------------------------------------------- history */

$('#tab-history').addEventListener('click', async () => {
  open(el.history);
  const archived = $('#archived');
  archived.innerHTML = '';
  state.archived.forEach((item) => {
    const li = card(item);
    li.querySelector('.card').classList.add('gone');
    archived.appendChild(li);
  });
  if (!state.archived.length) archived.innerHTML = '<li class="log"><span>Nog niets opgegeten.</span></li>';

  try {
    const { events } = await api('api/events');
    $('#events').innerHTML = '';
    events.forEach((ev) => {
      const li = document.createElement('li');
      const when = new Date(ev.at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
      li.innerHTML = '<span><b></b> <i></i></span><span></span>';
      li.querySelector('b').textContent = ev.item_name;
      li.querySelector('i').textContent = ev.action + (ev.who ? ` door ${ev.who}` : '');
      li.querySelector('span:last-child').textContent = when;
      $('#events').appendChild(li);
    });
  } catch { /* offline: laat de lijst leeg */ }
});

/* ------------------------------------------------------- back-up ------ */

$('#export-btn').addEventListener('click', async () => {
  try {
    const res = await fetch('api/export');
    if (!res.ok) throw new Error('Exporteren lukte niet.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kliekjes-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Bestand gedownload.');
  } catch (err) { toast(err.message); }
});

$('#import-btn').addEventListener('click', () => $('#import-file').click());

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const res = await api('api/import', { method: 'POST', body: data });
    close(el.history);
    await refresh();
    toast(res.added
      ? `${res.added} kliekjes toegevoegd${res.skipped ? `, ${res.skipped} stonden er al` : ''}.`
      : 'Alles stond er al in.');
  } catch (err) {
    toast(err instanceof SyntaxError ? 'Dit is geen geldig exportbestand.' : err.message);
  }
});

/* ----------------------------------------------------------------- login */

$('#login-btn').addEventListener('click', async () => {
  const password = $('#login-pass').value;
  const who = $('#login-who').value.trim();
  const err = $('#login-err');
  err.hidden = true;
  try {
    await api('api/login', { method: 'POST', body: { password } });
    state.who = who;
    localStorage.setItem('who', who);
    $('#login-pass').value = '';
    showApp();
    await refresh();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
});

$('#login-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#login-btn').click(); });

/* ----------------------------------------------------------- sheet logic */

function open(sheet) { sheet.hidden = false; }
function close(sheet) { sheet.hidden = true; }

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => close(btn.closest('.sheet')));
});

$('#add-btn').addEventListener('click', () => openEditor(null));
el.search.addEventListener('input', render);

window.addEventListener('online', refresh);
window.addEventListener('offline', () => { el.offline.hidden = false; });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !el.app.hidden) refresh(); });

// Onder ingress wisselt het pad per sessie; een service worker heeft daar geen zin.
if ('serviceWorker' in navigator && location.pathname === '/') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
