'use strict';

const STORAGE_KEY = 'rowerowy-niezbednik';
const TABS = ['dziennik', 'tempo', 'zawody', 'narzedzia', 'checklista'];
const DAY = 86400000;

// Próg (m) ignorujący szum wysokości z GPS przy liczeniu przewyższenia.
const ELE_THRESHOLD = 3;
// Poniżej tej prędkości (m/s) odcinek GPX traktujemy jako postój.
const MIN_MOVING_SPEED = 1;
// Prognoza Open-Meteo sięga 16 dni naprzód.
const FORECAST_DAYS = 15;

const DEFAULT_CHECKLIST = [
  'Numer startowy i agrafki',
  'Licencja / dokument tożsamości',
  'Kask',
  'Okulary',
  'Buty i rękawiczki',
  'Strój dopasowany do pogody',
  'Bidony z napojem',
  'Żele i batony',
  'Sprawdzone ciśnienie w oponach',
  'Dętka, łyżki i pompka / CO₂',
  'Multitool',
  'Naładowany licznik / GPS',
  'Naładowany telefon',
  'Krem z filtrem',
  'Ubranie na przebranie po mecie'
];

const GEAR_PRESETS = [
  ['Łańcuch', 3000],
  ['Opona tylna', 3500],
  ['Opona przednia', 5000],
  ['Klocki hamulcowe', 2000],
  ['Kaseta', 9000],
  ['Owijka', 6000]
];

const ICON = {
  edit: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
};

/* ---------- Narzędzia ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const optNum = v => { const n = num(v); return n > 0 ? n : null; };
const coord = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pad = n => String(n).padStart(2, '0');
const empty = text => `<p class="empty">${text}</p>`;

const nf0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });

function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
}

const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISODate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isISODate = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
const fmtDate = s => parseISODate(s).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = d => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
const today0 = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((b - a) / DAY);

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  return x;
}

function fmtDuration(sec) {
  sec = Math.round(sec);
  if (!(sec > 0)) return '—';
  return `${Math.floor(sec / 3600)}:${pad(Math.floor(sec % 3600 / 60))}:${pad(sec % 60)}`;
}

function fmtDelta(sec) {
  const s = Math.abs(Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return (sec < 0 ? '−' : '+') + (h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`);
}

function fmtClock(sec) {
  sec = Math.round(sec);
  const days = Math.floor(sec / 86400);
  const s = sec % 86400;
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}${days ? ` <span class="muted">+${days} d</span>` : ''}`;
}

function readDuration(prefix) {
  const s = $(`#${prefix}S`) ? num($(`#${prefix}S`).value) : 0;
  return Math.max(0, num($(`#${prefix}H`).value) * 3600 + num($(`#${prefix}M`).value) * 60 + s);
}

function setDuration(prefix, sec) {
  sec = Math.round(sec);
  $(`#${prefix}H`).value = sec > 0 ? Math.floor(sec / 3600) : '';
  $(`#${prefix}M`).value = sec > 0 ? Math.floor(sec % 3600 / 60) : '';
  $(`#${prefix}S`).value = sec > 0 ? sec % 60 : '';
}

function statTile(label, value, unit, sub, accent = false) {
  return `<div class="stat${accent ? ' accent' : ''}">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ''}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}

function setPressed(selector, active) {
  document.querySelectorAll(selector).forEach(b => b.setAttribute('aria-pressed', String(b === active)));
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- Dane ---------- */

function defaultChecklist() {
  return DEFAULT_CHECKLIST.map(text => ({ id: uid(), text, done: false }));
}

function normalizeResult(res) {
  if (!res || typeof res !== 'object') return null;
  const out = { time: Math.max(0, num(res.time)), place: optNum(res.place), cat: optNum(res.cat), note: String(res.note || '') };
  return out.time || out.place || out.cat || out.note ? out : null;
}

function normalize(d) {
  if (!d || typeof d !== 'object') return null;
  const arr = x => (Array.isArray(x) ? x : []);
  const p = d.profile && typeof d.profile === 'object' ? d.profile : {};
  const prefs = {};
  if (d.prefs && typeof d.prefs === 'object') {
    for (const [k, v] of Object.entries(d.prefs)) if (typeof v === 'string' || typeof v === 'number') prefs[k] = v;
  }
  return {
    version: 2,
    rides: arr(d.rides)
      .filter(r => r && isISODate(String(r.date).slice(0, 10)) && num(r.distance) > 0)
      .map(r => ({
        id: String(r.id || uid()),
        date: String(r.date).slice(0, 10),
        distance: num(r.distance),
        duration: Math.max(0, num(r.duration)),
        elevation: Math.max(0, num(r.elevation)),
        note: String(r.note || ''),
        source: r.source === 'gpx' ? 'gpx' : 'manual'
      })),
    races: arr(d.races)
      .filter(r => r && r.name && isISODate(String(r.date)))
      .map(r => ({
        id: String(r.id || uid()),
        name: String(r.name),
        date: String(r.date),
        time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : '',
        place: String(r.place || ''),
        lat: coord(r.lat),
        lon: coord(r.lon),
        placeLabel: String(r.placeLabel || ''),
        result: normalizeResult(r.result)
      })),
    checklist: Array.isArray(d.checklist)
      ? d.checklist.filter(i => i && i.text).map(i => ({ id: String(i.id || uid()), text: String(i.text), done: !!i.done }))
      : defaultChecklist(),
    gear: arr(d.gear)
      .filter(g => g && g.name && isISODate(String(g.since)))
      .map(g => ({ id: String(g.id || uid()), name: String(g.name), limit: Math.max(0, num(g.limit)), since: String(g.since) })),
    profile: { weight: optNum(p.weight), bikeWeight: optNum(p.bikeWeight), ftp: optNum(p.ftp), hrMax: optNum(p.hrMax) },
    prefs
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = normalize(JSON.parse(raw));
      if (data) return data;
    }
  } catch (e) { /* brak dostępu do pamięci lub uszkodzone dane */ }
  return normalize({});
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Nie udało się zapisać danych w przeglądarce');
  }
}

let state = load();

/* Ustawienia narzędzi i profil – zapisywane przy każdej zmianie pola. */

function bindSettings() {
  document.querySelectorAll('[data-pref]').forEach(el => {
    const v = state.prefs[el.dataset.pref];
    if (v !== undefined) el.value = v;
  });
  document.querySelectorAll('[data-profile]').forEach(el => {
    const v = state.profile[el.dataset.profile];
    el.value = v === null || v === undefined ? '' : v;
  });
}

function onSettingChange(e) {
  const el = e.target;
  if (el.dataset.pref) {
    state.prefs[el.dataset.pref] = el.value;
  } else if (el.dataset.profile) {
    const key = el.dataset.profile;
    state.profile[key] = optNum(el.value);
    document.querySelectorAll(`[data-profile="${key}"]`).forEach(o => { if (o !== el) o.value = el.value; });
  } else {
    return;
  }
  save();
  renderTools();
}
document.addEventListener('input', onSettingChange);
document.addEventListener('change', onSettingChange);

