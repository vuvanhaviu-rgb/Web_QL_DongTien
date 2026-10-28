// Kéo chi phí quảng cáo từ Facebook (Marketing API) và ghi vào Firestore.
// Chạy tự động bằng GitHub Actions. Bí mật lấy từ biến môi trường, không nằm trong code.
const admin = require("firebase-admin");

const TOKEN = process.env.FB_TOKEN;
const SA = process.env.FIREBASE_SA;
const DAYS = Number(process.env.SYNC_DAYS || 40);       // quét lại N ngày gần nhất (đủ cho tab Tháng này và số Facebook điều chỉnh)
const LIVE_WORDS = (process.env.LIVE_WORD || "live, livestream").toLowerCase().split(",").map(x => x.trim()).filter(Boolean); // tên chiến dịch có một trong các chữ này => Live
const API = "https://graph.facebook.com/v21.0";

if (!TOKEN || !SA) { console.error("Thiếu FB_TOKEN hoặc FIREBASE_SA trong GitHub Secrets."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();

// Giờ Việt Nam (UTC+7), vì máy chạy GitHub dùng giờ UTC
const VN = ms => new Date(ms + 7 * 3600e3);
const ymd = d => d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");

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

// bỏ dấu tiếng Việt, chữ thường: "Ngân" khớp "ngan", "NGAN"
const fold = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
const norm = t => String(t || "").trim(); // GIỮ NGUYÊN: không bỏ dấu, không đổi hoa/thường, không bỏ ký tự
const cache = {}; // mỗi tài khoản chỉ gọi Facebook một lần, dùng chung cho các khách cùng tài khoản
async function rowsOf(acct, since, until) { return cache[acct] || (cache[acct] = await insights(acct, since, until)); }

// gom theo ngày: {ngày: {live, post}}
// - Khách có điền từ khóa: chiến dịch khớp từ khóa Live => Live, khớp từ khóa Bài viết => Bài viết, không khớp => bỏ qua.
// - Khách không điền từ khóa nào: lấy cả tài khoản, tên có chữ LIVE đứng riêng => Live, còn lại => Bài viết.
function split(rows, liveKeys, postKeys, nameKey) {
  const by = {}, custom = liveKeys.length || postKeys.length;
  for (const r of rows) {
    const name = norm(r.campaign_name), amt = Math.round(Number(r.spend) || 0);
    let kind;
    if (custom) kind = liveKeys.some(k => name.includes(k)) ? "live" : postKeys.some(k => name.includes(k)) ? "post" : null;
    else if (nameKey && name !== nameKey) kind = null;   // tài khoản dùng chung, khách không điền từ khóa: chỉ lấy chiến dịch có tên khách
    else kind = LIVE_WORDS.some(w => new RegExp("(?<!\\p{L})" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?!\\p{L})", "u").test(name.toLowerCase())) ? "live" : "post";
    if (!kind) continue;
    const b = by[r.date_start] || (by[r.date_start] = { live: 0, post: 0 });
    b[kind] += amt;
  }
  return by;
}

(async () => {
  const nowVN = VN(Date.now()), now = nowVN, from = VN(Date.now() - (DAYS - 1) * 864e5);
  const since = ymd(from), until = ymd(now), yesterday = ymd(VN(Date.now() - 864e5));
  const pastTen = nowVN.getUTCHours() >= 10; // từ 10h sáng giờ Việt Nam: chốt chi phí hôm qua // từ 10h sáng giờ Việt Nam: chốt chi phí hôm qua vào bảng chi tiêu
  const snap = await db.collection("customers").get();
  let ok = 0, fail = 0;
  for (const c of snap.docs) {
    const d = c.data(), accts = String(d.adAccountId || "").split(/[^0-9]+/).filter(x => x.length >= 5); // nhiều ID: cách nhau bằng dấu phẩy, cách hoặc xuống dòng
    if (!accts.length) continue;
    const list = v => String(v || "").split(",").map(x => norm(x)).filter(Boolean);
    const liveKeys = list(d.liveKey), postKeys = list(d.postKey);
    try {
      const by = {};
      for (const acct of accts) {                       // cộng chi phí của tất cả tài khoản của khách
        let rows = await rowsOf(acct, since, until);
        // tài khoản này có khách khác dùng chung không?
        const shared = snap.docs.some(o => o.id !== c.id && String(o.data().adAccountId || "").split(/[^0-9]+/).includes(acct));
        const nk = norm(d.name), hit = nk && rows.some(r => norm(r.campaign_name) === nk);
        // có chiến dịch mang tên khách => chỉ lấy các chiến dịch đó; tài khoản riêng của khách và không chiến dịch nào mang tên khách => lấy cả tài khoản
        const one = split(rows, liveKeys, postKeys, (hit || shared) ? nk : "");
        for (const day of Object.keys(one)) {
          const b = by[day] || (by[day] = { live: 0, post: 0 });
          b.live += one[day].live; b.post += one[day].post;
        }
      }
      // xóa số cũ của các ngày trong khoảng quét mà lần này không còn chiến dịch nào khớp khách (tránh còn sót số tính theo cách cũ)
      const have = await db.collection("fbspend").where("customerId", "==", c.id).get();
      for (const e of have.docs) { const dt = e.data().date; if (dt >= since && dt <= until && !by[dt]) await e.ref.delete(); }
      for (const day of Object.keys(by)) {
        await db.collection("fbspend").doc(`${c.id}_${day}`).set(
          { customerId: c.id, date: day, live: by[day].live, post: by[day].post, updatedAt: Date.now() }, { merge: true });
      }
      // Cập nhật bảng chi tiêu của khách: hôm nay (và hôm qua nếu chưa chốt) mỗi lần chạy; từ 10h sáng giờ VN chốt hôm qua một lần rồi khóa.
      // Chỉ đụng vào dòng do Facebook tạo (fromFb). Dòng bạn tự nhập hoặc đã chốt thì không đè.
      for (const day of [yesterday, until]) {
        const v = by[day] || { live: 0, post: 0 };
        const ex = await db.collection("spend").where("customerId", "==", c.id).where("date", "==", day).limit(1).get();
        if (ex.empty) {
          if (v.live + v.post <= 0) continue;
          const hid = await db.collection("hidden").where("customerId", "==", c.id).where("date", "==", day).limit(1).get();
          if (!hid.empty) continue; // khách đã xóa ngày này khỏi bảng
          await db.collection("spend").doc(`fb_${c.id}_${day}`).set({
            customerId: c.id, date: day, adLive: v.live, adPost: v.post,
            feeRate: d.feeRate != null && d.feeRate !== "" ? Number(d.feeRate) : 10, transfer: 0, paid: false,
            fromFb: true, finalized: day === yesterday && pastTen, createdAt: Date.now()
          });
          console.log(`    -> ghi ${day} vào bảng chi tiêu của ${d.name}`);
        } else {
          const row = ex.docs[0], x = row.data();
          if (!x.fromFb || x.finalized) continue;
          if (x.adLive === v.live && x.adPost === v.post && !(day === yesterday && pastTen)) continue;
          await row.ref.update({ adLive: v.live, adPost: v.post, finalized: day === yesterday && pastTen });
          console.log(`    -> cập nhật ${day}${day === yesterday && pastTen ? " (chốt)" : ""} cho ${d.name}`);
        }
      }
      console.log(`OK  ${d.name}: ${Object.keys(by).length} ngày`);
      ok++;
    } catch (e) { console.error(`LỖI ${d.name}: ${e.message}`); fail++; }
  }
  console.log(`Xong. Thành công ${ok}, lỗi ${fail}.`);
  if (fail && !ok) process.exit(1);
})();
