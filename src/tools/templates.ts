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
      description: "Get metadata for a specific email template. Use mailchimp_get_template_content to get the HTML.",
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

  // ── Get Template Default Content ─────────────────────────────────
  server.registerTool(
    "mailchimp_get_template_content",
    {
      title: "Get Template Default Content",
      description:
        "Get the raw HTML content of a template. Returns the default content " +
        "sections and full HTML that you can customize and use with mailchimp_set_campaign_content.",
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
        const data = await mailchimpRequest<any>(`/templates/${params.template_id}/default-content`);
        const sections = data.sections ?? {};

        const lines = [`# Template Content for ID \`${params.template_id}\``, ``];

        if (Object.keys(sections).length) {
          lines.push(`## Editable Sections`, ``);
          for (const [key, val] of Object.entries(sections)) {
            const preview = String(val).length > 200 ? String(val).slice(0, 200) + "..." : String(val);
            lines.push(`### ${key}`, `\`\`\`html`, preview, `\`\`\``, ``);
          }
        }

        if (data.html) {
          const htmlPreview = data.html.length > 8000
            ? data.html.slice(0, 8000) + "\n... [truncated]"
            : data.html;
          lines.push(`## Full HTML`, ``, `\`\`\`html`, htmlPreview, `\`\`\``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Update Template ─────────────────────────────────────────────
  server.registerTool(
    "mailchimp_update_template",
    {
      title: "Update Mailchimp Template",
      description: "Update an existing template's name or HTML content.",
      inputSchema: z.object({
        template_id: z.number().int().min(1).describe("The template ID to update"),
        name: z.string().optional().describe("Updated template name"),
        html: z.string().optional().describe("Updated full HTML content"),
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
        if (params.name) body.name = params.name;
        if (params.html) body.html = params.html;

        const data = await mailchimpRequest<any>(`/templates/${params.template_id}`, "PATCH", body);
        return {
          content: [{
            type: "text",
            text: `Template updated!\n\n- **Name**: ${data.name}\n- **ID**: \`${data.id}\``,
          }],
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
