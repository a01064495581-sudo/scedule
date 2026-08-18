/* 앱 상태 — localStorage 영속화 + 간단한 구독 모델 */

const KEY = 'scedule.state.v1';
const THEME_KEY = 'scedule.theme';

/** 우리 학교 (경북 영천시 안야사길 13) — 설정에서 언제든 바꿀 수 있다 */
export const DEFAULT_SCHOOL = {
  name: '영동고등학교',
  kind: 'his',
  atptCode: 'R10',
  atptName: '경상북도교육청',
  sdCode: '8750192',
  address: '경상북도 영천시 안야사길 13',
  kindName: '고등학교',
};

/** 관리자 패널 주소 — 이 12자리를 아는 사람만 설정 화면에 들어올 수 있다.
 *  (완전한 보안은 아니다. 코드가 공개 저장소에 있으므로 '숨김'에 가깝다.) */
export const ADMIN_CODE = '688219355416';
const ADMIN_KEY = 'scedule.admin';

export const isAdmin = () => localStorage.getItem(ADMIN_KEY) === '1';

export function setAdmin(on) {
  if (on) localStorage.setItem(ADMIN_KEY, '1');
  else localStorage.removeItem(ADMIN_KEY);
}

const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const defaults = () => ({
  school: DEFAULT_SCHOOL,
  profile: { grade: '', classNm: '' },
  neisKey: '',
  periods: 7,
  timetable: {},       // { '0-0': { subject, room, teacher } }  key = `${요일0~4}-${교시0-base}`
  assessments: [],     // { id, subject, title, date, note, done }
  exams: [],           // { id, name, sessions: [{ id, date, period, subject, range }] }
  bells: [             // 교시별 시작/종료 — '오늘' 화면의 현재 수업 표시에 사용
    ['08:40', '09:30'], ['09:40', '10:30'], ['10:40', '11:30'], ['11:40', '12:30'],
    ['13:30', '14:20'], ['14:30', '15:20'], ['15:30', '16:20'],
  ],

  /* 건의사항 */
  suggestions: [],     // 로컬 모드 저장소: { id, text, category, createdAt, likes }
  myLikes: [],         // 내가 좋아요한 건의 id
  myPosts: [],         // 이 기기에서 올린 건의 id (익명이지만 본인 삭제는 가능)
  boardUrl: '',        // 공유 게시판(Apps Script) 주소 — 비어 있으면 이 기기에만 저장
  deviceId: randomId(),// 좋아요 중복 방지용 익명 식별자 (개인정보 아님)
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

export const state = load();

const listeners = new Set();

/** 상태 변경 후 저장 + 구독자 알림 */
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('저장 실패', e);
  }
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(patch) {
  Object.assign(state, patch);
  save();
}

/* --- 테마 --- */
export const getThemePref = () => localStorage.getItem(THEME_KEY) || 'auto';

export function setThemePref(pref) {
  localStorage.setItem(THEME_KEY, pref);
  applyTheme();
}

export function applyTheme() {
  const pref = getThemePref();
  const dark = pref === 'dark' ||
    (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/* --- 백업 / 복원 --- */
export function exportJSON() {
  return JSON.stringify({ app: 'scedule', version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  const next = data && data.state ? data.state : data;
  if (!next || typeof next !== 'object') throw new Error('형식을 알 수 없는 파일입니다.');
  Object.assign(state, defaults(), next);
  save();
}

export function resetAll() {
  Object.assign(state, defaults());
  save();
}

/* --- 파생 데이터 --- */

/** 다가오는(=오늘 이후) 수행평가, 날짜순 */
export function upcomingAssessments(limit = Infinity) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return state.assessments
    .filter((a) => !a.done && a.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

/** 시험 기간의 시작/끝 날짜 */
export function examRange(exam) {
  const dates = (exam.sessions || []).map((s) => s.date).filter(Boolean).sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}

/** 아직 끝나지 않은 시험, 시작일순 */
export function upcomingExams() {
  const todayStr = new Date().toISOString().slice(0, 10);
  return state.exams
    .map((e) => ({ exam: e, range: examRange(e) }))
    .filter((x) => x.range && x.range.end >= todayStr)
    .sort((a, b) => a.range.start.localeCompare(b.range.start));
}

/** 특정 요일(0=월)의 시간표 행 목록 */
export function daySchedule(dayIdx) {
  const rows = [];
  for (let p = 0; p < state.periods; p++) {
    const cell = state.timetable[`${dayIdx}-${p}`];
    if (cell && cell.subject) rows.push({ period: p + 1, ...cell });
  }
  return rows;
}
