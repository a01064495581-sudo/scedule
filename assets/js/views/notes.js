/* 요점정리 노트 — 과목별로 사진·파일과 메모를 모아 둔다 (등록은 관리자, 열람은 모두) */
import { state } from '../store.js';
import {
  MAX_FILE_MB, addNote, canEdit, fileToPayload, isShared, listNotes, pull, removeNote,
} from '../server.js';
import { card, confirmModal, emptyState, iconBtn, openModal, skeletonList } from '../ui.js';
import { el, esc, fromNow, icon, subjectColor, toast } from '../utils.js';

let subject = '전체';

export default {
  title: '요점정리',

  actions: () => `
    <button class="btn btn--sm" id="ntRefresh" aria-label="새로고침">${icon.refresh}</button>
    ${canEdit() ? `<button class="btn btn--sm btn--primary desk-only" id="ntAddTop">${icon.plus} 노트 올리기</button>` : ''}`,

  fab: () => (canEdit() ? { label: '노트 올리기', icon: 'plus', action: () => form() } : null),

  render(root) {
    root.innerHTML = `
      <div id="ntFilter"></div>
      <div id="ntList">${skeletonList(3)}</div>
      ${isShared() ? '' : `
        <p class="hint" style="text-align:center">
          공용 서버가 연결되지 않아 노트가 <b>이 기기에만</b> 저장됩니다.
        </p>`}`;

    bind(root);
    load();
  },
};

async function load() {
  const box = el('#ntList');
  if (!box) return;
  try {
    if (isShared()) await pull({ force: true });
    paint();
  } catch (e) {
    box.innerHTML = card('', emptyState('노트를 불러오지 못했습니다', e.message, '⚠️'));
  }
}

function paint() {
  const all = listNotes();
  const subjects = ['전체', ...new Set(all.map((n) => n.subject).filter(Boolean))];
  if (!subjects.includes(subject)) subject = '전체';

  el('#ntFilter').innerHTML = all.length
    ? `<div class="chip-row">${subjects.map((s) => `
        <button type="button" class="chip-tab ${s === subject ? 'is-active' : ''}" data-subject="${esc(s)}">
          ${s === '전체' ? '' : `<span class="subject-dot" style="--dot:${subjectColor(s)}"></span>`}${esc(s)}
        </button>`).join('')}</div>`
    : '';

  const list = subject === '전체' ? all : all.filter((n) => n.subject === subject);
  el('#ntList').innerHTML = list.length
    ? `<div class="note-grid">${list.map(noteCard).join('')}</div>`
    : card('', emptyState('올라온 노트가 없습니다',
        canEdit() ? '아래 버튼으로 필기 사진이나 정리 파일을 올려 보세요.' : '관리자가 올리면 여기에 표시됩니다.', '📒'));
}

function noteCard(n) {
  const img = n.thumbUrl || n.dataUrl;
  const isImage = (n.mime || '').startsWith('image/');
  const link = n.openUrl || n.dataUrl;

  return `<article class="card note-card" data-id="${esc(n.id)}">
    ${img && isImage
      ? `<a class="note-card__thumb" href="${esc(link)}" target="_blank" rel="noopener">
           <img src="${esc(img)}" alt="${esc(n.title || n.subject)} 첨부 이미지" loading="lazy">
         </a>`
      : ''}
    <div class="note-card__body">
      <div class="note-card__top">
        <span class="chip chip--accent">${esc(n.subject)}</span>
        <span class="muted">${esc(fromNow(n.createdAt))}</span>
        ${canEdit() ? iconBtn('trash', '삭제', 'data-remove') : ''}
      </div>
      ${n.title ? `<h3 class="note-card__title">${esc(n.title)}</h3>` : ''}
      ${n.body ? `<p class="note-card__text">${esc(n.body)}</p>` : ''}
      ${link && !isImage
        ? `<a class="btn btn--sm btn--soft" href="${esc(link)}" target="_blank" rel="noopener">
             ${icon.download} ${esc(n.fileName || '파일 열기')}
           </a>`
        : ''}
    </div>
  </article>`;
}

function bind(root) {
  el('#ntRefresh')?.addEventListener('click', () => { load(); toast('새로고침했습니다.'); });
  el('#ntAddTop')?.addEventListener('click', () => form());

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-subject]');
    if (tab) {
      subject = tab.dataset.subject;
      paint();
      return;
    }

    const del = e.target.closest('[data-remove]');
    if (del && canEdit()) {
      const id = del.closest('[data-id]').dataset.id;
      confirmModal('이 노트를 삭제할까요?', async () => {
        try {
          await removeNote(id);
          paint();
          toast('삭제했습니다.');
        } catch (err) {
          toast(err.message);
        }
      });
    }
  });
}

/** 노트 올리기 (관리자) */
function form() {
  const subjects = [...new Set([
    ...Object.values(state.timetable).map((c) => c.subject),
    ...listNotes().map((n) => n.subject),
  ].filter(Boolean))];

  openModal({
    title: '요점정리 올리기',
    submitLabel: '올리기',
    body: `<div class="form-grid">
      <div class="field">
        <label for="ntSubject">과목</label>
        <input class="input" id="ntSubject" name="subject" required placeholder="예: 문학" list="ntSubjects"
          value="${esc(subject === '전체' ? '' : subject)}">
        <datalist id="ntSubjects">${subjects.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
      </div>
      <div class="field">
        <label for="ntTitle">제목</label>
        <input class="input" id="ntTitle" name="title" placeholder="예: 3단원 핵심 정리">
      </div>
      <div class="field span-2">
        <label for="ntBody">설명 (선택)</label>
        <textarea class="textarea" id="ntBody" name="body" placeholder="시험 범위, 주의할 점 등"></textarea>
      </div>
      <div class="field span-2">
        <label for="ntFile">사진 / 파일</label>
        <input class="input" id="ntFile" name="file" type="file"
          accept="image/*,application/pdf,.hwp,.hwpx,.docx,.pptx,.xlsx,.txt">
        <span class="hint">
          사진은 자동으로 줄여서 올립니다. 최대 ${MAX_FILE_MB}MB.
          여러 장이면 노트를 여러 개로 나눠 올려 주세요.
        </span>
      </div>
    </div>`,
    onSubmit: (v) => {
      if (!v.subject.trim()) { toast('과목을 입력해 주세요.'); return false; }
      const file = el('#ntFile')?.files?.[0] || null;
      if (!v.title.trim() && !v.body.trim() && !file) {
        toast('제목·설명·파일 중 하나는 넣어 주세요.');
        return false;
      }
      submit(v, file);
    },
  });
}

async function submit(v, file) {
  toast(file ? '올리는 중…' : '저장하는 중…');
  try {
    const payload = file ? await fileToPayload(file) : null;
    await addNote({ subject: v.subject.trim(), title: v.title.trim(), body: v.body.trim(), file: payload });
    subject = v.subject.trim();
    paint();
    toast('노트를 올렸습니다.');
  } catch (e) {
    toast(e.message);
  }
}
