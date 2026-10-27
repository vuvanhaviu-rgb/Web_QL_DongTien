/* Kết nối trang với cơ sở dữ liệu Firebase của riêng bạn, có màn hình đăng nhập. */
(function () {
  var V = "10.12.5", B = "https://www.gstatic.com/firebasejs/" + V + "/";
  var cfg = window.FIREBASE_CONFIG || {};
  var configured = cfg.apiKey && cfg.projectId && cfg.apiKey.indexOf("DAN-") !== 0 && cfg.projectId.indexOf("DAN-") !== 0;
  function load(src) {
    return new Promise(function (ok, bad) {
      var s = document.createElement("script"); s.src = src; s.onload = ok;
      s.onerror = function () { bad(new Error("Không tải được " + src)); };
      document.head.appendChild(s);
    });
  }
  function loginScreen(auth) {
    return new Promise(function (resolve) {
      var o = document.createElement("div");
      o.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:var(--bg,#f6f7f9);font-family:inherit;padding:16px";
      o.innerHTML = '<form style="width:100%;max-width:340px;background:var(--surface,#fff);color:var(--text,#111);border:1px solid var(--line,#ddd);border-radius:14px;padding:24px;display:grid;gap:12px">'
        + '<h1 style="margin:0;font-size:20px;text-align:center">Quản lý dòng tiền</h1>'
        + '<p style="margin:0;text-align:center;font-size:13px;opacity:.7">Đăng nhập để tiếp tục</p>'
        + '<input name="e" type="email" placeholder="Email" autocomplete="username" required style="padding:11px;border-radius:8px;border:1px solid #bbb;font:inherit">'
        + '<input name="p" type="password" placeholder="Mật khẩu" autocomplete="current-password" required style="padding:11px;border-radius:8px;border:1px solid #bbb;font:inherit">'
        + '<div class="err" style="color:#c0392b;font-size:13px;min-height:16px"></div>'
        + '<button type="submit" style="padding:11px;border:0;border-radius:8px;background:#2563eb;color:#fff;font:inherit;font-weight:600;cursor:pointer">Đăng nhập</button></form>';
      document.body.appendChild(o);
      var f = o.querySelector("form"), err = o.querySelector(".err");
      f.addEventListener("submit", function (ev) {
        ev.preventDefault(); err.textContent = "";
        auth.signInWithEmailAndPassword(f.e.value.trim(), f.p.value).then(function () { o.remove(); resolve(); })
          .catch(function () { err.textContent = "Sai email hoặc mật khẩu."; });
      });
    });
  }
  window.claude = {
    use: async function (name) {
      if (name !== "db" || !configured) return null; // chưa cấu hình: chạy thử ở chế độ tạm
      await load(B + "firebase-app-compat.js");
      await load(B + "firebase-auth-compat.js");
      await load(B + "firebase-firestore-compat.js");
      firebase.initializeApp(cfg);
      var auth = firebase.auth();
      var user = await new Promise(function (r) { var u = auth.onAuthStateChanged(function (x) { u(); r(x); }); });
      if (!user) await loginScreen(auth);
      return firebase.firestore();
    }
  };
})();
