import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";

export function registerCampaignFeedbackTools(server: McpServer): void {
  // ── List Campaign Feedback ──────────────────────────────────────
  server.registerTool(
    "mailchimp_list_campaign_feedback",
    {
      title: "List Campaign Feedback",
      description:
        "List all feedback messages for a campaign. " +
        "Campaign feedback lets team members leave comments and suggestions during campaign creation.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID"),
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
        const data = await mailchimpRequest<any>(`/campaigns/${params.campaign_id}/feedback`);
        const feedback = data.feedback ?? [];

        if (!feedback.length) {
          return { content: [{ type: "text", text: "No feedback for this campaign." }] };
        }

        const lines: string[] = [`# Campaign Feedback`, ``, `${feedback.length} message(s).`, ``];
        for (const f of feedback) {
          lines.push(`## Feedback #${f.feedback_id}`);
          lines.push(`- **From**: ${f.created_by || "N/A"}`);
          lines.push(`- **Message**: ${f.message}`);
          lines.push(`- **Source**: ${f.source || "N/A"}`);
          lines.push(`- **Block ID**: ${f.block_id || "N/A"}`);
          lines.push(`- **Is Complete**: ${f.is_complete ? "Yes" : "No"}`);
          lines.push(`- **Created**: ${f.created_at ? new Date(f.created_at).toLocaleString() : "N/A"}`);
          lines.push(`- **Updated**: ${f.updated_at ? new Date(f.updated_at).toLocaleString() : "N/A"}`);
          lines.push(``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Add Campaign Feedback ───────────────────────────────────────
  server.registerTool(
    "mailchimp_add_campaign_feedback",
    {
      title: "Add Campaign Feedback",
      description: "Add a feedback comment to a campaign for team review.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID"),
        message: z.string().min(1).describe("The feedback message"),
        block_id: z.number().int().optional().describe("Optional block ID to attach feedback to a specific content block"),
        is_complete: z.boolean().default(false).describe("Whether to mark this feedback as resolved"),
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
        const body: Record<string, unknown> = {
          message: params.message,
          is_complete: params.is_complete,
        };
        if (params.block_id !== undefined) body.block_id = params.block_id;

        const data = await mailchimpRequest<any>(
          `/campaigns/${params.campaign_id}/feedback`,
          "POST",
          body
        );
        return {
          content: [{
            type: "text",
            text: `Feedback added!\n\n- **ID**: ${data.feedback_id}\n- **Message**: ${data.message}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Update Campaign Feedback ────────────────────────────────────
  server.registerTool(
    "mailchimp_update_campaign_feedback",
    {
      title: "Update Campaign Feedback",
      description: "Update or resolve a campaign feedback message.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID"),
        feedback_id: z.string().min(1).describe("The feedback ID to update"),
        message: z.string().optional().describe("Updated feedback message"),
        is_complete: z.boolean().optional().describe("Mark feedback as resolved (true) or unresolved (false)"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {};
        if (params.message !== undefined) body.message = params.message;
        if (params.is_complete !== undefined) body.is_complete = params.is_complete;

        const data = await mailchimpRequest<any>(
          `/campaigns/${params.campaign_id}/feedback/${params.feedback_id}`,
          "PATCH",
          body
        );
        return {
          content: [{
            type: "text",
            text: `Feedback updated!\n\n- **ID**: ${data.feedback_id}\n- **Complete**: ${data.is_complete ? "Yes" : "No"}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Delete Campaign Feedback ────────────────────────────────────
  server.registerTool(
    "mailchimp_delete_campaign_feedback",
    {
      title: "Delete Campaign Feedback",
      description: "Delete a feedback message from a campaign.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID"),
        feedback_id: z.string().min(1).describe("The feedback ID to delete"),
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
          `/campaigns/${params.campaign_id}/feedback/${params.feedback_id}`,
          "DELETE"
        );
        return { content: [{ type: "text", text: `Feedback \`${params.feedback_id}\` deleted.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
