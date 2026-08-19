/* 건의사항 — 익명 등록, 좋아요, 주간 인기 */
import {
  CATEGORIES, MAX_LEN, addSuggestion, canEdit, isShared, listSuggestions,
  pull, removeSuggestion, toggleLike, weeklyRanking,
} from '../server.js';
import { card, confirmModal, emptyState, iconBtn, openModal, skeletonList } from '../ui.js';
import { el, esc, fromNow, icon, toast } from '../utils.js';

let sort = 'new';      // new | hot
let cache = null;      // 마지막으로 불러온 목록 (좋아요 토글 시 부분 갱신용)

export default {
  title: '건의사항',

  actions: () => `
    <button class="btn btn--sm" id="sgRefresh" aria-label="새로고침">${icon.refresh}</button>
    <button class="btn btn--sm btn--primary desk-only" id="sgWriteTop">${icon.plus} 건의 쓰기</button>`,

  fab: () => ({ label: '건의 쓰기', icon: 'plus', action: () => compose() }),

  render(root) {
    root.innerHTML = `
      <section class="card card--accent sg-hero" id="sgTop">
        <div class="sg-hero__label">${icon.trophy} 이번 주 인기 건의</div>
        <div class="sg-hero__text">불러오는 중…</div>
      </section>

      <div class="segmented segmented--full" id="sgSort">
        ${[['new', '최신순'], ['hot', '인기순']].map(([k, label]) =>
          `<button type="button" data-sort="${k}" class="${sort === k ? 'is-active' : ''}">${label}</button>`).join('')}
      </div>

      ${card('올라온 건의', '<div id="sgList">' + skeletonList(3) + '</div>', {
        actions: `<span class="muted">${isShared() ? '반 전체 공유' : '이 기기에만 저장'}</span>`,
      })}

      ${isShared() ? '' : `
        <p class="hint" style="text-align:center">
          지금은 건의가 <b>이 기기에만</b> 저장돼요. 반 전체가 함께 보려면 관리자가 공용 서버를 연결해야 합니다.
        </p>`}`;

    bind(root);
    load();
  },
};

async function load() {
  const list = el('#sgList');
  if (!list) return;
  try {
    if (isShared()) await pull({ force: true });
    cache = listSuggestions();
    paint();
  } catch (e) {
    cache = null;
    list.innerHTML = emptyState('건의를 불러오지 못했습니다', e.message, '⚠️');
    el('#sgTop').innerHTML = `
      <div class="sg-hero__label">${icon.trophy} 이번 주 인기 건의</div>
      <div class="sg-hero__text">목록을 불러오지 못했어요.</div>`;
  }
}

function paint() {
  const items = cache || [];

  /* 이번 주 1위 */
  const [top] = weeklyRanking(items, 1);
  el('#sgTop').innerHTML = top
    ? `<div class="sg-hero__label">${icon.trophy} 이번 주 인기 건의</div>
       <div class="sg-hero__text">${esc(top.text)}</div>
       <div class="sg-hero__meta">
         <span class="chip" style="background:rgba(255,255,255,.22);color:inherit">${esc(top.category)}</span>
         <span>❤️ ${top.likes}</span><span>${esc(fromNow(top.createdAt))}</span>
       </div>`
    : `<div class="sg-hero__label">${icon.trophy} 이번 주 인기 건의</div>
       <div class="sg-hero__text">아직 이번 주에 좋아요를 받은 건의가 없어요.</div>
       <div class="sg-hero__meta"><span>첫 건의를 올려 보세요 — 익명이에요.</span></div>`;

  /* 목록 */
  const shown = [...items];
  if (sort === 'hot') shown.sort((a, b) => b.likes - a.likes || b.createdAt.localeCompare(a.createdAt));

  el('#sgList').innerHTML = shown.length
    ? shown.map(row).join('')
    : emptyState('아직 올라온 건의가 없습니다', '학교·학급에 바라는 점을 익명으로 남겨 보세요.', '💬');
}

