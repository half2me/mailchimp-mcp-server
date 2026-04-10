/**
 * Cloudflare Worker entry point for the Mailchimp MCP server.
 *
 * Stateless: each request creates a fresh McpServer instance.
 * Auth: X-Mailchimp-API-Key header required on every request.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./server.js";
import { apiKeyStore } from "./services/mailchimp-client.js";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Only serve /mcp
    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }

    // Require API key
    const apiKey = request.headers.get("x-mailchimp-api-key");
    if (!apiKey) {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Missing X-Mailchimp-API-Key header" },
          id: null,
        },
        { status: 401, headers: corsHeaders() },
      );
    }

    // Only POST for stateless mode
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    // Run the request inside the API key context
    return apiKeyStore.run(apiKey, async () => {
      const server = createServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });

      await server.connect(transport);
      const response = await transport.handleRequest(request);

      // Append CORS headers
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(corsHeaders())) {
        headers.set(k, v);
      }

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    });
  },
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, X-Mailchimp-API-Key",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  };
}
