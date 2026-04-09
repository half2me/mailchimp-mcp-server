import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

export function registerTemplateTools(server: McpServer): void {
  // ── List Templates ──────────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_templates",
    {
      title: "List Mailchimp Templates",
      description:
        "List available email templates. Returns template IDs, names, types, and dates. " +
        "Use template IDs with mailchimp_set_campaign_content.",
      inputSchema: PaginationSchema.extend({
        type: z.enum(["user", "base", "gallery"]).optional().describe(
          "Filter by template type: 'user' (custom), 'base' (Mailchimp defaults), 'gallery'"
        ),
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
        if (params.type) queryParams.type = params.type;

        const data = await mailchimpRequest<any>("/templates", "GET", undefined, queryParams);
        const templates = data.templates ?? [];
        const total = data.total_items ?? 0;

        if (!templates.length) {
          return { content: [{ type: "text", text: "No templates found." }] };
        }

        const lines: string[] = [`# Email Templates`, ``, `Found ${total} template(s).`, ``];
        for (const t of templates) {
          lines.push(`- **${t.name}** — ID: \`${t.id}\` — type: ${t.type} — created: ${t.date_created ?? "N/A"}`);
        }

        const meta = paginationMeta(total, templates.length, params.offset);
        if (meta.has_more) {
          lines.push(``, `*Showing ${templates.length} of ${total}. Use offset=${meta.next_offset} to see more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Template ────────────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_template",
    {
      title: "Get Mailchimp Template",
      description: "Get details and HTML content of a specific email template.",
      inputSchema: z.object({
        template_id: z.number().int().min(1).describe("The template ID"),
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
        const data = await mailchimpRequest<any>(`/templates/${params.template_id}`);

        const lines = [
          `# Template: ${data.name}`,
          ``,
          `- **ID**: \`${data.id}\``,
          `- **Type**: ${data.type}`,
          `- **Created**: ${data.date_created ?? "N/A"}`,
          `- **Edited**: ${data.date_edited ?? "N/A"}`,
          `- **Active**: ${data.active ? "Yes" : "No"}`,
          `- **Folder ID**: ${data.folder_id || "None"}`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Create Template ─────────────────────────────────────────────
  server.registerTool(
    "mailchimp_create_template",
    {
      title: "Create Mailchimp Template",
      description: "Create a new email template with custom HTML content.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Template name"),
        html: z.string().min(1).describe("Full HTML content for the template"),
        folder_id: z.string().optional().describe("Optional folder ID to organize the template"),
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
          name: params.name,
          html: params.html,
        };
        if (params.folder_id) body.folder_id = params.folder_id;

        const data = await mailchimpRequest<any>("/templates", "POST", body);

        return {
          content: [
            {
              type: "text",
              text: `Template created!\n\n- **Name**: ${data.name}\n- **ID**: \`${data.id}\`\n\nUse this ID with mailchimp_set_campaign_content.`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Delete Template ─────────────────────────────────────────────
  server.registerTool(
    "mailchimp_delete_template",
    {
      title: "Delete Mailchimp Template",
      description: "Permanently delete an email template. This cannot be undone.",
      inputSchema: z.object({
        template_id: z.number().int().min(1).describe("The template ID to delete"),
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
        await mailchimpRequest(`/templates/${params.template_id}`, "DELETE");
        return {
          content: [{ type: "text", text: `Template \`${params.template_id}\` deleted permanently.` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