/* ---------- Zakładki ---------- */

function showTab(name) {
  if (!TABS.includes(name)) name = 'dziennik';
  for (const t of TABS) $(`#tab-${t}`).hidden = t !== name;
  document.querySelectorAll('.tabbar a').forEach(a => {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  if (name === 'dziennik') renderChart();
  if (name === 'zawody') renderRaces();
  if (name === 'narzedzia') renderTools();
}

window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

/* ---------- 1. Dziennik treningów ---------- */

function summarize(filter) {
  return state.rides.filter(filter).reduce((a, r) => {
    a.km += r.distance; a.sec += r.duration; a.ele += r.elevation; a.n++;
    return a;
  }, { km: 0, sec: 0, ele: 0, n: 0 });
}

const kmBetween = (from, to) => state.rides
  .filter(r => r.date >= from && (!to || r.date < to))
  .reduce((a, r) => a + r.distance, 0);

function renderStats() {
  const now = new Date();
  const weekStart = toISODate(startOfWeek(now));
  const monthStart = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const week = summarize(r => r.date >= weekStart);
  const month = summarize(r => r.date >= monthStart);
  const all = summarize(() => true);
  const timed = summarize(r => r.duration > 0);
  const avg = timed.sec ? timed.km / (timed.sec / 3600) : 0;
  const monthName = now.toLocaleDateString('pl-PL', { month: 'long' });
  const rides = n => `${n} ${plural(n, 'przejazd', 'przejazdy', 'przejazdów')}`;

  $('#stats').innerHTML = [
    statTile('Ten tydzień', nf1.format(week.km), 'km', rides(week.n), true),
    statTile('Ten miesiąc', nf1.format(month.km), 'km', `${monthName}: ${rides(month.n)}`),
    statTile('Średnia prędkość', avg ? nf1.format(avg) : '—', avg ? 'km/h' : '',
      timed.n ? `z ${timed.n} ${plural(timed.n, 'przejazdu', 'przejazdów', 'przejazdów')}` : 'brak danych o czasie'),
    statTile('Przewyższenie', nf0.format(all.ele), 'm', `w tym miesiącu: ${nf0.format(month.ele)} m`)
  ].join('');
}

let chartMode = 'week';

function chartBuckets() {
  const now = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    let from, to, label, title;
    if (chartMode === 'week') {
      from = addDays(startOfWeek(now), -i * 7);
      to = addDays(from, 7);
      label = `${from.getDate()}.${pad(from.getMonth() + 1)}`;
      title = `Tydzień od ${fmtShort(from)}`;
    } else {
      from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
      label = from.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '');
      title = from.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    }
    buckets.push({ label, title, km: kmBetween(toISODate(from), toISODate(to)), current: i === 0 });
  }
  return buckets;
}

function niceStep(x) {
  if (!(x > 0)) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / p;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p);
}

function renderChart() {
  const el = $('#chart');
  if (!el.clientWidth) return; // zakładka ukryta – narysujemy po pokazaniu
  const W = el.clientWidth, H = 210;
  const padL = 36, padR = 4, padT = 18, padB = 26;
  const buckets = chartBuckets();
  const maxKm = Math.max(...buckets.map(b => b.km));
  const step = niceStep(maxKm / 4);
  const top = Math.max(step, step * Math.ceil(maxKm / step));
  const iw = W - padL - padR, ih = H - padT - padB;
  const slot = iw / buckets.length;
  const bw = Math.min(28, slot * 0.62);
  const y = v => padT + ih - (v / top) * ih;
  const labelEvery = slot < 34 ? 2 : 1;

  let svg = '';
  for (let v = 0; v <= top; v += step) {
    svg += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="axis-text" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${nf0.format(v)}</text>`;
  }
  buckets.forEach((b, i) => {
    const cx = padL + slot * i + slot / 2;
    if (b.km > 0) {
      svg += `<rect class="bar${b.current ? ' current' : ''}" x="${cx - bw / 2}" y="${y(b.km)}" width="${bw}" height="${ih - (y(b.km) - padT)}" rx="4"><title>${esc(b.title)}: ${nf1.format(b.km)} km</title></rect>`;
      if (slot >= 20) svg += `<text class="bar-val" x="${cx}" y="${y(b.km) - 5}" text-anchor="middle">${nf0.format(b.km)}</text>`;
    }
    if ((buckets.length - 1 - i) % labelEvery === 0) {
      svg += `<text class="axis-text" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>`;
    }
  });
  if (maxKm === 0) {
    svg += `<text class="empty-text" x="${padL + iw / 2}" y="${padT + ih / 2}" text-anchor="middle">Brak przejazdów w tym okresie</text>`;
  }
  const range = chartMode === 'week' ? 'ostatnich 12 tygodni' : 'ostatnich 12 miesięcy';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Kilometry z ${range}">${svg}</svg>`;
}

document.querySelectorAll('[data-chart]').forEach(btn => btn.addEventListener('click', () => {
  chartMode = btn.dataset.chart;
  setPressed('[data-chart]', btn);
  renderChart();
}));

let resizeFrame;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(renderChart);
});

function renderRides() {
  const rides = [...state.rides].sort((a, b) => b.date.localeCompare(a.date));
  $('#rideCount').textContent = rides.length ? `(${rides.length})` : '';
  $('#rideList').innerHTML = rides.length
    ? rides.map(r => `<li class="ride">
        <div class="ride-main">
          <div class="ride-date">${fmtDate(r.date)}${r.source === 'gpx' ? '<span class="badge">GPX</span>' : ''}</div>
          <div class="ride-metrics">
            <strong>${nf1.format(r.distance)} km</strong>
            <span>${fmtDuration(r.duration)}</span>
            <span>${r.duration > 0 ? `${nf1.format(r.distance / (r.duration / 3600))} km/h` : '— km/h'}</span>
            <span>↗ ${nf0.format(r.elevation)} m</span>
          </div>
          ${r.note ? `<p class="ride-note">${esc(r.note)}</p>` : ''}
        </div>
        <div class="ride-actions">
          <button type="button" class="icon-btn" data-edit="${esc(r.id)}" aria-label="Edytuj przejazd">${ICON.edit}</button>
          <button type="button" class="icon-btn danger" data-del="${esc(r.id)}" aria-label="Usuń przejazd">${ICON.trash}</button>
        </div>
      </li>`).join('')
    : '<li class="empty">Brak przejazdów. Dodaj pierwszy powyżej albo wczytaj plik GPX.</li>';
  renderStats();
  renderChart();
}

const rideForm = $('#rideForm');
let editingId = null;
let rideSource = 'manual';

function setGpxInfo(msg, kind = 'ok') {
  const el = $('#gpxInfo');
  el.hidden = !msg;
  el.textContent = msg;
  el.className = `hint ${kind}`;
}

