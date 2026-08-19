/* 공용 서버 통신 — 시간표·시험·수행평가·노트·건의를 반 전체가 공유한다
 *
 * 관리자 패널에 Apps Script 웹앱 주소(boardUrl)를 넣으면 '공유 모드'가 된다.
 *   · 학생 기기 : 서버 내용을 받아 그대로 보여 준다 (수정 불가)
 *   · 관리자    : 수정 후 서버로 올린다 (관리자 키 필요)
 * 주소가 없으면 '이 기기 전용 모드'로, 관리자가 자기 폰에서만 쓰는 상태가 된다.
 */
import { state, save, isAdmin } from './store.js';

export const CATEGORIES = ['급식', '시설', '수업', '행사', '기타'];
export const MAX_LEN = 300;
export const MAX_FILE_MB = 8;

/** 공용 서버가 연결돼 있는가 */
export const isShared = () => !!(state.boardUrl || '').trim();

/** 이 기기에서 내용을 고칠 수 있는가 (관리자만) */
export const canEdit = () => isAdmin();

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);

/* --- 통신 ---------------------------------------------------------------- */

async function call(payload, { admin = false } = {}) {
  const url = (state.boardUrl || '').trim();
  if (!url) throw new Error('공용 서버 주소가 설정되지 않았습니다.');

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      // text/plain 이어야 preflight(OPTIONS) 없이 Apps Script 로 바로 간다.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        ...payload,
        device: state.deviceId,
        ...(admin ? { adminKey: state.adminKey || '' } : {}),
      }),
      redirect: 'follow',
    });
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 주소와 네트워크를 확인해 주세요.');
  }
  if (!res.ok) throw new Error(`서버 오류 (HTTP ${res.status})`);

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('서버 응답을 이해하지 못했습니다. 웹앱 배포 설정을 확인해 주세요.');
  }
  if (!data || data.ok === false) throw new Error(data?.error || '요청을 처리하지 못했습니다.');
  return data;
}

/* --- 전체 내려받기 -------------------------------------------------------- */

let pulling = null;

/** 서버에서 공용 데이터를 받아 화면에 쓰는 상태로 반영한다 */
export async function pull({ force = false } = {}) {
  if (!isShared()) return null;
  if (pulling && !force) return pulling;

  pulling = (async () => {
    const data = await call({ action: 'get' });
    const c = data.content || {};

    // 서버가 가진 값이 항상 우선. 없으면 지금 값을 유지한다.
    if (c.timetable) state.timetable = c.timetable;
    if (c.periods) state.periods = c.periods;
    if (Array.isArray(c.bells) && c.bells.length) state.bells = c.bells;
    if (Array.isArray(c.exams)) state.exams = c.exams;
    if (Array.isArray(c.assessments)) state.assessments = c.assessments;

    state.notes = data.notes || [];
    state.suggestions = (data.suggestions || []).map((s) => ({
      id: String(s.id), text: String(s.text || ''), category: String(s.category || '기타'),
      createdAt: s.createdAt || new Date().toISOString(),
      likes: Number(s.likes) || 0, liked: !!s.liked,
    }));
    state.syncedAt = new Date().toISOString();
    save();
    return data;
  })().finally(() => { pulling = null; });

  return pulling;
}

/** 관리자가 고친 시간표·시험·수행평가를 서버로 올린다 */
export async function pushContent() {
  if (!isShared()) return;          // 이 기기 전용 모드에서는 localStorage 저장으로 끝
  if (!canEdit()) throw new Error('관리자만 수정할 수 있습니다.');
  await call({
    action: 'saveContent',
    content: {
      timetable: state.timetable,
      periods: state.periods,
      bells: state.bells,
      exams: state.exams,
      assessments: state.assessments,
    },
  }, { admin: true });
  state.syncedAt = new Date().toISOString();
  save();
}

/** 수정 후 저장 — 로컬에 쓰고, 공유 모드면 서버에도 올린다 */
export async function saveAndPush() {
  save();
  if (isShared() && canEdit()) await pushContent();
}

/* --- 관리자 키 ----------------------------------------------------------- */

export async function claimAdminKey(key) {
  state.adminKey = key;
  save();
  await call({ action: 'claimAdmin', adminKey: key });
}

export async function checkAdminKey() {
  const { admin } = await call({ action: 'checkAdmin' }, { admin: true });
  return !!admin;
}

