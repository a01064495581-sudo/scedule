/* 앱 셸 — 해시 라우팅, 모바일 탭바/데스크톱 사이드바, 테마, FAB */
import {
  ADMIN_CODE, state, applyTheme, getThemePref, isAdmin, setAdmin, setThemePref, upcomingAssessments,
} from './store.js';
import { isShared, pull } from './server.js';
import { el, fmtFull, icon, toast } from './utils.js';

import todayView from './views/today.js';
import mealView from './views/meal.js';
import timetableView from './views/timetable.js';
import assessmentsView from './views/assessments.js';
import examsView from './views/exams.js';
import notesView from './views/notes.js';
import suggestionsView from './views/suggestions.js';
import settingsView from './views/settings.js';

/**
 * tab      : 모바일 하단 탭바에 노출할 대표 화면 (시험은 '평가' 탭에 묶인다)
 * sidebar  : 데스크톱 사이드바 노출 여부
 */
const ROUTES = [
  { id: 'today', label: '오늘', icon: 'today', view: todayView, tab: 'today', sidebar: true },
  { id: 'meal', label: '급식', icon: 'meal', view: mealView, tab: 'meal', sidebar: true },
  { id: 'timetable', label: '시간표', icon: 'timetable', view: timetableView, tab: 'timetable', sidebar: true },
  {
    id: 'assessments', label: '평가', sidebarLabel: '수행평가', icon: 'task', view: assessmentsView,
    tab: 'assessments', sidebar: true, badge: () => upcomingAssessments().length,
  },
  { id: 'exams', label: '시험', sidebarLabel: '정기시험', icon: 'exam', view: examsView, tab: 'assessments', sidebar: true },
  { id: 'notes', label: '노트', sidebarLabel: '요점정리', icon: 'note', view: notesView, tab: 'notes', sidebar: true },
  { id: 'suggestions', label: '건의', sidebarLabel: '건의사항', icon: 'megaphone', view: suggestionsView, tab: 'suggestions', sidebar: true },
  // 설정(관리자 패널)은 12자리 주소를 아는 사람만 들어온다.
  { id: 'settings', label: '설정', icon: 'settings', view: settingsView, tab: null, sidebar: false },
];

const TABS = ['today', 'meal', 'timetable', 'assessments', 'notes', 'suggestions'];

const routeId = () => {
  const id = location.hash.replace(/^#\/?/, '');

  // 관리자 주소로 들어오면 이 기기를 관리자로 기억한다.
  if (id === ADMIN_CODE) {
    setAdmin(true);
    return 'settings';
  }
  // 잠금 해제 전에는 설정 화면을 열 수 없다.
  if (id === 'settings' && !isAdmin()) return 'today';

  return ROUTES.some((r) => r.id === id) ? id : 'today';
};

/**
 * compact=true  → 모바일 탭바. 시험처럼 다른 화면에 묶인 경우 대표 탭이 켜진다.
 * compact=false → 데스크톱 사이드바. 지금 보고 있는 화면 하나만 켜진다.
 */
const navItem = (r, route, { compact = false } = {}) => {
  const badge = r.badge?.() || 0;
  const active = compact ? r.tab === route.tab : r.id === route.id;
  const label = compact ? r.label : (r.sidebarLabel || r.label);
  return `<a class="nav__item ${active ? 'is-active' : ''}" href="#/${r.id}">
    ${icon[r.icon]}<span>${label}</span>
    ${badge ? `<span class="nav__badge">${badge}</span>` : ''}
  </a>`;
};

function renderNav(route) {
  const sidebarRoutes = ROUTES.filter((r) => r.sidebar || (r.id === 'settings' && isAdmin()));
  el('#nav').innerHTML = sidebarRoutes.map((r) => navItem(r, route)).join('');

  el('#tabbar').innerHTML = TABS
    .map((id) => ROUTES.find((r) => r.id === id))
    .map((r) => navItem(r, route, { compact: true })).join('');

  el('#brandSchool').textContent = state.school
    ? `${state.school.name}${state.profile.grade ? ` · ${state.profile.grade}-${state.profile.classNm}` : ''}`
    : '학교를 설정해 주세요';
}

/** 화면이 제공하는 주요 액션을 모바일 FAB 에 연결 */
function renderFab(view) {
  const fab = el('#fab');
  const spec = view.fab?.();
  if (!spec) {
    fab.hidden = true;
    fab.onclick = null;
    return;
  }
  fab.hidden = false;
  fab.innerHTML = `${icon[spec.icon || 'plus']}<span>${spec.label}</span>`;
  fab.onclick = spec.action;
}

function render() {
  const route = ROUTES.find((r) => r.id === routeId());
  const view = route.view;

  document.body.dataset.section = route.id;
  document.title = `${view.title} · 스케줄`;
  el('#topbarTitle').textContent = view.title;
  el('#topbarDate').textContent = state.school
    ? `${state.school.name} · ${fmtFull(new Date())}`
    : fmtFull(new Date());

  // 앱바: 누구나 쓰는 테마 전환 + (관리자만) 설정 바로가기
  const dark = document.documentElement.dataset.theme === 'dark';
  el('#topbarActions').innerHTML = (view.actions ? view.actions() : '')
    + `<button type="button" class="icon-btn" id="themeQuick"
         aria-label="테마 전환 (현재 ${dark ? '다크' : '라이트'})">${dark ? icon.sun : icon.moon}</button>`
    + (isAdmin() && route.id !== 'settings'
      ? `<a class="icon-btn mob-only" href="#/settings" aria-label="관리자 설정">${icon.settings}</a>` : '');

  renderNav(route);
  renderFab(view);

  el('#themeQuick')?.addEventListener('click', cycleTheme);

  const root = el('#view');
  root.innerHTML = '';
  view.render(root);
  window.scrollTo({ top: 0 });
}

/* 화면 안에서 데이터가 바뀌면 이 이벤트로 다시 그린다 */
document.addEventListener('scedule:rerender', render);
window.addEventListener('hashchange', render);

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getThemePref() === 'auto') { applyTheme(); render(); }
});

/* 사이드바 테마 버튼: 자동 → 라이트 → 다크 순환 */
const THEME_LABEL = { auto: '자동', light: '라이트', dark: '다크' };
const syncThemeLabel = () => {
  const label = el('.theme-toggle__label');
  if (label) label.textContent = `테마 · ${THEME_LABEL[getThemePref()]}`;
};

function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(getThemePref()) + 1) % order.length];
  setThemePref(next);
  syncThemeLabel();
  render();
  toast(`테마: ${THEME_LABEL[next]}`);
}

el('#themeToggle')?.addEventListener('click', cycleTheme);

/* 스크롤하면 앱바에 구분선 */
const topbar = el('#topbar');
addEventListener('scroll', () => {
  topbar.classList.toggle('is-stuck', window.scrollY > 4);
}, { passive: true });

applyTheme();
syncThemeLabel();
render();

/* 공용 서버가 연결돼 있으면 시작할 때, 그리고 앱으로 돌아올 때 최신 내용을 받아 온다 */
async function syncNow() {
  if (!isShared()) return;
  try {
    await pull({ force: true });
    render();
  } catch (e) {
    console.warn('공용 데이터 동기화 실패', e);
  }
}
syncNow();
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
setInterval(syncNow, 5 * 60_000);

/* 자정을 넘기면 화면을 갱신 */
let lastDay = new Date().getDate();
setInterval(() => {
  const d = new Date().getDate();
  if (d !== lastDay) { lastDay = d; render(); }
}, 60_000);
