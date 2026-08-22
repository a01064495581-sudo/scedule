/* 관리자 로그인 화면 — #/admin
 *
 * 계정이 아직 없으면 '계정 만들기'로 바뀐다. 공유 모드에서는 서버가 확인하고,
 * 이 기기 전용 모드에서는 이 브라우저에 만들어 둔 계정으로 연다.
 */
import { isShared } from '../server.js';
import { isRegistered, login, register, MIN_ID, MIN_PW } from '../admin.js';
import { el, icon, toast } from '../utils.js';

let mode = 'login';   // 'login' | 'register'

export default {
  title: '관리자 로그인',

  render(root) {
    mode = 'login';   // 화면에 다시 들어오면 로그인부터
    root.innerHTML = `
      <div class="login">
        <section class="card login__card">
          <div class="login__head">
            <span class="login__lock" aria-hidden="true">${icon.lock}</span>
            <h2 id="loginTitle">관리자 로그인</h2>
            <p class="muted" id="loginSub">이 화면은 관리자만 씁니다. 학생은 로그인하지 않아도 모든 화면을 볼 수 있어요.</p>
          </div>

          <form id="loginForm" autocomplete="on" novalidate>
            <div class="field">
              <label for="adminId">아이디</label>
              <input class="input" id="adminId" name="username" autocomplete="username"
                autocapitalize="none" autocorrect="off" spellcheck="false" required>
            </div>
            <div class="field">
              <label for="adminPw">비밀번호</label>
              <input class="input" id="adminPw" name="password" type="password"
                autocomplete="current-password" required>
            </div>
            <div class="field" id="pw2Field" hidden>
              <label for="adminPw2">비밀번호 확인</label>
              <input class="input" id="adminPw2" type="password" autocomplete="new-password">
            </div>

            <button class="btn btn--primary btn--wide" id="loginSubmit" type="submit">로그인</button>
            <p class="hint" id="loginHint" role="status" aria-live="polite"></p>
          </form>

          <hr class="divider">
          <div class="login__foot">
            <button type="button" class="btn btn--sm btn--soft" id="loginSwitch">계정 만들기</button>
            <a class="btn btn--sm" href="#/today">돌아가기</a>
          </div>
        </section>
      </div>`;

    bind();
  },
};

function paint() {
  const creating = mode === 'register';
  el('#loginTitle').textContent = creating ? '관리자 계정 만들기' : '관리자 로그인';
  el('#loginSub').textContent = creating
    ? `처음 한 번만 만듭니다. 아이디 ${MIN_ID}자 이상, 비밀번호 ${MIN_PW}자 이상.`
    : '이 화면은 관리자만 씁니다. 학생은 로그인하지 않아도 모든 화면을 볼 수 있어요.';
  el('#loginSubmit').textContent = creating ? '계정 만들고 들어가기' : '로그인';
  el('#pw2Field').hidden = !creating;
  el('#adminPw').autocomplete = creating ? 'new-password' : 'current-password';
  el('#loginSwitch').textContent = creating ? '이미 계정이 있어요' : '계정 만들기';
}

function bind() {
  const hint = (msg = '') => { el('#loginHint').textContent = msg; };

  el('#loginSwitch').addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    hint('');
    paint();
    el('#adminId').focus();
  });

  el('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = el('#adminId').value;
    const pw = el('#adminPw').value;
    const pw2 = el('#adminPw2').value;
    const btn = el('#loginSubmit');

    btn.disabled = true;
    hint('확인하는 중…');
    try {
      if (mode === 'register') await register(id, pw, pw2);
      else await login(id, pw);
      toast(mode === 'register' ? '관리자 계정을 만들었습니다.' : '관리자로 로그인했습니다.');
      location.hash = '#/admin';
      document.dispatchEvent(new CustomEvent('scedule:rerender'));
    } catch (err) {
      hint(err.message || '로그인하지 못했습니다.');
      el('#adminPw').value = '';
      el('#adminPw').focus();
    } finally {
      btn.disabled = false;
    }
  });

  paint();

  // 계정이 아직 없으면 만들기 화면으로 바꿔 준다 (서버 확인이 필요해 화면을 그린 뒤에 한다)
  isRegistered().then((yes) => {
    if (yes || mode === 'register') return;
    mode = 'register';
    paint();
    hint(isShared()
      ? '이 서버에는 아직 관리자가 없습니다. 계정을 만들어 주세요.'
      : '이 기기에 아직 관리자 계정이 없습니다. 계정을 만들어 주세요.');
  }).catch((err) => hint(err.message || ''));
}
