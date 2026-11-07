// CHỈ ĐỌC: liệt kê khách đang gắn một ID tài khoản quảng cáo (không sửa gì).
const admin = require("firebase-admin");
const SA = process.env.FIREBASE_SA, ID = (process.env.ACCT || "").replace(/\D/g, "");
if (!SA) { console.error("Thiếu FIREBASE_SA"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
(async () => {
  const s = await admin.firestore().collection("customers").get();
  let n = 0;
  s.forEach(d => { const x = d.data(); if (String(x.adAccountId || "").replace(/\D+/g, " ").split(" ").includes(ID)) { n++; console.log(`KHÁCH: "${x.name}" (mã ${d.id}) · ô ID đang ghi: "${x.adAccountId}"`); } });
  console.log(`Tổng ${n} khách đang gắn ID ${ID}; tổng số khách: ${s.size}`);
  s.forEach(d => { const x = d.data(); if (/dung/i.test(String(x.name || ""))) console.log(`  tên có "Dung": "${x.name}" · ID: "${x.adAccountId || ""}"`); });
})().catch(e => { console.error("LỖI: " + e.message); process.exit(1); });