function resetRideForm() {
  rideForm.reset();
  editingId = null;
  rideSource = 'manual';
  $('#rideDate').value = toISODate(new Date());
  $('#rideFormTitle').textContent = 'Dodaj przejazd';
  $('#rideSubmit').textContent = 'Zapisz przejazd';
  $('#rideCancel').hidden = true;
  setGpxInfo('');
}

rideForm.addEventListener('submit', e => {
  e.preventDefault();
  const date = $('#rideDate').value;
  const distance = num($('#rideDistance').value);
  if (!isISODate(date)) return toast('Podaj datę przejazdu');
  if (!(distance > 0)) return toast('Podaj dystans większy od zera');

  const ride = {
    id: editingId || uid(),
    date,
    distance: Math.round(distance * 100) / 100,
    duration: Math.round(readDuration('ride')),
    elevation: Math.round(Math.max(0, num($('#rideElevation').value))),
    note: $('#rideNote').value.trim(),
    source: rideSource
  };
  const i = state.rides.findIndex(r => r.id === ride.id);
  if (i >= 0) state.rides[i] = ride;
  else state.rides.push(ride);
  save();
  renderRides();
  toast(editingId ? 'Zapisano zmiany' : 'Dodano przejazd');
  resetRideForm();
});

$('#rideCancel').addEventListener('click', resetRideForm);

$('#rideList').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.edit || btn.dataset.del;
  const ride = state.rides.find(r => r.id === id);
  if (!ride) return;

  if (btn.dataset.del) {
    if (!confirm(`Usunąć przejazd z ${fmtDate(ride.date)} (${nf1.format(ride.distance)} km)?`)) return;
    state.rides = state.rides.filter(r => r.id !== id);
    save();
    renderRides();
    if (editingId === id) resetRideForm();
    toast('Usunięto przejazd');
    return;
  }

  resetRideForm();
  editingId = id;
  rideSource = ride.source;
  $('#rideDate').value = ride.date;
  $('#rideDistance').value = ride.distance;
  setDuration('ride', ride.duration);
  $('#rideElevation').value = ride.elevation || '';
  $('#rideNote').value = ride.note;
  $('#rideFormTitle').textContent = 'Edytuj przejazd';
  $('#rideSubmit').textContent = 'Zapisz zmiany';
  $('#rideCancel').hidden = false;
  $('#rideFormCard').open = true;
  $('#rideFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* GPX */

function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('To nie jest prawidłowy plik GPX.');
  const byTag = (root, tag) => Array.from(root.getElementsByTagNameNS('*', tag));
  const childText = (el, tag) => { const c = byTag(el, tag)[0]; return c ? c.textContent.trim() : ''; };

  let segments = byTag(doc, 'trkseg').map(s => byTag(s, 'trkpt'));
  if (!segments.some(s => s.length)) segments = [byTag(doc, 'rtept')];
  segments = segments.map(seg => seg.map(p => {
    const ele = parseFloat(childText(p, 'ele'));
    const t = Date.parse(childText(p, 'time'));
    return {
      lat: parseFloat(p.getAttribute('lat')),
      lon: parseFloat(p.getAttribute('lon')),
      ele: Number.isFinite(ele) ? ele : null,
      t: Number.isFinite(t) ? t : null
    };
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)));

  if (segments.reduce((n, s) => n + s.length, 0) < 2) throw new Error('Plik nie zawiera punktów trasy.');

  let dist = 0, moving = 0, gain = 0, first = null, last = null;
  for (const seg of segments) {
    let ref = null;
    seg.forEach((p, i) => {
      if (p.t !== null) {
        if (first === null || p.t < first) first = p.t;
        if (last === null || p.t > last) last = p.t;
      }
      if (p.ele !== null) {
        if (ref === null) ref = p.ele;
        else if (p.ele - ref >= ELE_THRESHOLD) { gain += p.ele - ref; ref = p.ele; }
        else if (ref - p.ele >= ELE_THRESHOLD) ref = p.ele;
      }
      if (i === 0) return;
      const q = seg[i - 1];
      const d = haversine(q, p);
      dist += d;
      if (p.t !== null && q.t !== null) {
        const dt = (p.t - q.t) / 1000;
        if (dt > 0 && d / dt >= MIN_MOVING_SPEED) moving += dt;
      }
    });
  }

  const metaTime = Date.parse(childText(doc, 'time'));
  const nameEl = byTag(doc, 'name')[0];
  const elapsed = first !== null ? (last - first) / 1000 : 0;
  return {
    distanceKm: dist / 1000,
    movingSec: Math.round(moving || elapsed),
    elapsedSec: Math.round(elapsed),
    gainM: Math.round(gain),
    date: toISODate(first !== null ? new Date(first) : Number.isFinite(metaTime) ? new Date(metaTime) : new Date()),
    name: nameEl ? nameEl.textContent.trim() : '',
    hasTime: first !== null
  };
}

$('#gpxInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const g = parseGPX(await file.text());
    rideSource = 'gpx';
    $('#rideDate').value = g.date;
    $('#rideDistance').value = g.distanceKm.toFixed(2);
    setDuration('ride', g.movingSec);
    $('#rideElevation').value = g.gainM;
    if (!$('#rideNote').value.trim() && g.name) $('#rideNote').value = g.name;

    let msg = `Wczytano: ${nf2.format(g.distanceKm)} km, przewyższenie ${nf0.format(g.gainM)} m`;
    if (g.hasTime) {
      msg += `, czas jazdy ${fmtDuration(g.movingSec)}`;
      if (g.elapsedSec - g.movingSec > 60) msg += ` (z postojami ${fmtDuration(g.elapsedSec)})`;
      msg += '.';
    } else {
      msg += '. Plik nie zawiera czasu – wpisz go ręcznie.';
    }
    setGpxInfo(`${msg} Sprawdź dane i zapisz.`);
  } catch (err) {
    setGpxInfo(err.message || 'Nie udało się odczytać pliku GPX.', 'err');
  }
});

/* ---------- 2. Kalkulator tempa ---------- */

