/**
 * Fusion 富生 — Cloudflare Worker (server side)
 * ------------------------------------------------------------------------
 * This file runs on Cloudflare, NOT in the browser. It must never contain
 * React / JSX. The React app lives in src/App.jsx and is started by
 * src/main.jsx.
 *
 * What this Worker does (interim, until server-side accounts + Stripe):
 *   1. Serves the built React app (static assets).
 *   2. /logout  — clears the access cookies and returns to the app.
 *   3. /healthz — simple uptime check.
 *   4. Adds basic security headers to every response.
 *
 * Access control: the app's built-in BetaGate screen handles access when no
 * Worker cookie is present (see the "Worker-gate passthrough" comment in
 * App.jsx). Server-verified login and subscription tiers replace this in the
 * accounts + payments step.
 * ------------------------------------------------------------------------
 */

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(response) {
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!res.headers.has(k)) res.headers.set(k, v);
  }
  return res;
}

function clearCookie(name, httpOnly) {
  return `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return withSecurityHeaders(new Response("ok", { headers: { "content-type": "text/plain" } }));
    }

    if (url.pathname === "/logout") {
      const headers = new Headers({ Location: "/" });
      headers.append("Set-Cookie", clearCookie("cpf_gate_v1", true));
      headers.append("Set-Cookie", clearCookie("cpf_tier_v1", false));
      return withSecurityHeaders(new Response(null, { status: 302, headers }));
    }

    // Serve the React app. Requires an assets binding named ASSETS in the
    // Wrangler config ("assets": { "binding": "ASSETS", ... }).
    if (env && env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      // Single-page app fallback: unknown paths load index.html
      if (res.status === 404 && request.method === "GET" && !url.pathname.includes(".")) {
        const indexReq = new Request(new URL("/", url), request);
        return withSecurityHeaders(await env.ASSETS.fetch(indexReq));
      }
      return withSecurityHeaders(res);
    }

    return withSecurityHeaders(new Response(
      "Fusion is deploying — static assets binding (ASSETS) is not configured.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    ));
  },
};
