/* 나이스 교육정보 개방 포털(open.neis.go.kr) 클라이언트
 *
 * - 인증키 없이도 동작하지만, 키가 없으면 한 번에 최대 5건까지만 내려온다.
 *   설정 화면에서 개인 인증키를 넣으면 제한이 풀린다. (https://open.neis.go.kr)
 * - 응답은 { <서비스명>: [ { head }, { row } ] } 또는 { RESULT: { CODE, MESSAGE } } 형태.
 *   INFO-200 = 해당 조건의 데이터 없음(정상).
 */

const BASE = 'https://open.neis.go.kr/hub';

export class NeisError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'NeisError';
    this.code = code;
  }
}

async function call(service, params, key) {
  const qs = new URLSearchParams({ Type: 'json', pIndex: '1', pSize: '100', ...params });
  if (key) qs.set('KEY', key);

  let res;
  try {
    res = await fetch(`${BASE}/${service}?${qs}`);
  } catch {
    throw new NeisError('나이스 서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.', 'NETWORK');
  }
  if (!res.ok) throw new NeisError(`나이스 응답 오류 (HTTP ${res.status})`, String(res.status));

  const data = await res.json();

  // 데이터 없음/오류는 RESULT 로만 내려온다.
  if (data.RESULT) {
    if (data.RESULT.CODE === 'INFO-200') return { rows: [], total: 0, truncated: false };
    throw new NeisError(data.RESULT.MESSAGE || '나이스 조회에 실패했습니다.', data.RESULT.CODE);
  }
  const body = data[service];
  if (!body) return { rows: [], total: 0, truncated: false };
  const head = body[0]?.head?.[1]?.RESULT;
  if (head && head.CODE !== 'INFO-000' && head.CODE !== 'INFO-200') {
    throw new NeisError(head.MESSAGE || '나이스 조회에 실패했습니다.', head.CODE);
  }
  const rows = body[1]?.row || [];
  const total = body[0]?.head?.[0]?.list_total_count ?? rows.length;
  // 인증키 없이 부르면 전체 건수와 무관하게 5건만 내려온다.
  return { rows, total, truncated: rows.length < total };
}

/** 학교 이름으로 검색 */
export async function searchSchool(name, key) {
  const { rows } = await call('schoolInfo', { SCHUL_NM: name, pSize: '20' }, key);
  return rows.map((r) => ({
    name: r.SCHUL_NM,
    atptCode: r.ATPT_OFCDC_SC_CODE,
    atptName: r.ATPT_OFCDC_SC_NM,
    sdCode: r.SD_SCHUL_CODE,
    address: r.ORG_RDNMA || '',
    kind: kindOf(r.SCHUL_KND_SC_NM),
    kindName: r.SCHUL_KND_SC_NM,
  }));
}

const kindOf = (n = '') => {
  if (n.includes('초등')) return 'els';
  if (n.includes('중학')) return 'mis';
  if (n.includes('특수') || n.includes('각종')) return 'sps';
  return 'his';
};

/** 급식 조회 — from~to 는 'YYYYMMDD'. { meals, truncated } 반환 */
export async function fetchMeals(school, from, to, key) {
  const { rows, truncated } = await call('mealServiceDietInfo', {
    ATPT_OFCDC_SC_CODE: school.atptCode,
    SD_SCHUL_CODE: school.sdCode,
    MLSV_FROM_YMD: from,
    MLSV_TO_YMD: to,
  }, key);

  return {
    truncated,
    meals: rows.map((r) => ({
      date: r.MLSV_YMD,
      type: r.MMEAL_SC_NM,                 // 조식 / 중식 / 석식
      dishes: parseDishes(r.DDISH_NM),
      calorie: (r.CAL_INFO || '').trim(),
      nutrition: (r.NTR_INFO || '').replace(/<br\s*\/?>/gi, ' · '),
      origin: (r.ORPLC_INFO || '').replace(/<br\s*\/?>/gi, '\n'),
    })),
  };
}

/** 'DDISH_NM' → [{ name, allergies: [번호] }] */
function parseDishes(raw = '') {
  return raw
    .split(/<br\s*\/?>/i)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/\(([\d.\s]+)\)\s*$/);
      const allergies = m ? m[1].split('.').map((n) => n.trim()).filter(Boolean) : [];
      return { name: m ? s.slice(0, m.index).trim() : s, allergies };
    });
}

export const ALLERGY = {
  1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두', 6: '밀', 7: '고등어',
  8: '게', 9: '새우', 10: '돼지고기', 11: '복숭아', 12: '토마토', 13: '아황산류',
  14: '호두', 15: '닭고기', 16: '쇠고기', 17: '오징어', 18: '조개류', 19: '잣',
};

/** 학교 급별에 맞는 시간표 서비스명 */
const timetableService = (kind) =>
  ({ els: 'elsTimetable', mis: 'misTimetable', his: 'hisTimetable', sps: 'spsTimetable' }[kind] || 'hisTimetable');

/** 나이스 시간표 조회 (학교가 입력해 둔 경우에만 데이터가 있다) */
export async function fetchTimetable(school, { grade, classNm, year, semester, from, to }, key) {
  const { rows, truncated } = await call(timetableService(school.kind), {
    ATPT_OFCDC_SC_CODE: school.atptCode,
    SD_SCHUL_CODE: school.sdCode,
    AY: String(year),
    SEM: String(semester),
    GRADE: String(grade),
    CLASS_NM: String(classNm),
    TI_FROM_YMD: from,
    TI_TO_YMD: to,
  }, key);

  return {
    truncated,
    lessons: rows.map((r) => ({
      date: r.ALL_TI_YMD,
      period: Number(r.PERIO),
      subject: (r.ITRT_CNT || '').trim(),
      room: (r.CLRM_NM || '').trim(),
    })),
  };
}

/** 학사일정 조회 — { events, truncated } 반환 */
export async function fetchSchedule(school, from, to, key) {
  const { rows, truncated } = await call('SchoolSchedule', {
    ATPT_OFCDC_SC_CODE: school.atptCode,
    SD_SCHUL_CODE: school.sdCode,
    AA_FROM_YMD: from,
    AA_TO_YMD: to,
  }, key);

  return {
    truncated,
    events: rows
      .map((r) => ({
        date: r.AA_YMD,
        name: (r.EVENT_NM || '').trim(),
        content: (r.EVENT_CNTNT || '').trim(),
      }))
      .filter((e) => e.name && e.name !== '토요휴업일'),
  };
}