function renderPace() {
  const out = $('#paceResult');
  const d = num($('#paceDistance').value);
  const t = readDuration('pace');
  document.querySelectorAll('#paceChips .chip').forEach(c => c.setAttribute('aria-pressed', String(num(c.dataset.km) === d)));

  if (!(d > 0) || !(t > 0)) {
    out.innerHTML = empty('Wpisz dystans i docelowy czas – pokażę wymaganą średnią prędkość i międzyczasy co 10 km.');
    return;
  }

  const speed = d / (t / 3600);
  const secPerKm = Math.round(t / d);
  const start = $('#paceStart').value;
  const startSec = /^\d{2}:\d{2}/.test(start) ? Number(start.slice(0, 2)) * 3600 + Number(start.slice(3, 5)) * 60 : null;

  const marks = [];
  for (let k = 10; k < d - 1e-9; k += 10) marks.push(k);
  marks.push(d);

  const rows = marks.map(k => {
    const at = t * k / d;
    return `<tr>
      <td>${nf2.format(k)} km${k === d ? '<span class="finish">meta</span>' : ''}</td>
      <td>${fmtDuration(at)}</td>
      ${startSec !== null ? `<td>${fmtClock(startSec + at)}</td>` : ''}
    </tr>`;
  }).join('');

  out.innerHTML = `
    <div class="result-hero">
      ${statTile('Wymagana średnia', nf1.format(speed), 'km/h', `na ${nf2.format(d)} km`, true)}
      ${statTile('Czas na 1 km', `${Math.floor(secPerKm / 60)}:${pad(secPerKm % 60)}`, 'min', `10 km co ${fmtDuration(t / d * 10)}`)}
    </div>
    <div class="card">
      <h3>Międzyczasy co 10 km</h3>
      <table class="splits">
        <thead><tr><th>Dystans</th><th>Czas</th>${startSec !== null ? '<th>Godzina</th>' : ''}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

$('#paceForm').addEventListener('input', renderPace);
$('#paceForm').addEventListener('submit', e => e.preventDefault());
$('#paceChips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $('#paceDistance').value = chip.dataset.km;
  $('#paceDistance').dispatchEvent(new Event('input', { bubbles: true }));
});

/* ---------- 3. Zawody ---------- */

const raceKey = name => name.trim().toLowerCase();

function raceTarget(r) {
  const d = parseISODate(r.date);
  if (r.time) d.setHours(Number(r.time.slice(0, 2)), Number(r.time.slice(3, 5)));
  return d.getTime();
}

function countdownParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
}

function upcomingRaces() {
  const now = Date.now();
  return state.races.filter(r => raceTarget(r) > now).sort((a, b) => raceTarget(a) - raceTarget(b));
}

function previousResult(race) {
  const target = raceTarget(race);
  return state.races
    .filter(r => r.id !== race.id && raceKey(r.name) === raceKey(race.name) && r.result && r.result.time > 0 && raceTarget(r) < target)
    .sort((a, b) => raceTarget(b) - raceTarget(a))[0] || null;
}

function resultHTML(r) {
  const res = r.result;
  if (!res) return `<button type="button" class="btn btn-secondary btn-sm race-result-btn" data-result="${esc(r.id)}">Dodaj wynik</button>`;
  const parts = [];
  if (res.time) parts.push(`<strong>${fmtDuration(res.time)}</strong>`);
  if (res.place) parts.push(`${res.place}. miejsce open`);
  if (res.cat) parts.push(`${res.cat}. w kategorii`);
  let compare = '';
  const prev = res.time ? previousResult(r) : null;
  if (prev) {
    const delta = res.time - prev.result.time;
    const when = prev.date.slice(0, 4) !== r.date.slice(0, 4) ? prev.date.slice(0, 4) : fmtShort(parseISODate(prev.date));
    compare = `<p class="delta ${delta <= 0 ? 'better' : 'worse'}">${fmtDelta(delta)} względem ${when} (${fmtDuration(prev.result.time)})</p>`;
  }
  return `<div class="result">
      <div class="result-top"><span class="result-label">Wynik</span><button type="button" class="link-btn" data-result="${esc(r.id)}">Edytuj</button></div>
      <div class="result-main">${parts.join(' · ') || '—'}</div>
      ${compare}
      ${res.note ? `<p class="ride-note">${esc(res.note)}</p>` : ''}
    </div>`;
}

function renderRaces() {
  const now = Date.now();
  const today = toISODate(new Date());
  const isUpcoming = r => raceTarget(r) > now;
  const upcoming = upcomingRaces();
  const past = state.races.filter(r => !isUpcoming(r)).sort((a, b) => raceTarget(b) - raceTarget(a));

  const item = (r, i) => {
    const when = fmtDate(r.date) + (r.time ? `, godz. ${r.time}` : '');
    const head = `<div class="race-head">
        <div class="race-info">
          ${i === 0 ? '<span class="race-tag">Najbliższe</span>' : ''}
          <div class="race-name">${esc(r.name)}</div>
          <div class="race-date">${when}${r.place ? ` · ${esc(r.place)}` : ''}</div>
        </div>
        <div class="race-actions">
          <button type="button" class="icon-btn" data-edit="${esc(r.id)}" aria-label="Edytuj zawody ${esc(r.name)}">${ICON.edit}</button>
          <button type="button" class="icon-btn danger" data-del="${esc(r.id)}" aria-label="Usuń zawody ${esc(r.name)}">${ICON.trash}</button>
        </div>
      </div>`;
    if (isUpcoming(r)) {
      return `<li class="race${i === 0 ? ' next' : ''}" data-target="${raceTarget(r)}">${head}
        <div class="countdown">
          <div class="cd-box"><span class="cd-num" data-u="d"></span><span class="cd-unit" data-l="d"></span></div>
          <div class="cd-box"><span class="cd-num" data-u="h"></span><span class="cd-unit">godz.</span></div>
          <div class="cd-box"><span class="cd-num" data-u="m"></span><span class="cd-unit">min</span></div>
          <div class="cd-box"><span class="cd-num" data-u="s"></span><span class="cd-unit">s</span></div>
        </div>
        ${r.place ? `<div class="weather" data-weather="${esc(r.id)}"><span class="muted">Sprawdzam prognozę pogody…</span></div>` : ''}
      </li>`;
    }
    const isToday = r.date === today;
    const status = isToday
      ? '<p class="race-status today">To dziś – powodzenia!</p>'
      : '<p class="race-status muted">Zawody już się odbyły</p>';
    return `<li class="race${isToday ? '' : ' past'}">${head}${status}${resultHTML(r)}</li>`;
  };

  $('#raceList').innerHTML = state.races.length
    ? upcoming.map(item).join('') + past.map(r => item(r, -1)).join('')
    : '<li class="empty">Brak zawodów. Dodaj własne powyżej albo wybierz z kalendarza 2027.</li>';
  if (!state.races.length) $('#raceFormCard').open = true;
  renderTaper();
  tickRaces();
  updateWeather();
}

function tickRaces() {
  if ($('#tab-zawody').hidden) return;
  const now = Date.now();
  for (const el of document.querySelectorAll('#raceList .race[data-target]')) {
    const left = Number(el.dataset.target) - now;
    if (left <= 0) return renderRaces();
    const p = countdownParts(left);
    el.querySelector('[data-u="d"]').textContent = p.d;
    el.querySelector('[data-l="d"]').textContent = plural(p.d, 'dzień', 'dni', 'dni');
    el.querySelector('[data-u="h"]').textContent = pad(p.h);
    el.querySelector('[data-u="m"]').textContent = pad(p.m);
    el.querySelector('[data-u="s"]').textContent = pad(p.s);
  }
}

setInterval(tickRaces, 1000);

/* Formularz zawodów (dodawanie i edycja) */

let editingRaceId = null;

function resetRaceForm() {
  $('#raceForm').reset();
  editingRaceId = null;
  $('#raceFormTitle').textContent = 'Dodaj zawody';
  $('#raceSubmit').textContent = 'Dodaj zawody';
  $('#raceCancel').hidden = true;
}

$('#raceForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#raceName').value.trim();
  const date = $('#raceDate').value;
  if (!name) return toast('Podaj nazwę zawodów');
  if (!isISODate(date)) return toast('Podaj datę zawodów');
  const fields = { name, date, time: $('#raceTime').value.slice(0, 5), place: $('#racePlace').value.trim() };

  const existing = state.races.find(r => r.id === editingRaceId);
  if (existing) {
    if (existing.place !== fields.place) Object.assign(existing, { lat: null, lon: null, placeLabel: '' });
    Object.assign(existing, fields);
  } else {
    state.races.push({ id: uid(), ...fields, lat: null, lon: null, placeLabel: '', result: null });
  }
  save();
  toast(existing ? 'Zapisano zmiany' : 'Dodano zawody');
  resetRaceForm();
  $('#raceFormCard').open = false;
  renderRaces();
  renderCatalog();
});

$('#raceCancel').addEventListener('click', () => { resetRaceForm(); $('#raceFormCard').open = false; });

$('#raceList').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const race = state.races.find(r => r.id === (btn.dataset.del || btn.dataset.edit || btn.dataset.result));
  if (!race) return;

  if (btn.dataset.del) {
    if (!confirm(`Usunąć zawody „${race.name}”?`)) return;
    state.races = state.races.filter(r => r.id !== race.id);
    save();
    if (editingRaceId === race.id) resetRaceForm();
    renderRaces();
    renderCatalog();
    toast('Usunięto zawody');
  } else if (btn.dataset.edit) {
    resetRaceForm();
    editingRaceId = race.id;
    $('#raceName').value = race.name;
    $('#raceDate').value = race.date;
    $('#raceTime').value = race.time;
    $('#racePlace').value = race.place;
    $('#raceFormTitle').textContent = 'Edytuj zawody';
    $('#raceSubmit').textContent = 'Zapisz zmiany';
    $('#raceCancel').hidden = false;
    $('#raceFormCard').open = true;
    $('#raceFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    openResultDialog(race);
  }
});

/* Wyniki */

const resultDialog = $('#resultDialog');
let resultRaceId = null;

function openResultDialog(race) {
  resultRaceId = race.id;
  const res = race.result || {};
  $('#resultForm').reset();
  $('#resultRace').textContent = `${race.name} · ${fmtDate(race.date)}`;
  setDuration('res', res.time || 0);
  $('#resPlace').value = res.place || '';
  $('#resCat').value = res.cat || '';
  $('#resNote').value = res.note || '';
  $('#resDelete').hidden = !race.result;
  resultDialog.showModal();
}

$('#resultForm').addEventListener('submit', e => {
  e.preventDefault();
  const race = state.races.find(r => r.id === resultRaceId);
  if (!race) return resultDialog.close();
  const result = normalizeResult({
    time: Math.round(readDuration('res')),
    place: $('#resPlace').value,
    cat: $('#resCat').value,
    note: $('#resNote').value.trim()
  });
  if (!result) return toast('Wpisz czas, miejsce albo notatkę');
  race.result = result;
  save();
  resultDialog.close();
  renderRaces();
  toast('Zapisano wynik');
});

$('#resDelete').addEventListener('click', () => {
  const race = state.races.find(r => r.id === resultRaceId);
  if (race && confirm('Usunąć wynik tych zawodów?')) {
    race.result = null;
    save();
    resultDialog.close();
    renderRaces();
  }
});

$('#resCancel').addEventListener('click', () => resultDialog.close());

/* Tapering przed najbliższymi zawodami */

function renderTaper() {
  const el = $('#taper');
  const next = upcomingRaces()[0];
  const today = today0();
  const raceDay = next ? parseISODate(next.date) : null;
  const days = next ? daysBetween(today, raceDay) : Infinity;
  if (!next || days > 21) { el.innerHTML = ''; return; }

  const taperStart = addDays(raceDay, -14);
  const finalWeek = addDays(raceDay, -7);
  const baseKm = kmBetween(toISODate(addDays(taperStart, -42)), toISODate(taperStart)) / 6;

  let advice;
  if (days > 14) advice = `Ostatnie dni normalnego treningu. Od ${fmtShort(taperStart)} zacznij zmniejszać kilometraż.`;
  else if (days > 7) advice = 'Etap 1: jedź ok. 70% zwykłego kilometrażu. Zostaw 1–2 krótkie, mocne akcenty w tempie startowym, resztę spokojnie.';
  else if (days > 1) advice = 'Etap 2: ok. 50% kilometrażu. Krótkie przyspieszenia w tempie startowym, dużo snu, a w ostatnie 2 dni więcej węglowodanów.';
  else if (days === 1) advice = 'Jutro start! Krótka jazda 30–45 min z 2–3 przyspieszeniami po 30 s. Przygotuj rower, numer i przejrzyj checklistę.';
  else advice = 'Dziś start – powodzenia! Zjedz śniadanie 2–3 h przed startem i zrób rozgrzewkę.';

  const phases = [
    { label: `${fmtShort(taperStart)} – ${fmtShort(addDays(finalWeek, -1))}`, share: 0.7, from: taperStart, to: finalWeek },
    { label: `${fmtShort(finalWeek)} – ${fmtShort(addDays(raceDay, -1))}`, share: 0.5, from: finalWeek, to: raceDay }
  ];
  const rows = phases.map(p => {
    const started = today >= p.from;
    const done = kmBetween(toISODate(p.from), toISODate(p.to));
    return `<tr><td>${p.label}</td><td>~${nf0.format(baseKm * p.share)} km</td><td>${started ? `${nf0.format(done)} km` : '—'}</td></tr>`;
  }).join('');

  el.innerHTML = `<div class="card taper">
      <span class="race-tag">Przygotowanie do startu</span>
      <h3>${esc(next.name)} · ${days === 0 ? 'dziś' : days === 1 ? 'jutro' : `za ${days} dni`}</h3>
      <p class="taper-advice">${advice}</p>
      ${baseKm > 0 ? `
        <table class="splits">
          <thead><tr><th>Okres</th><th>Cel</th><th>Przejechane</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="note-small">Cel liczony od Twojej średniej z 6 tygodni przed taperem: ${nf0.format(baseKm)} km tygodniowo.</p>`
        : '<p class="note-small">Dodaj przejazdy do dziennika, a pokażę, ile kilometrów jeździć w tych tygodniach.</p>'}
      ${days <= 2 ? '<a class="btn btn-secondary btn-sm" href="#checklista">Otwórz checklistę</a>' : ''}
    </div>`;
}

/* Pogoda z Open-Meteo (darmowa, bez klucza) */

const WMO = {
  0: 'Bezchmurnie', 1: 'Przeważnie słonecznie', 2: 'Częściowe zachmurzenie', 3: 'Pochmurno',
  45: 'Mgła', 48: 'Mgła', 51: 'Lekka mżawka', 53: 'Mżawka', 55: 'Gęsta mżawka', 56: 'Marznąca mżawka', 57: 'Marznąca mżawka',
  61: 'Słaby deszcz', 63: 'Deszcz', 65: 'Silny deszcz', 66: 'Marznący deszcz', 67: 'Marznący deszcz',
  71: 'Słaby śnieg', 73: 'Śnieg', 75: 'Intensywny śnieg', 77: 'Śnieg ziarnisty',
  80: 'Przelotny deszcz', 81: 'Przelotne opady', 82: 'Ulewy', 85: 'Przelotny śnieg', 86: 'Przelotny śnieg',
  95: 'Burza', 96: 'Burza z gradem', 99: 'Burza z gradem'
};
const WIND_DIRS = ['płn.', 'płn.-wsch.', 'wsch.', 'płd.-wsch.', 'płd.', 'płd.-zach.', 'zach.', 'płn.-zach.'];
const windDir = deg => WIND_DIRS[Math.round(deg / 45) % 8];
const weatherCache = new Map();

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function ensureCoords(race) {
  if (race.lat !== null && race.lon !== null) return true;
  const query = race.place.split(',')[0].trim();
  const data = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=pl&format=json`);
  const hit = data.results && data.results[0];
  if (!hit) return false;
  race.lat = hit.latitude;
  race.lon = hit.longitude;
  race.placeLabel = [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ');
  save();
  return true;
}

