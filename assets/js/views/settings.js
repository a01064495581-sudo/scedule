/* 설정 — 학교 검색, 학년/반, 나이스 인증키, 테마, 백업/복원 */
import {
  ADMIN_CODE, state, save, update, exportJSON, importJSON, resetAll,
  getThemePref, setAdmin, setThemePref,
} from '../store.js';
import { clearCache } from '../data.js';
import { searchSchool } from '../neis.js';
import { checkAdminKey, claimAdminKey, pull, pushContent } from '../server.js';
import { card, confirmModal } from '../ui.js';
import { el, esc, icon, toast } from '../utils.js';

export default {
  title: '관리자 패널',

  render(root) {
    const s = state.school;
    const theme = getThemePref();

    root.innerHTML = `
      <section class="card card--accent">
        <div class="sg-hero__label">${icon.lock} 관리자 패널</div>
        <p style="margin-top:6px;font-size:14px;line-height:1.5">
          이 화면은 아래 주소를 아는 사람만 들어올 수 있어요. 학생들 화면에는 보이지 않습니다.
        </p>
        <p class="mono" style="margin-top:10px;padding:9px 12px;border-radius:12px;
           background:rgba(255,255,255,.2);font-size:13px;word-break:break-all">#/${ADMIN_CODE}</p>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn--sm" id="adminCopy" type="button">주소 복사</button>
          <button class="btn btn--sm" id="adminLock" type="button">이 기기에서 관리자 끄기</button>
        </div>
      </section>

      ${card('학교', `
        <div class="field">
          <label for="schoolQuery">학교 검색</label>
          <div style="display:flex;gap:8px">
            <input class="input" id="schoolQuery" placeholder="예: 서울고등학교" autocomplete="off">
            <button class="btn btn--primary" id="schoolSearch" type="button">${icon.search} 검색</button>
          </div>
          <span class="hint">나이스에 등록된 학교 이름으로 검색합니다.</span>
        </div>
        <div id="schoolResults" style="display:flex;flex-direction:column;gap:8px;margin-top:12px"></div>
        <hr class="divider">
        <div class="setting-row">
          <div class="setting-row__text">
            <strong>${s ? esc(s.name) : '설정된 학교 없음'}</strong>
            <span>${s ? `${esc(s.atptName)} · 학교코드 ${esc(s.sdCode)}` : '검색 결과에서 학교를 선택해 주세요.'}</span>
          </div>
          ${s ? '<button class="btn btn--sm btn--danger" id="schoolClear" type="button">해제</button>' : ''}
        </div>`)}

      ${card('학년 / 반', `
        <div class="form-grid">
          <div class="field">
            <label for="grade">학년</label>
            <input class="input" id="grade" type="number" min="1" max="6" value="${esc(state.profile.grade || '')}">
          </div>
          <div class="field">
            <label for="classNm">반</label>
            <input class="input" id="classNm" type="number" min="1" value="${esc(state.profile.classNm || '')}">
          </div>
        </div>
        <p class="hint" style="margin-top:8px">나이스 시간표를 가져올 때 사용됩니다.</p>`)}

      ${card('나이스 인증키 (선택)', `
        <div class="field">
          <label for="neisKey">인증키</label>
          <input class="input" id="neisKey" value="${esc(state.neisKey || '')}" placeholder="키가 없어도 동작하지만 조회량이 5건으로 제한됩니다" autocomplete="off">
          <span class="hint">
            <a href="https://open.neis.go.kr" target="_blank" rel="noopener">open.neis.go.kr</a>에서 무료로 발급받을 수 있어요.
            키는 이 브라우저에만 저장됩니다.
          </span>
        </div>`)}

      ${card('공용 서버 (반 전체 공유)', `
        <div class="field">
          <label for="boardUrl">Apps Script 웹앱 주소</label>
          <input class="input" id="boardUrl" value="${esc(state.boardUrl || '')}" inputmode="url"
            placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off">
          <span class="hint">
            저장소의 <code>backend/apps-script.gs</code> 를 구글 Apps Script 웹앱으로 배포하고 주소를 넣으세요.
            <b>이 주소가 없으면 시간표·시험·노트가 이 기기에만 저장되어 친구들에게는 보이지 않습니다.</b>
          </span>
        </div>

        <div class="field" style="margin-top:14px">
          <label for="adminKey">관리자 키</label>
          <input class="input" id="adminKey" type="password" value="${esc(state.adminKey || '')}"
            placeholder="6자 이상, 서버 수정 권한" autocomplete="off">
          <span class="hint">
            서버에 처음 등록한 키가 관리자 키가 됩니다. 이 키가 있어야 시간표·시험·노트를 수정할 수 있어요.
            학생 기기에는 넣지 마세요.
          </span>
        </div>

        <div class="setting-row" style="margin-top:8px">
          <div class="setting-row__text">
            <strong>${state.boardUrl ? '공유 모드' : '이 기기 전용 모드'}</strong>
            <span>${state.syncedAt ? `마지막 동기화 ${esc(new Date(state.syncedAt).toLocaleString('ko-KR'))}` : '아직 동기화하지 않음'}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn--sm" id="serverCheck" type="button">연결·키 확인</button>
          <button class="btn btn--sm btn--soft" id="serverPush" type="button">${icon.upload} 서버로 올리기</button>
          <button class="btn btn--sm btn--soft" id="serverPull" type="button">${icon.download} 서버에서 받기</button>
        </div>`)}

      ${card('화면', `
        <div class="setting-row">
          <div class="setting-row__text"><strong>테마</strong><span>시스템 설정을 따르거나 직접 고를 수 있어요.</span></div>
          <div class="segmented" id="themeSeg">
            ${[['auto', '자동'], ['light', '라이트'], ['dark', '다크']].map(([k, label]) =>
              `<button type="button" data-theme="${k}" class="${theme === k ? 'is-active' : ''}">${label}</button>`).join('')}
          </div>
        </div>`)}

      ${card('데이터', `
        <div class="setting-row">
          <div class="setting-row__text"><strong>백업 파일 내보내기</strong><span>시간표·수행평가·시험 일정을 JSON으로 저장합니다.</span></div>
          <button class="btn btn--sm" id="dataExport" type="button">${icon.download} 내보내기</button>
        </div>
        <div class="setting-row">
          <div class="setting-row__text"><strong>백업 파일 가져오기</strong><span>기존 데이터를 덮어씁니다.</span></div>
          <label class="btn btn--sm" style="cursor:pointer">${icon.upload} 가져오기
            <input type="file" id="dataImport" accept="application/json,.json" hidden>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-row__text"><strong>급식 캐시 비우기</strong><span>불러온 급식·학사일정을 다시 받아옵니다.</span></div>
          <button class="btn btn--sm" id="cacheClear" type="button">${icon.refresh} 비우기</button>
        </div>
        <div class="setting-row">
          <div class="setting-row__text"><strong>전체 초기화</strong><span>이 브라우저에 저장된 모든 데이터를 지웁니다.</span></div>
          <button class="btn btn--sm btn--danger" id="dataReset" type="button">초기화</button>
        </div>`)}

      <p class="muted" style="text-align:center">
        학교·학년/반·인증키는 이 브라우저에만, 시간표·시험·노트·건의는 공용 서버에 저장됩니다.
      </p>`;

    bind(root);
  },
};

