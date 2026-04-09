import axios, { AxiosError, AxiosInstance } from "axios";
import { REQUEST_TIMEOUT } from "../constants.js";

let clientInstance: AxiosInstance | null = null;

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
      `Got suffix: "${dc}". Check your MAILCHIMP_API_KEY environment variable.`
    );
  }
  return dc;
}

/**
 * Get or create the shared Axios client for Mailchimp API requests.
 */
export function getClient(): AxiosInstance {
  if (clientInstance) return clientInstance;

  const apiKey = process.env.MAILCHIMP_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MAILCHIMP_API_KEY environment variable is required. " +
      "Generate one at: https://us1.admin.mailchimp.com/account/api/ " +
      "(replace 'us1' with your data center)."
    );
  }

  const dc = getDataCenter(apiKey);

  clientInstance = axios.create({
    baseURL: `https://${dc}.api.mailchimp.com/3.0`,
    timeout: REQUEST_TIMEOUT,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    auth: {
      username: "anystring",
      password: apiKey,
    },
  });

  return clientInstance;
}

/**
 * Make an authenticated request to the Mailchimp Marketing API.
 */
export async function mailchimpRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  data?: unknown,
  params?: Record<string, unknown>
): Promise<T> {
  const client = getClient();
  const response = await client.request<T>({
    url: endpoint,
    method,
    data,
    params,
  });
  return response.data;
}

/**
 * Format an Axios/Mailchimp API error into a helpful, actionable message.
 */
export function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<{ title?: string; detail?: string; status?: number }>;
    if (axiosErr.response) {
      const { status, data } = axiosErr.response;
      const title = data?.title ?? "API Error";
      const detail = data?.detail ?? "";

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
    } else if (axiosErr.code === "ECONNABORTED") {
      return "Error: Request timed out. The Mailchimp API may be slow — try again.";
    } else if (axiosErr.code === "ENOTFOUND") {
      return "Error: Could not connect to Mailchimp API. Check your network and that your API key data center suffix is correct.";
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