async function weatherHTML(race) {
  const raceDay = parseISODate(race.date);
  if (daysBetween(today0(), raceDay) > FORECAST_DAYS) {
    return `<span class="muted">Prognoza pogody pojawi się ok. ${fmtShort(addDays(raceDay, -FORECAST_DAYS))}.</span>`;
  }
  if (!(await ensureCoords(race))) {
    return `<span class="muted">Nie znaleziono miejscowości „${esc(race.place)}” – popraw ją w edycji zawodów.</span>`;
  }
  const f = await fetchJSON('https://api.open-meteo.com/v1/forecast'
    + `?latitude=${race.lat}&longitude=${race.lon}&timezone=auto&start_date=${race.date}&end_date=${race.date}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant'
    + '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m');
  const d = f.daily;
  const rain = d.precipitation_probability_max[0];
  let html = `<div class="weather-main"><strong>${WMO[d.weather_code[0]] || 'Prognoza'}</strong> · ${nf0.format(d.temperature_2m_min[0])}…${nf0.format(d.temperature_2m_max[0])}°C</div>
    <div class="weather-sub">Opady: ${rain === null ? '—' : `${rain}%`} (${nf1.format(d.precipitation_sum[0] || 0)} mm) · wiatr do ${nf0.format(d.wind_speed_10m_max[0])} km/h z kier. ${windDir(d.wind_direction_10m_dominant[0])}</div>`;
  const h = race.time ? Number(race.time.slice(0, 2)) : null;
  const hr = f.hourly;
  if (h !== null && hr && hr.temperature_2m[h] !== null && hr.temperature_2m[h] !== undefined) {
    const p = hr.precipitation_probability[h];
    html += `<div class="weather-sub">O ${race.time}: ${nf0.format(hr.temperature_2m[h])}°C, ${(WMO[hr.weather_code[h]] || '').toLowerCase()}, opady ${p === null ? '—' : `${p}%`}, wiatr ${nf0.format(hr.wind_speed_10m[h])} km/h</div>`;
  }
  html += `<div class="weather-src">Prognoza Open-Meteo${race.placeLabel ? ` · ${esc(race.placeLabel)}` : ''}</div>`;
  return html;
}

function updateWeather() {
  document.querySelectorAll('#raceList [data-weather]').forEach(async el => {
    const race = state.races.find(r => r.id === el.dataset.weather);
    if (!race) return;
    const key = [race.id, race.date, race.time, race.place, toISODate(new Date())].join('|');
    let entry = weatherCache.get(key);
    if (!entry || Date.now() - entry.at > 30 * 60000) {
      entry = {
        at: Date.now(),
        html: weatherHTML(race).catch(() => {
          weatherCache.delete(key);
          return '<span class="muted">Nie udało się pobrać prognozy – sprawdź połączenie z internetem.</span>';
        })
      };
      weatherCache.set(key, entry);
    }
    el.innerHTML = await entry.html;
  });
}

/* Kalendarz zawodów 2027 */

let catalogFilter = 'all';

function fmtCatalogDate(c) {
  if (!c.date) return esc(c.when || '');
  const start = parseISODate(c.date);
  const opts = { day: 'numeric', month: 'long', year: 'numeric' };
  if (!c.end) return start.toLocaleDateString('pl-PL', { weekday: 'short', ...opts });
  const end = parseISODate(c.end);
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.toLocaleDateString('pl-PL', opts)}`
    : `${fmtShort(start)} – ${end.toLocaleDateString('pl-PL', opts)}`;
}

const isAdded = c => state.races.some(r => r.date === c.date && raceKey(r.name) === raceKey(c.name));

function renderCatalog() {
  const today = toISODate(new Date());
  const items = RACE_CATALOG
    .filter(c => catalogFilter === 'all' || (catalogFilter === 'pl') === (c.country === 'Polska'))
    .filter(c => !c.date || (c.end || c.date) >= today)
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));

  $('#catalogList').innerHTML = items.length ? items.map(c => {
    const i = RACE_CATALOG.indexOf(c);
    const action = !c.date ? ''
      : isAdded(c) ? '<button type="button" class="btn btn-ghost btn-sm" disabled>✓ Dodane do odliczania</button>'
      : `<button type="button" class="btn btn-primary btn-sm" data-add="${i}">Dodaj do odliczania</button>`;
    return `<li class="cat-item">
        <div class="cat-date">${fmtCatalogDate(c)}</div>
        <div class="cat-name">${esc(c.name)}</div>
        <div class="cat-meta">${esc(c.type)} · ${esc([c.place, c.country].filter(Boolean).join(', '))}</div>
        ${c.note ? `<p class="cat-note">${esc(c.note)}</p>` : ''}
        <div class="cat-actions">
          ${action}
          <a class="btn btn-ghost btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener">Źródło ↗</a>
        </div>
      </li>`;
  }).join('') : empty('Brak zawodów w tej kategorii.');
}

