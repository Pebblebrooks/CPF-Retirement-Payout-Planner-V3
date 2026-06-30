// =============================================================================
// src/index.js — Cloudflare Worker edge auth gate for Fusion CPF Planner
// =============================================================================
// PURPOSE
//   Runs on Cloudflare's edge BEFORE any static asset (the App_NN.jsx bundle,
//   index.html, etc.) is served. If the visitor doesn't have a valid, signed,
//   HttpOnly session cookie, they see ONLY this gate's login screen — the real
//   app is never transmitted to their browser. This replaces relying on the
//   in-app LockScreen + localStorage, which can be bypassed by clearing the
//   browser cache, because the check now happens server-side and the session
//   token is stored in a cookie JavaScript cannot read or clear.
//
// REQUIRES (Worker → Settings → Variables and secrets, all type "Secret"):
//   FUSION_GATE_SECRET          long random string, HMAC signing key
//   FUSION_GATE_ADMIN_PASSWORD  admin passphrase (never expires)
//   FUSION_GATE_BETA_PASSWORD   beta tester passphrase (7-day session)
//   NOTE: these will be UNAVAILABLE to add until this script is deployed and
//   wrangler.jsonc has a "main" field — Cloudflare hides Secrets entirely on
//   Workers that are still in "static assets only" mode.
//
// REQUIRES (wrangler.jsonc):
//   "main": "src/index.js"      — points Wrangler at this file
//   An "assets" block with a binding name — this file assumes the default
//   name "ASSETS". If your wrangler.jsonc uses a different binding name,
//   change every `env.ASSETS` reference below to match it.
//
// NOTE: the passwords here are intentionally DIFFERENT from the in-app
// ACCESS_GATE_PASSPHRASES already in App_NN.jsx. Those remain visible in
// DevTools by design (soft secondary layer); these never leave the server.
// =============================================================================

const COOKIE_NAME   = 'cpf_gate_v1';
const BETA_MAX_AGE  = 5 * 24 * 60 * 60;     // 5 days — matches existing beta window
const ADMIN_MAX_AGE = 365 * 24 * 60 * 60;   // 1 year

// ---------------------------------------------------------------------------
// Crypto helpers — HMAC-SHA256 token signing via Web Crypto (native to Workers)
// ---------------------------------------------------------------------------

function b64urlEncode(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return b64urlEncode(new Uint8Array(sig));
}

async function mintToken(secret, role) {
  const ts  = Math.floor(Date.now() / 1000).toString();
  const sig = await hmacSign(secret, `${role}:${ts}`);
  return `${role}:${ts}:${sig}`;
}

async function verifyToken(secret, token) {
  const parts = (token || '').split(':');
  if (parts.length !== 3) return null;
  const [role, ts, sig] = parts;
  if (role !== 'admin' && role !== 'beta') return null;

  const expectedSig = await hmacSign(secret, `${role}:${ts}`);
  if (sig.length !== expectedSig.length) return null;

  // Constant-time comparison to avoid timing side-channels
  const a = new TextEncoder().encode(sig);
  const b = new TextEncoder().encode(expectedSig);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return null;

  const age    = (Date.now() / 1000) - parseInt(ts, 10);
  const maxAge = role === 'admin' ? ADMIN_MAX_AGE : BETA_MAX_AGE;
  if (age > maxAge) return { expired: true, role };
  return { valid: true, role };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function setCookieHeader(token, maxAge) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Path=/`;
}

function clearCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`;
}

// ---------------------------------------------------------------------------
// Login screen — served in place of the app whenever there's no valid session
// ---------------------------------------------------------------------------

