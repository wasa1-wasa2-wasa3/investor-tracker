import { createHmac, timingSafeEqual } from "node:crypto";

// 「マイ銘柄」ページの合言葉ログイン。サーバー側（APIルート）だけで使う。
//   MY_PASSWORD … 合言葉（必須。未設定ならマイ銘柄ページは使えない）
//   MY_SECRET   … ログイン状態の署名に使う鍵（任意。未設定なら合言葉から作る）
// ログインすると、署名付きの有効期限をHttpOnlyのCookieに入れる。合言葉を変えると全員ログアウトになる。

export const COOKIE = "my_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30日

export const isConfigured = () => !!process.env.MY_PASSWORD;

function key() {
  return `${process.env.MY_SECRET || ""}|${process.env.MY_PASSWORD || ""}`;
}

function sign(value) {
  return createHmac("sha256", key()).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(input) {
  if (!isConfigured() || typeof input !== "string") return false;
  // 長さの違いで時間が変わらないよう、両方をハッシュしてから比べる
  return safeEqual(sign(`pw:${input}`), sign(`pw:${process.env.MY_PASSWORD}`));
}

export function sessionCookie() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  const value = `${exp}.${sign(`session:${exp}`)}`;
  return cookieHeader(value, MAX_AGE);
}

export function clearCookie() {
  return cookieHeader("", 0);
}

function cookieHeader(value, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readCookie(req) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === COOKIE) return part.slice(i + 1);
  }
  return null;
}

export function isLoggedIn(req) {
  if (!isConfigured()) return false;
  const v = readCookie(req);
  if (!v) return false;
  const [exp, sig] = v.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, sign(`session:${exp}`));
}

// 合言葉の総当たり対策（同じサーバーが生きている間だけの簡易版）
const fails = new Map(); // ip → { n, until }
export function tooManyTries(ip) {
  const f = fails.get(ip);
  return !!f && f.until > Date.now();
}
export function recordFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n++;
  if (f.n >= 5) {
    f.until = Date.now() + 15 * 60 * 1000; // 5回まちがえたら15分ロック
    f.n = 0;
  }
  fails.set(ip, f);
}
export function clearFails(ip) {
  fails.delete(ip);
}

// MY_HOLDINGS の書き方：「証券コード:株数:取得単価」をカンマ区切り（株数・取得単価は省略可）
//   例）8233:100:1622.65,9831:100:733.19,4746:100
export function parseHoldings(text = process.env.MY_HOLDINGS || "") {
  const out = [];
  for (const item of text.split(/[,\n]/)) {
    const [code, shares, cost] = item.trim().split(":").map((s) => s?.trim());
    if (!code || !/^[0-9][0-9A-Z]{3}$/.test(code.toUpperCase())) continue;
    const n = (v) => (v != null && v !== "" && isFinite(Number(v)) ? Number(v) : null);
    out.push({ secCode: code.toUpperCase(), shares: n(shares), cost: n(cost) });
  }
  return out;
}
