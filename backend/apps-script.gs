/**
 * 스케줄 — 공용 데이터 서버 (Google Apps Script, 무료)
 *
 * 이 스크립트 하나가 반 전체의 공용 저장소가 된다.
 *   · 시간표 / 정기시험 / 수행평가 : 관리자가 저장하면 모든 학생이 같은 내용을 본다
 *   · 과목별 요점정리 노트(사진·파일) : 구글 드라이브에 저장
 *   · 건의사항 + 좋아요 : 익명 등록, 기기당 1회
 *
 * ── 배포 방법 ──────────────────────────────────────────────
 * 1. https://script.google.com 새 프로젝트 → 이 파일 내용 붙여넣기
 * 2. [배포] → [새 배포] → 유형 '웹 앱'
 *      · 실행 계정 : 나
 *      · 액세스 권한 : 모든 사용자      ← 로그인 없이 쓰려면 필수
 * 3. 나온 웹앱 주소(.../exec)를 사이트 관리자 패널에 붙여넣기
 * 4. 사이트에서 /#/admin 으로 들어가 관리자 아이디·비밀번호를 만들면 이 서버에 등록된다.
 *    이후 시간표·시험·노트 수정은 그 계정으로 로그인한 사람만 가능하다.
 *    (비밀번호는 해시로만 보관하고, 로그인 실패가 잦으면 잠시 막는다)
 *
 * 저장 위치 : 스프레드시트와 드라이브 폴더를 자동으로 만든다.
 * 익명성 : 글쓴이 이름·계정은 저장하지 않는다. 좋아요 중복 방지용 기기 식별자만 해시로 보관.
 */

var MAX_LEN = 300;              // 건의 글자 수 제한
var MAX_FILE_MB = 8;            // 노트 첨부 파일 최대 용량
var MIN_ID = 3;                 // 관리자 아이디 최소 길이
var MIN_PW = 6;                 // 관리자 비밀번호 최소 길이
var MAX_FAILS = 5;              // 로그인 실패 허용 횟수
var FAIL_WINDOW_MIN = 10;       // 실패 기록이 풀리는 시간(분)