function bind(root) {
  const rerender = () => document.dispatchEvent(new CustomEvent('scedule:rerender'));

  /* 관리자 */
  el('#adminCopy')?.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#/${ADMIN_CODE}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('관리자 주소를 복사했습니다.');
    } catch {
      toast(url);   // 클립보드가 막힌 브라우저에서는 화면에 띄워 준다
    }
  });

  el('#adminLock')?.addEventListener('click', () => {
    confirmModal('이 기기에서 관리자 모드를 끕니다. 다시 들어오려면 관리자 주소가 필요해요.', () => {
      setAdmin(false);
      location.hash = '#/today';
      toast('관리자 모드를 껐습니다.');
    }, { title: '관리자 모드 끄기', yes: '끄기' });
  });

  /* 학교 검색 */
  const doSearch = async () => {
    const q = el('#schoolQuery').value.trim();
    const box = el('#schoolResults');
    if (!q) return;
    box.innerHTML = '<div class="skeleton" style="height:52px"></div>';
    try {
      const list = await searchSchool(q, state.neisKey);
      box.innerHTML = list.length
        ? list.map((x) => `
            <button type="button" class="school-result" data-school='${esc(JSON.stringify(x))}'>
              <span><strong>${esc(x.name)}</strong><br><span>${esc(x.address || x.atptName)}</span></span>
              <span class="chip">${esc(x.kindName || '')}</span>
            </button>`).join('')
        : '<p class="muted">검색 결과가 없습니다. 학교 이름을 정확히 입력해 보세요.</p>';
    } catch (e) {
      box.innerHTML = `<p class="muted">검색 실패: ${esc(e.message)}</p>`;
    }
  };

  el('#schoolSearch')?.addEventListener('click', doSearch);
  el('#schoolQuery')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-school]');
    if (!btn) return;
    // dataset 값은 브라우저가 이미 엔티티를 디코드해서 돌려준다.
    update({ school: JSON.parse(btn.dataset.school) });
    clearCache();
    toast(`${state.school.name} 으로 설정했습니다.`);
    rerender();
  });

  el('#schoolClear')?.addEventListener('click', () => {
    update({ school: null });
    clearCache();
    rerender();
  });

  /* 학년/반, 인증키 */
  el('#grade')?.addEventListener('change', (e) => {
    state.profile.grade = e.target.value;
    save();
  });
  el('#classNm')?.addEventListener('change', (e) => {
    state.profile.classNm = e.target.value;
    save();
  });
  el('#boardUrl')?.addEventListener('change', (e) => {
    const url = e.target.value.trim();
    if (url && !/^https:\/\//.test(url)) {
      toast('https:// 로 시작하는 주소를 넣어 주세요.');
      return;
    }
    update({ boardUrl: url });
    toast(url ? '공용 서버를 연결했습니다.' : '이 기기 전용 모드로 돌아갑니다.');
    rerender();
  });

  el('#adminKey')?.addEventListener('change', async (e) => {
    const key = e.target.value.trim();
    if (!key) { update({ adminKey: '' }); return; }
    if (key.length < 6) { toast('관리자 키는 6자 이상으로 정해 주세요.'); return; }
    if (!state.boardUrl) { update({ adminKey: key }); toast('키를 저장했습니다. 서버 주소도 넣어 주세요.'); return; }
    try {
      await claimAdminKey(key);
      toast('관리자 키를 서버에 등록했습니다.');
    } catch (err) {
      toast(err.message);
    }
  });

  el('#serverCheck')?.addEventListener('click', async () => {
    if (!state.boardUrl) { toast('먼저 웹앱 주소를 입력해 주세요.'); return; }
    toast('확인하는 중…');
    try {
      await pull({ force: true });
      const ok = state.adminKey ? await checkAdminKey() : false;
      toast(ok ? '서버 연결 정상 · 관리자 키 확인됨' : '서버 연결 정상 (관리자 키 없음/불일치)');
      rerender();
    } catch (err) {
      toast(err.message);
    }
  });

  el('#serverPush')?.addEventListener('click', async () => {
    confirmModal('이 기기의 시간표·시험·수행평가를 서버에 올려 모두에게 보이게 합니다. 서버의 기존 내용은 덮어써집니다.', async () => {
      try {
        await pushContent();
        toast('서버에 올렸습니다. 이제 모두 같은 내용을 봅니다.');
        rerender();
      } catch (err) {
        toast(err.message);
      }
    }, { title: '서버로 올리기', yes: '올리기' });
  });

  el('#serverPull')?.addEventListener('click', async () => {
    try {
      await pull({ force: true });
      toast('서버에서 최신 내용을 받았습니다.');
      rerender();
    } catch (err) {
      toast(err.message);
    }
  });

  el('#neisKey')?.addEventListener('change', (e) => {
    update({ neisKey: e.target.value.trim() });
    clearCache();
    toast('인증키를 저장했습니다.');
  });

  /* 테마 */
  el('#themeSeg')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    setThemePref(btn.dataset.theme);
    rerender();
  });

  /* 데이터 */
  el('#dataExport')?.addEventListener('click', () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scedule-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  el('#dataImport')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      importJSON(await file.text());
      clearCache();
      toast('백업을 불러왔습니다.');
      rerender();
    } catch (err) {
      toast(`불러오기 실패: ${err.message}`);
    }
  });

  el('#cacheClear')?.addEventListener('click', () => {
    clearCache();
    toast('캐시를 비웠습니다.');
  });

  el('#dataReset')?.addEventListener('click', () => {
    confirmModal('저장된 학교·시간표·수행평가·시험 정보를 모두 지웁니다. 되돌릴 수 없어요.', () => {
      resetAll();
      clearCache();
      rerender();
      toast('초기화했습니다.');
    }, { title: '전체 초기화', yes: '모두 지우기' });
  });
}
