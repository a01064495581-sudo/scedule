/* 관리자 로그인 — 사이트주소/#/admin 에서 아이디·비밀번호로 들어온다
 *
 * 공유 모드      : 공용 서버(Apps Script)가 아이디·비밀번호를 확인한다.
 *                 실제 수정 권한도 서버가 쥐고 있어서, 화면을 억지로 열어도 저장은 되지 않는다.
 * 이 기기 전용 모드 : 확인해 줄 서버가 없으므로 이 브라우저에 만들어 둔 계정으로 연다.
 *                 (서버를 붙이기 전, 관리자 혼자 쓰는 단계용)
 */
import { state, save, setAdmin } from './store.js';
import { adminLogin, adminRegister, adminStatus, setAdminCred, isShared } from './server.js';

const CRED_KEY = 'scedule.admin.cred';

export const MIN_ID = 3;
export const MIN_PW = 6;

/** SHA-256(아이디|비밀번호) — 이 기기 전용 모드에서 비밀번호를 그대로 두지 않으려고 */
export async function hashCred(id, pw) {
  const data = new TextEncoder().encode(`${id}|${pw}|scedule`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const readCred = () => {
  try { return JSON.parse(localStorage.getItem(CRED_KEY) || 'null'); } catch { return null; }
};

const writeCred = async (id, pw) =>
  localStorage.setItem(CRED_KEY, JSON.stringify({ id, hash: await hashCred(id, pw) }));

export const hasLocalCred = () => !!readCred()?.hash;

/** 관리자 계정이 이미 있는가 — 공유 모드면 서버에, 아니면 이 기기에 */
export async function isRegistered() {
  if (!isShared()) return hasLocalCred();
  return adminStatus();
}

function validate(id, pw) {
  if (id.length < MIN_ID) throw new Error(`아이디는 ${MIN_ID}자 이상이어야 합니다.`);
  if (pw.length < MIN_PW) throw new Error(`비밀번호는 ${MIN_PW}자 이상이어야 합니다.`);
}

/** 로그인 성공 — 이 기기를 관리자로 기억한다.
 *  비밀번호는 서버 수정 요청에 함께 보내야 해서 이 브라우저에 보관된다. 학생 기기에서는 로그인하지 말 것. */
function startSession(id, pw) {
  state.adminId = id;
  state.adminKey = pw;
  save();
  setAdmin(true);
}

export async function login(id, pw) {
  const name = String(id || '').trim();
  const key = String(pw || '');
  if (!name || !key) throw new Error('아이디와 비밀번호를 입력해 주세요.');

  if (isShared()) {
    await adminLogin(name, key);
  } else {
    const cred = readCred();
    if (!cred) throw new Error('아직 관리자 계정이 없습니다. 계정을 먼저 만들어 주세요.');
    if (cred.id !== name || (await hashCred(name, key)) !== cred.hash) {
      throw new Error('아이디 또는 비밀번호가 맞지 않습니다.');
    }
  }
  startSession(name, key);
}

/** 계정 만들기 — 아직 관리자가 없을 때 처음 한 번 */
export async function register(id, pw, pw2) {
  const name = String(id || '').trim();
  const key = String(pw || '');
  validate(name, key);
  if (key !== pw2) throw new Error('비밀번호가 서로 다릅니다.');

  if (isShared()) await adminRegister(name, key);
  else await writeCred(name, key);
  startSession(name, key);
}

/** 관리자 패널에서 아이디·비밀번호 바꾸기 (비밀번호를 비우면 아이디만 바뀐다) */
export async function changeCred(id, pw, pw2) {
  const name = String(id || '').trim();
  const key = String(pw || '');
  if (name.length < MIN_ID) throw new Error(`아이디는 ${MIN_ID}자 이상이어야 합니다.`);
  if (key) {
    if (key.length < MIN_PW) throw new Error(`비밀번호는 ${MIN_PW}자 이상이어야 합니다.`);
    if (key !== pw2) throw new Error('비밀번호가 서로 다릅니다.');
  }

  if (isShared()) await setAdminCred(name, key);
  else await writeCred(name, key || state.adminKey);
  startSession(name, key || state.adminKey);
}

/** 이 브라우저에 만든 관리자 계정을 지운다 (전체 초기화용) */
export function clearLocalCred() {
  localStorage.removeItem(CRED_KEY);
}

export function logout() {
  setAdmin(false);
  state.adminId = '';
  state.adminKey = '';
  save();
}
