/**
 * Mailchimp MCP Server — CLI entry point
 *
 * Transports:
 *   - stdio (default): for Claude Desktop / Code. Requires MAILCHIMP_API_KEY env var.
 *   - HTTP  (--http) : for Claude Cowork / remote. API key via X-Mailchimp-API-Key header.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  if (process.argv.includes("--http")) {
    const { startHttpServer } = await import("./http.js");
    const port = parseInt(process.env.PORT ?? "3000", 10);
    startHttpServer(port);
  } else {
    if (!process.env.MAILCHIMP_API_KEY) {
      console.error(
        "ERROR: MAILCHIMP_API_KEY environment variable is required.\n" +
          "To get your API key:\n" +
          "  1. Log in to Mailchimp → Account & billing → Extras → API keys\n" +
          "  2. Click 'Create A Key' and copy the full key (including the -usXX suffix)\n" +
          "  3. Set it: export MAILCHIMP_API_KEY='your-key-here'\n"
      );
      process.exit(1);
    }

    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Mailchimp MCP server running via stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
