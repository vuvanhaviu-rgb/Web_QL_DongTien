// Gom các file của web vào thư mục dist/ để đưa lên GitHub Pages.
const fs = require("fs");
const path = require("path");
const files = ["index.html", "firebase-config.js", "firebase-shim.js", "favicon.ico", "favicon-32.png", "favicon-192.png", "apple-touch-icon.png"];
const out = path.join(__dirname, "..", "dist");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of files) {
  const src = path.join(__dirname, "..", f);
  if (!fs.existsSync(src)) throw new Error("Thiếu file: " + f);
  fs.copyFileSync(src, path.join(out, f));
}
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log("Đã build vào dist/:", files.join(", "));