/* --- 요점정리 노트 -------------------------------------------------------- */

export function listNotes() {
  return [...(state.notes || [])].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function addNote({ subject, title, body, file }) {
  if (!subject?.trim()) throw new Error('과목을 입력해 주세요.');

  if (isShared()) {
    await call({ action: 'addNote', subject, title, body, file }, { admin: true });
    await pull({ force: true });
    return;
  }

  // 이 기기 전용 모드: 파일은 data URL 로 브라우저에 보관 (용량이 커지면 저장에 실패할 수 있다)
  state.notes = state.notes || [];
  state.notes.push({
    id: uid(), subject: subject.trim(), title: (title || '').trim(), body: (body || '').trim(),
    createdAt: new Date().toISOString(),
    fileName: file?.name || '', mime: file?.mime || '',
    dataUrl: file ? `data:${file.mime};base64,${file.data}` : '',
  });
  save();
}

export async function removeNote(id) {
  if (!canEdit()) throw new Error('관리자만 삭제할 수 있습니다.');
  if (isShared()) {
    await call({ action: 'removeNote', id }, { admin: true });
    await pull({ force: true });
    return;
  }
  state.notes = (state.notes || []).filter((n) => n.id !== id);
  save();
}

/* --- 건의사항 ------------------------------------------------------------ */

export function listSuggestions() {
  return [...(state.suggestions || [])]
    .map((it) => ({ ...it, liked: isShared() ? !!it.liked : state.myLikes.includes(it.id) }))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function addSuggestion(text, category) {
  const body = (text || '').trim().slice(0, MAX_LEN);
  if (!body) throw new Error('내용을 입력해 주세요.');
  const cat = CATEGORIES.includes(category) ? category : '기타';

  if (isShared()) {
    await call({ action: 'add', text: body, category: cat });
    await pull({ force: true });
    return;
  }
  state.suggestions.push({
    id: uid(), text: body, category: cat, createdAt: new Date().toISOString(), likes: 0,
  });
  save();
}

/** 좋아요 토글 — 기기당 한 번 */
export async function toggleLike(id) {
  if (isShared()) {
    const { liked } = await call({ action: 'like', id });
    const item = (state.suggestions || []).find((s) => s.id === id);
    if (item) {
      item.liked = liked;
      item.likes = Math.max(0, (item.likes || 0) + (liked ? 1 : -1));
      save();
    }
    return liked;
  }

  const item = state.suggestions.find((s) => s.id === id);
  if (!item) return false;
  const i = state.myLikes.indexOf(id);
  if (i === -1) { state.myLikes.push(id); item.likes = (item.likes || 0) + 1; }
  else { state.myLikes.splice(i, 1); item.likes = Math.max(0, (item.likes || 0) - 1); }
  save();
  return i === -1;
}

/** 건의 삭제는 관리자만 (학생은 자기 글도 지울 수 없다) */
export async function removeSuggestion(id) {
  if (!canEdit()) throw new Error('관리자만 삭제할 수 있습니다.');
  if (isShared()) {
    await call({ action: 'removeSuggestion', id }, { admin: true });
    await pull({ force: true });
    return;
  }
  state.suggestions = state.suggestions.filter((s) => s.id !== id);
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

/* --- 파일 도우미 ---------------------------------------------------------- */

/** 이미지면 긴 변 1600px, JPEG 80% 로 줄여서 base64 로 만든다 */
export async function fileToPayload(file) {
  if (!file) return null;
  if (file.size > MAX_FILE_MB * 1024 * 1024 && !file.type.startsWith('image/')) {
    throw new Error(`${MAX_FILE_MB}MB 이하 파일만 올릴 수 있습니다.`);
  }

  if (file.type.startsWith('image/')) {
    const resized = await shrinkImage(file);
    if (resized) return resized;
  }

  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`${MAX_FILE_MB}MB 이하 파일만 올릴 수 있습니다.`);
  }
  return { name: file.name, mime: file.type || 'application/octet-stream', data: toBase64(buf) };
}

async function shrinkImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob) return null;
    return {
      name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
      mime: 'image/jpeg',
      data: toBase64(await blob.arrayBuffer()),
    };
  } catch {
    return null;   // 브라우저가 지원하지 않으면 원본을 그대로 쓴다
  }
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
