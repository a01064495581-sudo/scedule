/* 급식 화면 — 주간/월간, 나이스 연동 */
import { state } from '../store.js';
import { getMeals } from '../data.js';
import { ALLERGY } from '../neis.js';
import { card, emptyState, skeletonList } from '../ui.js';
import { DOW, addDays, esc, el, icon, startOfWeek, today, ymd, parseDate, toast } from '../utils.js';

/** 인증키가 없어 결과가 잘렸을 때 안내 */
export const truncatedNotice = () => `
  <p class="hint" style="margin-bottom:10px">
    인증키가 없어 최근 5건만 표시됩니다. <a href="#/settings">설정</a>에서 나이스 인증키를 등록하면 전체 기간을 볼 수 있어요.
  </p>`;

/** 끼니별 메뉴를 칩으로 — 한 줄에 여러 개가 들어가 세로 길이가 짧다 */
export const dishChips = (meal) => `
  <ul class="dish-chips">
    ${meal.dishes.map((d) => `
      <li class="dish-chip"${d.allergies.length
        ? ` title="알레르기 ${esc(d.allergies.map((n) => ALLERGY[n] || n).join(', '))}"` : ''}>
        ${esc(d.name)}${d.allergies.length ? `<small>${esc(d.allergies.join('·'))}</small>` : ''}
      </li>`).join('')}
  </ul>`;

/** '오늘' 화면 블록 — 끼니가 여러 개면 탭으로 하나씩 (조식·중식·석식) */
export function mealBlock(meals, { idPrefix = 'tm' } = {}) {
  if (!meals || !meals.length) {
    return emptyState('급식 정보가 없습니다', '휴일이거나 아직 등록되지 않았어요.', '🍽️');
  }
  if (meals.length === 1) {
    const m = meals[0];
    return `<div class="meal-type-head">${esc(m.type)}${m.calorie ? ` · ${esc(m.calorie)}` : ''}</div>
      ${dishChips(m)}`;
  }

  return `
    <div class="segmented segmented--full" data-meal-tabs="${idPrefix}">
      ${meals.map((m, i) => `
        <button type="button" data-meal-index="${i}" class="${i === defaultMealIndex(meals) ? 'is-active' : ''}">
          ${esc(m.type)}
        </button>`).join('')}
    </div>
    ${meals.map((m, i) => `
      <div class="meal-pane" data-meal-pane="${i}" ${i === defaultMealIndex(meals) ? '' : 'hidden'}>
        ${m.calorie ? `<div class="meal-type-head">${esc(m.calorie)}</div>` : ''}
        ${dishChips(m)}
      </div>`).join('')}`;
}

/** 지금 시각에 가장 가까운 끼니를 기본으로 연다 */
function defaultMealIndex(meals) {
  const h = new Date().getHours();
  const want = h < 9 ? '조식' : h < 14 ? '중식' : '석식';
  const i = meals.findIndex((m) => m.type === want);
  return i === -1 ? 0 : i;
}

/** 끼니 탭 동작 — 화면을 그린 뒤 한 번 호출 */
export function bindMealTabs(root = document) {
  root.querySelectorAll('[data-meal-tabs]').forEach((tabs) => {
    if (tabs.dataset.bound) return;
    tabs.dataset.bound = '1';
    const scope = tabs.parentElement;
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-meal-index]');
      if (!btn) return;
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
      scope.querySelectorAll('[data-meal-pane]').forEach((pane) => {
        pane.hidden = pane.dataset.mealPane !== btn.dataset.mealIndex;
      });
    });
  });
}

let offset = 0;      // 기준 주/월 (0 = 이번)
let mode = 'week';   // week | month
let picked = null;   // 선택한 날짜 'YYYYMMDD'
let loaded = [];     // 현재 기간에 불러온 급식

export default {
  title: '급식',

  actions: () => `<button class="btn btn--sm" id="mealRefresh" aria-label="새로고침">${icon.refresh}</button>`,

  async render(root) {
    if (!state.school) {
      root.innerHTML = card('', emptyState('학교를 먼저 설정해 주세요', '설정에서 학교를 검색해 등록하면 급식이 표시됩니다.', '🏫'));
      return;
    }

    const range = currentRange();
    root.innerHTML = `
      <div class="stack">
        <div class="segmented segmented--full" id="mealMode">
          <button type="button" data-mode="week" class="${mode === 'week' ? 'is-active' : ''}">주간</button>
          <button type="button" data-mode="month" class="${mode === 'month' ? 'is-active' : ''}">월간</button>
        </div>
        <div class="range-bar">
          <button type="button" class="icon-btn" id="mealPrev" aria-label="이전">${icon.chevronL}</button>
          <span class="range-bar__label" id="mealLabel">${esc(range.label)}</span>
          <button type="button" class="icon-btn" id="mealNext" aria-label="다음">${icon.chevronR}</button>
        </div>
      </div>

      <div id="mealBody">${skeletonList(3)}</div>

      <details class="card">
        <summary class="card__title" style="cursor:pointer">알레르기 표기 보기</summary>
        <div class="allergy-legend" style="margin-top:12px">
          ${Object.entries(ALLERGY).map(([n, name]) => `<span class="chip">${n} ${esc(name)}</span>`).join('')}
        </div>
      </details>`;

    bindActions();
    await load(range);
  },
};

