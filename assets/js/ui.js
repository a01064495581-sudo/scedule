/* 모달·폼 등 공용 UI 헬퍼 */
import { el, esc, icon } from './utils.js';

const dialog = () => el('#modal');

/**
 * 모달 열기
 * @param {{title:string, body:string, submitLabel?:string, danger?:boolean,
 *          onSubmit?:(values:Record<string,string>)=>boolean|void}} opts
 */
export function openModal({ title, body, submitLabel = '저장', danger = false, onSubmit }) {
  const dlg = dialog();
  el('#modalTitle').textContent = title;
  el('#modalBody').innerHTML = body;
  el('#modalFoot').innerHTML = `
    <button type="button" class="btn" data-close>${onSubmit ? '취소' : '닫기'}</button>
    ${onSubmit ? `<button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${esc(submitLabel)}</button>` : ''}
  `;

  const form = el('#modalForm');
  const close = () => dlg.close();

  form.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close, { once: true }));

  form.onsubmit = (e) => {
    if (!onSubmit) return; // method=dialog 기본 동작으로 닫힘
    const values = Object.fromEntries(new FormData(form).entries());
    if (onSubmit(values) === false) {
      e.preventDefault(); // 검증 실패 → 열어 둔다
    }
  };

  dlg.showModal();
  enableSwipeToClose(dlg);

  // 모바일에서 시트가 열리자마자 키보드가 튀어나오지 않도록 데스크톱에서만 자동 포커스
  if (matchMedia('(min-width: 900px)').matches) {
    const first = el('#modalBody input, #modalBody select, #modalBody textarea');
    if (first) setTimeout(() => first.focus(), 30);
  }
}

/** 확인 대화상자 */
export function confirmModal(message, onYes, { title = '확인', yes = '삭제' } = {}) {
  openModal({
    title,
    body: `<p style="font-size:14px;color:var(--text-2)">${esc(message)}</p>`,
    submitLabel: yes,
    danger: true,
    onSubmit: () => { onYes(); },
  });
}

/** 카드 컨테이너 */
export const card = (title, content, { actions = '', flush = false, cls = '' } = {}) => `
  <section class="card ${flush ? 'card--flush' : ''} ${cls}">
    ${title ? `<div class="card__head" ${flush ? 'style="padding:20px 20px 0"' : ''}>
      <h2 class="card__title">${title}</h2>
      ${actions ? `<div class="topbar__actions">${actions}</div>` : ''}
    </div>` : ''}
    ${content}
  </section>`;

export const emptyState = (text, sub = '', iconChar = '🗂️') => `
  <div class="empty">
    <div class="empty__icon">${iconChar}</div>
    <strong>${esc(text)}</strong>
    ${sub ? `<span class="muted">${esc(sub)}</span>` : ''}
  </div>`;

export const iconBtn = (name, label, attrs = '') =>
  `<button type="button" class="icon-btn" title="${esc(label)}" aria-label="${esc(label)}" ${attrs}>${icon[name]}</button>`;

export const skeletonList = (rows = 3) =>
  Array.from({ length: rows }, () => '<div class="skeleton" style="height:44px;margin-bottom:8px"></div>').join('');

/** 이벤트 위임 헬퍼 */
export function on(root, selector, type, handler) {
  root.addEventListener(type, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}


/** 바텀시트를 아래로 끌어내려 닫기 (모바일) */
function enableSwipeToClose(dlg) {
  const grip = el('.modal__grip');
  if (!grip || grip.dataset.bound) return;
  grip.dataset.bound = '1';

  let startY = null;
  const sheet = dlg;

  grip.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
  grip.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    const dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  grip.addEventListener('touchend', (e) => {
    const dy = Math.max(0, (e.changedTouches[0]?.clientY ?? 0) - (startY ?? 0));
    sheet.style.transform = '';
    startY = null;
    if (dy > 90) sheet.close();
  });
}
