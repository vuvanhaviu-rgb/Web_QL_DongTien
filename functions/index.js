// Nút "Làm mới" trên web gọi hàm này: kéo chi phí mới nhất từ Facebook ngay và ghi vào Firebase.
// Mã Facebook (FB_TOKEN) được Firebase giữ bí mật, không nằm trong web.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const runSync = require("./sync.js");
admin.initializeApp();

const FB_TOKEN = defineSecret("FB_TOKEN");

exports.kichHoatDongBo = onCall({ region: "asia-southeast1", secrets: [FB_TOKEN], maxInstances: 2, timeoutSeconds: 300, memory: "512MiB" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Cần đăng nhập web trước.");
  const db = admin.firestore();
  // chống bấm liên tục: tối thiểu 30 giây giữa hai lần
  const ref = db.doc("system/syncTrigger");
  const snap = await ref.get();
  const last = snap.exists ? Number(snap.data().at) || 0 : 0;
  if (Date.now() - last < 30000) throw new HttpsError("resource-exhausted", "Vừa kéo xong, đợi 30 giây rồi bấm lại.");
  await ref.set({ at: Date.now(), by: (req.auth.token && req.auth.token.email) || "" });
  try {
    const r = await runSync(db, { token: FB_TOKEN.value(), full: false, days: 2 });
    return { ok: true, customers: r.ok, errors: r.fail };
  } catch (e) {
    console.error(e);
    throw new HttpsError("internal", String(e.message || e).slice(0, 200));
  }
});
