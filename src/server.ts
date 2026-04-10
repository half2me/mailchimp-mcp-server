import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
import { registerCustomerJourneyTools } from "./tools/customer-journeys.js";
import { registerVerifiedDomainTools } from "./tools/verified-domains.js";
import { registerCampaignFeedbackTools } from "./tools/campaign-feedback.js";
import { registerActivityFeedTools } from "./tools/activity-feed.js";

/** Create a fully-configured McpServer with all tools registered. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "mailchimp-mcp-server",
    version: "1.0.0",
  });

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
  registerCustomerJourneyTools(server);
  registerVerifiedDomainTools(server);
  registerCampaignFeedbackTools(server);
  registerActivityFeedTools(server);

  return server;
}
