import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

const WebhookEventEnum = z.enum([
  "subscribe",
  "unsubscribe",
  "campaign",
  "cleaned",
  "email",
  "profile",
  "upemail",
]);

const WebhookSourceEnum = z.enum([
  "user",
  "admin",
  "api",
]);

export function registerWebhookTools(server: McpServer): void {
  // ── List Webhooks ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_webhooks",
    {
      title: "List Webhooks for Audience",
      description:
        "List all webhooks configured for a specific audience/list. " +
        "Returns webhook IDs, URLs, event types, and enabled status.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
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
          `/lists/${params.list_id}/webhooks`,
          "GET"
        );
        const webhooks = data.webhooks ?? [];

        if (!webhooks.length) {
          return { content: [{ type: "text", text: `No webhooks configured for audience \`${params.list_id}\`.` }] };
        }

        const lines: string[] = [
          `# Webhooks for Audience \`${params.list_id}\``,
          ``,
          `Found ${webhooks.length} webhook(s).`,
          ``,
        ];

        for (const webhook of webhooks) {
          lines.push(`## ${webhook.url}`);
          lines.push(`- **ID**: \`${webhook.id}\``);
          lines.push(`- **URL**: ${webhook.url}`);
          lines.push(`- **Enabled**: ${webhook.enabled ? "Yes" : "No"}`);
          lines.push(`- **Events**: ${webhook.events?.join(", ") || "None"}`);
          lines.push(`- **Sources**: ${webhook.sources?.join(", ") || "None"}`);
          lines.push(`- **Created**: ${webhook.created_at ? new Date(webhook.created_at).toLocaleString() : "N/A"}`);
          lines.push(``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Create Webhook ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_create_webhook",
    {
      title: "Create Webhook",
      description:
        "Create a new webhook for an audience. The webhook will be triggered for the specified events and sources.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        url: z.string().url().describe("The webhook URL to receive POST requests"),
        events: z.array(WebhookEventEnum).min(1).describe("Events to trigger the webhook: subscribe, unsubscribe, campaign, cleaned, email, profile, upemail"),
        sources: z.array(WebhookSourceEnum).min(1).describe("Sources that trigger the webhook: user, admin, api"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const body = {
          url: params.url,
          events: params.events,
          sources: params.sources,
        };

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/webhooks`,
          "POST",
          body
        );

        return {
          content: [
            {
              type: "text",
              text:
                `Webhook created successfully!\n\n` +
                `- **ID**: \`${data.id}\`\n` +
                `- **URL**: ${data.url}\n` +
                `- **Events**: ${data.events?.join(", ") || "None"}\n` +
                `- **Sources**: ${data.sources?.join(", ") || "None"}\n` +
                `- **Status**: ${data.enabled ? "Enabled" : "Disabled"}`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Delete Webhook ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_delete_webhook",
    {
      title: "Delete Webhook",
      description:
        "Delete a webhook from an audience. The webhook will no longer receive events. This action cannot be undone.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        webhook_id: z.string().min(1).describe("The webhook ID to delete"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        await mailchimpRequest(
          `/lists/${params.list_id}/webhooks/${params.webhook_id}`,
          "DELETE"
        );

        return {
          content: [
            {
              type: "text",
              text: `Webhook \`${params.webhook_id}\` deleted permanently from audience \`${params.list_id}\`.`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
