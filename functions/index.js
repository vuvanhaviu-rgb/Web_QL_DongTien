// Nút "Kéo từ Facebook" trên web gọi hàm này. Hàm giữ mã GitHub bí mật (không nằm trong web) và bấm chạy workflow fb-sync giúp bạn.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
admin.initializeApp();

const GH_TOKEN = defineSecret("GH_TOKEN");
const REPO = "vuvanhaviu-rgb/Web_QL_DongTien";

exports.kichHoatDongBo = onCall({ region: "asia-southeast1", secrets: [GH_TOKEN], maxInstances: 2 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Cần đăng nhập web trước.");
  // chống bấm liên tục: tối thiểu 60 giây giữa hai lần
  const ref = admin.firestore().doc("system/syncTrigger");
  const snap = await ref.get();
  const last = snap.exists ? Number(snap.data().at) || 0 : 0;
  if (Date.now() - last < 60000) throw new HttpsError("resource-exhausted", "Vừa kéo xong, đợi 1 phút rồi bấm lại.");
  await ref.set({ at: Date.now(), by: (req.auth.token && req.auth.token.email) || "" });
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/fb-sync.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: "Bearer " + GH_TOKEN.value(), Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "vh-agency" },
    body: JSON.stringify({ ref: "main" }),
  });
  if (r.status !== 204) throw new HttpsError("internal", "GitHub trả mã " + r.status);
  return { ok: true };
});
