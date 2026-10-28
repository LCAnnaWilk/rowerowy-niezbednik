'use strict';

const STORAGE_KEY = 'rowerowy-niezbednik';
const TABS = ['dziennik', 'tempo', 'zawody', 'checklista'];

// Próg (m) ignorujący szum wysokości z GPS przy liczeniu przewyższenia.
const ELE_THRESHOLD = 3;
// Poniżej tej prędkości (m/s) odcinek GPX traktujemy jako postój.
const MIN_MOVING_SPEED = 1;

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

const ICON = {
  edit: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
};

/* ---------- Narzędzia ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const pad = n => String(n).padStart(2, '0');

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

function fmtClock(sec) {
  sec = Math.round(sec);
  const days = Math.floor(sec / 86400);
  const s = sec % 86400;
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}${days ? ` <span class="muted">+${days} d</span>` : ''}`;
}

function readDuration(prefix) {
  return Math.max(0, num($(`#${prefix}H`).value) * 3600 + num($(`#${prefix}M`).value) * 60 + num($(`#${prefix}S`).value));
}

function setDuration(prefix, sec) {
  sec = Math.round(sec);
  $(`#${prefix}H`).value = sec > 0 ? Math.floor(sec / 3600) : '';
  $(`#${prefix}M`).value = sec > 0 ? Math.floor(sec % 3600 / 60) : '';
  $(`#${prefix}S`).value = sec > 0 ? sec % 60 : '';
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

function normalize(d) {
  if (!d || typeof d !== 'object') return null;
  const arr = x => (Array.isArray(x) ? x : []);
  return {
    version: 1,
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
        time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : ''
      })),
    checklist: Array.isArray(d.checklist)
      ? d.checklist.filter(i => i && i.text).map(i => ({ id: String(i.id || uid()), text: String(i.text), done: !!i.done }))
      : defaultChecklist()
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
  return { version: 1, rides: [], races: [], checklist: defaultChecklist() };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Nie udało się zapisać danych w przeglądarce');
  }
}

let state = load();

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
}

window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

/* ---------- 1. Dziennik treningów ---------- */

function summarize(filter) {
  return state.rides.filter(filter).reduce((a, r) => {
    a.km += r.distance; a.sec += r.duration; a.ele += r.elevation; a.n++;
    return a;
  }, { km: 0, sec: 0, ele: 0, n: 0 });
}

function statTile(label, value, unit, sub, accent = false) {
  return `<div class="stat${accent ? ' accent' : ''}">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ''}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}

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
      from = startOfWeek(now);
      from.setDate(from.getDate() - i * 7);
      to = new Date(from);
      to.setDate(to.getDate() + 7);
      label = `${from.getDate()}.${pad(from.getMonth() + 1)}`;
      title = `Tydzień od ${from.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}`;
    } else {
      from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
      label = from.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '');
      title = from.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    }
    const f = toISODate(from), t = toISODate(to);
    const km = state.rides.filter(r => r.date >= f && r.date < t).reduce((a, r) => a + r.distance, 0);
    buckets.push({ label, title, km, current: i === 0 });
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
  document.querySelectorAll('[data-chart]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
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
    out.innerHTML = '<p class="empty">Wpisz dystans i docelowy czas – pokażę wymaganą średnią prędkość i międzyczasy co 10 km.</p>';
    return;
  }

  const speed = d / (t / 3600);
  const secPerKm = t / d;
  const start = $('#paceStart').value;
  const startSec = /^\d{2}:\d{2}/.test(start) ? Number(start.slice(0, 2)) * 3600 + Number(start.slice(3, 5)) * 60 : null;

  const marks = [];
  for (let k = 10; k < d - 1e-9; k += 10) marks.push(k);
  marks.push(d);

  const rows = marks.map(k => {
    const at = t * k / d;
    const isFinish = k === d;
    return `<tr>
      <td>${nf2.format(k)} km${isFinish ? '<span class="finish">meta</span>' : ''}</td>
      <td>${fmtDuration(at)}</td>
      ${startSec !== null ? `<td>${fmtClock(startSec + at)}</td>` : ''}
    </tr>`;
  }).join('');

  out.innerHTML = `
    <div class="result-hero">
      ${statTile('Wymagana średnia', nf1.format(speed), 'km/h', `na ${nf2.format(d)} km`, true)}
      ${statTile('Czas na 1 km', `${Math.floor(Math.round(secPerKm) / 60)}:${pad(Math.round(secPerKm) % 60)}`, 'min',
        `10 km co ${fmtDuration(secPerKm * 10)}`)}
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
  renderPace();
});

