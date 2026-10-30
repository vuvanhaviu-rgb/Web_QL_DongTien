// Sao lưu tự động mỗi ngày: chép toàn bộ dữ liệu quan trọng vào bộ sưu tập "backups" ngay trong Firestore.
// Giữ 30 ngày gần nhất. Dữ liệu chi tiêu Facebook (fbspend) không cần sao lưu vì kéo lại được từ Facebook.
const admin = require("firebase-admin");
const SA = process.env.FIREBASE_SA;
if (!SA) { console.error("Thiếu FIREBASE_SA trong GitHub Secrets."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();
const COLS = ["customers", "prices", "payments", "spend", "hidden", "fbaccounts", "shares"];
const KEEP_DAYS = 30, CHUNK = 600 * 1024;

const vnDate = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const replacer = (k, v) => (v && typeof v === "object" && typeof v.toMillis === "function") ? { __ts: v.toMillis() } : v;

async function deleteQuery(q) {
  let n = 0;
  for (;;) {
    const s = await q.limit(300).get();
    if (s.empty) break;
    const b = db.batch(); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); n += s.size;
  }
  return n;
}

(async () => {
  const now = Date.now(), date = vnDate(now);
  await deleteQuery(db.collection("backups").where("date", "==", date)); // chạy lại trong ngày thì ghi đè
  const counts = {}, chunks = {};
  let total = 0;
  for (const col of COLS) {
    const snap = await db.collection(col).get();
    const rows = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    counts[col] = rows.length; total += rows.length;
    // chia nhỏ để mỗi tài liệu dưới giới hạn 1MB của Firestore
    const parts = []; let cur = [], size = 2;
    for (const r of rows) {
      const s = JSON.stringify(r, replacer);
      if (size + s.length > CHUNK && cur.length) { parts.push(cur); cur = []; size = 2; }
      cur.push(r); size += s.length + 1;
    }
    parts.push(cur);
    chunks[col] = parts.length;
    for (let i = 0; i < parts.length; i++) {
      await db.collection("backups").doc(`${date}_${col}_${i}`).set({ date, col, i, json: JSON.stringify(parts[i], replacer) });
    }
    console.log(`${col}: ${rows.length} bản ghi, ${parts.length} phần`);
  }
  await db.collection("backups").doc("latest").set({ date, at: now, counts, chunks, total });
  const cutoff = vnDate(now - KEEP_DAYS * 86400e3);
  const old = await deleteQuery(db.collection("backups").where("date", "<", cutoff));
  console.log(`Xong: ${total} bản ghi ngày ${date}. Đã xóa ${old} phần của bản sao lưu cũ hơn ${KEEP_DAYS} ngày.`);
  process.exit(0);
})().catch(e => { console.error("LỖI: " + e.message); process.exit(1); });
