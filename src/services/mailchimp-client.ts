import { AsyncLocalStorage } from "node:async_hooks";
import { REQUEST_TIMEOUT } from "../constants.js";

/**
 * AsyncLocalStorage lets tool handlers inherit the API key from the
 * HTTP request that triggered them — no changes needed in tool files.
 */
export const apiKeyStore = new AsyncLocalStorage<string>();

/**
 * Extract the data center from a Mailchimp API key.
 * API keys have the format: `<hash>-<dc>` (e.g., `abc123def456-us21`).
 */
function getDataCenter(apiKey: string): string {
  const parts = apiKey.split("-");
  const dc = parts[parts.length - 1];
  if (!dc || !/^[a-z]+\d+$/.test(dc)) {
    throw new Error(
      `Invalid Mailchimp API key format. Expected format: <key>-<dc> (e.g., abc123-us21). ` +
      `Got suffix: "${dc}".`
    );
  }
  return dc;
}

/**
 * Resolve the API key: AsyncLocalStorage (HTTP mode) → env var (stdio mode).
 */
function getApiKey(): string {
  const key = apiKeyStore.getStore() ?? process.env.MAILCHIMP_API_KEY;
  if (!key) {
    throw new Error(
      "MAILCHIMP_API_KEY is not set. " +
      "Generate one at: https://us1.admin.mailchimp.com/account/api/"
    );
  }
  return key;
}

/**
 * Make an authenticated request to the Mailchimp Marketing API.
 * Uses native fetch — works in Node.js, Cloudflare Workers, Deno, etc.
 */
export async function mailchimpRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  data?: unknown,
  params?: Record<string, unknown>
): Promise<T> {
  const apiKey = getApiKey();
  const dc = getDataCenter(apiKey);

  const url = new URL(`https://${dc}.api.mailchimp.com/3.0${endpoint}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Basic ${btoa("anystring:" + apiKey)}`,
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      const err = new MailchimpApiError(
        response.status,
        (body.title as string) ?? "API Error",
        (body.detail as string) ?? "",
      );
      throw err;
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

class MailchimpApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail: string,
  ) {
    super(`${status}: ${title}. ${detail}`);
    this.name = "MailchimpApiError";
  }
}

/**
 * Format an API error into a helpful, actionable message.
 */
export function handleApiError(error: unknown): string {
  if (error instanceof MailchimpApiError) {
    const { status, title, detail } = error;
    switch (status) {
      case 400:
        return `Error (400 Bad Request): ${title}. ${detail}. Check your parameters and try again.`;
      case 401:
        return `Error (401 Unauthorized): ${title}. ${detail}. Your API key may be invalid or expired. Regenerate it at https://us1.admin.mailchimp.com/account/api/`;
      case 403:
        return `Error (403 Forbidden): ${title}. ${detail}. You don't have permission for this action.`;
      case 404:
        return `Error (404 Not Found): ${title}. ${detail}. Check that the resource ID is correct.`;
      case 405:
        return `Error (405 Method Not Allowed): ${title}. ${detail}.`;
      case 429:
        return `Error (429 Rate Limited): Too many requests. Wait a moment and try again.`;
      default:
        return `Error (${status}): ${title}. ${detail}`;
    }
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return "Error: Request timed out. The Mailchimp API may be slow — try again.";
  }

  if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("network"))) {
    return "Error: Could not connect to Mailchimp API. Check your network and that your API key data center suffix is correct.";
  }

  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
