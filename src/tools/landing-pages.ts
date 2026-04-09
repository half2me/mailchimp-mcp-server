import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

export function registerLandingPageTools(server: McpServer): void {
  // ── List Landing Pages ────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_landing_pages",
    {
      title: "List Mailchimp Landing Pages",
      description:
        "List all landing pages. Returns page IDs, names, URLs, and performance stats including visitor and conversion counts.",
      inputSchema: PaginationSchema.extend({}).strict(),
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

        const data = await mailchimpRequest<any>(
          "/landing-pages",
          "GET",
          undefined,
          queryParams
        );
        const pages = data.landing_pages ?? [];
        const total = data.total_items ?? 0;

        if (!pages.length) {
          return { content: [{ type: "text", text: "No landing pages found." }] };
        }

        const lines: string[] = [`# Landing Pages`, ``, `Found ${total} page(s).`, ``];

        for (const page of pages) {
          lines.push(`## ${page.name || "(untitled)"}`);
          lines.push(`- **ID**: \`${page.id}\``);
          lines.push(`- **URL**: ${page.url || "N/A"}`);
          lines.push(`- **Status**: ${page.status || "N/A"}`);
          lines.push(`- **Published**: ${page.published_at ? new Date(page.published_at).toLocaleString() : "Not published"}`);
          lines.push(`- **Visitors**: ${page.stats?.visits ?? 0}`);
          lines.push(`- **Conversions**: ${page.stats?.conversions ?? 0}`);
          if (page.stats?.visits && page.stats.visits > 0) {
            const conversionRate = ((page.stats.conversions ?? 0) / page.stats.visits * 100).toFixed(2);
            lines.push(`- **Conversion Rate**: ${conversionRate}%`);
          }
          lines.push(`- **Created**: ${page.created_at ? new Date(page.created_at).toLocaleString() : "N/A"}`);
          lines.push(``);
        }

        const meta = paginationMeta(total, pages.length, params.offset);
        if (meta.has_more) {
          lines.push(
            `*Showing ${pages.length} of ${total}. Use offset=${meta.next_offset} to see more.*`
          );
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Landing Page ──────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_landing_page",
    {
      title: "Get Landing Page Details",
      description:
        "Get detailed information about a specific landing page including content, tracking, and performance metrics.",
      inputSchema: z.object({
        page_id: z.string().min(1).describe("The landing page ID"),
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
        const data = await mailchimpRequest<any>(`/landing-pages/${params.page_id}`);

        const lines = [
          `# Landing Page: ${data.name || "(untitled)"}`,
          ``,
          `- **ID**: \`${data.id}\``,
          `- **URL**: ${data.url || "N/A"}`,
          `- **Status**: ${data.status || "N/A"}`,
          `- **Published**: ${data.published_at ? new Date(data.published_at).toLocaleString() : "Not published"}`,
          `- **Created**: ${data.created_at ? new Date(data.created_at).toLocaleString() : "N/A"}`,
          `- **Updated**: ${data.updated_at ? new Date(data.updated_at).toLocaleString() : "N/A"}`,
          ``,
          `### Performance Metrics`,
          `- **Total Visitors**: ${data.stats?.visits ?? 0}`,
          `- **Total Conversions**: ${data.stats?.conversions ?? 0}`,
          `- **Conversion Rate**: ${data.stats?.visits && data.stats.visits > 0 ? ((data.stats.conversions ?? 0) / data.stats.visits * 100).toFixed(2) + "%" : "N/A"}`,
          `- **Click-through Rate**: ${data.stats?.click_rate ?? "N/A"}`,
          ``,
          `### Tracking Settings`,
          `- **Google Analytics**: ${data.tracking?.google_analytics || "Not configured"}`,
          `- **Conversion Tracking**: ${data.tracking?.conversion_tracking ? "Enabled" : "Disabled"}`,
        ];

        if (data.title) {
          lines.push(``, `### Content`, `- **Page Title**: ${data.title}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