$('#catalogList').addEventListener('click', e => {
  const btn = e.target.closest('[data-add]');
  if (!btn) return;
  const c = RACE_CATALOG[Number(btn.dataset.add)];
  if (!c || isAdded(c)) return;
  state.races.push({
    id: uid(), name: c.name, date: c.date, time: '', place: c.place,
    lat: coord(c.lat), lon: coord(c.lon), placeLabel: c.place, result: null
  });
  save();
  renderCatalog();
  toast(`Dodano „${c.name}” do odliczania`);
});

document.querySelectorAll('[data-catalog]').forEach(btn => btn.addEventListener('click', () => {
  catalogFilter = btn.dataset.catalog;
  setPressed('[data-catalog]', btn);
  renderCatalog();
}));

document.querySelectorAll('[data-raceview]').forEach(btn => btn.addEventListener('click', () => {
  const mine = btn.dataset.raceview === 'mine';
  setPressed('[data-raceview]', btn);
  $('#raceViewMine').hidden = !mine;
  $('#raceViewCatalog').hidden = mine;
  if (mine) renderRaces();
  else renderCatalog();
}));

/* ---------- 4. Narzędzia ---------- */

document.querySelectorAll('[data-tool]').forEach(btn => btn.addEventListener('click', () => {
  setPressed('[data-tool]', btn);
  document.querySelectorAll('.tool').forEach(t => { t.hidden = t.id !== `tool-${btn.dataset.tool}`; });
}));

