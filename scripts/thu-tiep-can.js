// CHỈ ĐỌC (thử nghiệm): kiểm tra cách lấy "người tiếp cận" đã loại trùng giữa các chiến dịch cùng ngày.
// Không sửa dữ liệu, không in tên khách/tên chiến dịch/ID: chỉ in số thứ tự tài khoản và các con số.
const admin = require("firebase-admin");
const API = "https://graph.facebook.com/v21.0", TOKEN = process.env.FB_TOKEN, SA = process.env.FIREBASE_SA;
if (!TOKEN || !SA) { console.error("Thiếu FB_TOKEN hoặc FIREBASE_SA"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const VN = ms => new Date(ms + 7 * 3600e3), ymd = d => d.toISOString().slice(0, 10);
async function list(url) {
  const out = [], seen = new Set();
  while (url && !seen.has(url) && seen.size < 30) {
    seen.add(url);
    const j = await (await fetch(url, { signal: AbortSignal.timeout(60000) })).json();
    if (j.error) throw new Error(j.error.message);
    out.push(...(j.data || []));
    url = j.paging && j.paging.next ? j.paging.next : null;
  }
  return out;
}
(async () => {
  const snap = await admin.firestore().collection("customers").get();
  const accts = Array.from(new Set(snap.docs.flatMap(d => String(d.data().adAccountId || "").split(/[^0-9]+/).filter(x => x.length >= 5))));
  const since = ymd(VN(Date.now() - 6 * 864e5)), until = ymd(VN(Date.now()));
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  console.log(`Quét ${accts.length} tài khoản, từ ${since} đến ${until}`);
  let shown = 0, okN = 0, errN = 0;
  for (let ai = 0; ai < accts.length && shown < 8; ai++) {
    const a = accts[ai];
    try {
      const rows = await list(`${API}/act_${a}/insights?level=campaign&fields=campaign_id,spend,reach&time_increment=1&time_range=${tr}&limit=500&access_token=${TOKEN}`);
      const byDay = {};
      for (const r of rows) if (Number(r.spend) > 0) (byDay[r.date_start] = byDay[r.date_start] || []).push(r);
      const multi = Object.keys(byDay).filter(d => byDay[d].length >= 2);
      if (!multi.length) continue;
      const ids = Array.from(new Set(rows.filter(r => Number(r.spend) > 0).map(r => r.campaign_id)));
      const filt = encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]));
      let dedup = {};
      try {
        const rr = await list(`${API}/act_${a}/insights?level=account&fields=reach,spend&time_increment=1&time_range=${tr}&filtering=${filt}&limit=500&access_token=${TOKEN}`);
        rr.forEach(x => { dedup[x.date_start] = Number(x.reach) || 0; });
        okN++;
      } catch (e) { errN++; console.log(`TK#${ai + 1}: LỖI khi lấy tiếp cận gộp (${ids.length} chiến dịch): ${e.message}`); shown++; continue; }
      shown++;
      for (const d of multi.sort()) {
        const sum = byDay[d].reduce((t, r) => t + (Number(r.reach) || 0), 0);
        console.log(`TK#${ai + 1} ${d}: ${byDay[d].length} chiến dịch · cộng thẳng ${sum} · loại trùng (Facebook) ${dedup[d] === undefined ? "không có dòng" : dedup[d]}`);
      }
    } catch (e) { console.log(`TK#${ai + 1}: lỗi đọc: ${e.message}`); }
  }
  console.log(`Xong. Thử thành công ${okN} tài khoản, lỗi ${errN}.`);
})().catch(e => { console.error("LỖI: " + e.message); process.exit(1); });
