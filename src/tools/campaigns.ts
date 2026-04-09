import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

const CampaignStatusEnum = z.enum(["save", "paused", "schedule", "sending", "sent"]);
const CampaignTypeEnum = z.enum(["regular", "plaintext", "absplit", "rss", "variate"]);

export function registerCampaignTools(server: McpServer): void {
  // ── List Campaigns ──────────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_campaigns",
    {
      title: "List Mailchimp Campaigns",
      description:
        "List email campaigns in the account. Can filter by status or type. " +
        "Returns campaign IDs, titles, status, send time, and basic stats.",
      inputSchema: PaginationSchema.extend({
        status: CampaignStatusEnum.optional().describe("Filter by campaign status"),
        type: CampaignTypeEnum.optional().describe("Filter by campaign type (default: regular)"),
        list_id: z.string().optional().describe("Filter campaigns sent to a specific audience"),
        since_send_time: z.string().optional().describe("Only campaigns sent after this ISO 8601 date"),
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
        const queryParams: Record<string, unknown> = {
          count: params.count,
          offset: params.offset,
        };
        if (params.status) queryParams.status = params.status;
        if (params.type) queryParams.type = params.type;
        if (params.list_id) queryParams.list_id = params.list_id;
        if (params.since_send_time) queryParams.since_send_time = params.since_send_time;

        const data = await mailchimpRequest<any>("/campaigns", "GET", undefined, queryParams);
        const campaigns = data.campaigns ?? [];
        const total = data.total_items ?? 0;

        if (!campaigns.length) {
          return { content: [{ type: "text", text: "No campaigns found matching your filters." }] };
        }

        const lines: string[] = [`# Campaigns`, ``, `Found ${total} campaign(s).`, ``];
        for (const c of campaigns) {
          const sendTime = c.send_time ? new Date(c.send_time).toLocaleString() : "Not sent";
          lines.push(`## ${c.settings?.title || "(untitled)"}`);
          lines.push(`- **ID**: \`${c.id}\``);
          lines.push(`- **Subject**: ${c.settings?.subject_line || "N/A"}`);
          lines.push(`- **Status**: ${c.status}`);
          lines.push(`- **Type**: ${c.type}`);
          lines.push(`- **Sent**: ${sendTime}`);
          lines.push(`- **List ID**: \`${c.recipients?.list_id || "N/A"}\``);
          if (c.report_summary) {
            lines.push(`- **Opens**: ${c.report_summary.opens ?? 0} (${((c.report_summary.open_rate ?? 0) * 100).toFixed(1)}%)`);
            lines.push(`- **Clicks**: ${c.report_summary.clicks ?? 0} (${((c.report_summary.click_rate ?? 0) * 100).toFixed(1)}%)`);
          }
          lines.push(``);
        }

        const meta = paginationMeta(total, campaigns.length, params.offset);
        if (meta.has_more) {
          lines.push(`*Showing ${campaigns.length} of ${total}. Use offset=${meta.next_offset} to see more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Campaign Details ────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_campaign",
    {
      title: "Get Mailchimp Campaign Details",
      description:
        "Get detailed information about a specific campaign including content, settings, and tracking.",
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
        const data = await mailchimpRequest<any>(`/campaigns/${params.campaign_id}`);
        const s = data.settings ?? {};
        const r = data.recipients ?? {};
        const t = data.tracking ?? {};

        const lines = [
          `# Campaign: ${s.title || "(untitled)"}`,
          ``,
          `- **ID**: \`${data.id}\``,
          `- **Subject**: ${s.subject_line || "N/A"}`,
          `- **Preview text**: ${s.preview_text || "N/A"}`,
          `- **From**: ${s.from_name} <${s.reply_to}>`,
          `- **Status**: ${data.status}`,
          `- **Type**: ${data.type}`,
          `- **Audience**: \`${r.list_id || "N/A"}\` (${r.list_name || "N/A"})`,
          `- **Segment**: ${r.segment_text || "Entire audience"}`,
          `- **Send time**: ${data.send_time ? new Date(data.send_time).toLocaleString() : "Not sent"}`,
          `- **Created**: ${data.create_time ? new Date(data.create_time).toLocaleString() : "N/A"}`,
          ``,
          `### Tracking`,
          `- Opens: ${t.opens ? "Yes" : "No"}`,
          `- Clicks: ${t.html_clicks ? "Yes" : "No"}`,
          `- Text clicks: ${t.text_clicks ? "Yes" : "No"}`,
          `- Google Analytics: ${t.google_analytics || "Disabled"}`,
        ];

        if (data.report_summary) {
          const rs = data.report_summary;
          lines.push(
            ``,
            `### Report Summary`,
            `- Opens: ${rs.opens} (${((rs.open_rate ?? 0) * 100).toFixed(1)}%)`,
            `- Clicks: ${rs.clicks} (${((rs.click_rate ?? 0) * 100).toFixed(1)}%)`,
            `- Unsubscribes: ${rs.unsubscribed ?? 0}`,
          );
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Update Campaign ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_update_campaign",
    {
      title: "Update Mailchimp Campaign",
      description:
        "Update campaign settings such as subject line, title, from name, reply-to email, and preview text. " +
        "The campaign must be in 'save' (draft) status.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID to update"),
        subject_line: z.string().optional().describe("Email subject line"),
        title: z.string().optional().describe("Internal campaign title (not seen by recipients)"),
        from_name: z.string().optional().describe("Sender name"),
        reply_to: z.string().email().optional().describe("Reply-to email address"),
        preview_text: z.string().optional().describe("Preview text shown in email clients"),
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
        if (params.subject_line !== undefined) {
          body.settings = body.settings || {};
          (body.settings as Record<string, unknown>).subject_line = params.subject_line;
        }
        if (params.title !== undefined) {
          body.settings = body.settings || {};
          (body.settings as Record<string, unknown>).title = params.title;
        }
        if (params.from_name !== undefined) {
          body.settings = body.settings || {};
          (body.settings as Record<string, unknown>).from_name = params.from_name;
        }
        if (params.reply_to !== undefined) {
          body.settings = body.settings || {};
          (body.settings as Record<string, unknown>).reply_to = params.reply_to;
        }
        if (params.preview_text !== undefined) {
          body.settings = body.settings || {};
          (body.settings as Record<string, unknown>).preview_text = params.preview_text;
        }

        await mailchimpRequest(
          `/campaigns/${params.campaign_id}`,
          "PATCH",
          body
        );

        return {
          content: [
            { type: "text", text: `Campaign \`${params.campaign_id}\` updated successfully.` },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Cancel Campaign ─────────────────────────────────────────────
  server.registerTool(
    "mailchimp_cancel_campaign",
    {
      title: "Cancel Mailchimp Campaign",
      description:
        "Cancel a campaign that is currently sending. " +
        "WARNING: This action is irreversible — any unsent emails will not be delivered.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID to cancel"),
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
          `/campaigns/${params.campaign_id}/actions/cancel-send`,
          "POST"
        );

        return {
          content: [
            { type: "text", text: `Campaign \`${params.campaign_id}\` send cancelled. Unsent emails will not be delivered.` },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Create Campaign ─────────────────────────────────────────────
  server.registerTool(
    "mailchimp_create_campaign",
    {
      title: "Create Mailchimp Campaign",
      description:
        "Create a new email campaign (draft). After creating, use mailchimp_set_campaign_content to add HTML/text content, " +
        "then mailchimp_send_campaign to send it.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID to send to"),
        subject_line: z.string().min(1).describe("Email subject line"),
        title: z.string().min(1).describe("Internal campaign title (not seen by recipients)"),
        from_name: z.string().min(1).describe("Sender name"),
        reply_to: z.string().email().describe("Reply-to email address"),
        preview_text: z.string().optional().describe("Preview text shown in email clients"),
        type: CampaignTypeEnum.default("regular").describe("Campaign type (default: regular)"),
        segment_opts: z.object({
          match: z.enum(["any", "all"]).describe("How to combine conditions: 'any' (OR) or 'all' (AND)"),
          conditions: z.array(z.record(z.unknown())).describe("Array of Mailchimp segment condition objects (passed through as-is). Example for a tag: {condition_type: 'StaticSegment', field: 'static_segment', op: 'static_is', value: 12345}"),
        }).optional().describe("Inline segment conditions to filter recipients (e.g. send to a specific tag or segment). The value in a StaticSegment condition is the numeric segment ID from GET /lists/{id}/segments."),
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
        const recipients: Record<string, unknown> = { list_id: params.list_id };
        if (params.segment_opts) {
          recipients.segment_opts = params.segment_opts;
        }

        const body = {
          type: params.type,
          recipients,
          settings: {
            subject_line: params.subject_line,
            title: params.title,
            from_name: params.from_name,
            reply_to: params.reply_to,
            ...(params.preview_text ? { preview_text: params.preview_text } : {}),
          },
        };

        const data = await mailchimpRequest<any>("/campaigns", "POST", body);

        return {
          content: [
            {
              type: "text",
              text:
                `Campaign created as draft!\n\n` +
                `- **ID**: \`${data.id}\`\n` +
                `- **Title**: ${data.settings?.title}\n` +
                `- **Subject**: ${data.settings?.subject_line}\n` +
                `- **Status**: ${data.status}\n\n` +
                `Next steps:\n` +
                `1. Use \`mailchimp_set_campaign_content\` with this campaign ID to add your email HTML.\n` +
                `2. Use \`mailchimp_send_campaign\` to send it.`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Set Campaign Content ────────────────────────────────────────
  server.registerTool(
    "mailchimp_set_campaign_content",
    {
      title: "Set Mailchimp Campaign Content",
      description:
        "Set the HTML content and optional plain-text content for a campaign. " +
        "The campaign must be in 'save' (draft) status. You can also reference a template.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID"),
        html: z.string().optional().describe("Full HTML content for the email"),
        plain_text: z.string().optional().describe("Plain-text version of the email"),
        template_id: z.number().int().optional().describe("Template ID to use instead of raw HTML"),
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
        if (params.html) body.html = params.html;
        if (params.plain_text) body.plain_text = params.plain_text;
        if (params.template_id) body.template = { id: params.template_id };

        await mailchimpRequest(
          `/campaigns/${params.campaign_id}/content`,
          "PUT",
          body
        );

        return {
          content: [
            { type: "text", text: `Campaign content updated successfully for campaign \`${params.campaign_id}\`.` },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Send Campaign ───────────────────────────────────────────────
  server.registerTool(
    "mailchimp_send_campaign",
    {
      title: "Send Mailchimp Campaign",
      description:
        "Send a campaign immediately. The campaign must have content set and be in 'save' (draft) status. " +
        "WARNING: This action is irreversible — the email will be sent to all recipients in the audience.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID to send"),
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
          `/campaigns/${params.campaign_id}/actions/send`,
          "POST"
        );

        return {
          content: [
            { type: "text", text: `Campaign \`${params.campaign_id}\` is now sending! Check reports for delivery status.` },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Schedule Campaign ───────────────────────────────────────────
  server.registerTool(
    "mailchimp_schedule_campaign",
    {
      title: "Schedule Mailchimp Campaign",
      description:
        "Schedule a campaign to send at a specific date and time. The campaign must be in 'save' status.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID to schedule"),
        schedule_time: z.string().min(1).describe("ISO 8601 UTC date/time to send (e.g., '2026-04-15T14:00:00Z')"),
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
        await mailchimpRequest(
          `/campaigns/${params.campaign_id}/actions/schedule`,
          "POST",
          { schedule_time: params.schedule_time }
        );

        return {
          content: [
            {
              type: "text",
              text: `Campaign \`${params.campaign_id}\` scheduled for ${params.schedule_time}.\nUse mailchimp_unschedule_campaign to cancel.`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Unschedule Campaign ─────────────────────────────────────────
  server.registerTool(
    "mailchimp_unschedule_campaign",
    {
      title: "Unschedule Mailchimp Campaign",
      description: "Cancel a scheduled campaign, returning it to draft status.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID to unschedule"),
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
        await mailchimpRequest(
          `/campaigns/${params.campaign_id}/actions/unschedule`,
          "POST"
        );
        return {
          content: [{ type: "text", text: `Campaign \`${params.campaign_id}\` unscheduled. It's back in draft status.` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Send Test Email ──────────────────────────────────────────────
  server.registerTool(
    "mailchimp_send_test_email",
    {
      title: "Send Test Email for Campaign",
      description:
        "Send a test email for a campaign to one or more email addresses. " +
        "Useful for previewing a campaign before sending to the full audience.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID"),
        test_emails: z.array(z.string().email()).min(1).max(5).describe("Email addresses to send the test to (max 5)"),
        send_type: z.enum(["html", "plaintext"]).default("html").describe("Type of test email to send"),
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
        await mailchimpRequest(
          `/campaigns/${params.campaign_id}/actions/test`,
          "POST",
          { test_emails: params.test_emails, send_type: params.send_type }
        );
        return {
          content: [{
            type: "text",
            text: `Test email sent to: ${params.test_emails.join(", ")}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Send Checklist ──────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_send_checklist",
    {
      title: "Get Campaign Send Checklist",
      description:
        "Review the send checklist for a campaign. Shows whether the campaign is ready to send " +
        "and lists any issues that need to be resolved.",
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
        const data = await mailchimpRequest<any>(`/campaigns/${params.campaign_id}/send-checklist`);
        const ready = data.is_ready ?? false;
        const items = data.items ?? [];

        const lines = [
          `# Send Checklist for Campaign \`${params.campaign_id}\``,
          ``,
          `**Ready to send**: ${ready ? "Yes ✓" : "No ✗"}`,
          ``,
        ];

        for (const item of items) {
          const icon = item.type === "success" ? "✓" : item.type === "warning" ? "⚠" : "✗";
          lines.push(`- ${icon} **${item.heading ?? "Check"}**: ${item.details ?? ""}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Replicate Campaign ──────────────────────────────────────────
  server.registerTool(
    "mailchimp_replicate_campaign",
    {
      title: "Replicate Mailchimp Campaign",
      description: "Create a copy of an existing campaign. The copy will be in draft status.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID to replicate"),
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
        const data = await mailchimpRequest<any>(
          `/campaigns/${params.campaign_id}/actions/replicate`,
          "POST"
        );
        return {
          content: [{
            type: "text",
            text: `Campaign replicated!\n\n- **New campaign ID**: \`${data.id}\`\n- **Title**: ${data.settings?.title ?? "N/A"}\n- **Status**: ${data.status}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Search Campaigns ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_search_campaigns",
    {
      title: "Search Mailchimp Campaigns",
      description: "Search campaigns by title or subject line.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Search query to match against campaign title or subject"),
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
        const data = await mailchimpRequest<any>("/search-campaigns", "GET", undefined, {
          query: params.query,
        });
        const results = data.results ?? [];

        if (!results.length) {
          return { content: [{ type: "text", text: `No campaigns found matching '${params.query}'.` }] };
        }

        const lines: string[] = [`# Campaign Search: '${params.query}'`, ``, `Found ${results.length} result(s).`, ``];
        for (const r of results) {
          const c = r.campaign ?? {};
          lines.push(`- **${c.settings?.title || "(untitled)"}** — ID: \`${c.id}\` — subject: ${c.settings?.subject_line || "N/A"} — status: ${c.status}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Campaign Content ────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_campaign_content",
    {
      title: "Get Mailchimp Campaign Content",
      description: "Retrieve the HTML and plain-text content of a campaign.",
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
        const data = await mailchimpRequest<any>(`/campaigns/${params.campaign_id}/content`);
        const lines = [`# Campaign Content for \`${params.campaign_id}\``, ``];

        if (data.plain_text) {
          lines.push(`## Plain Text`, ``, `\`\`\``, data.plain_text.slice(0, 5000), `\`\`\``, ``);
        }
        if (data.html) {
          const preview = data.html.length > 5000
            ? data.html.slice(0, 5000) + "\n... [truncated]"
            : data.html;
          lines.push(`## HTML (preview)`, ``, `\`\`\`html`, preview, `\`\`\``);
        }

        if (!data.plain_text && !data.html) {
          lines.push(`No content set for this campaign yet.`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Delete Campaign ─────────────────────────────────────────────
  server.registerTool(
    "mailchimp_delete_campaign",
    {
      title: "Delete Mailchimp Campaign",
      description:
        "Permanently delete a campaign. Only works on campaigns that haven't been sent. This cannot be undone.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID to delete"),
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
        await mailchimpRequest(`/campaigns/${params.campaign_id}`, "DELETE");
        return {
          content: [{ type: "text", text: `Campaign \`${params.campaign_id}\` deleted permanently.` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