function loginHtml({ error = '', expired = false } = {}) {
  const msg = expired
    ? 'Your access window has ended. Enter your access code to continue.'
    : 'This app is in private beta. Enter your access code to continue.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fusion 富生 — Access</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:linear-gradient(135deg,#0d1424 0%,#131c33 100%);
       font-family:system-ui,-apple-system,sans-serif;padding:16px}
  .card{background:#161f38;border:1px solid #28324f;border-radius:12px;
        padding:32px 28px;max-width:360px;width:100%;text-align:center;
        box-shadow:0 8px 32px rgba(0,0,0,.4)}
  .row{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:14px}
  .ico{background:#10b981;padding:8px;border-radius:12px;display:flex}
  .t1{font-weight:900;font-size:16px;background:linear-gradient(90deg,#10b981,#3b82f6);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .t2{font-size:11px;color:#10b981;font-weight:800;letter-spacing:.15em;text-transform:uppercase}
  p{font-size:13px;color:#9aa4b8;margin:0 0 20px;line-height:1.5}
  input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid ${error ? '#e05252' : '#3a4566'};
        background:#0d1424;color:#e6e9ef;font-size:14px;margin-bottom:${error ? '8px' : '12px'};outline:none}
  input:focus{border-color:#4f8cff}
  .err{color:#e05252;font-size:12px;margin-bottom:10px;text-align:left}
  button{width:100%;padding:10px 12px;border-radius:8px;border:none;background:#4f8cff;
         color:#fff;font-size:14px;font-weight:600;cursor:pointer}
  button:hover{background:#3d6fd6}
  footer{font-size:11px;color:#5b6886;margin:20px 0 0}
</style>
</head>
<body>
  <div class="card">
    <div class="row">
      <div class="ico">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      </div>
      <div style="text-align:left">
        <div class="t1">Fusion 富生</div>
        <div class="t2">Retirement Engine</div>
      </div>
    </div>
    <div style="font-size:22px;margin-bottom:8px">🔒</div>
    <p>${msg}</p>
    <form method="POST" action="/__gate/login">
      <input type="password" name="pwd" placeholder="Access code" autofocus autocomplete="current-password">
      ${error ? `<div class="err">${error}</div>` : ''}
      <button type="submit">Unlock</button>
    </form>
    <footer>© 2026 Pebblebrooks. All rights reserved.</footer>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const SECRET   = env.FUSION_GATE_SECRET;
    const PW_ADMIN = env.FUSION_GATE_ADMIN_PASSWORD;
    const PW_BETA  = env.FUSION_GATE_BETA_PASSWORD;

    // --- Handle login form submission ---------------------------------------
    if (url.pathname === '/__gate/login' && request.method === 'POST') {
      const form = await request.formData();
      const pwd  = (form.get('pwd') || '').toString().trim();

      let role = null;
      if (PW_ADMIN && pwd === PW_ADMIN) role = 'admin';
      else if (PW_BETA && pwd === PW_BETA) role = 'beta';

      if (role && SECRET) {
        const token  = await mintToken(SECRET, role);
        const maxAge = role === 'admin' ? ADMIN_MAX_AGE : BETA_MAX_AGE;
        return new Response(null, {
          status: 302,
          headers: {
            'Location': '/',
            'Set-Cookie': setCookieHeader(token, maxAge),
          },
        });
      }

      return new Response(loginHtml({ error: 'Incorrect access code.' }), {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // --- Handle logout --------------------------------------------------------
    if (url.pathname === '/__gate/logout') {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/', 'Set-Cookie': clearCookieHeader() },
      });
    }

    // --- Check existing session cookie -----------------------------------------
    const cookies = parseCookies(request.headers.get('Cookie') || '');
    const token   = cookies[COOKIE_NAME];

    if (token && SECRET) {
      const result = await verifyToken(SECRET, token);

      if (result?.valid) {
        // Authenticated — hand off to the real static assets (the app itself)
        return env.ASSETS.fetch(request);
      }

      if (result?.expired) {
        return new Response(loginHtml({ expired: true }), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Set-Cookie': clearCookieHeader(),
          },
        });
      }
    }

    // --- No / invalid session — show the gate. The app bundle is NEVER sent. --
    return new Response(loginHtml(), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': clearCookieHeader(),
      },
    });
  },
};
