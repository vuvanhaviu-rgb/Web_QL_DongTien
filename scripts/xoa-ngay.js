// Xóa dữ liệu chi tiêu của MỘT ngày (bảng chi tiêu từng khách + chi tiêu Facebook), và in số liệu một ngày khác để đối chiếu.
// Mặc định chỉ liệt kê, không xóa. Chỉ xóa khi APPLY=true.
const admin = require("firebase-admin");
const SA = process.env.FIREBASE_SA;
if (!SA) { console.error("Thiếu FIREBASE_SA"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();
const DEL = (process.env.DEL_DATE || "").trim(), CHECK = (process.env.CHECK_DATE || "").trim(), APPLY = process.env.APPLY === "true";
const ok = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
const f = n => Number(n || 0).toLocaleString("vi-VN");
(async () => {
  const names = {}; (await db.collection("customers").get()).forEach(d => names[d.id] = d.data().name || d.id);
  if (ok(CHECK)) {
    const s = await db.collection("spend").where("date", "==", CHECK).get();
    let L = 0, P = 0, n = 0;
    console.log(`== ĐỐI CHIẾU ngày ${CHECK}: ${s.size} dòng trong bảng chi tiêu ==`);
    s.forEach(d => { const x = d.data(); L += +x.adLive || 0; P += +x.adPost || 0; n++;
      console.log(`  ${names[x.customerId] || x.customerId}: Live ${f(x.adLive)} · Bài viết ${f(x.adPost)}${x.finalized ? " · đã chốt" : ""}`); });
    console.log(`  TỔNG: Live ${f(L)} · Bài viết ${f(P)} · Cộng ${f(L + P)}`);
  }
  if (!ok(DEL)) { console.log("Không có ngày cần xóa."); return; }
  const s = await db.collection("spend").where("date", "==", DEL).get();
  const b = await db.collection("fbspend").where("date", "==", DEL).get();
  let L = 0, P = 0, T = 0;
  console.log(`== NGÀY CẦN XÓA ${DEL}: ${s.size} dòng bảng chi tiêu, ${b.size} dòng chi tiêu Facebook ==`);
  s.forEach(d => { const x = d.data(); L += +x.adLive || 0; P += +x.adPost || 0; T += +x.transfer || 0;
    console.log(`  ${names[x.customerId] || x.customerId}: Live ${f(x.adLive)} · Bài viết ${f(x.adPost)} · khách đã chuyển ${f(x.transfer)}${x.paid ? " · đã thanh toán" : ""}`); });
  console.log(`  TỔNG sẽ mất: Live ${f(L)} · Bài viết ${f(P)} · khách đã chuyển ${f(T)}`);
  if (!APPLY) { console.log("CHƯA XÓA GÌ (chế độ xem trước). Chạy lại với apply = true để xóa."); return; }
  const refs = [...s.docs, ...b.docs].map(d => d.ref);
  for (let i = 0; i < refs.length; i += 400) { const w = db.batch(); refs.slice(i, i + 400).forEach(r => w.delete(r)); await w.commit(); }
  console.log(`ĐÃ XÓA ${refs.length} dòng của ngày ${DEL}.`);
})().catch(e => { console.error("LỖI: " + e.message); process.exit(1); });
