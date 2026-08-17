/* 오늘 — 하루에 필요한 정보를 한 화면에 */
import { state, daySchedule, upcomingAssessments, upcomingExams } from '../store.js';
import { getMeals } from '../data.js';
import { listSuggestions, weeklyRanking } from '../board.js';
import { card, emptyState, skeletonList } from '../ui.js';
import { mealBlock } from './meal.js';
import { DAYS } from './timetable.js';
import {
  daysUntil, ddayClass, ddayLabel, el, esc, fmtDate, fmtFull, fromNow,
  icon, subjectColor, today, ymd,
} from '../utils.js';

export default {
  title: '오늘',

  render(root) {
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7;   // 0=월 … 6=일
    const isWeekend = dayIdx > 4;
    const rows = isWeekend ? [] : daySchedule(dayIdx);
    const nowPeriod = currentPeriod(now);

    const assessments = upcomingAssessments();
    const exams = upcomingExams();
    const next = [
      ...assessments.map((a) => ({ date: a.date, label: a.title })),
      ...exams.map((x) => ({ date: x.range.start, label: x.exam.name })),
    ].sort((a, b) => a.date.localeCompare(b.date))[0];

    root.innerHTML = `
      <section class="card card--accent hero">
        <div>
          <div class="hero__day">${fmtFull(now)}</div>
          <p class="hero__sub">${esc(state.school?.name || '학교가 설정되지 않았어요')}${
            state.profile.grade ? ` · ${esc(state.profile.grade)}학년 ${esc(state.profile.classNm)}반` : ''}</p>
        </div>
        <div class="hero__stats">
          <div class="hero__stat"><b>${isWeekend ? '휴일' : `${rows.length}교시`}</b><span>오늘 수업</span></div>
          <div class="hero__stat"><b>${assessments.length}개</b><span>남은 수행평가</span></div>
          <div class="hero__stat"><b>${next ? ddayLabel(daysUntil(next.date)) : '—'}</b>
            <span>${next ? esc(next.label) : '다가오는 일정 없음'}</span></div>
        </div>
      </section>

      <div class="grid grid--dash">
        ${card(
          isWeekend ? '다음 수업일 시간표' : '오늘 시간표',
          isWeekend ? weekendSchedule() : timeline(rows, nowPeriod),
          { actions: `<span class="muted">${isWeekend ? '주말이에요' : `${DAYS[dayIdx]}요일`}</span>` })}

        <div class="grid" style="gap:var(--gap)">
          ${card('오늘 급식', '<div id="todayMeal">' + skeletonList(2) + '</div>')}
          ${card('다가오는 일정', upcomingList(assessments, exams))}
          ${card(`${icon.trophy} 이번 주 인기 건의`, '<div id="todayTop">' + skeletonList(1) + '</div>',
            { actions: '<a class="muted" href="#/suggestions">전체 보기</a>' })}
        </div>
      </div>`;

    loadMeal();
    loadTopSuggestion();
  },
};

/** 지금이 몇 교시인지 (없으면 null) */
function currentPeriod(now) {
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const i = state.bells.findIndex(([s, e]) => s && e && hhmm >= s && hhmm <= e);
  return i === -1 ? null : i + 1;
}

function timeline(rows, nowPeriod) {
  if (!rows.length) {
    return emptyState('오늘 등록된 수업이 없습니다', '시간표 화면에서 직접 입력할 수 있어요.', '🗓️');
  }
  return `<div class="timeline">${rows.map((r) => {
    const bell = state.bells[r.period - 1] || [];
    return `<div class="timeline__row ${r.period === nowPeriod ? 'is-now' : ''}">
      <span class="timeline__period">${r.period}</span>
      <div style="min-width:0">
        <div class="timeline__subject" style="--dot:${subjectColor(r.subject)}">${esc(r.subject)}</div>
        ${r.room || r.teacher ? `<div class="timeline__meta">${esc([r.room, r.teacher].filter(Boolean).join(' · '))}</div>` : ''}
      </div>
      <span class="timeline__time mono">${bell[0] ? `${esc(bell[0])}–${esc(bell[1])}` : ''}</span>
    </div>`;
  }).join('')}</div>`;
}

function weekendSchedule() {
  const rows = daySchedule(0); // 월요일
  if (!rows.length) return emptyState('주말입니다', '푹 쉬세요 🙌', '🛌');
  return `<p class="muted" style="margin-bottom:8px">월요일 시간표</p>${timeline(rows, null)}`;
}

function upcomingList(assessments, exams) {
  const items = [
    ...assessments.slice(0, 5).map((a) => ({
      date: a.date, title: a.title, sub: a.subject || '수행평가', kind: '수행',
    })),
    ...exams.flatMap((x) => (x.exam.sessions || [])
      .filter((s) => (daysUntil(s.date) ?? -1) >= 0)
      .map((s) => ({ date: s.date, title: `${s.subject} 시험`, sub: x.exam.name, kind: '시험' }))),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

  if (!items.length) {
    return emptyState('예정된 일정이 없습니다', '수행평가·시험을 등록하면 D-day가 표시돼요.', '✅');
  }
  return `<div class="list">${items.map((it) => {
    const d = daysUntil(it.date);
    return `<div class="list__item">
      <span class="chip ${it.kind === '시험' ? 'chip--danger' : 'chip--accent'}">${it.kind}</span>
      <div class="list__main">
        <div class="list__title">${esc(it.title)}</div>
        <div class="list__sub"><span>${esc(it.sub)}</span><span>${esc(fmtDate(it.date))}</span></div>
      </div>
      <span class="dday ${ddayClass(d)}">${esc(ddayLabel(d))}</span>
    </div>`;
  }).join('')}</div>`;
}

async function loadMeal() {
  const box = el('#todayMeal');
  if (!box) return;
  if (!state.school) {
    box.innerHTML = emptyState('학교를 설정해 주세요', '설정에서 학교를 등록하면 급식을 보여드려요.', '🏫');
    return;
  }
  try {
    const base = today();
    const res = await getMeals(ymd(base), ymd(base));
    box.innerHTML = mealBlock(res?.meals);
  } catch (e) {
    box.innerHTML = emptyState('급식을 불러오지 못했습니다', e.message, '⚠️');
  }
}

async function loadTopSuggestion() {
  const box = el('#todayTop');
  if (!box) return;
  try {
    const [top] = weeklyRanking(await listSuggestions(), 1);
    box.innerHTML = top
      ? `<p class="sg-item__text">${esc(top.text)}</p>
         <div class="sg-item__meta" style="margin-top:8px">
           <span class="chip chip--accent">${esc(top.category)}</span>
           <span>❤️ ${top.likes}</span><span>${esc(fromNow(top.createdAt))}</span>
         </div>`
      : emptyState('이번 주 인기 건의가 아직 없어요', '건의 화면에서 익명으로 올릴 수 있어요.', '💬');
  } catch {
    box.innerHTML = emptyState('건의를 불러오지 못했습니다', '', '⚠️');
  }
}
