/**
 * 건의사항 공유 게시판 — Google Apps Script 백엔드 (무료, 서버 필요 없음)
 *
 * 배포 방법
 *  1. https://script.google.com 에서 새 프로젝트를 만들고 이 파일 내용을 붙여넣는다.
 *  2. 상단 [배포] → [새 배포] → 유형 '웹 앱'
 *       - 실행 계정: 나
 *       - 액세스 권한: 모든 사용자   ← 반 친구들이 로그인 없이 쓰려면 필수
 *  3. 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 복사해
 *     사이트의 [설정] → [건의사항 공유 게시판] 에 붙여넣는다.
 *
 * 저장 위치: 이 스크립트에 연결된 스프레드시트가 없으면 자동으로 하나 만든다.
 * 익명성: 글쓴이 이름·계정은 저장하지 않는다. 좋아요 중복을 막기 위한
 *         익명 기기 식별자만 해시해서 보관한다.
 */

var SHEET_NAME = 'suggestions';
var LIKE_SHEET = 'likes';
var MAX_LEN = 300;

function doGet() {
  return json({ ok: true, message: '건의 게시판이 동작 중입니다.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var device = hash(String(body.device || ''));

    switch (body.action) {
      case 'list':   return json({ ok: true, items: listItems(device) });
      case 'add':    return json({ ok: true, item: addItem(body, device) });
      case 'like':   return json({ ok: true, liked: toggleLike(String(body.id), device) });
      case 'remove': return json({ ok: removeItem(String(body.id), device) });
      default:       return json({ ok: false, error: '알 수 없는 요청입니다.' });
    }
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* --- 시트 --- */

function book() {
  var id = PropertiesService.getScriptProperties().getProperty('BOOK_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create('건의사항 게시판');
  PropertiesService.getScriptProperties().setProperty('BOOK_ID', ss.getId());
  return ss;
}

function sheet(name, header) {
  var ss = book();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
  }
  return sh;
}

function items() { return sheet(SHEET_NAME, ['id', 'text', 'category', 'createdAt', 'device', 'deleted']); }
function likes() { return sheet(LIKE_SHEET, ['id', 'device']); }

/* --- 동작 --- */

function listItems(device) {
  var rows = items().getDataRange().getValues().slice(1);
  var likeRows = likes().getDataRange().getValues().slice(1);

  var counts = {}, mineLiked = {};
  likeRows.forEach(function (r) {
    var id = String(r[0]);
    counts[id] = (counts[id] || 0) + 1;
    if (String(r[1]) === device) mineLiked[id] = true;
  });

  return rows
    .filter(function (r) { return !r[5]; })
    .map(function (r) {
      var id = String(r[0]);
      return {
        id: id,
        text: String(r[1]),
        category: String(r[2]),
        createdAt: toIso(r[3]),
        likes: counts[id] || 0,
        liked: !!mineLiked[id],
        mine: String(r[4]) === device,
      };
    });
}

function addItem(body, device) {
  var text = String(body.text || '').trim().slice(0, MAX_LEN);
  if (!text) throw new Error('내용이 비어 있습니다.');

  // 같은 기기에서 1분에 3건 이상은 막는다 (도배 방지)
  var recent = items().getDataRange().getValues().slice(1).filter(function (r) {
    return String(r[4]) === device && (new Date() - new Date(r[3])) < 60000;
  });
  if (recent.length >= 3) throw new Error('잠시 후 다시 올려 주세요.');

  var item = {
    id: Utilities.getUuid(),
    text: text,
    category: String(body.category || '기타'),
    createdAt: new Date().toISOString(),
  };
  items().appendRow([item.id, item.text, item.category, item.createdAt, device, '']);
  return item;
}

function toggleLike(id, device) {
  var sh = likes();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id && String(rows[i][1]) === device) {
      sh.deleteRow(i + 1);
      return false;
    }
  }
  sh.appendRow([id, device]);
  return true;
}

function removeItem(id, device) {
  var sh = items();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id && String(rows[i][4]) === device) {
      sh.getRange(i + 1, 6).setValue('1');   // soft delete
      return true;
    }
  }
  return false;   // 남의 글은 지울 수 없다
}

/* --- 유틸 --- */

function hash(s) {
  if (!s) return '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + '|scedule');
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 24);
}

function toIso(v) {
  if (v instanceof Date) return v.toISOString();
  var d = new Date(v);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
