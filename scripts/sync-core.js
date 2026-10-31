// Lõi đồng bộ chi phí Facebook: dùng cho GitHub Actions (scripts/fb-sync.js).
const API = "https://graph.facebook.com/v21.0";

module.exports = async function runSync(db, OPT) {
const TOKEN = OPT.token;
const DAYS = Math.min(1100, Math.max(2, Number(OPT.days) || 40));       // quét lại N ngày gần nhất khi chạy chế độ đủ
const LIVE_WORDS = String(OPT.liveWord || "live, livestream").toLowerCase().split(",").map(x => x.trim()).filter(Boolean); // tên chiến dịch có một trong các chữ này => Live
if (!TOKEN) throw new Error("Thiếu mã Facebook (FB_TOKEN).");

// Thông tin tài khoản quảng cáo: dư nợ, ngưỡng thanh toán, thẻ, ngày thanh toán (chỉ ghi khi Facebook trả về)
const OFFSET1 = ["VND", "JPY", "KRW", "CLP", "ISK", "HUF", "PYG", "TWD", "UGX"];
const money = (v, cur) => (v === undefined || v === null || v === "" || isNaN(Number(v))) ? null : Math.round(Number(v) / (OFFSET1.includes(cur) ? 1 : 100));
async function accountInfo(acct) {
  const g = async path => { const j = await (await fetch(`${API}/${path}${path.includes("?") ? "&" : "?"}access_token=${TOKEN}`, { signal: AbortSignal.timeout(60000) })).json(); if (j.error) throw new Error(j.error.message); return j; };
  const a = await g(`act_${acct}?fields=name,currency,balance,account_status,is_prepay_account`);
  const info = { accountId: acct, name: a.name || "", currency: a.currency || "", balance: money(a.balance, a.currency), status: a.account_status, prepay: !!a.is_prepay_account,
    threshold: null, cardLast4: "", cardText: "", nextBill: "", updatedAt: Date.now() };
  try { const p = await g(`act_${acct}/adspaymentcycle?fields=threshold_amount`); const t = p.data && p.data[0] && p.data[0].threshold_amount; info.threshold = money(t, a.currency); } catch (e) { console.log(`  (${acct}: không đọc được ngưỡng: ${e.message})`); }
  try { const f = await g(`act_${acct}?fields=funding_source_details`); const d = f.funding_source_details; if (d && d.display_string) { info.cardText = d.display_string; const m = d.display_string.match(/(\d{4})\s*$/); if (m) info.cardLast4 = m[1]; } } catch (e) { console.log(`  (${acct}: không đọc được thẻ: ${e.message})`); }
  try { const n = await g(`act_${acct}?fields=next_bill_date`); if (n.next_bill_date) info.nextBill = String(n.next_bill_date).slice(0, 10); } catch (e) { /* chưa có dữ liệu: để trống */ }
  return info;
}

// Giờ Việt Nam (UTC+7), vì máy chạy GitHub dùng giờ UTC
const VN = ms => new Date(ms + 7 * 3600e3);
const ymd = d => d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");

async function insights(acct, since, until) {
  let url = `${API}/act_${acct}/insights?level=campaign&fields=campaign_name,spend&time_increment=1`
    + `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500&access_token=${TOKEN}`;
  const rows = [], seen = new Set();
  while (url && !seen.has(url) && seen.size < 200) {
    seen.add(url);
    const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
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
function rowsOf(acct, since, until) { return cache[acct] || (cache[acct] = insights(acct, since, until)); }

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
    if (amt > 0) (b.camps || (b.camps = [])).push({ n: name, s: amt, k: kind });
  }
  return by;
}

async function main() {
  const nowVN = VN(Date.now()), now = nowVN;
  // Để không vượt hạn mức miễn phí của Firebase: lần chạy thường chỉ quét hôm qua và hôm nay.
  // Quét đủ cả khoảng ngày (và dọn số cũ) chỉ khi: chạy tay có tick "full", hoặc lần chạy đầu tiên sau 10:00 sáng giờ Việt Nam.
  const since7 = ymd(VN(Date.now() - 6 * 864e5)); // tên chiến dịch chỉ lưu cho 7 ngày gần nhất
  const FULL = OPT.full === true || (nowVN.getUTCHours() === 10 && nowVN.getUTCMinutes() < 10);
  const from = VN(Date.now() - ((FULL ? DAYS : 2) - 1) * 864e5);
  console.log(FULL ? "Chế độ quét đủ" : "Chế độ nhanh (hôm qua và hôm nay)");
  const since = ymd(from), until = ymd(now), yesterday = ymd(VN(Date.now() - 864e5));
  const pastTen = nowVN.getUTCHours() >= 10; // từ 10h sáng giờ Việt Nam: chốt chi phí hôm qua // từ 10h sáng giờ Việt Nam: chốt chi phí hôm qua vào bảng chi tiêu
  const snap = await db.collection("customers").get();
  let ok = 0, fail = 0;
  const one = async c => {
    const d = c.data(), accts = String(d.adAccountId || "").split(/[^0-9]+/).filter(x => x.length >= 5); // nhiều ID: cách nhau bằng dấu phẩy, cách hoặc xuống dòng
    if (!accts.length) return;
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
          if (one[day].camps) b.camps = (b.camps || []).concat(one[day].camps);
        }
      }
      // xóa số cũ của các ngày trong khoảng quét mà lần này không còn chiến dịch nào khớp khách (tránh còn sót số tính theo cách cũ)
      if (FULL) {
        const have = await db.collection("fbspend").where("customerId", "==", c.id).get();
        for (const e of have.docs) { const dt = e.data().date; if (dt >= since && dt <= until && !by[dt]) await e.ref.delete(); }
      }
      for (const day of Object.keys(by)) {
        await db.collection("fbspend").doc(`${c.id}_${day}`).set(
          Object.assign({ customerId: c.id, date: day, live: by[day].live, post: by[day].post, updatedAt: Date.now() },
            day >= since7 ? { camps: (by[day].camps || []).slice(0, 40) } : {}), { merge: true });
      }
      // Bảng chi tiêu của khách chỉ được tự điền MỘT lần mỗi ngày: lần chạy đầu tiên từ 10h sáng giờ VN ghi chi phí của hôm qua rồi khóa (finalized), sau đó không sửa lại nữa.
      // Trước 10h không đụng vào bảng chi tiêu. Chỉ đụng vào dòng do Facebook tạo (fromFb) hoặc dòng trống; dòng bạn tự nhập hoặc đã chốt thì không đè.
      for (const day of pastTen ? [yesterday] : []) {
        const v = by[day] || { live: 0, post: 0 };
        const ex = await db.collection("spend").where("customerId", "==", c.id).where("date", "==", day).limit(1).get();
        if (ex.empty) {
          if (v.live + v.post <= 0) continue;
          const hid = await db.collection("hidden").where("customerId", "==", c.id).where("date", "==", day).limit(1).get();
          if (!hid.empty) continue; // khách đã xóa ngày này khỏi bảng
          await db.collection("spend").doc(`fb_${c.id}_${day}`).set({
            customerId: c.id, date: day, adLive: v.live, adPost: v.post,
            feeRate: d.feeRate != null && d.feeRate !== "" ? Number(d.feeRate) : 10, transfer: 0, paid: false,
            fromFb: true, finalized: true, createdAt: Date.now()
          });
          console.log(`    -> ghi ${day} vào bảng chi tiêu của ${d.name}`);
        } else {
          const row = ex.docs[0], x = row.data();
          // dòng trống do bạn tạo sẵn (chưa nhập tiền) thì nhận làm dòng của Facebook luôn
          const blank = !x.fromFb && !(Number(x.adLive) > 0) && !(Number(x.adPost) > 0);
          if ((!x.fromFb && !blank) || x.finalized) continue;
          if (blank && v.live + v.post <= 0) continue;
          await row.ref.update({ adLive: v.live, adPost: v.post, fromFb: true, finalized: true });
          console.log(`    -> chốt ${day} cho ${d.name}`);
        }
      }
      console.log(`OK  ${d.name}: ${Object.keys(by).length} ngày`);
      ok++;
    } catch (e) { console.error(`LỖI ${d.name}: ${e.message}`); fail++; }
  };
  const queue = snap.docs.slice();
  await Promise.all(Array.from({ length: 5 }, async () => { while (queue.length) await one(queue.shift()); }));
  const accs = {};
  for (const c of snap.docs) for (const a of String(c.data().adAccountId || "").split(/[^0-9]+/).filter(x => x.length >= 5)) (accs[a] = accs[a] || []).push(c.data().name || "");
  for (const a of Object.keys(accs)) {
    try { const info = await accountInfo(a); info.customers = accs[a]; await db.collection("fbaccounts").doc(a).set(info, { merge: true });
      console.log(`TK ${a}: dư nợ ${info.balance}, ngưỡng ${info.threshold === null ? "không đọc được" : info.threshold}, thẻ ${info.cardLast4 || "?"}, hạn ${info.nextBill || "chưa xác định"}`);
    } catch (e) { console.error(`LỖI tài khoản ${a}: ${e.message}`); }
  }
  // Cập nhật luôn link chia sẻ của khách (trang khách xem), để link luôn mới dù bạn không mở web
  let ns = 0, nchk = 0, nerr = "";
  try {
    for (const c of snap.docs) {
      const d = c.data(); if (!d.shareToken) continue; // khách không bật link thì bỏ qua hoàn toàn
      if (!String(d.adAccountId || "").replace(/\D/g, "")) continue; // khách không nối Facebook: số chỉ đổi khi bạn sửa tay (web tự cập nhật link lúc đó)
      const rate = d.feeRate != null && d.feeRate !== "" ? Number(d.feeRate) : 10;
      const sp = await db.collection("spend").where("customerId", "==", c.id).get();
      const rows = sp.docs.map(x => x.data()).filter(r => r.date)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || ((a.createdAt || 0) - (b.createdAt || 0)))
        .map(r => ({ date: r.date, adLive: Number(r.adLive) || 0, adPost: Number(r.adPost) || 0,
          feeRate: r.feeRate != null && r.feeRate !== "" ? Number(r.feeRate) : rate, transfer: Number(r.transfer) || 0, paid: !!r.paid }));
      nchk++;
      const out = { name: d.name, rows };
      if (d.shareCamps !== false) {
        const days = Array.from({ length: 7 }, (_, i) => ymd(VN(Date.now() - i * 864e5)));
        const got = [];
        for (const day of days) { const fb = await db.collection("fbspend").where("customerId", "==", c.id).where("date", "==", day).limit(1).get(); fb.docs.forEach(x => got.push(x)); }
        const camps = got.map(x => x.data()).filter(r => r.camps && r.camps.length).sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .map(r => ({ date: r.date, items: r.camps.map(x => ({ n: x.n, s: x.s, k: x.k })) }));
        if (camps.length) out.camps = camps;
      }
      const ref = db.collection("shares").doc(d.shareToken), cur = await ref.get();
      if (cur.exists) { const o = cur.data(); delete o.updatedAt; if (JSON.stringify(o) === JSON.stringify(out)) continue; }
      await ref.set(Object.assign({}, out, { updatedAt: Date.now() })); ns++;
    }
    console.log(`Link chia sẻ: cập nhật ${ns} link.`);
  } catch (e) { if (e.message !== "__skip") { nerr = e.message; console.error("LỖI cập nhật link chia sẻ: " + e.message); } }
  // ghi dấu mốc để web hiện "máy chủ đã kiểm tra lúc nào" (1 lần ghi mỗi lượt chạy)
  try { await db.collection("fbaccounts").doc("__sync").set({ at: Date.now(), ok, fail, linksChecked: nchk, linksUpdated: ns, linkError: nerr }); } catch (e) { console.error("Không ghi được mốc đồng bộ: " + e.message); }
  console.log(`Xong. Thành công ${ok}, lỗi ${fail}.`);
  if (fail && !ok) throw new Error("Tất cả khách đều lỗi");
  return { ok, fail };
}

return main();
};