function renderTools() {
  renderTires();
  renderZones();
  renderGear();
}

/* Ciśnienie w oponach – metoda 15% ugięcia opony (Frank Berto) */

function renderTires() {
  const out = $('#tireResult');
  const width = num($('#tireWidth').value);
  const rider = num($('#tireWeight').value);
  const bike = num($('#tireBike').value) || 9;
  document.querySelectorAll('#tireChips .chip').forEach(c => c.setAttribute('aria-pressed', String(num(c.dataset.mm) === width)));
  if (!(rider > 0) || !(width >= 18 && width <= 70)) {
    out.innerHTML = empty('Wpisz swoją wagę i szerokość opony (18–70 mm).');
    return;
  }
  const lbs = (rider + bike + 1.5) * 2.20462; // +1,5 kg na bidony i drobiazgi
  let factor = 1;
  if ($('#tireType').value === 'tubeless') factor *= 0.92;
  factor *= { smooth: 1, rough: 0.93, gravel: 0.85, wet: 0.92 }[$('#tireSurface').value] || 1;
  const psi = share => Math.max(15, (153.6 * lbs * share / Math.pow(width, 1.5866) - 7.1) * factor);
  const front = psi(0.45), rear = psi(0.55);
  const bar = p => nf1.format(p / 14.5038);

  const notes = [
    'Nigdy nie przekraczaj maksymalnego ciśnienia podanego na oponie i na obręczy.',
    'Manometry pomp potrafią się różnić o 0,2–0,5 bara – mierz zawsze tym samym.'
  ];
  if (rear / 14.5038 > 5) notes.unshift('<strong>Obręcze hookless</strong> (bez haczyka) mają zwykle limit 5 bar (72 psi) – w takim wypadku zostań przy 5 barach albo wybierz szerszą oponę.');

  out.innerHTML = `
    <div class="result-hero">
      ${statTile('Przód', bar(front), 'bar', `${nf0.format(front)} psi`, true)}
      ${statTile('Tył', bar(rear), 'bar', `${nf0.format(rear)} psi`, true)}
    </div>
    <div class="card">
      <ul class="tips">${notes.map(n => `<li>${n}</li>`).join('')}</ul>
      <p class="note-small">Punkt wyjścia wg metody 15% ugięcia opony (Frank Berto), z rozkładem masy 45% przód / 55% tył. Dostosuj o ±0,2 bara według odczuć.</p>
    </div>`;
}

$('#tireChips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $('#tireWidth').value = chip.dataset.mm;
  $('#tireWidth').dispatchEvent(new Event('input', { bubbles: true }));
});

/* Strefy mocy i tętna */

const POWER_ZONES = [
  ['Z1', 'Regeneracja', 0, 0.55],
  ['Z2', 'Wytrzymałość', 0.56, 0.75],
  ['Z3', 'Tempo', 0.76, 0.90],
  ['Z4', 'Próg', 0.91, 1.05],
  ['Z5', 'VO₂max', 1.06, 1.20],
  ['Z6', 'Beztlenowa', 1.21, 1.50],
  ['Z7', 'Sprint', 1.51, null]
];
const HR_ZONES = [
  ['Z1', 'Bardzo lekko', 0.50, 0.60],
  ['Z2', 'Lekko – baza', 0.60, 0.70],
  ['Z3', 'Umiarkowanie', 0.70, 0.80],
  ['Z4', 'Mocno – próg', 0.80, 0.90],
  ['Z5', 'Maksymalnie', 0.90, 1.00]
];

function wkgLevel(wkg) {
  if (wkg < 2.0) return 'początkujący';
  if (wkg < 2.8) return 'rekreacyjny';
  if (wkg < 3.5) return 'wytrenowany amator';
  if (wkg < 4.2) return 'mocny amator';
  if (wkg < 5.0) return 'czołówka amatorów';
  return 'poziom zawodowy';
}

