/* 앱 셸 — 해시 라우팅, 모바일 탭바/데스크톱 사이드바, 테마, FAB */
import { state, applyTheme, getThemePref, setThemePref, upcomingAssessments } from './store.js';
import { el, fmtFull, icon, toast } from './utils.js';

import todayView from './views/today.js';
import mealView from './views/meal.js';
import timetableView from './views/timetable.js';
import assessmentsView from './views/assessments.js';
import examsView from './views/exams.js';
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
  { id: 'exams', label: '시험', icon: 'exam', view: examsView, tab: 'assessments', sidebar: true },
  { id: 'suggestions', label: '건의', sidebarLabel: '건의사항', icon: 'megaphone', view: suggestionsView, tab: 'suggestions', sidebar: true },
  { id: 'settings', label: '설정', icon: 'settings', view: settingsView, tab: null, sidebar: true },
];

const TABS = ['today', 'meal', 'timetable', 'assessments', 'suggestions'];

const routeId = () => {
  const id = location.hash.replace(/^#\/?/, '');
  return ROUTES.some((r) => r.id === id) ? id : 'today';
};

const navItem = (r, activeTab, { compact = false } = {}) => {
  const badge = r.badge?.() || 0;
  const label = compact ? r.label : (r.sidebarLabel || r.label);
  return `<a class="nav__item ${r.tab === activeTab || r.id === activeTab ? 'is-active' : ''}" href="#/${r.id}">
    ${icon[r.icon]}<span>${label}</span>
    ${badge ? `<span class="nav__badge">${badge}</span>` : ''}
  </a>`;
};

function renderNav(route) {
  const activeSidebar = route.id;
  const activeTab = route.tab;

  el('#nav').innerHTML = ROUTES.filter((r) => r.sidebar)
    .map((r) => navItem(r, activeSidebar)).join('');

  el('#tabbar').innerHTML = TABS
    .map((id) => ROUTES.find((r) => r.id === id))
    .map((r) => navItem(r, activeTab, { compact: true })).join('');

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

  // 모바일에는 사이드바가 없으므로 설정 버튼을 앱바에 둔다.
  el('#topbarActions').innerHTML = (view.actions ? view.actions() : '') + (route.id === 'settings' ? '' :
    `<a class="icon-btn mob-only" href="#/settings" aria-label="설정">${icon.settings}</a>`);

  renderNav(route);
  renderFab(view);

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

el('#themeToggle')?.addEventListener('click', () => {
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(getThemePref()) + 1) % order.length];
  setThemePref(next);
  syncThemeLabel();
  render();
  toast(`테마: ${THEME_LABEL[next]}`);
});

/* 스크롤하면 앱바에 구분선 */
const topbar = el('#topbar');
addEventListener('scroll', () => {
  topbar.classList.toggle('is-stuck', window.scrollY > 4);
}, { passive: true });

applyTheme();
syncThemeLabel();
render();

/* 자정을 넘기면 화면을 갱신 */
let lastDay = new Date().getDate();
setInterval(() => {
  const d = new Date().getDate();
  if (d !== lastDay) { lastDay = d; render(); }
}, 60_000);