function row(it) {
  return `<article class="sg-item" data-id="${esc(it.id)}">
    <div class="sg-item__body">
      <div class="sg-item__top">
        <span class="chip chip--accent">${esc(it.category)}</span>
        <span class="muted">${esc(fromNow(it.createdAt))}</span>
      </div>
      <p class="sg-item__text">${esc(it.text)}</p>
      ${canEdit() ? `<div class="sg-item__meta">${iconBtn('trash', '삭제 (관리자)', 'data-remove')}</div>` : ''}
    </div>
    <button type="button" class="like-btn ${it.liked ? 'is-liked' : ''}" data-like
      aria-pressed="${it.liked}" aria-label="좋아요 ${it.likes}개">
      ${icon.heart}<span>${it.likes}</span>
    </button>
  </article>`;
}

function bind(root) {
  el('#sgSort')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn || btn.dataset.sort === sort) return;
    sort = btn.dataset.sort;
    el('#sgSort').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
    paint();
  });

  el('#sgRefresh')?.addEventListener('click', () => { load(); toast('새로고침했습니다.'); });
  el('#sgWriteTop')?.addEventListener('click', () => compose());

  root.addEventListener('click', async (e) => {
    const item = e.target.closest('.sg-item');
    if (!item) return;
    const id = item.dataset.id;

    if (e.target.closest('[data-like]')) {
      const btn = e.target.closest('[data-like]');
      btn.disabled = true;
      try {
        const liked = await toggleLike(id);
        const entry = (cache || []).find((x) => x.id === id);
        if (entry) {
          entry.liked = liked;
          entry.likes = Math.max(0, entry.likes + (liked ? 1 : -1));
          btn.classList.toggle('is-liked', liked);
          btn.setAttribute('aria-pressed', String(liked));
          btn.querySelector('span').textContent = entry.likes;
          if (liked) {
            btn.classList.add('just-liked');
            setTimeout(() => btn.classList.remove('just-liked'), 300);
          }
          // 순위가 바뀔 수 있으니 상단 카드만 다시 계산
          paintTopOnly();
        }
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (e.target.closest('[data-remove]')) {
      confirmModal('이 건의를 삭제할까요? (관리자 권한)', async () => {
        try {
          await removeSuggestion(id);
          await load();
          toast('삭제했습니다.');
        } catch (err) {
          toast(err.message);
        }
      });
    }
  });
}

function paintTopOnly() {
  const items = cache || [];
  const [top] = weeklyRanking(items, 1);
  if (!top) return;
  const box = el('#sgTop');
  if (!box) return;
  box.innerHTML = `
    <div class="sg-hero__label">${icon.trophy} 이번 주 인기 건의</div>
    <div class="sg-hero__text">${esc(top.text)}</div>
    <div class="sg-hero__meta">
      <span class="chip" style="background:rgba(255,255,255,.22);color:inherit">${esc(top.category)}</span>
      <span>❤️ ${top.likes}</span><span>${esc(fromNow(top.createdAt))}</span>
    </div>`;
}

/** 건의 작성 시트 */
function compose() {
  openModal({
    title: '건의사항 쓰기',
    submitLabel: '익명으로 올리기',
    body: `
      <div class="field">
        <label>분류</label>
        <div class="segmented segmented--full" id="sgCat">
          ${CATEGORIES.map((c, i) =>
            `<button type="button" data-cat="${c}" class="${i === 0 ? 'is-active' : ''}">${c}</button>`).join('')}
        </div>
        <input type="hidden" name="category" id="sgCatValue" value="${CATEGORIES[0]}">
      </div>
      <div class="field" style="margin-top:14px">
        <label for="sgText">내용</label>
        <textarea class="textarea" id="sgText" name="text" maxlength="${MAX_LEN}" required
          placeholder="예: 급식에 후식 과일이 더 자주 나왔으면 좋겠어요."></textarea>
        <span class="hint"><span id="sgCount">0</span>/${MAX_LEN}자 · 이름은 저장되지 않는 <b>익명</b> 건의예요.</span>
      </div>`,
    onSubmit: (v) => {
      if (!v.text.trim()) { toast('내용을 입력해 주세요.'); return false; }
      submit(v.text, v.category);
    },
  });

  const cat = el('#sgCat');
  cat?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    cat.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
    el('#sgCatValue').value = btn.dataset.cat;
  });

  const text = el('#sgText');
  text?.addEventListener('input', () => { el('#sgCount').textContent = text.value.length; });
}

async function submit(text, category) {
  try {
    await addSuggestion(text, category);
    await load();
    toast(isShared() ? '건의를 올렸습니다.' : '건의를 저장했습니다. (이 기기)');
  } catch (e) {
    toast(e.message);
  }
}