function doGet() {
  return json({ ok: true, message: '스케줄 공용 서버가 동작 중입니다.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var device = hash(String(body.device || ''));
    var admin = isAdmin(body.adminKey);

    switch (body.action) {
      /* --- 읽기 (누구나) --- */
      case 'get':
        return json({
          ok: true,
          content: readContent(),
          notes: listNotes(),
          suggestions: listSuggestions(device),
          updatedAt: props().getProperty('UPDATED_AT') || '',
        });

      /* --- 건의 (누구나) --- */
      case 'add':  return json({ ok: true, item: addSuggestion(body, device) });
      case 'like': return json({ ok: true, liked: toggleLike(String(body.id), device) });

      /* --- 관리자 계정 --- */
      case 'adminStatus':   return json({ ok: true, registered: !!props().getProperty('ADMIN_KEY') });
      case 'adminLogin':    return json({ ok: true, admin: adminLogin(body, device) });
      case 'adminRegister': return json({ ok: true, registered: adminRegister(body) });
      case 'setAdminCred':  return needAdmin(admin) || json({ ok: true, changed: setAdminCred(body) });
      case 'claimAdmin':    return json({ ok: true, claimed: claimAdmin(body.adminKey) });   // 예전 버전 호환
      case 'checkAdmin':    return json({ ok: true, admin: admin });

      /* --- 관리자 전용 --- */
      case 'saveContent': return needAdmin(admin) || json({ ok: true, content: saveContent(body.content) });
      case 'addNote':     return needAdmin(admin) || json({ ok: true, note: addNote(body) });
      case 'removeNote':  return needAdmin(admin) || json({ ok: true, removed: removeNote(String(body.id)) });
      case 'removeSuggestion':
        return needAdmin(admin) || json({ ok: true, removed: removeSuggestion(String(body.id)) });

      default: return json({ ok: false, error: '알 수 없는 요청입니다.' });
    }
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ── 관리자 계정 ─────────────────────────────────────────── */

function props() { return PropertiesService.getScriptProperties(); }

/** 아이디·비밀번호 확인. 맞으면 true, 틀리면 예외.
 *  아이디가 아직 없는 서버(예전 버전에서 키만 등록한 경우)라면 이번 아이디를 등록한다. */
function adminLogin(body, device) {
  guardFails(device);

  var id = String(body.adminId || '').trim();
  var savedId = props().getProperty('ADMIN_ID');
  var okKey = isAdmin(body.adminKey);
  var okId = !savedId || savedId === id;

  if (!okKey || !okId) {
    noteFail(device);
    throw new Error('아이디 또는 비밀번호가 맞지 않습니다.');
  }
  if (!savedId && id) props().setProperty('ADMIN_ID', id);
  clearFails(device);
  return true;
}

/** 관리자 계정 만들기 — 아직 아무도 등록하지 않았을 때만 */
function adminRegister(body) {
  var id = String(body.adminId || '').trim();
  var key = String(body.adminKey || '');
  if (id.length < MIN_ID) throw new Error('아이디는 ' + MIN_ID + '자 이상이어야 합니다.');
  if (key.length < MIN_PW) throw new Error('비밀번호는 ' + MIN_PW + '자 이상이어야 합니다.');
  if (props().getProperty('ADMIN_KEY')) throw new Error('이미 관리자 계정이 있습니다. 로그인해 주세요.');

  props().setProperty('ADMIN_ID', id);
  props().setProperty('ADMIN_KEY', hash(key));
  return true;
}

/** 아이디·비밀번호 바꾸기 (비밀번호가 비면 아이디만) — 지금 관리자만 부를 수 있다 */
function setAdminCred(body) {
  var id = String(body.adminId || '').trim();
  var key = String(body.newKey || '');
  if (id.length < MIN_ID) throw new Error('아이디는 ' + MIN_ID + '자 이상이어야 합니다.');
  if (key && key.length < MIN_PW) throw new Error('비밀번호는 ' + MIN_PW + '자 이상이어야 합니다.');

  props().setProperty('ADMIN_ID', id);
  if (key) props().setProperty('ADMIN_KEY', hash(key));
  return true;
}

/* 로그인 실패 기록 — 기기별로 세어 두고, 너무 잦으면 잠시 막는다 */

function readFails() {
  try { return JSON.parse(props().getProperty('LOGIN_FAILS') || '{}'); } catch (e) { return {}; }
}

function saveFails(map) {
  var now = Date.now();
  Object.keys(map).forEach(function (k) {
    if (now - map[k].at > FAIL_WINDOW_MIN * 60000) delete map[k];   // 오래된 기록은 버린다
  });
  props().setProperty('LOGIN_FAILS', JSON.stringify(map));
}

function guardFails(device) {
  var f = readFails()[device];
  if (f && f.n >= MAX_FAILS && Date.now() - f.at <= FAIL_WINDOW_MIN * 60000) {
    throw new Error('로그인 시도가 너무 많습니다. ' + FAIL_WINDOW_MIN + '분 후 다시 시도해 주세요.');
  }
}

function noteFail(device) {
  var map = readFails();
  var f = map[device];
  var fresh = f && Date.now() - f.at <= FAIL_WINDOW_MIN * 60000;
  map[device] = { n: (fresh ? f.n : 0) + 1, at: Date.now() };
  saveFails(map);
}

function clearFails(device) {
  var map = readFails();
  delete map[device];
  saveFails(map);
}

/** 키가 아직 없으면 처음 보낸 값을 관리자 키로 등록한다. (예전 버전 사이트 호환) */
function claimAdmin(key) {
  key = String(key || '').trim();
  if (key.length < 6) throw new Error('관리자 키는 6자 이상이어야 합니다.');
  var saved = props().getProperty('ADMIN_KEY');
  if (saved && saved !== hash(key)) throw new Error('이미 다른 관리자 키가 등록되어 있습니다.');
  props().setProperty('ADMIN_KEY', hash(key));
  return true;
}

function isAdmin(key) {
  var saved = props().getProperty('ADMIN_KEY');
  return !!saved && !!key && hash(String(key)) === saved;
}

function needAdmin(ok) {
  return ok ? null : json({ ok: false, error: '관리자만 할 수 있는 작업입니다. 다시 로그인해 주세요.' });
}

/* ── 저장소 ──────────────────────────────────────────────── */

function book() {
  var id = props().getProperty('BOOK_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* 삭제됐으면 새로 */ } }
  var ss = SpreadsheetApp.create('스케줄 공용 데이터');
  props().setProperty('BOOK_ID', ss.getId());
  return ss;
}

function sheet(name, header) {
  var ss = book();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); }
  return sh;
}

function folder() {
  var id = props().getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 삭제됐으면 새로 */ } }
  var f = DriveApp.createFolder('스케줄 노트 첨부');
  props().setProperty('FOLDER_ID', f.getId());
  return f;
}

var S_SUG = 'suggestions', S_LIKE = 'likes', S_NOTE = 'notes', S_CONTENT = 'content';

function suggestionSheet() { return sheet(S_SUG, ['id', 'text', 'category', 'createdAt', 'device', 'deleted']); }
function likeSheet()       { return sheet(S_LIKE, ['id', 'device']); }
function noteSheet()       { return sheet(S_NOTE, ['id', 'subject', 'title', 'body', 'fileId', 'fileName', 'mime', 'createdAt', 'deleted']); }
function contentSheet()    { return sheet(S_CONTENT, ['key', 'json', 'updatedAt']); }

/* ── 시간표 · 시험 · 수행평가 (관리자 저장, 전체 공유) ──── */

function readContent() {
  var rows = contentSheet().getDataRange().getValues().slice(1);
  var out = {};
  rows.forEach(function (r) {
    if (!r[0]) return;
    try { out[String(r[0])] = JSON.parse(r[1]); } catch (e) { /* 깨진 값은 무시 */ }
  });
  return out;
}

