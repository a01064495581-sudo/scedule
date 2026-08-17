/* 나이스 조회 결과 캐시 (세션 단위) — 화면 전환마다 다시 부르지 않도록 */
import { state } from './store.js';
import * as neis from './neis.js';

const mem = new Map();

function cacheKey(kind, from, to) {
  const s = state.school;
  return `scedule.cache.${kind}.${s?.atptCode}.${s?.sdCode}.${from}.${to}`;
}

function readCache(key) {
  if (mem.has(key)) return mem.get(key);
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const val = JSON.parse(raw);
      mem.set(key, val);
      return val;
    }
  } catch { /* 캐시는 실패해도 무시 */ }
  return null;
}

function writeCache(key, val) {
  mem.set(key, val);
  try { sessionStorage.setItem(key, JSON.stringify(val)); } catch { /* 용량 초과 무시 */ }
}

export function clearCache() {
  mem.clear();
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith('scedule.cache.'))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch { /* noop */ }
}

/** 급식 조회 (캐시 사용). 학교 미설정이면 null */
export async function getMeals(from, to, { force = false } = {}) {
  if (!state.school) return null;
  const key = cacheKey('meal', from, to);
  if (!force) {
    const hit = readCache(key);
    if (hit) return hit;
  }
  const rows = await neis.fetchMeals(state.school, from, to, state.neisKey);
  writeCache(key, rows);
  return rows;
}

/** 학사일정 조회 (캐시 사용) */
export async function getSchedule(from, to, { force = false } = {}) {
  if (!state.school) return null;
  const key = cacheKey('sched', from, to);
  if (!force) {
    const hit = readCache(key);
    if (hit) return hit;
  }
  const rows = await neis.fetchSchedule(state.school, from, to, state.neisKey);
  writeCache(key, rows);
  return rows;
}

/** 나이스 시간표 조회 (캐시 없음 — 가져오기 버튼에서만 사용) */
export function getTimetable(opts) {
  if (!state.school) return Promise.resolve(null);
  return neis.fetchTimetable(state.school, opts, state.neisKey);
}