function zoneTable(zones, value, unit) {
  const rows = zones.map(([z, name, lo, hi], i) => {
    const range = hi === null ? `> ${nf0.format(value * lo)}` : `${nf0.format(value * lo)}–${nf0.format(value * hi)}`;
    const pct = hi === null ? `> ${Math.round(lo * 100)}%` : `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;
    return `<tr><td><span class="zone-dot" style="opacity:${0.25 + i * (0.75 / (zones.length - 1))}"></span>${z} ${name}</td><td>${pct}</td><td>${range} ${unit}</td></tr>`;
  }).join('');
  return `<table class="splits"><thead><tr><th>Strefa</th><th>%</th><th>Zakres</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderZones() {
  const out = $('#zoneResult');
  const { ftp, weight, hrMax } = state.profile;
  if (!ftp && !hrMax) {
    out.innerHTML = empty('Wpisz FTP lub tętno maksymalne – pokażę Twoje strefy treningowe.');
    return;
  }
  let html = '';
  if (ftp && weight) {
    const wkg = ftp / weight;
    html += `<div class="result-hero">
      ${statTile('Moc względna', nf2.format(wkg), 'W/kg', wkgLevel(wkg), true)}
      ${statTile('FTP', nf0.format(ftp), 'W', `przy wadze ${nf1.format(weight)} kg`)}
    </div>`;
  }
  if (ftp) html += `<div class="card"><h3 class="card-title">Strefy mocy</h3>${zoneTable(POWER_ZONES, ftp, 'W')}</div>`;
  if (hrMax) html += `<div class="card"><h3 class="card-title">Strefy tętna</h3>${zoneTable(HR_ZONES, hrMax, 'ud./min')}</div>`;
  out.innerHTML = html;
}

/* Zużycie sprzętu */

const gearKm = g => kmBetween(g.since);

function renderGear() {
  const items = [...state.gear].sort((a, b) => (gearKm(b) / (b.limit || Infinity)) - (gearKm(a) / (a.limit || Infinity)));
  $('#gearList').innerHTML = items.length ? items.map(g => {
    const km = gearKm(g);
    const ratio = g.limit ? km / g.limit : 0;
    const cls = ratio >= 1 ? 'over' : ratio >= 0.9 ? 'warn' : '';
    const status = !g.limit ? 'bez limitu'
      : ratio >= 1 ? 'czas na wymianę!'
      : `zostało ${nf0.format(g.limit - km)} km`;
    return `<li class="gear-item">
        <div class="gear-head">
          <div>
            <div class="gear-name">${esc(g.name)}</div>
            <div class="race-date">od ${fmtDate(g.since)}</div>
          </div>
          <button type="button" class="icon-btn danger" data-del="${esc(g.id)}" aria-label="Usuń: ${esc(g.name)}">${ICON.trash}</button>
        </div>
        <div class="gear-km"><strong>${nf0.format(km)}</strong>${g.limit ? ` / ${nf0.format(g.limit)}` : ''} km <span class="gear-status ${cls}">${status}</span></div>
        ${g.limit ? `<div class="progress"><div class="progress-bar ${cls}" style="width:${Math.min(100, ratio * 100)}%"></div></div>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-reset="${esc(g.id)}">Wymienione dziś</button>
      </li>`;
  }).join('') : '<li class="empty">Dodaj części, które chcesz śledzić – np. łańcuch czy opony.</li>';
  if (!state.gear.length) $('#gearFormCard').open = true;
}

$('#gearChips').innerHTML = GEAR_PRESETS
  .map(([name, km]) => `<button type="button" class="chip" data-name="${esc(name)}" data-km="${km}">${esc(name)}</button>`).join('');

$('#gearChips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $('#gearName').value = chip.dataset.name;
  $('#gearLimit').value = chip.dataset.km;
});

$('#gearForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#gearName').value.trim();
  const since = $('#gearSince').value;
  if (!name) return toast('Podaj nazwę części');
  if (!isISODate(since)) return toast('Podaj datę montażu');
  state.gear.push({ id: uid(), name, limit: Math.max(0, num($('#gearLimit').value)), since });
  save();
  e.target.reset();
  $('#gearSince').value = toISODate(new Date());
  $('#gearFormCard').open = false;
  renderGear();
  toast('Dodano część');
});

$('#gearList').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const g = state.gear.find(x => x.id === (btn.dataset.del || btn.dataset.reset));
  if (!g) return;
  if (btn.dataset.del) {
    if (!confirm(`Usunąć „${g.name}” z listy?`)) return;
    state.gear = state.gear.filter(x => x.id !== g.id);
    toast('Usunięto');
  } else {
    if (!confirm(`Wymieniono „${g.name}”? Licznik zacznie się od dziś.`)) return;
    g.since = toISODate(new Date());
    toast('Licznik wyzerowany');
  }
  save();
  renderGear();
});

/* ---------- 5. Checklista ---------- */

function renderCheckProgress() {
  const items = state.checklist;
  const done = items.filter(i => i.done).length;
  $('#checkCount').textContent = `${done} / ${items.length}`;
  $('#checkMsg').textContent = !items.length ? 'lista jest pusta'
    : done === items.length ? 'wszystko gotowe – powodzenia!'
    : `zostało ${items.length - done}`;
  $('#checkBar').style.width = items.length ? `${(done / items.length) * 100}%` : '0';
}

function renderChecklist() {
  const items = state.checklist;
  $('#checkList').innerHTML = items.length
    ? items.map(i => `<li class="check">
        <label><input type="checkbox" data-id="${esc(i.id)}"${i.done ? ' checked' : ''}><span>${esc(i.text)}</span></label>
        <button type="button" class="icon-btn" data-del="${esc(i.id)}" aria-label="Usuń: ${esc(i.text)}">${ICON.trash}</button>
      </li>`).join('')
    : '<li class="empty">Lista jest pusta – dodaj pierwszą pozycję poniżej.</li>';
  renderCheckProgress();
}

$('#checkList').addEventListener('change', e => {
  const item = state.checklist.find(i => i.id === e.target.dataset.id);
  if (!item) return;
  item.done = e.target.checked;
  save();
  renderCheckProgress();
});

$('#checkList').addEventListener('click', e => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  state.checklist = state.checklist.filter(i => i.id !== btn.dataset.del);
  save();
  renderChecklist();
});

$('#checkForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#checkText').value.trim();
  if (!text) return;
  state.checklist.push({ id: uid(), text, done: false });
  save();
  renderChecklist();
  $('#checkText').value = '';
  $('#checkText').focus();
});

$('#checkReset').addEventListener('click', () => {
  if (!state.checklist.some(i => i.done)) return toast('Nic nie jest zaznaczone');
  state.checklist.forEach(i => { i.done = false; });
  save();
  renderChecklist();
  toast('Odznaczono wszystkie pozycje');
});

/* ---------- Kopia zapasowa ---------- */

const backupDialog = $('#backupDialog');

$('#backupBtn').addEventListener('click', () => backupDialog.showModal());
for (const dlg of [backupDialog, resultDialog]) {
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
}

$('#exportBtn').addEventListener('click', () => {
  const data = { app: 'rowerowy-niezbednik', exportedAt: new Date().toISOString(), ...state };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `rowerowy-niezbednik-${toISODate(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  backupDialog.close();
  toast('Pobrano kopię zapasową');
});

$('#importInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    const raw = JSON.parse(await file.text());
    if (!raw || !['rides', 'races', 'checklist', 'gear'].some(k => Array.isArray(raw[k]))) throw new Error();
    data = normalize(raw);
  } catch (err) {
    backupDialog.close();
    return toast('To nie jest kopia zapasowa z tej aplikacji');
  }
  const summary = `przejazdy: ${data.rides.length}, zawody: ${data.races.length}, części: ${data.gear.length}, pozycje checklisty: ${data.checklist.length}`;
  if (!confirm(`Wczytać kopię zapasową?\nW pliku: ${summary}.\n\nObecne dane zostaną zastąpione.`)) return;
  state = data;
  save();
  resetRideForm();
  resetRaceForm();
  renderAll();
  backupDialog.close();
  toast('Wczytano kopię zapasową');
});

// Zmiany zrobione w innej karcie przeglądarki.
window.addEventListener('storage', e => {
  if (e.key !== STORAGE_KEY) return;
  state = load();
  renderAll();
});

/* ---------- Start ---------- */

function renderAll() {
  bindSettings();
  renderRides();
  renderPace();
  renderRaces();
  renderCatalog();
  renderTools();
  renderChecklist();
}

resetRideForm();
$('#gearSince').value = toISODate(new Date());
showTab(location.hash.slice(1));
renderAll();
