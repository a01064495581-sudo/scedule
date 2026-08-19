/* 수행평가 — 과목·마감일·완료 관리 */
import { state } from '../store.js';
import { canEdit, saveAndPush } from '../server.js';
import { card, confirmModal, emptyState, iconBtn, openModal } from '../ui.js';
import {
  daysUntil, ddayClass, ddayLabel, el, esc, fmtDate, icon, iso, subjectColor, toast, uid,
} from '../utils.js';

let filter = 'todo'; // todo | done | all

/** 수행평가 ↔ 정기시험 전환 (모바일에서는 두 화면이 '평가' 탭 하나로 묶여 있다) */
export const planSwitch = (current) => `
  <div class="segmented segmented--full">
    <a class="${current === 'assessments' ? 'is-active' : ''}" href="#/assessments"
       style="display:flex;align-items:center;justify-content:center">수행평가</a>
    <a class="${current === 'exams' ? 'is-active' : ''}" href="#/exams"
       style="display:flex;align-items:center;justify-content:center">정기시험</a>
  </div>`;

export default {
  title: '수행평가',

  actions: () => (canEdit()
    ? `<button class="btn btn--sm btn--primary desk-only" id="asAdd">${icon.plus} 추가</button>` : ''),

  fab: () => (canEdit() ? { label: '수행평가 추가', icon: 'plus', action: () => form(null, rerender) } : null),

  render(root) {
    const list = sorted().filter((a) =>
      filter === 'all' ? true : filter === 'done' ? a.done : !a.done);

    const remain = state.assessments.filter((a) => !a.done).length;
    const week = state.assessments.filter((a) => {
      const d = daysUntil(a.date);
      return !a.done && d !== null && d >= 0 && d <= 7;
    }).length;

    root.innerHTML = `
      ${planSwitch('assessments')}

      <div class="grid grid--stats">
        ${stat('남은 평가', remain)}
        ${stat('이번 주', week)}
        ${stat('완료', state.assessments.filter((a) => a.done).length)}
      </div>

      <div class="segmented segmented--full" id="asFilter">
        ${[['todo', '남은 항목'], ['done', '완료'], ['all', '전체']].map(([k, label]) =>
          `<button type="button" data-filter="${k}" class="${filter === k ? 'is-active' : ''}">${label}</button>`).join('')}
      </div>

      ${card('평가 목록',
        list.length
          ? `<div class="list">${list.map(row).join('')}</div>`
          : emptyState(
              filter === 'done' ? '완료한 항목이 없습니다' : '등록된 수행평가가 없습니다',
              canEdit() ? '아래 ‘수행평가 추가’ 버튼으로 등록해 보세요.' : '관리자가 등록하면 여기에 표시됩니다.', '📝'))}`;

    bind(root);
  },
};

const rerender = () => document.dispatchEvent(new CustomEvent('scedule:rerender'));

/** 저장 + (공유 모드면) 서버 반영 */
const push = () => saveAndPush().catch((e) => toast(e.message));

const sorted = () => [...state.assessments].sort((a, b) => {
  if (a.done !== b.done) return a.done ? 1 : -1;
  return (a.date || '').localeCompare(b.date || '');
});

const stat = (label, value) => `
  <div class="card stat-card">
    <p>${esc(label)}</p>
    <b>${value}<small>개</small></b>
  </div>`;

function row(a) {
  const d = daysUntil(a.date);
  return `<div class="list__item" data-id="${a.id}">
    ${canEdit() ? `<label class="check" style="min-height:auto">
      <input type="checkbox" data-toggle ${a.done ? 'checked' : ''} aria-label="완료 표시">
    </label>` : ''}
    <span class="subject-dot" style="--dot:${subjectColor(a.subject)}"></span>
    <div class="list__main">
      <div class="list__title ${a.done ? 'is-done' : ''}">${esc(a.title)}</div>
      <div class="list__sub">
        <span>${esc(a.subject || '과목 미지정')}</span>
        <span>${esc(fmtDate(a.date))}</span>
        ${a.note ? `<span>· ${esc(a.note)}</span>` : ''}
      </div>
    </div>
    <span class="dday ${a.done ? 'dday--past' : ddayClass(d)}">${esc(ddayLabel(d))}</span>
    ${canEdit() ? `<div class="list__actions">
      ${iconBtn('edit', '수정', 'data-edit')}
      ${iconBtn('trash', '삭제', 'data-delete')}
    </div>` : ''}
  </div>`;
}

function bind(root) {
  el('#asFilter')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn || btn.dataset.filter === filter) return;
    filter = btn.dataset.filter;
    rerender();
  });

  el('#asAdd')?.addEventListener('click', () => form(null, rerender));

  root.addEventListener('click', (e) => {
    const item = e.target.closest('.list__item');
    if (!item || !canEdit()) return;
    const a = state.assessments.find((x) => x.id === item.dataset.id);
    if (!a) return;

    if (e.target.closest('[data-edit]')) form(a, rerender);
    else if (e.target.closest('[data-delete]')) {
      confirmModal(`‘${a.title}’ 항목을 삭제할까요?`, () => {
        state.assessments = state.assessments.filter((x) => x.id !== a.id);
        push();
        rerender();
        toast('삭제했습니다.');
      });
    }
  });

  root.addEventListener('change', (e) => {
    const box = e.target.closest('[data-toggle]');
    if (!box) return;
    const a = state.assessments.find((x) => x.id === box.closest('.list__item').dataset.id);
    if (!a) return;
    a.done = box.checked;
    push();
    rerender();
  });
}

/** 추가·수정 폼 (a=null 이면 추가) */
export function form(a, done = () => {}) {
  const subjects = [...new Set([
    ...Object.values(state.timetable).map((c) => c.subject),
    ...state.assessments.map((x) => x.subject),
  ].filter(Boolean))];

  openModal({
    title: a ? '수행평가 수정' : '수행평가 추가',
    body: `<div class="form-grid">
      <div class="field span-2">
        <label for="title">제목</label>
        <input class="input" id="title" name="title" required value="${esc(a?.title || '')}"
          placeholder="예: 영어 말하기 수행평가" enterkeyhint="next">
      </div>
      <div class="field">
        <label for="subject">과목</label>
        <input class="input" id="subject" name="subject" value="${esc(a?.subject || '')}"
          placeholder="예: 영어" list="asSubjects">
        <datalist id="asSubjects">${subjects.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
      </div>
      <div class="field">
        <label for="date">날짜</label>
        <input class="input" id="date" name="date" type="date" required value="${esc(a?.date || iso(new Date()))}">
      </div>
      <div class="field span-2">
        <label for="note">메모 (범위·준비물)</label>
        <textarea class="textarea" id="note" name="note" placeholder="예: 교과서 3단원, 대본 A4 1장">${esc(a?.note || '')}</textarea>
      </div>
    </div>`,
    onSubmit: (v) => {
      if (!v.title.trim() || !v.date) {
        toast('제목과 날짜를 입력해 주세요.');
        return false;
      }
      if (a) {
        Object.assign(a, { title: v.title.trim(), subject: v.subject.trim(), date: v.date, note: v.note.trim() });
      } else {
        state.assessments.push({
          id: uid(), title: v.title.trim(), subject: v.subject.trim(),
          date: v.date, note: v.note.trim(), done: false,
        });
      }
      push();
      done();
      toast(a ? '수정했습니다.' : '추가했습니다.');
    },
  });
}
