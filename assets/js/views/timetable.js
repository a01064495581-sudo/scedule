/* 시간표 화면 — 셀을 눌러 직접 편집하거나, 나이스에서 한 번에 가져온다 */
import { state, save } from '../store.js';
import { getClasses, getTimetable } from '../data.js';
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

/** 나이스 시간표 가져오기 — 학교가 등록해 둔 주간 시간표를 표에 채운다 */
function importFromNeis() {
  if (!state.school) {
    toast('설정에서 학교를 먼저 등록해 주세요.');
    return;
  }

  openModal({
    title: '나이스에서 시간표 가져오기',
    submitLabel: '가져오기',
    body: `<div class="form-grid">
      <div class="field">
        <label for="g">학년</label>
        <select class="select" id="g" name="grade" required>
          <option value="">불러오는 중…</option>
        </select>
      </div>
      <div class="field">
        <label for="c">반</label>
        <select class="select" id="c" name="classNm" required>
          <option value="">학년을 먼저 고르세요</option>
        </select>
      </div>
      <p class="hint span-2" id="ttImportHint">
        이번 주 시간표를 불러와 표를 덮어씁니다. 이번 주에 등록된 것이 없으면
        가장 최근에 수업이 있던 주를 자동으로 찾아옵니다.
      </p>
    </div>`,
    onSubmit: (v) => {
      if (!v.grade || !v.classNm) {
        toast('학년과 반을 골라 주세요.');
        return false;
      }
      state.profile = { grade: v.grade, classNm: v.classNm };
      save();
      runImport(v);
    },
  });

  fillClassPickers();
}

/** 학급 목록을 나이스에서 받아 학년·반 선택지를 채운다 (실패하면 직접 입력으로) */
async function fillClassPickers() {
  const gradeSel = el('#g');
  const classSel = el('#c');
  if (!gradeSel || !classSel) return;

  const paint = (classes) => {
    const grades = [...new Set(classes.map((c) => c.grade))];
    const cur = String(state.profile.grade || grades[0] || '');
    gradeSel.innerHTML = grades
      .map((g) => `<option value="${esc(g)}" ${g === cur ? 'selected' : ''}>${esc(g)}학년</option>`).join('');

    const paintClasses = () => {
      const list = classes.filter((c) => c.grade === gradeSel.value);
      const curC = String(state.profile.classNm || '');
      classSel.innerHTML = list
        .map((c) => `<option value="${esc(c.classNm)}" ${c.classNm === curC ? 'selected' : ''}>${esc(c.classNm)}반</option>`).join('');
    };
    paintClasses();
    gradeSel.onchange = paintClasses;
  };

  try {
    const classes = await getClasses(currentTerm().year);
    if (classes.length) { paint(classes); return; }
    throw new Error('학급 정보 없음');
  } catch {
    // 나이스에 학급 정보가 없으면 숫자 입력으로 대체
    const num = (id, name, label, value, max) =>
      `<input class="input" id="${id}" name="${name}" type="number" min="1" max="${max}"
         value="${esc(value || '')}" placeholder="${label}" required>`;
    gradeSel.outerHTML = num('g', 'grade', '학년', state.profile.grade, 6);
    el('#c').outerHTML = num('c', 'classNm', '반', state.profile.classNm, 30);
  }
}

/** 이번 주 → 없으면 최근 10주 안에서 수업이 있던 주를 찾아 가져온다 */
async function fetchWeek(grade, classNm) {
  const monday = startOfWeek(today());
  const week = (base) => getTimetable({
    grade, classNm, from: ymd(base), to: ymd(addDays(base, 4)),
  });

  const thisWeek = await week(monday);
  if (thisWeek?.lessons.length) return { res: thisWeek, monday, fallback: false };

  // 최근 10주를 한 번에 훑어 가장 최근 수업일을 찾는다.
  const wide = await getTimetable({
    grade, classNm, from: ymd(addDays(monday, -70)), to: ymd(addDays(monday, 4)),
  });
  if (!wide?.lessons.length) return null;

  const latest = wide.lessons.map((l) => l.date).sort().at(-1);
  const base = startOfWeek(parseDate(latest));
  const res = await week(base);
  return { res: res?.lessons.length ? res : wide, monday: base, fallback: true };
}

async function runImport(v) {
  toast('나이스에서 시간표를 불러오는 중…');
  try {
    const found = await fetchWeek(v.grade, v.classNm);
    if (!found) {
      toast(`${v.grade}학년 ${v.classNm}반 시간표가 나이스에 없습니다. 직접 입력해 주세요.`);
      return;
    }

    const { res, monday, fallback } = found;
    const next = {};
    let maxPeriod = 0;
    for (const r of res.lessons) {
      const d = parseDate(r.date);
      if (!d) continue;
      const day = (d.getDay() + 6) % 7;
      if (day > 4) continue;
      maxPeriod = Math.max(maxPeriod, r.period);
      next[cellKey(day, r.period - 1)] = { subject: r.subject, room: r.room || '', teacher: '' };
    }
    if (!Object.keys(next).length) {
      toast('가져온 수업이 없습니다. 직접 입력해 주세요.');
      return;
    }

    state.timetable = next;
    state.periods = Math.max(state.periods, Math.min(12, maxPeriod));
    while (state.bells.length < state.periods) state.bells.push(['', '']);
    save();
    document.dispatchEvent(new CustomEvent('scedule:rerender'));

    const when = `${monday.getMonth() + 1}월 ${monday.getDate()}일 주`;
    toast([
      `${Object.keys(next).length}개 수업을 가져왔습니다.`,
      fallback ? `이번 주는 등록 전이라 ${when} 시간표를 불러왔어요.` : '',
      res.truncated ? '인증키를 등록하면 전체를 가져올 수 있어요.' : '',
    ].filter(Boolean).join(' '));
  } catch (e) {
    toast(e.message || '시간표를 가져오지 못했습니다.');
  }
}
