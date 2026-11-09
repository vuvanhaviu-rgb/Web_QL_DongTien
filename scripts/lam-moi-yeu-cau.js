// Làm mới theo yêu cầu: khách bấm nút "Làm mới" trên link chia sẻ => web ghi một yêu cầu vào bộ sưu tập "refresh".
// Script này (chạy mỗi phút trên GitHub Actions) đọc các yêu cầu, kéo số Facebook CHỈ của khách đó (hôm qua và hôm nay),
// cập nhật link chia sẻ rồi xóa yêu cầu. Không có yêu cầu nào thì thoát ngay, không gọi Facebook.
const MIN_GAP_MS = 30e3, MAX_CUSTOMERS = 10;

async function processRequests(db, run, opt) {
  opt = opt || {};
  const now = opt.now || Date.now;
  const reqs = await db.collection("refresh").get();
  if (reqs.empty) { console.log("Không có yêu cầu làm mới."); return { done: 0 }; }
  const custs = await db.collection("customers").get();
  const byToken = {};
  custs.forEach(c => { const t = c.data().shareToken; if (t) byToken[t] = c.id; });
  const ids = new Set(), drop = [];
  for (const r of reqs.docs) {
    drop.push(r.ref);
    const cid = byToken[r.id];
    if (!cid) { console.log("Bỏ qua yêu cầu không có link hợp lệ."); continue; }
    const sh = await db.collection("shares").doc(r.id).get();
    const last = (sh.exists && sh.data().refreshedAt) || 0;
    if (now() - last < MIN_GAP_MS) { console.log("Bỏ qua: link này vừa làm mới xong."); continue; }
    if (ids.size < MAX_CUSTOMERS) ids.add(cid);
  }
  let err = null;
  try {
    if (ids.size) { console.log(`Làm mới ${ids.size} khách theo yêu cầu.`); await run(db, Object.assign({}, opt.sync, { only: Array.from(ids) })); }
  } catch (e) { err = e; console.error("LỖI làm mới: " + e.message); }
  for (const ref of drop) { try { await ref.delete(); } catch (e) { /* bỏ qua */ } }
  if (err) throw err;
  return { done: ids.size };
}
module.exports = { processRequests };

if (require.main === module) {
  const admin = require("firebase-admin"), runSync = require("./sync-core.js");
  const SA = process.env.FIREBASE_SA;
  if (!process.env.FB_TOKEN || !SA) { console.error("Thiếu FB_TOKEN hoặc FIREBASE_SA trong GitHub Secrets."); process.exit(1); }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
  setTimeout(() => { console.error("QUÁ 5 PHÚT: tự dừng"); process.exit(2); }, 5 * 60e3).unref();
  processRequests(admin.firestore(), runSync, { sync: { token: process.env.FB_TOKEN, liveWord: process.env.LIVE_WORD, days: 2 } })
    .then(() => process.exit(0)).catch(e => { console.error("LỖI: " + e.message); process.exit(1); });
}
