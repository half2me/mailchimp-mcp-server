import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";

export function registerAccountTools(server: McpServer): void {
  // ── Ping ────────────────────────────────────────────────────────
  server.registerTool(
    "mailchimp_ping",
    {
      title: "Ping Mailchimp API",
      description:
        "Check that the Mailchimp API connection is working. Returns a simple health check. " +
        "Use this to verify your API key is valid before doing anything else.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const data = await mailchimpRequest<any>("/ping");
        return {
          content: [{ type: "text", text: `Mailchimp API is reachable. Response: ${data.health_status}` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Account Info ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_account",
    {
      title: "Get Mailchimp Account Info",
      description:
        "Get information about the authenticated Mailchimp account: name, email, plan, " +
        "industry, contact info, and account-level stats.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const data = await mailchimpRequest<any>("/");
        const lines = [
          `# Mailchimp Account`,
          ``,
          `- **Account name**: ${data.account_name ?? "N/A"}`,
          `- **Email**: ${data.email ?? "N/A"}`,
          `- **First name**: ${data.first_name ?? ""}`,
          `- **Last name**: ${data.last_name ?? ""}`,
          `- **Role**: ${data.role ?? "N/A"}`,
          `- **Plan**: ${data.pricing_plan_type ?? "N/A"}`,
          `- **Industry**: ${data.industry_stats?.type ?? "N/A"}`,
          `- **Member since**: ${data.member_since ?? "N/A"}`,
          `- **Total subscribers**: ${data.total_subscribers ?? "N/A"}`,
          `- **Account ID**: \`${data.account_id ?? "N/A"}\``,
          `- **Data center**: \`${data.dc ?? "N/A"}\``,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