function saveContent(content) {
  if (!content || typeof content !== 'object') throw new Error('저장할 내용이 없습니다.');
  var sh = contentSheet();
  var rows = sh.getDataRange().getValues();
  var now = new Date().toISOString();

  Object.keys(content).forEach(function (key) {
    var payload = JSON.stringify(content[key]);
    var found = -1;
    for (var i = 1; i < rows.length; i++) if (String(rows[i][0]) === key) { found = i; break; }
    if (found > 0) sh.getRange(found + 1, 1, 1, 3).setValues([[key, payload, now]]);
    else sh.appendRow([key, payload, now]);
  });
  props().setProperty('UPDATED_AT', now);
  return readContent();
}

/* ── 요점정리 노트 ───────────────────────────────────────── */

function listNotes() {
  return noteSheet().getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0] && !r[8]; })
    .map(function (r) {
      var fileId = String(r[4] || '');
      return {
        id: String(r[0]),
        subject: String(r[1] || ''),
        title: String(r[2] || ''),
        body: String(r[3] || ''),
        fileId: fileId,
        fileName: String(r[5] || ''),
        mime: String(r[6] || ''),
        createdAt: toIso(r[7]),
        // 이미지 미리보기 / 원본 열기 주소
        thumbUrl: fileId ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200' : '',
        openUrl: fileId ? 'https://drive.google.com/file/d/' + fileId + '/view' : '',
      };
    })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
}

function addNote(body) {
  var subject = String(body.subject || '').trim();
  var title = String(body.title || '').trim();
  if (!subject) throw new Error('과목을 입력해 주세요.');
  if (!title && !body.file) throw new Error('제목이나 파일 중 하나는 있어야 합니다.');

  var fileId = '', fileName = '', mime = '';
  if (body.file && body.file.data) {
    var bytes = Utilities.base64Decode(body.file.data);
    if (bytes.length > MAX_FILE_MB * 1024 * 1024) throw new Error(MAX_FILE_MB + 'MB 이하 파일만 올릴 수 있습니다.');
    mime = String(body.file.mime || 'application/octet-stream');
    fileName = String(body.file.name || 'note');
    var blob = Utilities.newBlob(bytes, mime, fileName);
    var file = folder().createFile(blob);
    // 링크를 아는 사람은 볼 수 있게 (앱에서 이미지 표시에 필요)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fileId = file.getId();
  }

  var note = {
    id: Utilities.getUuid(),
    subject: subject,
    title: title,
    body: String(body.body || '').trim(),
    createdAt: new Date().toISOString(),
  };
  noteSheet().appendRow([note.id, note.subject, note.title, note.body, fileId, fileName, mime, note.createdAt, '']);
  props().setProperty('UPDATED_AT', note.createdAt);
  return note;
}

function removeNote(id) {
  var sh = noteSheet();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      var fileId = String(rows[i][4] || '');
      if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* 이미 없음 */ } }
      sh.getRange(i + 1, 9).setValue('1');
      return true;
    }
  }
  return false;
}

/* ── 건의사항 ────────────────────────────────────────────── */

function listSuggestions(device) {
  var rows = suggestionSheet().getDataRange().getValues().slice(1);
  var counts = {}, mine = {};
  likeSheet().getDataRange().getValues().slice(1).forEach(function (r) {
    var id = String(r[0]);
    counts[id] = (counts[id] || 0) + 1;
    if (String(r[1]) === device) mine[id] = true;
  });

  return rows.filter(function (r) { return r[0] && !r[5]; }).map(function (r) {
    var id = String(r[0]);
    return {
      id: id,
      text: String(r[1]),
      category: String(r[2]),
      createdAt: toIso(r[3]),
      likes: counts[id] || 0,
      liked: !!mine[id],
    };
  });
}

function addSuggestion(body, device) {
  var text = String(body.text || '').trim().slice(0, MAX_LEN);
  if (!text) throw new Error('내용이 비어 있습니다.');

  // 도배 방지 — 같은 기기에서 1분에 3건까지
  var recent = suggestionSheet().getDataRange().getValues().slice(1).filter(function (r) {
    return String(r[4]) === device && (new Date() - new Date(r[3])) < 60000;
  });
  if (recent.length >= 3) throw new Error('잠시 후 다시 올려 주세요.');

  var item = {
    id: Utilities.getUuid(),
    text: text,
    category: String(body.category || '기타'),
    createdAt: new Date().toISOString(),
  };
  suggestionSheet().appendRow([item.id, item.text, item.category, item.createdAt, device, '']);
  return item;
}

function toggleLike(id, device) {
  var sh = likeSheet();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id && String(rows[i][1]) === device) { sh.deleteRow(i + 1); return false; }
  }
  sh.appendRow([id, device]);
  return true;
}

/** 건의 삭제는 관리자만 (학생은 자기 글도 지울 수 없다) */
function removeSuggestion(id) {
  var sh = suggestionSheet();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id) { sh.getRange(i + 1, 6).setValue('1'); return true; }
  }
  return false;
}

/* ── 유틸 ────────────────────────────────────────────────── */

function hash(s) {
  if (!s) return '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + '|scedule');
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 32);
}

function toIso(v) {
  if (v instanceof Date) return v.toISOString();
  var d = new Date(v);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
