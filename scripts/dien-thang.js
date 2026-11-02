// Điền lại bảng chi tiêu của các ngày trong một tháng (đến hết HÔM QUA) từ số Facebook đã kéo (fbspend).
// Chỉ THÊM dòng cho (khách, ngày) chưa có dòng nào; không đụng vào dòng đã có. Mặc định chỉ xem trước, chỉ ghi khi APPLY=true.
// UNHIDE=true: gỡ dấu "đã ẩn" của các ngày cần điền (dấu này do chức năng xóa theo tháng tạo ra, nó chặn việc điền lại).
const admin = require("firebase-admin");
const SA = process.env.FIREBASE_SA;
if (!SA) { console.error("Thiếu FIREBASE_SA"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();
const MONTH = (process.env.MONTH || "").trim(), APPLY = process.env.APPLY === "true", UNHIDE = process.env.UNHIDE === "true";
if (!/^\d{4}-\d{2}$/.test(MONTH)) { console.error("MONTH phải dạng YYYY-MM"); process.exit(1); }
const VN = ms => new Date(ms + 7 * 3600e3);
const ymd = d => d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
const yesterday = ymd(VN(Date.now() - 864e5));
const f = n => Number(n || 0).toLocaleString("vi-VN");
(async () => {
  const cs = {}; (await db.collection("customers").get()).forEach(d => cs[d.id] = d.data());
  const fb = (await db.collection("fbspend").get()).docs.map(d => d.data()).filter(x => x.date && x.date.slice(0, 7) === MONTH && x.date <= yesterday && (+x.live > 0 || +x.post > 0));
  const have = new Set((await db.collection("spend").get()).docs.map(d => d.data().customerId + "|" + d.data().date));
  const hid = (await db.collection("hidden").get()).docs.filter(d => (d.data().date || "").slice(0, 7) === MONTH);
  const hidKey = {}; hid.forEach(d => hidKey[d.data().customerId + "|" + d.data().date] = d.ref);
  const add = fb.filter(x => cs[x.customerId] && !have.has(x.customerId + "|" + x.date));
  let L = 0, P = 0, blocked = 0;
  console.log(`== THÁNG ${MONTH}: số Facebook ${fb.length} ngày-khách, đã có trong bảng ${fb.length - add.length}, cần điền ${add.length}; dấu ẩn trong tháng: ${hid.length} ==`);
  add.sort((a, b) => a.date.localeCompare(b.date)).forEach(x => { L += +x.live || 0; P += +x.post || 0; const h = !!hidKey[x.customerId + "|" + x.date]; if (h) blocked++;
    console.log(`  ${x.date} ${cs[x.customerId].name}: Live ${f(x.live)} · Bài viết ${f(x.post)}${h ? " · đang bị ẩn" : ""}`); });
  console.log(`  TỔNG cần điền: Live ${f(L)} · Bài viết ${f(P)} · Cộng ${f(L + P)} · trong đó bị ẩn ${blocked}`);
  if (!APPLY) { console.log("CHƯA GHI GÌ (xem trước)."); return; }
  if (blocked && !UNHIDE) { console.log(`Có ${blocked} dòng bị ẩn, chưa điền (cần tick UNHIDE).`); }
  let n = 0;
  for (const x of add) {
    const k = x.customerId + "|" + x.date, h = hidKey[k];
    if (h && !UNHIDE) continue;
    if (h) await h.delete();
    const d = cs[x.customerId];
    await db.collection("spend").doc(`fb_${x.customerId}_${x.date}`).set({
      customerId: x.customerId, date: x.date, adLive: +x.live || 0, adPost: +x.post || 0,
      feeRate: d.feeRate != null && d.feeRate !== "" ? Number(d.feeRate) : 10, transfer: 0, paid: false,
      fromFb: true, finalized: true, createdAt: Date.now()
    }); n++;
  }
  console.log(`ĐÃ ĐIỀN ${n} dòng.`);
})().catch(e => { console.error("LỖI: " + e.message); process.exit(1); });
