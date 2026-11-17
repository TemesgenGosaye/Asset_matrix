import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, "..", "android-shell", "index.html");
let html = readFileSync(file, "utf8");

// Insert setNavEnabled(true) after attempt = 0; in the probe .then
html = html.replace(
  /attempt = 0;\n(\s+)setTimeout\(function \(\) \{ window\.location\.replace\(SERVER_URL\); \}, 350\);/,
  "attempt = 0;\n$1setNavEnabled(true);\n$1setTimeout(function () { window.location.replace(SERVER_URL); }, 350);"
);

// Insert setNavEnabled(false) before busy(false); checking = false; scheduleRetry(); in .catch
html = html.replace(
  /(tips\([^)]+\);\n\s+)(busy\(false\); checking = false; scheduleRetry\(\);)/,
  "$1setNavEnabled(false);\n      $2"
);

writeFileSync(file, html, "utf8");
console.log("Patched index.html — setNavEnabled hooks injected.");
