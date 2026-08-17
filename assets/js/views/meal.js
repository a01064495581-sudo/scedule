/* 급식 화면 — 주간/월간, 나이스 연동 */
import { state } from '../store.js';
import { getMeals } from '../data.js';
import { ALLERGY } from '../neis.js';
import { card, emptyState, skeletonList } from '../ui.js';
import { DOW, addDays, esc, el, icon, startOfWeek, today, ymd, parseDate, toast } from '../utils.js';

/** 급식 한 끼의 메뉴 목록 마크업 */
export function mealDishes(meal, { allergy = true } = {}) {
  return `<ul class="meal-list">${meal.dishes.map((d) => `
    <li class="meal-item">
      <span class="meal-item__name">${esc(d.name)}</span>
      ${allergy && d.allergies.length
        ? `<span class="meal-item__allergy" title="${esc(d.allergies.map((n) => ALLERGY[n] || n).join(', '))}">${esc(d.allergies.join('·'))}</span>`
        : ''}
    </li>`).join('')}</ul>`;
}

/** 인증키가 없어 결과가 잘렸을 때 안내 */
export const truncatedNotice = () => `
  <p class="hint" style="margin-bottom:10px">
    인증키가 없어 최근 5건만 표시됩니다. <a href="#/settings">설정</a>에서 나이스 인증키를 등록하면 전체 기간을 볼 수 있어요.
  </p>`;

/** '오늘' 화면 등에서 쓰는 끼니별 요약 블록 */
export function mealBlock(meals) {
  if (!meals || !meals.length) {
    return emptyState('급식 정보가 없습니다', '휴일이거나 아직 등록되지 않았어요.', '🍽️');
  }
  return meals.map((m) => `
    <div style="margin-bottom:14px">
      <div class="meal-type-head">${esc(m.type)}${m.calorie ? ` · ${esc(m.calorie)}` : ''}</div>
      ${mealDishes(m)}
    </div>`).join('');
}

let offset = 0;    // 기준 주/월 (0 = 이번)
let mode = 'week'; // week | month

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
        ${offset !== 0 ? '<button type="button" class="btn btn--sm btn--soft" id="mealToday" style="align-self:center">오늘로</button>' : ''}
      </div>

      <div id="mealBody">${skeletonList(3)}</div>

      ${card('알레르기 표기', `<div class="allergy-legend">
        ${Object.entries(ALLERGY).map(([n, name]) => `<span class="chip">${n} ${esc(name)}</span>`).join('')}
      </div>`)}`;

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
    body.innerHTML = (res?.truncated ? truncatedNotice() : '') + renderDays(res?.meals);
  } catch (e) {
    body.innerHTML = card('', emptyState('급식을 불러오지 못했습니다', e.message, '⚠️'));
  }
}

function renderDays(meals) {
  const byDate = new Map();
  for (const m of meals || []) {
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    byDate.get(m.date).push(m);
  }
  if (!byDate.size) {
    return card('', emptyState('이 기간에 등록된 급식이 없습니다', '방학이거나 학교가 아직 등록하지 않았을 수 있어요.', '🍽️'));
  }

  const todayYmd = ymd(today());
  const cards = [...byDate.keys()].sort().map((date) => {
    const d = parseDate(date);
    const list = byDate.get(date);
    return `
      <article class="card meal-card ${date === todayYmd ? 'is-today' : ''}">
        <div class="meal-card__head">
          <span class="meal-card__date">${d.getMonth() + 1}월 ${d.getDate()}일</span>
          <span class="meal-card__dow">${DOW[d.getDay()]}요일${date === todayYmd ? ' · 오늘' : ''}</span>
        </div>
        ${list.map((m) => `
          <div>
            <div class="meal-type-head">${esc(m.type)}${m.calorie ? ` · ${esc(m.calorie)}` : ''}</div>
            <ul>${m.dishes.map((x) => `<li>${esc(x.name)}</li>`).join('')}</ul>
          </div>`).join('')}
      </article>`;
  });
  return `<div class="meal-grid">${cards.join('')}</div>`;
}

function bindActions() {
  const rerender = () => document.dispatchEvent(new CustomEvent('scedule:rerender'));

  el('#mealPrev')?.addEventListener('click', () => { offset -= 1; rerender(); });
  el('#mealNext')?.addEventListener('click', () => { offset += 1; rerender(); });
  el('#mealToday')?.addEventListener('click', () => { offset = 0; rerender(); });
  el('#mealRefresh')?.addEventListener('click', async () => {
    await load(currentRange(), true);
    toast('급식 정보를 새로 불러왔습니다.');
  });
  el('#mealMode')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn || btn.dataset.mode === mode) return;
    mode = btn.dataset.mode;
    offset = 0;
    rerender();
  });
}
