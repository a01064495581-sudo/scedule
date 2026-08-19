/* 정기시험 화면 — 시험 기간별 시간표 + 나이스 학사일정 */
import { state, examRange } from '../store.js';
import { canEdit, saveAndPush } from '../server.js';
import { getSchedule } from '../data.js';
import { card, emptyState, iconBtn, openModal, confirmModal, skeletonList } from '../ui.js';
import { truncatedNotice } from './meal.js';
import { planSwitch } from './assessments.js';
import {
  addDays, daysUntil, ddayClass, ddayLabel, el, esc, fmtDate, icon, iso,
  subjectColor, toast, today, uid, ymd,
} from '../utils.js';

export default {
  title: '정기시험',
  actions: () => (canEdit()
    ? `<button class="btn btn--sm btn--primary desk-only" id="exAdd">${icon.plus} 시험 추가</button>` : ''),

  fab: () => (canEdit() ? { label: '시험 추가', icon: 'plus', action: addExam } : null),

  render(root) {
    const exams = [...state.exams].sort((a, b) =>
      (examRange(a)?.start || '9999').localeCompare(examRange(b)?.start || '9999'));

    root.innerHTML = `
      ${planSwitch('exams')}
      ${exams.length
        ? exams.map(examCard).join('')
        : card('', emptyState('등록된 시험이 없습니다',
            canEdit() ? '중간고사·기말고사 기간을 만들고 과목별 일정을 넣어 보세요.' : '관리자가 등록하면 여기에 표시됩니다.', '📚'))}
      ${card('학사일정', '<div id="exSchedule">' + skeletonList(3) + '</div>',
        { actions: '<span class="muted">나이스 · 앞으로 90일</span>' })}`;

    bind(root);
    loadSchedule();
  },
};

function examCard(exam) {
  const range = examRange(exam);
  const d = range ? daysUntil(range.start) : null;
  const byDate = new Map();
  for (const s of exam.sessions || []) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  const dates = [...byDate.keys()].sort();
  const total = (exam.sessions || []).length;
  const passed = (exam.sessions || []).filter((s) => (daysUntil(s.date) ?? 0) < 0).length;

  return `<section class="card exam-card" data-exam="${exam.id}">
    <div class="exam-card__head">
      <div>
        <div class="exam-card__name">${esc(exam.name)}</div>
        <p class="muted">${range ? `${esc(fmtDate(range.start))} ~ ${esc(fmtDate(range.end))} · 총 ${total}과목` : '일정을 추가해 주세요'}</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${range ? `<span class="dday ${ddayClass(d)}">${esc(ddayLabel(d))}</span>` : ''}
        ${canEdit() ? iconBtn('edit', '시험 이름 수정', 'data-rename') + iconBtn('trash', '시험 삭제', 'data-remove') : ''}
      </div>
    </div>

    ${total ? `<div class="progress"><i style="width:${Math.round((passed / total) * 100)}%"></i></div>` : ''}

    <div class="exam-sessions">
      ${dates.length ? dates.map((date) => `
        <div class="exam-day">
          <div class="exam-day__date">${esc(fmtDate(date))}</div>
          <div class="exam-day__subjects">
            ${byDate.get(date)
              .sort((a, b) => (a.period || 0) - (b.period || 0))
              .map((s) => `
                <button type="button" class="exam-sub ${canEdit() ? '' : 'is-locked'}" data-session="${s.id}">
                  <span class="subject-dot" style="--dot:${subjectColor(s.subject)}"></span>
                  ${s.period ? `<small>${esc(s.period)}교시</small>` : ''}
                  ${esc(s.subject)}
                  ${s.range ? `<small>${esc(s.range)}</small>` : ''}
                </button>`).join('')}
          </div>
        </div>`).join('') : '<p class="muted">아직 과목 일정이 없습니다.</p>'}
    </div>

    ${canEdit() ? `<div>
      <button type="button" class="btn btn--sm" data-add-session>${icon.plus} 과목 일정 추가</button>
    </div>` : ''}
  </section>`;
}

const rerender = () => document.dispatchEvent(new CustomEvent('scedule:rerender'));

/** 저장 + (공유 모드면) 서버 반영 */
const push = () => saveAndPush().catch((e) => toast(e.message));

/** 시험 기간 만들기 */
function addExam() {
  openModal({
    title: '시험 기간 추가',
    body: `<div class="field">
      <label for="name">이름</label>
      <input class="input" id="name" name="name" required placeholder="예: 2학기 중간고사">
    </div>`,
    onSubmit: (v) => {
      if (!v.name.trim()) return false;
      state.exams.push({ id: uid(), name: v.name.trim(), sessions: [] });
      push();
      rerender();
    },
  });
}

