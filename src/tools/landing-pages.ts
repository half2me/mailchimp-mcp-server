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

  // ── Create Landing Page ───────────────────────────────────────
  server.registerTool(
    "mailchimp_create_landing_page",
    {
      title: "Create Landing Page",
      description: "Create a new landing page in Mailchimp.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Name for the landing page"),
        title: z.string().optional().describe("Page title shown in the browser tab"),
        description: z.string().optional().describe("Description of the page"),
        list_id: z.string().optional().describe("Audience/list ID to connect signups to"),
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
        const body: Record<string, unknown> = { name: params.name };
        if (params.title !== undefined) body.title = params.title;
        if (params.description !== undefined) body.description = params.description;
        if (params.list_id !== undefined) body.list_id = params.list_id;

        const data = await mailchimpRequest<any>("/landing-pages", "POST", body);
        return {
          content: [{
            type: "text",
            text: `Landing page created!\n\n- **Name**: ${data.name}\n- **ID**: \`${data.id}\`\n- **Status**: ${data.status}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Update Landing Page ──────────────────────────────────────
  server.registerTool(
    "mailchimp_update_landing_page",
    {
      title: "Update Landing Page",
      description: "Update an existing landing page's name, title, or description.",
      inputSchema: z.object({
        page_id: z.string().min(1).describe("The landing page ID"),
        name: z.string().optional().describe("Updated page name"),
        title: z.string().optional().describe("Updated page title"),
        description: z.string().optional().describe("Updated description"),
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
        if (params.name !== undefined) body.name = params.name;
        if (params.title !== undefined) body.title = params.title;
        if (params.description !== undefined) body.description = params.description;

        const data = await mailchimpRequest<any>(`/landing-pages/${params.page_id}`, "PATCH", body);
        return {
          content: [{
            type: "text",
            text: `Landing page updated!\n\n- **Name**: ${data.name}\n- **ID**: \`${data.id}\``,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Delete Landing Page ──────────────────────────────────────
  server.registerTool(
    "mailchimp_delete_landing_page",
    {
      title: "Delete Landing Page",
      description: "Permanently delete a landing page. This cannot be undone.",
      inputSchema: z.object({
        page_id: z.string().min(1).describe("The landing page ID to delete"),
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
        await mailchimpRequest(`/landing-pages/${params.page_id}`, "DELETE");
        return { content: [{ type: "text", text: `Landing page \`${params.page_id}\` deleted.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Publish Landing Page ─────────────────────────────────────
  server.registerTool(
    "mailchimp_publish_landing_page",
    {
      title: "Publish Landing Page",
      description: "Publish a landing page, making it live and accessible via its URL.",
      inputSchema: z.object({
        page_id: z.string().min(1).describe("The landing page ID to publish"),
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
        await mailchimpRequest(`/landing-pages/${params.page_id}/actions/publish`, "POST");
        return { content: [{ type: "text", text: `Landing page \`${params.page_id}\` published.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Unpublish Landing Page ───────────────────────────────────
  server.registerTool(
    "mailchimp_unpublish_landing_page",
    {
      title: "Unpublish Landing Page",
      description: "Unpublish a landing page, taking it offline.",
      inputSchema: z.object({
        page_id: z.string().min(1).describe("The landing page ID to unpublish"),
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
        await mailchimpRequest(`/landing-pages/${params.page_id}/actions/unpublish`, "POST");
        return { content: [{ type: "text", text: `Landing page \`${params.page_id}\` unpublished.` }] };
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
