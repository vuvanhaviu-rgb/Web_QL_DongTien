// Kéo chi phí quảng cáo từ Facebook (Marketing API) và ghi vào Firestore.
// Chạy tự động bằng GitHub Actions. Bí mật lấy từ biến môi trường, không nằm trong code.
const admin = require("firebase-admin");

const TOKEN = process.env.FB_TOKEN;
const SA = process.env.FIREBASE_SA;
const DAYS = Number(process.env.SYNC_DAYS || 40);       // quét lại N ngày gần nhất (đủ cho tab Tháng này và số Facebook điều chỉnh)
const LIVE_WORD = (process.env.LIVE_WORD || "live").toLowerCase(); // tên chiến dịch có chữ này => Live
const API = "https://graph.facebook.com/v21.0";

if (!TOKEN || !SA) { console.error("Thiếu FB_TOKEN hoặc FIREBASE_SA trong GitHub Secrets."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();

const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

async function insights(acct, since, until) {
  let url = `${API}/act_${acct}/insights?level=campaign&fields=campaign_name,spend&time_increment=1`
    + `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500&access_token=${TOKEN}`;
  const rows = [];
  while (url) {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    rows.push(...(j.data || []));
    url = j.paging && j.paging.next ? j.paging.next : null;
  }
  return rows;
}

// gom theo ngày: {ngày: {live, post}}
function split(rows) {
  const by = {};
  for (const r of rows) {
    const day = r.date_start, amt = Math.round(Number(r.spend) || 0);
    const b = by[day] || (by[day] = { live: 0, post: 0 });
    if ((r.campaign_name || "").toLowerCase().includes(LIVE_WORD)) b.live += amt; else b.post += amt;
  }
  return by;
}

(async () => {
  const now = new Date(), from = new Date(now.getTime() - (DAYS - 1) * 864e5);
  const since = ymd(from), until = ymd(now);
  const snap = await db.collection("customers").get();
  // dọn các dòng Facebook đã lỡ ghi vào bảng chi tiêu từ trước (chỉ xóa dòng chưa có chuyển khoản/chưa đánh dấu thanh toán)
  const old = await db.collection("spend").where("fromFb", "==", true).get();
  for (const d of old.docs) { const x = d.data(); if (!x.transfer && !x.paid) await d.ref.delete(); }
  if (old.size) console.log(`Đã dọn ${old.size} dòng Facebook cũ khỏi bảng chi tiêu.`);
  let ok = 0, fail = 0;
  for (const c of snap.docs) {
    const d = c.data(), acct = String(d.adAccountId || "").replace(/\D/g, "");
    if (!acct) continue;
    try {
      const by = split(await insights(acct, since, until));
      for (const day of Object.keys(by)) {
        await db.collection("fbspend").doc(`${c.id}_${day}`).set(
          { customerId: c.id, date: day, live: by[day].live, post: by[day].post, updatedAt: Date.now() }, { merge: true });
      }
      console.log(`OK  ${d.name}: ${Object.keys(by).length} ngày`);
      ok++;
    } catch (e) { console.error(`LỖI ${d.name}: ${e.message}`); fail++; }
  }
  console.log(`Xong. Thành công ${ok}, lỗi ${fail}.`);
  if (fail && !ok) process.exit(1);
})();
