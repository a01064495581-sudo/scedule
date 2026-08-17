/* 건의사항 저장소
 *
 * 두 가지 모드로 동작한다.
 *  1) 로컬 모드 (기본)  — 이 기기의 localStorage 에만 저장. 설치 없이 바로 쓸 수 있지만 나만 본다.
 *  2) 공유 모드         — 설정에 Google Apps Script 웹앱 주소를 넣으면 반 전체가 같은 목록을 본다.
 *                         (backend/apps-script.gs 를 배포하고 주소를 붙여넣으면 끝)
 *
 * 어느 모드든 글쓴이 정보는 저장하지 않는다. 좋아요 중복만 익명 기기 식별자로 막는다.
 */
import { state, save } from './store.js';

export const CATEGORIES = ['급식', '시설', '수업', '행사', '기타'];
export const MAX_LEN = 300;

export const isShared = () => !!(state.boardUrl || '').trim();

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);

/* --- 공유 모드 통신 ------------------------------------------------------ */

async function callBoard(payload) {
  const url = state.boardUrl.trim();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      // text/plain 이어야 preflight(OPTIONS) 없이 Apps Script 로 바로 간다.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, device: state.deviceId }),
      redirect: 'follow',
    });
  } catch {
    throw new Error('게시판 서버에 연결하지 못했습니다. 주소와 네트워크를 확인해 주세요.');
  }
  if (!res.ok) throw new Error(`게시판 오류 (HTTP ${res.status})`);

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('게시판 응답을 이해하지 못했습니다. 웹앱 배포 설정을 확인해 주세요.');
  }
  if (!data || data.ok === false) throw new Error(data?.error || '게시판 처리에 실패했습니다.');
  return data;
}

/* --- 공통 API ------------------------------------------------------------ */

/** 건의 목록 (최신순) */
export async function listSuggestions() {
  if (isShared()) {
    const { items = [] } = await callBoard({ action: 'list' });
    return items
      .map((it) => ({
        id: String(it.id),
        text: String(it.text || ''),
        category: String(it.category || '기타'),
        createdAt: it.createdAt || new Date().toISOString(),
        likes: Number(it.likes) || 0,
        liked: !!it.liked,
        mine: !!it.mine,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return [...state.suggestions]
    .map((it) => ({ ...it, liked: state.myLikes.includes(it.id), mine: state.myPosts.includes(it.id) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 건의 등록 */
export async function addSuggestion(text, category) {
  const body = text.trim().slice(0, MAX_LEN);
  if (!body) throw new Error('내용을 입력해 주세요.');
  const cat = CATEGORIES.includes(category) ? category : '기타';

  if (isShared()) {
    await callBoard({ action: 'add', text: body, category: cat });
    return;
  }

  const item = { id: uid(), text: body, category: cat, createdAt: new Date().toISOString(), likes: 0 };
  state.suggestions.push(item);
  state.myPosts.push(item.id);
  save();
}

/** 좋아요 토글 — 기기당 한 번 */
export async function toggleLike(id) {
  if (isShared()) {
    const liked = !!(await callBoard({ action: 'like', id })).liked;
    return liked;
  }

  const item = state.suggestions.find((s) => s.id === id);
  if (!item) return false;
  const i = state.myLikes.indexOf(id);
  if (i === -1) {
    state.myLikes.push(id);
    item.likes = (item.likes || 0) + 1;
  } else {
    state.myLikes.splice(i, 1);
    item.likes = Math.max(0, (item.likes || 0) - 1);
  }
  save();
  return i === -1;
}

/** 내가 올린 건의 삭제 */
export async function removeSuggestion(id) {
  if (isShared()) {
    await callBoard({ action: 'remove', id });
    return;
  }
  state.suggestions = state.suggestions.filter((s) => s.id !== id);
  state.myPosts = state.myPosts.filter((x) => x !== id);
  state.myLikes = state.myLikes.filter((x) => x !== id);
  save();
}

/* --- 주간 인기 ----------------------------------------------------------- */

/** 이번 주 월요일 00:00 */
export function weekStart(base = new Date()) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** 이번 주에 올라온 건의 중 좋아요 순위 */
export function weeklyRanking(items, limit = 3) {
  const from = weekStart().toISOString();
  return items
    .filter((it) => it.createdAt >= from && it.likes > 0)
    .sort((a, b) => b.likes - a.likes || a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}