function bind(root) {

  el('#exAdd')?.addEventListener('click', addExam);

  root.addEventListener('click', (e) => {
    const section = e.target.closest('[data-exam]');
    if (!section || !canEdit()) return;
    const exam = state.exams.find((x) => x.id === section.dataset.exam);
    if (!exam) return;

    if (e.target.closest('[data-add-session]')) sessionForm(exam, null, rerender);
    else if (e.target.closest('[data-session]')) {
      const id = e.target.closest('[data-session]').dataset.session;
      sessionForm(exam, exam.sessions.find((s) => s.id === id), rerender);
    } else if (e.target.closest('[data-rename]')) {
      openModal({
        title: '시험 이름 수정',
        body: `<div class="field"><label for="name">이름</label>
          <input class="input" id="name" name="name" value="${esc(exam.name)}" required></div>`,
        onSubmit: (v) => {
          if (!v.name.trim()) return false;
          exam.name = v.name.trim();
          push();
          rerender();
        },
      });
    } else if (e.target.closest('[data-remove]')) {
      confirmModal(`‘${exam.name}’ 전체를 삭제할까요?`, () => {
        state.exams = state.exams.filter((x) => x.id !== exam.id);
        push();
        rerender();
        toast('삭제했습니다.');
      });
    }
  });
}

function sessionForm(exam, session, done) {
  const subjects = [...new Set(Object.values(state.timetable).map((c) => c.subject).filter(Boolean))];
  openModal({
    title: session ? '과목 일정 수정' : '과목 일정 추가',
    body: `<div class="form-grid">
      <div class="field">
        <label for="date">날짜</label>
        <input class="input" id="date" name="date" type="date" required value="${esc(session?.date || iso(new Date()))}">
      </div>
      <div class="field">
        <label for="period">교시</label>
        <input class="input" id="period" name="period" type="number" min="1" max="12" value="${esc(session?.period || '')}" placeholder="선택">
      </div>
      <div class="field">
        <label for="subject">과목</label>
        <input class="input" id="subject" name="subject" required value="${esc(session?.subject || '')}" list="exSubjects" placeholder="예: 국어">
        <datalist id="exSubjects">${subjects.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
      </div>
      <div class="field">
        <label for="range">시험 범위</label>
        <input class="input" id="range" name="range" value="${esc(session?.range || '')}" placeholder="예: 1~3단원">
      </div>
      ${session ? '<label class="field span-2" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="delete" style="width:16px;height:16px;accent-color:var(--danger)"><span>이 과목 일정 삭제</span></label>' : ''}
    </div>`,
    onSubmit: (v) => {
      if (v.delete && session) {
        exam.sessions = exam.sessions.filter((s) => s.id !== session.id);
      } else if (!v.subject.trim() || !v.date) {
        toast('과목과 날짜를 입력해 주세요.');
        return false;
      } else if (session) {
        Object.assign(session, {
          date: v.date, period: v.period, subject: v.subject.trim(), range: v.range.trim(),
        });
      } else {
        exam.sessions.push({
          id: uid(), date: v.date, period: v.period,
          subject: v.subject.trim(), range: v.range.trim(),
        });
      }
      push();
      done();
    },
  });
}

async function loadSchedule() {
  const box = el('#exSchedule');
  if (!box) return;
  if (!state.school) {
    box.innerHTML = emptyState('학교를 설정하면 학사일정이 표시됩니다', '설정 화면에서 학교를 등록해 주세요.', '🏫');
    return;
  }
  try {
    const res = await getSchedule(ymd(today()), ymd(addDays(today(), 90)));
    const rows = res?.events || [];
    box.innerHTML = rows.length
      ? (res.truncated ? truncatedNotice() : '') + `<div class="list">${rows.map((r) => {
          const d = daysUntil(r.date);
          return `<div class="list__item">
            <div class="list__main">
              <div class="list__title">${esc(r.name)}</div>
              <div class="list__sub"><span>${esc(fmtDate(r.date))}</span>${r.content ? `<span>· ${esc(r.content)}</span>` : ''}</div>
            </div>
            <span class="dday ${ddayClass(d)}">${esc(ddayLabel(d))}</span>
          </div>`;
        }).join('')}</div>`
      : emptyState('등록된 학사일정이 없습니다', '', '📅');
  } catch (e) {
    box.innerHTML = emptyState('학사일정을 불러오지 못했습니다', e.message, '⚠️');
  }
}
