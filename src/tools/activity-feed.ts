import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";

export function registerActivityFeedTools(server: McpServer): void {
  // ── Get Activity Feed ───────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_activity_feed",
    {
      title: "Get Account Activity Feed",
      description:
        "Get the account's recent activity feed (Chimp Chatter). " +
        "Shows recent events like campaign sends, subscriber activity, and list changes.",
      inputSchema: z.object({
        count: z.number().int().min(1).max(50).default(20).describe("Number of activity items to return (1-50, default 20)"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const data = await mailchimpRequest<any>(
          "/activity-feed/chimp-chatter",
          "GET",
          undefined,
          { count: params.count }
        );
        const items = data.chimp_chatter ?? [];

        if (!items.length) {
          return { content: [{ type: "text", text: "No recent activity." }] };
        }

        const lines: string[] = [`# Account Activity Feed`, ``, `${items.length} recent event(s).`, ``];
        for (const item of items) {
          const date = item.update_time ? new Date(item.update_time).toLocaleString() : "N/A";
          lines.push(`- **[${item.type || "event"}]** ${item.message || "N/A"} — ${date}`);
          if (item.url) lines.push(`  Link: ${item.url}`);
          if (item.list_id) lines.push(`  List: \`${item.list_id}\``);
          if (item.campaign_id) lines.push(`  Campaign: \`${item.campaign_id}\``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
