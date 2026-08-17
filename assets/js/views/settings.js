/* 설정 — 학교 검색, 학년/반, 나이스 인증키, 테마, 백업/복원 */
import { state, save, update, exportJSON, importJSON, resetAll, getThemePref, setThemePref } from '../store.js';
import { clearCache } from '../data.js';
import { searchSchool } from '../neis.js';
import { listSuggestions } from '../board.js';
import { card, confirmModal } from '../ui.js';
import { el, esc, icon, toast } from '../utils.js';

export default {
  title: '설정',

  render(root) {
    const s = state.school;
    const theme = getThemePref();

    root.innerHTML = `
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

      ${card('건의사항 공유 게시판', `
        <div class="field">
          <label for="boardUrl">웹앱 주소 (선택)</label>
          <input class="input" id="boardUrl" value="${esc(state.boardUrl || '')}" inputmode="url"
            placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off">
          <span class="hint">
            비워 두면 건의가 <b>이 기기에만</b> 저장됩니다. 저장소의
            <code>backend/apps-script.gs</code> 를 구글 Apps Script 웹앱으로 배포한 뒤 주소를 붙여넣으면
            반 전체가 같은 건의 목록과 좋아요를 보게 됩니다.
          </span>
        </div>
        <div class="setting-row" style="margin-top:6px">
          <div class="setting-row__text">
            <strong>${state.boardUrl ? '공유 모드' : '이 기기 전용 모드'}</strong>
            <span>${state.boardUrl ? '반 전체가 같은 건의를 봅니다.' : '건의가 이 브라우저에만 저장됩니다.'}</span>
          </div>
          <button class="btn btn--sm" id="boardTest" type="button">연결 확인</button>
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
        모든 데이터는 서버 없이 이 브라우저(localStorage)에만 저장됩니다.
      </p>`;

    bind(root);
  },
};

function bind(root) {
  const rerender = () => document.dispatchEvent(new CustomEvent('scedule:rerender'));

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
    toast(url ? '공유 게시판을 연결했습니다.' : '이 기기 전용 모드로 돌아갑니다.');
    rerender();
  });

  el('#boardTest')?.addEventListener('click', async () => {
    if (!state.boardUrl) { toast('먼저 웹앱 주소를 입력해 주세요.'); return; }
    toast('연결을 확인하는 중…');
    try {
      await listSuggestions();
      toast('게시판과 정상적으로 연결됐습니다.');
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
