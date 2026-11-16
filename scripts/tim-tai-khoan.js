// CHỈ ĐỌC: liệt kê khách đang gắn một ID tài khoản quảng cáo (không sửa gì).
const admin = require("firebase-admin");
const SA = process.env.FIREBASE_SA, ID = (process.env.ACCT || "").replace(/\D/g, "");
if (!SA) { console.error("Thiếu FIREBASE_SA"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
(async () => {
  const s = await admin.firestore().collection("customers").get();
  let n = 0;
  s.forEach(d => { const x = d.data(); if (String(x.adAccountId || "").replace(/\D+/g, " ").split(" ").includes(ID)) { n++; console.log(`KHÁCH mã ${d.id} đang gắn ID này (mở web ở địa chỉ #khach-hang/${d.id} để xem khách nào)`); } });
  console.log(`Tổng ${n} khách đang gắn ID đã nhập; tổng số khách: ${s.size}`);
})().catch(e => { console.error("LỖI: " + String(e.message).replace(/\d{6,}/g, "…")); process.exit(1); });
