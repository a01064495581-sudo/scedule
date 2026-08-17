/* 시간표 화면 — 셀을 눌러 직접 편집하거나, 나이스에서 한 번에 가져온다 */
import { state, save } from '../store.js';
import { getTimetable } from '../data.js';
import { card, openModal } from '../ui.js';
import {
  addDays, currentTerm, el, esc, icon, parseDate, startOfWeek,
  subjectColor, toast, today, ymd,
} from '../utils.js';

export const DAYS = ['월', '화', '수', '목', '금'];
const cellKey = (day, period) => `${day}-${period}`;

export default {
  title: '시간표',
  actions: () => `<button class="btn btn--sm btn--primary desk-only" id="ttImport">${icon.download} 나이스에서 가져오기</button>`,

  render(root) {
    const todayDay = (new Date().getDay() + 6) % 7; // 0=월
    root.innerHTML = `
      ${card('주간 시간표', `
        <div class="tt-wrap">${table(todayDay)}</div>
        <p class="hint mob-only" style="margin-top:8px;text-align:center">좌우로 넘기면 나머지 요일이 보여요</p>`, {
        actions: '<span class="muted">셀을 눌러 입력</span>',
      })}

      <div class="stack">
        <div class="row-between" style="gap:8px">
          <button type="button" class="btn btn--sm" id="ttPeriods" style="flex:1">교시 수 ${state.periods}</button>
          <button type="button" class="btn btn--sm" id="ttClear" style="flex:1">비우기</button>
        </div>
        <button type="button" class="btn btn--sm btn--soft mob-only" id="ttImportMob" style="width:100%">
          ${icon.download} 나이스에서 시간표 가져오기
        </button>
      </div>

      ${card('교시별 시간', bells(), { actions: '<span class="muted">현재 수업 표시에 사용</span>' })}`;

    bind(root);
  },
};