function currentRange() {
  const base = today();
  if (mode === 'week') {
    const start = addDays(startOfWeek(base), offset * 7);
    const end = addDays(start, 6);
    return {
      start, end,
      label: `${start.getMonth() + 1}.${start.getDate()} ~ ${end.getMonth() + 1}.${end.getDate()}`,
    };
  }
  const start = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { start, end, label: `${start.getFullYear()}년 ${start.getMonth() + 1}월` };
}

async function load(range, force = false) {
  const body = el('#mealBody');
  if (!body) return;
  body.innerHTML = skeletonList(3);
  try {
    const res = await getMeals(ymd(range.start), ymd(range.end), { force });
    loaded = res?.meals || [];
    body.innerHTML = (res?.truncated ? truncatedNotice() : '') + renderBody(range);
    bindBody();
  } catch (e) {
    loaded = [];
    body.innerHTML = card('', emptyState('급식을 불러오지 못했습니다', e.message, '⚠️'));
  }
}

/** 날짜별로 묶기 */
function byDate() {
  const map = new Map();
  for (const m of loaded) {
    if (!map.has(m.date)) map.set(m.date, []);
    map.get(m.date).push(m);
  }
  return map;
}

function renderBody(range) {
  const map = byDate();
  if (!map.size) {
    return card('', emptyState('이 기간에 등록된 급식이 없습니다',
      '방학이거나 학교가 아직 등록하지 않았을 수 있어요.', '🍽️'));
  }

  const dates = [...map.keys()].sort();
  const todayYmd = ymd(today());
  if (!picked || !dates.includes(picked)) {
    picked = dates.includes(todayYmd) ? todayYmd : dates[0];
  }

  const meals = map.get(picked) || [];
  const d = parseDate(picked);

  return `
    ${mode === 'week' ? dayStrip(dates, todayYmd) : monthGrid(range, map, todayYmd)}
    <section class="card meal-detail">
      <div class="meal-detail__head">
        <div>
          <div class="meal-card__date">${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})</div>
          <p class="muted">${picked === todayYmd ? '오늘 급식' : esc(state.school?.name || '')}</p>
        </div>
        <span class="chip">${meals.length}끼니</span>
      </div>
      ${mealBlock(meals, { idPrefix: 'mv' })}
    </section>`;
}

/** 주간: 요일 칩 한 줄 → 고른 날만 자세히 (세로로 길어지지 않는다) */
function dayStrip(dates, todayYmd) {
  return `<div class="day-strip">${dates.map((date) => {
    const d = parseDate(date);
    return `<button type="button" class="day-chip ${date === picked ? 'is-active' : ''} ${date === todayYmd ? 'is-today' : ''}"
      data-date="${date}">
      <span class="day-chip__dow">${DOW[d.getDay()]}</span>
      <span class="day-chip__num">${d.getDate()}</span>
    </button>`;
  }).join('')}</div>`;
}

/** 월간: 달력 격자 — 급식 있는 날만 누를 수 있다 */
function monthGrid(range, map, todayYmd) {
  const first = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const cells = [];

  for (let i = 0; i < ((first.getDay() + 6) % 7); i++) cells.push('<span class="cal-cell is-blank"></span>');
  for (let day = 1; day <= last.getDate(); day++) {
    const date = ymd(new Date(first.getFullYear(), first.getMonth(), day));
    const has = map.has(date);
    cells.push(`<button type="button" class="cal-cell ${has ? '' : 'is-blank'}
      ${date === picked ? 'is-active' : ''} ${date === todayYmd ? 'is-today' : ''}"
      ${has ? `data-date="${date}"` : 'disabled'}>${day}${has ? '<i></i>' : ''}</button>`);
  }

  return `<section class="card">
    <div class="cal-head">${['월', '화', '수', '목', '금', '토', '일'].map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
  </section>`;
}

function bindBody() {
  const body = el('#mealBody');
  if (!body) return;

  // 날짜 선택은 위임으로 한 번만 연결한다 (끼니 탭 클릭에 지워지면 안 된다)
  if (!body.dataset.bound) {
    body.dataset.bound = '1';
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-date]');
      if (!btn) return;
      picked = btn.dataset.date;
      body.innerHTML = renderBody(currentRange());
      bindMealTabs(body);
    });
  }
  bindMealTabs(body);
}

function bindActions() {
  const rerender = () => document.dispatchEvent(new CustomEvent('scedule:rerender'));

  el('#mealPrev')?.addEventListener('click', () => { offset -= 1; picked = null; rerender(); });
  el('#mealNext')?.addEventListener('click', () => { offset += 1; picked = null; rerender(); });
  el('#mealRefresh')?.addEventListener('click', async () => {
    await load(currentRange(), true);
    toast('급식 정보를 새로 불러왔습니다.');
  });
  el('#mealMode')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn || btn.dataset.mode === mode) return;
    mode = btn.dataset.mode;
    offset = 0;
    picked = null;
    rerender();
  });
}
