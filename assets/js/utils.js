/* 날짜·DOM·문자열 유틸 */

export const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** Date → 'YYYYMMDD' (NEIS 파라미터 형식) */
export const ymd = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};

/** Date → 'YYYY-MM-DD' (input[type=date] 형식) */
export const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 'YYYY-MM-DD' 또는 'YYYYMMDD' → Date (로컬 자정) */
export const parseDate = (s) => {
  if (!s) return null;
  const t = String(s).replace(/\D/g, '');
  if (t.length !== 8) return null;
  return new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8));
};

export const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

/** 그 주의 월요일 */
export const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7));

/** 남은 일수 (오늘=0, 지남<0) */
export const daysUntil = (dateStr) => {
  const t = parseDate(dateStr);
  if (!t) return null;
  return Math.round((t - today()) / 86400000);
};

export const ddayLabel = (n) => {
  if (n === null) return '';
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n}`;
};

export const ddayClass = (n) => {
  if (n === null) return '';
  if (n < 0) return 'dday--past';
  if (n === 0) return 'dday--today';
  if (n <= 3) return 'dday--soon';
  if (n <= 7) return 'dday--near';
  return '';
};

export const fmtDate = (s, opts = {}) => {
  const d = parseDate(s);
  if (!d) return '';
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return opts.dow === false ? base : `${base} (${DOW[d.getDay()]})`;
};

export const fmtFull = (d) =>
  `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;

/** 현재 학년도·학기 추정 (3~8월 1학기, 그 외 2학기) */
export const currentTerm = () => {
  const d = new Date();
  const m = d.getMonth() + 1;
  return { year: m < 3 ? d.getFullYear() - 1 : d.getFullYear(), semester: m >= 3 && m <= 8 ? 1 : 2 };
};

/** ISO 시각 → '방금 전 / 12분 전 / 3시간 전 / 어제 / 8월 3일' */
export const fromNow = (isoStr) => {
  const t = new Date(isoStr);
  if (isNaN(t)) return '';
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 172800) return '어제';
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return `${t.getMonth() + 1}월 ${t.getDate()}일`;
};

/* --- DOM --- */

export const el = (sel, root = document) => root.querySelector(sel);
export const els = (sel, root = document) => [...root.querySelectorAll(sel)];

/** HTML 이스케이프 — 사용자 입력·외부 API 문자열은 반드시 통과시킨다 */
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Math.random().toString(36).slice(2, 10);

/** 과목명 → 안정적인 파스텔 색상 */
export const subjectColor = (name) => {
  if (!name) return 'transparent';
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const dark = document.documentElement.dataset.theme === 'dark';
  return dark ? `hsl(${h} 62% 66%)` : `hsl(${h} 58% 52%)`;
};

let toastTimer;
export const toast = (msg) => {
  const wrap = el('#toastWrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="toast">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (wrap.innerHTML = ''), 2400);
};

/* --- 아이콘 (Lucide 스타일 인라인 SVG) --- */
const P = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icon = {
  today: P('<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="16" r="1.6" fill="currentColor"/>'),
  meal: P('<path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v6M10 3v6"/><path d="M17 3c-1.5 2-2 4-2 7 0 1.5.7 2.5 2 3v8"/>'),
  timetable: P('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12M3 15h18"/>'),
  task: P('<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="m9 13 2 2 4-4"/>'),
  exam: P('<path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  settings: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-2.9-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1-.6H2a2 2 0 1 1 0-4h.2A1.7 1.7 0 0 0 3.7 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6h.1A1.7 1.7 0 0 0 10 3V2a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  edit: P('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash: P('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  chevronL: P('<path d="m15 18-6-6 6-6"/>'),
  chevronR: P('<path d="m9 18 6-6-6-6"/>'),
  refresh: P('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  school: P('<path d="m12 3 9 5-9 5-9-5Z"/><path d="M5 10v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
  heart: P('<path d="M12 20.5 4.6 13a4.7 4.7 0 0 1 0-6.7 4.7 4.7 0 0 1 6.7 0l.7.7.7-.7a4.7 4.7 0 0 1 6.7 0 4.7 4.7 0 0 1 0 6.7Z"/>'),
  megaphone: P('<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M16 8.5a4 4 0 0 1 0 7"/><path d="M19 6a8 8 0 0 1 0 12"/>'),
  trophy: P('<path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4v1a4 4 0 0 0 3 3.9M17 6h3v1a4 4 0 0 1-3 3.9"/><path d="M10 19h4M12 14v5M8 21h8"/>'),
  send: P('<path d="M21 3 3 10.5l7 3 3 7Z"/><path d="M10 13.5 21 3"/>'),
  download: P('<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  upload: P('<path d="M12 21V9m0 0 4 4M12 9 8 13"/><path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/>'),
};
