// Chạy trên GitHub Actions. Bí mật lấy từ biến môi trường, không nằm trong code.
const admin = require("firebase-admin");
const runSync = require("./sync-core.js");

const SA = process.env.FIREBASE_SA;
if (!process.env.FB_TOKEN || !SA) { console.error("Thiếu FB_TOKEN hoặc FIREBASE_SA trong GitHub Secrets."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const DAYS = Number(process.env.SYNC_DAYS) || 40;
// Nếu chạy quá thời gian cho phép thì tự dừng, để lần sau chạy lại thay vì treo mãi
const LIMIT_MIN = DAYS > 60 ? 40 : 12;
setTimeout(() => { console.error(`QUÁ ${LIMIT_MIN} PHÚT: tự dừng`); process.exit(2); }, LIMIT_MIN * 60e3).unref();

runSync(admin.firestore(), { token: process.env.FB_TOKEN, full: process.env.FULL === "true", days: DAYS, liveWord: process.env.LIVE_WORD })
  .then(() => process.exit(0))
  .catch(e => { console.error("LỖI: " + e.message); process.exit(1); });