/* ---------- 3. Odliczanie do zawodów ---------- */

function raceTarget(r) {
  const d = parseISODate(r.date);
  if (r.time) d.setHours(Number(r.time.slice(0, 2)), Number(r.time.slice(3, 5)));
  return d.getTime();
}

function countdownParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor(s % 86400 / 3600),
    m: Math.floor(s % 3600 / 60),
    s: s % 60
  };
}

function renderRaces() {
  const now = Date.now();
  const today = toISODate(new Date());
  const races = state.races.map(r => ({ ...r, target: raceTarget(r) }));
  const isUpcoming = r => r.target > now;
  const upcoming = races.filter(isUpcoming).sort((a, b) => a.target - b.target);
  const past = races.filter(r => !isUpcoming(r)).sort((a, b) => b.target - a.target);

  const item = (r, i) => {
    const when = fmtDate(r.date) + (r.time ? `, godz. ${r.time}` : '');
    const head = `<div class="race-head">
        <div class="race-info">
          ${i === 0 && isUpcoming(r) ? '<span class="race-tag">Najbliższe</span>' : ''}
          <div class="race-name">${esc(r.name)}</div>
          <div class="race-date">${when}</div>
        </div>
        <button type="button" class="icon-btn danger" data-del="${esc(r.id)}" aria-label="Usuń zawody ${esc(r.name)}">${ICON.trash}</button>
      </div>`;
    if (isUpcoming(r)) {
      return `<li class="race${i === 0 ? ' next' : ''}" data-target="${r.target}">${head}
        <div class="countdown">
          <div class="cd-box"><span class="cd-num" data-u="d"></span><span class="cd-unit" data-l="d"></span></div>
          <div class="cd-box"><span class="cd-num" data-u="h"></span><span class="cd-unit">godz.</span></div>
          <div class="cd-box"><span class="cd-num" data-u="m"></span><span class="cd-unit">min</span></div>
          <div class="cd-box"><span class="cd-num" data-u="s"></span><span class="cd-unit">s</span></div>
        </div>
      </li>`;
    }
    const status = r.date === today
      ? '<p class="race-status today">To dziś – powodzenia!</p>'
      : '<p class="race-status muted">Zawody już się odbyły</p>';
    return `<li class="race${r.date === today ? '' : ' past'}">${head}${status}</li>`;
  };

  $('#raceList').innerHTML = races.length
    ? upcoming.map(item).join('') + past.map(r => item(r, -1)).join('')
    : '<li class="empty">Brak zaplanowanych zawodów. Dodaj pierwsze powyżej.</li>';
  tickRaces();
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

$('#raceForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#raceName').value.trim();
  const date = $('#raceDate').value;
  if (!name) return toast('Podaj nazwę zawodów');
  if (!isISODate(date)) return toast('Podaj datę zawodów');
  state.races.push({ id: uid(), name, date, time: $('#raceTime').value.slice(0, 5) });
  save();
  e.target.reset();
  renderRaces();
  toast('Dodano zawody');
});

$('#raceList').addEventListener('click', e => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  const race = state.races.find(r => r.id === btn.dataset.del);
  if (!race || !confirm(`Usunąć zawody „${race.name}”?`)) return;
  state.races = state.races.filter(r => r.id !== race.id);
  save();
  renderRaces();
  toast('Usunięto zawody');
});

setInterval(tickRaces, 1000);

/* ---------- 4. Checklista ---------- */

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
backupDialog.addEventListener('click', e => { if (e.target === backupDialog) backupDialog.close(); });

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
    if (!raw || !['rides', 'races', 'checklist'].some(k => Array.isArray(raw[k]))) throw new Error();
    data = normalize(raw);
  } catch (err) {
    backupDialog.close();
    return toast('To nie jest kopia zapasowa z tej aplikacji');
  }
  const summary = `przejazdy: ${data.rides.length}, zawody: ${data.races.length}, pozycje checklisty: ${data.checklist.length}`;
  if (!confirm(`Wczytać kopię zapasową?\nW pliku: ${summary}.\n\nObecne dane zostaną zastąpione.`)) return;
  state = data;
  save();
  resetRideForm();
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
  renderRides();
  renderPace();
  renderRaces();
  renderChecklist();
}

resetRideForm();
showTab(location.hash.slice(1));
renderAll();
