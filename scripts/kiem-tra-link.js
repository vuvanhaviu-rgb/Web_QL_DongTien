// CHỈ ĐỌC (thử nghiệm): kiểm tra dữ liệu link chia sẻ đã có cột mới và người tiếp cận đã loại trùng chưa.
// Không in tên khách, tên chiến dịch hay mã link: chỉ in số thứ tự và các con số.
const admin = require("firebase-admin");
const SA = process.env.FIREBASE_SA;
if (!SA) { console.error("Thiếu FIREBASE_SA"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
(async () => {
  const snap = await admin.firestore().collection("shares").get();
  let k = 0, bad = 0, multiOk = 0, multiMissing = 0, single = 0;
  snap.forEach(d => {
    const x = d.data(); k++;
    const camps = x.camps || [];
    if (!camps.length) return;
    const cols = (x.cols || []).join(",");
    const lines = [];
    for (const day of camps) {
      const n = day.items.length, sum = day.items.reduce((t, i) => t + (i.r || 0), 0);
      const hasR = day.items.every(i => i.r !== undefined);
      if (n === 1) { single++; continue; }
      if (day.tr === undefined) { multiMissing++; lines.push(`${day.date}: ${n} chiến dịch · tr=chưa có · cộng thẳng=${hasR ? sum : "?"}`); }
      else { multiOk++; const ok = !hasR || day.tr <= sum; if (!ok) bad++; lines.push(`${day.date}: ${n} chiến dịch · tr=${day.tr} · cộng thẳng=${hasR ? sum : "?"}${ok ? "" : "  <-- LỚN HƠN TỔNG, BẤT THƯỜNG"}`); }
    }
    console.log(`Link#${k}: ${camps.length} ngày, cột: ${cols || "(chưa có)"}${lines.length ? "\n  " + lines.slice(0, 4).join("\n  ") : ""}`);
  });
  console.log(`Tổng ${snap.size} link · ngày 1 chiến dịch: ${single} · ngày nhiều chiến dịch đã có tr: ${multiOk} · chưa có tr: ${multiMissing} · bất thường: ${bad}`);
})().catch(e => { console.error("LỖI: " + e.message); process.exit(1); });
