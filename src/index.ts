#!/usr/bin/env node
/**
 * Mailchimp MCP Server
 *
 * An MCP server providing tools to interact with the Mailchimp Marketing API v3.
 * Supports audience management, subscriber operations, campaigns, templates, and reporting.
 *
 * Authentication: Set the MAILCHIMP_API_KEY environment variable.
 * Transport: stdio (for local integrations like Claude Cowork / Claude Code).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerAccountTools } from "./tools/account.js";
import { registerAudienceTools } from "./tools/audiences.js";
import { registerSubscriberTools } from "./tools/subscribers.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerReportTools } from "./tools/reports.js";
import { registerAutomationTools } from "./tools/automations.js";
import { registerSegmentTools } from "./tools/segments.js";
import { registerEcommerceTools } from "./tools/ecommerce.js";
import { registerLandingPageTools } from "./tools/landing-pages.js";
import { registerWebhookTools } from "./tools/webhooks.js";
import { registerFileManagerTools } from "./tools/file-manager.js";
import { registerBatchTools } from "./tools/batch.js";

// Create MCP server
const server = new McpServer({
  name: "mailchimp-mcp-server",
  version: "1.0.0",
});

// Register all tool groups
registerAccountTools(server);
registerAudienceTools(server);
registerSubscriberTools(server);
registerCampaignTools(server);
registerTemplateTools(server);
registerReportTools(server);
registerAutomationTools(server);
registerSegmentTools(server);
registerEcommerceTools(server);
registerLandingPageTools(server);
registerWebhookTools(server);
registerFileManagerTools(server);
registerBatchTools(server);

// Start server with stdio transport
async function main() {
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mailchimp MCP server running via stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
