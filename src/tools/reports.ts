import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

export function registerReportTools(server: McpServer): void {
  // ── List Campaign Reports ───────────────────────────────────────
  server.registerTool(
    "mailchimp_list_reports",
    {
      title: "List Mailchimp Campaign Reports",
      description:
        "List reports for sent campaigns with open rates, click rates, and other engagement metrics.",
      inputSchema: PaginationSchema.extend({
        since_send_time: z.string().optional().describe("Only reports for campaigns sent after this ISO 8601 date"),
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
        if (params.since_send_time) queryParams.since_send_time = params.since_send_time;

        const data = await mailchimpRequest<any>("/reports", "GET", undefined, queryParams);
        const reports = data.reports ?? [];
        const total = data.total_items ?? 0;

        if (!reports.length) {
          return { content: [{ type: "text", text: "No campaign reports found." }] };
        }

        const lines: string[] = [`# Campaign Reports`, ``, `Found ${total} report(s).`, ``];
        for (const r of reports) {
          const opens = r.opens ?? {};
          const clicks = r.clicks ?? {};
          lines.push(`## ${r.campaign_title || "(untitled)"}`);
          lines.push(`- **Campaign ID**: \`${r.id}\``);
          lines.push(`- **Subject**: ${r.subject_line || "N/A"}`);
          lines.push(`- **Sent**: ${r.send_time ? new Date(r.send_time).toLocaleString() : "N/A"}`);
          lines.push(`- **Emails sent**: ${r.emails_sent ?? 0}`);
          lines.push(`- **Opens**: ${opens.opens_total ?? 0} total, ${opens.unique_opens ?? 0} unique (${((opens.open_rate ?? 0) * 100).toFixed(1)}%)`);
          lines.push(`- **Clicks**: ${clicks.clicks_total ?? 0} total, ${clicks.unique_clicks ?? 0} unique (${((clicks.click_rate ?? 0) * 100).toFixed(1)}%)`);
          lines.push(`- **Unsubscribed**: ${r.unsubscribed ?? 0}`);
          lines.push(`- **Bounces**: ${(r.bounces?.hard_bounces ?? 0) + (r.bounces?.soft_bounces ?? 0)} (${r.bounces?.hard_bounces ?? 0} hard, ${r.bounces?.soft_bounces ?? 0} soft)`);
          lines.push(``);
        }

        const meta = paginationMeta(total, reports.length, params.offset);
        if (meta.has_more) {
          lines.push(`*Showing ${reports.length} of ${total}. Use offset=${meta.next_offset} to see more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Campaign Report ─────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_report",
    {
      title: "Get Mailchimp Campaign Report",
      description:
        "Get a detailed performance report for a specific sent campaign, including " +
        "opens, clicks, bounces, unsubscribes, and abuse reports.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The campaign ID to get the report for"),
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
        const r = await mailchimpRequest<any>(`/reports/${params.campaign_id}`);
        const opens = r.opens ?? {};
        const clicks = r.clicks ?? {};
        const bounces = r.bounces ?? {};
        const forwards = r.forwards ?? {};
        const fb = r.facebook_likes ?? {};

        const lines = [
          `# Campaign Report: ${r.campaign_title || "(untitled)"}`,
          ``,
          `- **Campaign ID**: \`${r.id}\``,
          `- **Subject**: ${r.subject_line || "N/A"}`,
          `- **Sent**: ${r.send_time ? new Date(r.send_time).toLocaleString() : "N/A"}`,
          `- **Audience**: \`${r.list_id}\` — ${r.list_name || "N/A"}`,
          ``,
          `## Delivery`,
          `- Emails sent: ${r.emails_sent ?? 0}`,
          `- Hard bounces: ${bounces.hard_bounces ?? 0}`,
          `- Soft bounces: ${bounces.soft_bounces ?? 0}`,
          `- Syntax errors: ${bounces.syntax_errors ?? 0}`,
          ``,
          `## Engagement`,
          `- Opens: ${opens.opens_total ?? 0} total / ${opens.unique_opens ?? 0} unique (${((opens.open_rate ?? 0) * 100).toFixed(1)}%)`,
          `- Last opened: ${opens.last_open ?? "N/A"}`,
          `- Clicks: ${clicks.clicks_total ?? 0} total / ${clicks.unique_clicks ?? 0} unique (${((clicks.click_rate ?? 0) * 100).toFixed(1)}%)`,
          `- Last clicked: ${clicks.last_click ?? "N/A"}`,
          `- Unique subscriber clicks: ${clicks.unique_subscriber_clicks ?? 0}`,
          ``,
          `## Other`,
          `- Unsubscribed: ${r.unsubscribed ?? 0}`,
          `- Abuse reports: ${r.abuse_reports ?? 0}`,
          `- Forwards: ${forwards.forwards_count ?? 0} (${forwards.forwards_opens ?? 0} opened)`,
          `- Industry open rate: ${r.industry_stats?.open_rate != null ? (r.industry_stats.open_rate * 100).toFixed(1) + "%" : "N/A"}`,
          `- Industry click rate: ${r.industry_stats?.click_rate != null ? (r.industry_stats.click_rate * 100).toFixed(1) + "%" : "N/A"}`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Click Details ───────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_click_details",
    {
      title: "Get Mailchimp Campaign Click Details",
      description:
        "Get click details for a specific campaign — which URLs were clicked and how many times.",
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
        const data = await mailchimpRequest<any>(
          `/reports/${params.campaign_id}/click-details`,
          "GET",
          undefined,
          { count: 50 }
        );
        const urls = data.urls_clicked ?? [];

        if (!urls.length) {
          return { content: [{ type: "text", text: "No click data available for this campaign." }] };
        }

        const lines: string[] = [`# Click Details`, ``];
        for (const u of urls) {
          lines.push(`- **${u.url}** — ${u.total_clicks ?? 0} clicks (${u.unique_clicks ?? 0} unique, ${((u.click_percentage ?? 0) * 100).toFixed(1)}%)`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Open Details ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_open_details",
    {
      title: "Get Campaign Open Details",
      description:
        "Get detailed open data for a campaign — which subscribers opened and when.",
      inputSchema: PaginationSchema.extend({
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
        const data = await mailchimpRequest<any>(
          `/reports/${params.campaign_id}/open-details`,
          "GET",
          undefined,
          { count: params.count, offset: params.offset }
        );
        const members = data.members ?? [];
        const total = data.total_items ?? 0;

        if (!members.length) {
          return { content: [{ type: "text", text: "No open data for this campaign." }] };
        }

        const lines: string[] = [`# Open Details`, ``, `${total} subscriber(s) opened.`, ``];
        for (const m of members) {
          const opens = m.opens_count ?? 0;
          const lastOpen = m.last_open ? new Date(m.last_open).toLocaleString() : "N/A";
          lines.push(`- **${m.email_address}** — ${opens} open(s) — last: ${lastOpen}`);
        }

        const meta = paginationMeta(total, members.length, params.offset);
        if (meta.has_more) {
          lines.push(``, `*Showing ${members.length} of ${total}. Use offset=${meta.next_offset} for more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Email Activity ──────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_email_activity",
    {
      title: "Get Campaign Email Activity",
      description:
        "Get per-subscriber activity for a campaign (opens, clicks, bounces) — " +
        "a detailed log of who did what.",
      inputSchema: PaginationSchema.extend({
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
        const data = await mailchimpRequest<any>(
          `/reports/${params.campaign_id}/email-activity`,
          "GET",
          undefined,
          { count: params.count, offset: params.offset }
        );
        const emails = data.emails ?? [];
        const total = data.total_items ?? 0;

        if (!emails.length) {
          return { content: [{ type: "text", text: "No email activity for this campaign." }] };
        }

        const lines: string[] = [`# Email Activity`, ``, `${total} subscriber(s) with activity.`, ``];
        for (const e of emails) {
          const activities = (e.activity ?? [])
            .map((a: any) => `${a.action}${a.timestamp ? " at " + new Date(a.timestamp).toLocaleString() : ""}`)
            .join("; ");
          lines.push(`- **${e.email_address}**: ${activities || "no recorded actions"}`);
        }

        const meta = paginationMeta(total, emails.length, params.offset);
        if (meta.has_more) {
          lines.push(``, `*Showing ${emails.length} of ${total}. Use offset=${meta.next_offset} for more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Unsubscribes ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_unsubscribes",
    {
      title: "Get Campaign Unsubscribes",
      description: "List subscribers who unsubscribed from a specific campaign.",
      inputSchema: PaginationSchema.extend({
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
        const data = await mailchimpRequest<any>(
          `/reports/${params.campaign_id}/unsubscribed`,
          "GET",
          undefined,
          { count: params.count, offset: params.offset }
        );
        const unsubs = data.unsubscribes ?? [];
        const total = data.total_items ?? 0;

        if (!unsubs.length) {
          return { content: [{ type: "text", text: "No unsubscribes for this campaign." }] };
        }

        const lines: string[] = [`# Unsubscribes`, ``, `${total} unsubscribe(s).`, ``];
        for (const u of unsubs) {
          const ts = u.timestamp ? new Date(u.timestamp).toLocaleString() : "N/A";
          lines.push(`- **${u.email_address}** — reason: ${u.reason ?? "N/A"} — at: ${ts}`);
        }

        const meta = paginationMeta(total, unsubs.length, params.offset);
        if (meta.has_more) {
          lines.push(``, `*Showing ${unsubs.length} of ${total}. Use offset=${meta.next_offset} for more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Domain Performance ──────────────────────────────────────
  server.registerTool(
    "mailchimp_get_domain_performance",
    {
      title: "Get Campaign Domain Performance",
      description: "Get email domain performance stats (gmail, yahoo, etc.) for a campaign.",
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
        const data = await mailchimpRequest<any>(`/reports/${params.campaign_id}/domain-performance`);
        const domains = data.domains ?? [];

        if (!domains.length) {
          return { content: [{ type: "text", text: "No domain performance data." }] };
        }

        const lines: string[] = [`# Domain Performance`, ``];
        for (const d of domains) {
          lines.push(`- **${d.domain}** — sent: ${d.emails_sent ?? 0}, bounces: ${d.bounces ?? 0}, opens: ${d.opens ?? 0}, clicks: ${d.clicks ?? 0}, unsubs: ${d.unsubs ?? 0}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Sent-To Report ──────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_sent_to",
    {
      title: "Get Campaign Sent-To Report",
      description:
        "Get delivery details for a campaign — which subscribers it was sent to and their delivery status (sent, bounced, etc.).",
      inputSchema: PaginationSchema.extend({
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
        const data = await mailchimpRequest<any>(
          `/reports/${params.campaign_id}/sent-to`,
          "GET",
          undefined,
          { count: params.count, offset: params.offset }
        );
        const recipients = data.sent_to ?? [];
        const total = data.total_items ?? 0;

        if (!recipients.length) {
          return { content: [{ type: "text", text: "No delivery data for this campaign." }] };
        }

        const lines: string[] = [`# Sent-To Report`, ``, `${total} recipient(s).`, ``];
        for (const r of recipients) {
          const status = r.status ?? "unknown";
          const openCount = r.open_count ?? 0;
          lines.push(`- **${r.email_address}** — status: ${status} — opens: ${openCount} — last open: ${r.last_open ?? "never"}`);
        }

        const meta = paginationMeta(total, recipients.length, params.offset);
        if (meta.has_more) {
          lines.push(``, `*Showing ${recipients.length} of ${total}. Use offset=${meta.next_offset} for more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get A/B Test Results ────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_ab_test_results",
    {
      title: "Get A/B Test Results",
      description:
        "Get results for a variate (A/B test) campaign — shows which combination won " +
        "and the performance of each variant.",
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("The variate campaign ID"),
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
        const data = await mailchimpRequest<any>(`/reports/${params.campaign_id}`);

        if (!data.variate_report) {
          return { content: [{ type: "text", text: "This campaign is not a variate/A/B test campaign, or results are not yet available." }] };
        }

        const vr = data.variate_report;
        const lines = [
          `# A/B Test Results: ${data.campaign_title ?? "(untitled)"}`,
          ``,
          `- **Winning combination**: ${vr.winning_combination_id ?? "N/A"}`,
          `- **Winner criteria**: ${vr.winning_campaign_id ?? "N/A"}`,
          ``,
          `### Combinations`,
        ];

        const combos = vr.combinations ?? [];
        for (const c of combos) {
          lines.push(``);
          lines.push(`#### Combination ${c.id ?? "?"}`);
          lines.push(`- Subject: ${c.subject_line ?? "N/A"}`);
          lines.push(`- Recipients: ${c.recipients ?? 0}`);
          lines.push(`- Opens: ${c.unique_opens ?? 0} (${((c.open_rate ?? 0) * 100).toFixed(1)}%)`);
          lines.push(`- Clicks: ${c.unique_clicks ?? 0} (${((c.click_rate ?? 0) * 100).toFixed(1)}%)`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
