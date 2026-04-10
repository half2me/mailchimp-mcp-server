/**
 * Cloudflare Worker entry point for the Mailchimp MCP server.
 *
 * Stateless OAuth: all state is encoded in signed tokens.
 * Cowork authenticates via OAuth → Mailchimp, then uses Bearer tokens on MCP requests.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./server.js";
import { apiKeyStore } from "./services/mailchimp-client.js";

interface Env {
  MAILCHIMP_CLIENT_ID: string;
  MAILCHIMP_CLIENT_SECRET: string;
}

const MAILCHIMP_AUTHORIZE_URL = "https://login.mailchimp.com/oauth2/authorize";
const MAILCHIMP_TOKEN_URL = "https://login.mailchimp.com/oauth2/token";
const MAILCHIMP_METADATA_URL = "https://login.mailchimp.com/oauth2/metadata";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    switch (url.pathname) {
      case "/.well-known/oauth-authorization-server":
        return handleMetadata(origin);
      case "/register":
        return handleRegister(request);
      case "/authorize":
        return handleAuthorize(request, env, origin);
      case "/callback":
        return handleCallback(request, env);
      case "/token":
        return handleToken(request, env);
      case "/mcp":
        return handleMcp(request, env);
      default:
        return new Response("Not found", { status: 404 });
    }
  },
};

// ── OAuth Metadata ──────────────────────────────────────────────────

function handleMetadata(origin: string): Response {
  return Response.json({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  }, { headers: corsHeaders() });
}

// ── Dynamic Client Registration ─────────────────────────────────────

async function handleRegister(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await request.json() as Record<string, unknown>;
  const clientId = crypto.randomUUID();

  return Response.json({
    client_id: clientId,
    client_name: body.client_name ?? "MCP Client",
    redirect_uris: body.redirect_uris ?? [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }, { status: 201, headers: corsHeaders() });
}

// ── Authorize: redirect to Mailchimp ────────────────────────────────

function handleAuthorize(request: Request, env: Env, origin: string): Response {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("redirect_uri");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const state = url.searchParams.get("state");

  if (!redirectUri || !codeChallenge || !state) {
    return Response.json({ error: "invalid_request", error_description: "Missing required parameters" }, { status: 400 });
  }

  // Pack Cowork's params into the state we pass to Mailchimp
  const mcState = btoa(JSON.stringify({
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod ?? "S256",
    state,
  }));

  const mailchimpUrl = new URL(MAILCHIMP_AUTHORIZE_URL);
  mailchimpUrl.searchParams.set("response_type", "code");
  mailchimpUrl.searchParams.set("client_id", env.MAILCHIMP_CLIENT_ID);
  mailchimpUrl.searchParams.set("redirect_uri", `${origin}/callback`);
  mailchimpUrl.searchParams.set("state", mcState);

  return Response.redirect(mailchimpUrl.toString(), 302);
}

// ── Callback: exchange Mailchimp code, redirect to Cowork ───────────

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const mcState = url.searchParams.get("state");

  if (!code || !mcState) {
    return new Response("Missing code or state", { status: 400 });
  }

  // Decode the state to recover Cowork's original params
  let params: { redirect_uri: string; code_challenge: string; code_challenge_method: string; state: string };
  try {
    params = JSON.parse(atob(mcState));
  } catch {
    return new Response("Invalid state", { status: 400 });
  }

  // Exchange Mailchimp code for access token
  const tokenRes = await fetch(MAILCHIMP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.MAILCHIMP_CLIENT_ID,
      client_secret: env.MAILCHIMP_CLIENT_SECRET,
      redirect_uri: `${url.origin}/callback`,
      code,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(`Mailchimp token exchange failed: ${err}`, { status: 502 });
  }

  const tokenData = await tokenRes.json() as { access_token: string };

  // Get the user's datacenter via Mailchimp metadata
  const metaRes = await fetch(MAILCHIMP_METADATA_URL, {
    headers: { Authorization: `OAuth ${tokenData.access_token}` },
  });

  if (!metaRes.ok) {
    return new Response("Failed to fetch Mailchimp metadata", { status: 502 });
  }

  const meta = await metaRes.json() as { dc: string; api_endpoint: string };

  // Create a signed auth code containing the Mailchimp credentials
  const authCode = await signPayload({
    mailchimp_token: tokenData.access_token,
    dc: meta.dc,
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method,
    exp: Date.now() + 5 * 60 * 1000, // 5 min expiry
  }, env.MAILCHIMP_CLIENT_SECRET);

  // Redirect back to Cowork with our auth code
  const callbackUrl = new URL(params.redirect_uri);
  callbackUrl.searchParams.set("code", authCode);
  callbackUrl.searchParams.set("state", params.state);

  return Response.redirect(callbackUrl.toString(), 302);
}

// ── Token: exchange our auth code for an access token ───────────────

async function handleToken(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
  }

  const body = new URLSearchParams(await request.text());
  const grantType = body.get("grant_type");
  const code = body.get("code");
  const codeVerifier = body.get("code_verifier");

  if (grantType !== "authorization_code" || !code || !codeVerifier) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: corsHeaders() });
  }

  // Verify and decode the signed auth code
  const payload = await verifyPayload(code, env.MAILCHIMP_CLIENT_SECRET);
  if (!payload) {
    return Response.json({ error: "invalid_grant", error_description: "Invalid auth code" }, { status: 400, headers: corsHeaders() });
  }

  // Check expiry
  if (Date.now() > payload.exp) {
    return Response.json({ error: "invalid_grant", error_description: "Auth code expired" }, { status: 400, headers: corsHeaders() });
  }

  // Verify PKCE
  const challengeFromVerifier = await sha256base64url(codeVerifier);
  if (challengeFromVerifier !== payload.code_challenge) {
    return Response.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400, headers: corsHeaders() });
  }

  // Create a signed access token containing the Mailchimp credentials
  const accessToken = await signPayload({
    mailchimp_token: payload.mailchimp_token,
    dc: payload.dc,
  }, env.MAILCHIMP_CLIENT_SECRET);

  return Response.json({
    access_token: accessToken,
    token_type: "bearer",
  }, { headers: corsHeaders() });
}

// ── MCP Handler ─────────────────────────────────────────────────────

async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
  }

  // Extract Bearer token
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
      { status: 401, headers: corsHeaders() },
    );
  }

  const token = auth.slice(7);
  const payload = await verifyPayload(token, env.MAILCHIMP_CLIENT_SECRET);
  if (!payload?.mailchimp_token || !payload?.dc) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Invalid token" }, id: null },
      { status: 401, headers: corsHeaders() },
    );
  }

  // Prefix with "oauth:" so mailchimpRequest uses Bearer auth instead of Basic.
  const apiKey = `oauth:${payload.mailchimp_token}-${payload.dc}`;

  return apiKeyStore.run(apiKey, async () => {
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request);

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders())) {
      headers.set(k, v);
    }

    return new Response(response.body, { status: response.status, headers });
  });
}

// ── Crypto helpers ──────────────────────────────────────────────────

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload: Record<string, unknown>, secret: string): Promise<string> {
  const data = JSON.stringify(payload);
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${btoa(data)}.${sigB64}`;
}

async function verifyPayload(token: string, secret: string): Promise<Record<string, any> | null> {
  const [dataB64, sigB64] = token.split(".");
  if (!dataB64 || !sigB64) return null;

  try {
    const data = atob(dataB64);
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    const key = await getKey(secret);
    const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(data));
    return valid ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

async function sha256base64url(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  };
}