function table(todayDay) {
  const rows = [];
  for (let p = 0; p < state.periods; p++) {
    const cells = DAYS.map((_, day) => {
      const cell = state.timetable[cellKey(day, p)] || {};
      const has = !!cell.subject;
      const color = has ? subjectColor(cell.subject) : '';
      return `<td>
        <button type="button" class="tt__cell ${has ? '' : 'is-empty'}"
          data-day="${day}" data-period="${p}"
          ${has ? `data-color style="--dot:${color}"` : ''}>
          <span class="tt__subject">${has ? esc(cell.subject) : '+'}</span>
          ${cell.room ? `<span class="tt__room">${esc(cell.room)}</span>` : ''}
        </button>
      </td>`;
    }).join('');
    rows.push(`<tr><th class="tt__period">${p + 1}</th>${cells}</tr>`);
  }

  return `<table class="tt">
    <thead><tr><th class="tt__period">교시</th>${DAYS.map((d, i) =>
      `<th class="${i === todayDay ? 'is-today' : ''}">${d}${i === todayDay ? ' · 오늘' : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

function bells() {
  return `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
    ${state.bells.slice(0, state.periods).map(([s, e], i) => `
      <div class="field">
        <label for="bell-${i}">${i + 1}교시</label>
        <div class="bell-row">
          <input class="input" id="bell-${i}" type="time" value="${esc(s)}" data-bell="${i}" data-pos="0" aria-label="${i + 1}교시 시작 시각">
          <span class="muted">–</span>
          <input class="input" type="time" value="${esc(e)}" data-bell="${i}" data-pos="1" aria-label="${i + 1}교시 종료 시각">
        </div>
      </div>`).join('')}
  </div>`;
}

function bind(root) {
  const rerender = () => document.dispatchEvent(new CustomEvent('scedule:rerender'));

  root.addEventListener('click', (e) => {
    const cell = e.target.closest('.tt__cell');
    if (!cell) return;
    editCell(Number(cell.dataset.day), Number(cell.dataset.period), rerender);
  });

  root.addEventListener('change', (e) => {
    const input = e.target.closest('[data-bell]');
    if (!input) return;
    const i = Number(input.dataset.bell);
    state.bells[i] = state.bells[i] || ['', ''];
    state.bells[i][Number(input.dataset.pos)] = input.value;
    save();
  });

  el('#ttPeriods')?.addEventListener('click', () => {
    openModal({
      title: '하루 교시 수',
      body: `<div class="field">
        <label for="p">교시 수 (1~12)</label>
        <input class="input" id="p" name="periods" type="number" min="1" max="12" value="${state.periods}">
      </div>`,
      onSubmit: ({ periods }) => {
        const n = Math.min(12, Math.max(1, Number(periods) || state.periods));
        state.periods = n;
        while (state.bells.length < n) state.bells.push(['', '']);
        save();
        rerender();
      },
    });
  });

  el('#ttClear')?.addEventListener('click', () => {
    openModal({
      title: '시간표 비우기',
      body: '<p class="muted">입력한 시간표를 모두 지웁니다. 되돌릴 수 없어요.</p>',
      submitLabel: '전부 지우기',
      danger: true,
      onSubmit: () => {
        state.timetable = {};
        save();
        rerender();
        toast('시간표를 비웠습니다.');
      },
    });
  });

  el('#ttImport')?.addEventListener('click', importFromNeis);
  el('#ttImportMob')?.addEventListener('click', importFromNeis);
}

function editCell(day, period, rerender) {
  const cur = state.timetable[cellKey(day, period)] || {};
  openModal({
    title: `${DAYS[day]}요일 ${period + 1}교시`,
    body: `<div class="form-grid">
      <div class="field span-2">
        <label for="subject">과목</label>
        <input class="input" id="subject" name="subject" value="${esc(cur.subject || '')}" placeholder="예: 수학" list="subjectList">
        <datalist id="subjectList">${subjectOptions()}</datalist>
      </div>
      <div class="field">
        <label for="room">교실 / 이동수업</label>
        <input class="input" id="room" name="room" value="${esc(cur.room || '')}" placeholder="예: 과학실">
      </div>
      <div class="field">
        <label for="teacher">선생님</label>
        <input class="input" id="teacher" name="teacher" value="${esc(cur.teacher || '')}" placeholder="선택">
      </div>
    </div>`,
    onSubmit: ({ subject, room, teacher }) => {
      const key = cellKey(day, period);
      if (!subject.trim()) delete state.timetable[key];
      else state.timetable[key] = { subject: subject.trim(), room: room.trim(), teacher: teacher.trim() };
      save();
      rerender();
    },
  });
}

function subjectOptions() {
  const set = new Set(Object.values(state.timetable).map((c) => c.subject).filter(Boolean));
  return [...set].map((s) => `<option value="${esc(s)}"></option>`).join('');
}

/** 나이스 시간표 가져오기 — 학교가 시간표를 올려 둔 경우에만 데이터가 있다 */
function importFromNeis() {
  if (!state.school) {
    toast('설정에서 학교를 먼저 등록해 주세요.');
    return;
  }
  const term = currentTerm();
  openModal({
    title: '나이스에서 시간표 가져오기',
    body: `<div class="form-grid">
      <div class="field"><label for="g">학년</label>
        <input class="input" id="g" name="grade" type="number" min="1" max="6" value="${esc(state.profile.grade || '')}" required></div>
      <div class="field"><label for="c">반</label>
        <input class="input" id="c" name="classNm" type="number" min="1" value="${esc(state.profile.classNm || '')}" required></div>
      <div class="field"><label for="y">학년도</label>
        <input class="input" id="y" name="year" type="number" value="${term.year}"></div>
      <div class="field"><label for="s">학기</label>
        <select class="select" id="s" name="semester">
          <option value="1" ${term.semester === 1 ? 'selected' : ''}>1학기</option>
          <option value="2" ${term.semester === 2 ? 'selected' : ''}>2학기</option>
        </select></div>
      <p class="hint span-2">이번 주 시간표를 불러와 표를 덮어씁니다. 학교가 나이스에 시간표를 등록하지 않았다면 결과가 비어 있을 수 있어요.</p>
    </div>`,
    submitLabel: '가져오기',
    onSubmit: (v) => {
      state.profile = { grade: v.grade, classNm: v.classNm };
      save();
      runImport(v);
    },
  });
}

async function runImport(v) {
  const monday = startOfWeek(today());
  toast('나이스에서 시간표를 불러오는 중…');
  try {
    const res = await getTimetable({
      grade: v.grade, classNm: v.classNm, year: v.year, semester: v.semester,
      from: ymd(monday), to: ymd(addDays(monday, 4)),
    });
    const rows = res?.lessons || [];
    if (!rows.length) {
      toast('가져올 시간표가 없습니다. 직접 입력해 주세요.');
      return;
    }
    const next = {};
    let maxPeriod = 0;
    for (const r of rows) {
      const d = parseDate(r.date);
      if (!d) continue;
      const day = (d.getDay() + 6) % 7;
      if (day > 4 || !r.subject) continue;
      maxPeriod = Math.max(maxPeriod, r.period);
      next[cellKey(day, r.period - 1)] = { subject: r.subject, room: r.room || '', teacher: '' };
    }
    state.timetable = next;
    state.periods = Math.max(state.periods, Math.min(12, maxPeriod));
    while (state.bells.length < state.periods) state.bells.push(['', '']);
    save();
    document.dispatchEvent(new CustomEvent('scedule:rerender'));
    toast(`${Object.keys(next).length}개 수업을 가져왔습니다.${
      res.truncated ? ' 인증키를 등록하면 전체를 가져올 수 있어요.' : ''}`);
  } catch (e) {
    toast(e.message || '시간표를 가져오지 못했습니다.');
  }
}
