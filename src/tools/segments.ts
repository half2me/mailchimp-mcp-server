import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

export function registerSegmentTools(server: McpServer): void {
  // ── List Segments ───────────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_segments",
    {
      title: "List Mailchimp Segments",
      description:
        "List saved segments and tags for an audience. Segments allow you to target " +
        "subsets of your audience based on conditions.",
      inputSchema: PaginationSchema.extend({
        list_id: z.string().min(1).describe("The audience/list ID"),
        type: z.enum(["saved", "static", "fuzzy"]).optional().describe("Filter by segment type"),
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

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/segments`,
          "GET",
          undefined,
          queryParams
        );
        const segments = data.segments ?? [];
        const total = data.total_items ?? 0;

        if (!segments.length) {
          return { content: [{ type: "text", text: "No segments found for this audience." }] };
        }

        const lines: string[] = [`# Segments`, ``, `Found ${total} segment(s).`, ``];
        for (const s of segments) {
          lines.push(`- **${s.name}** — ID: \`${s.id}\` — type: ${s.type} — members: ${s.member_count ?? 0} — created: ${s.created_at ?? "N/A"}`);
        }

        const meta = paginationMeta(total, segments.length, params.offset);
        if (meta.has_more) {
          lines.push(``, `*Showing ${segments.length} of ${total}. Use offset=${meta.next_offset} to see more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Segment ─────────────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_segment",
    {
      title: "Get Mailchimp Segment",
      description: "Get details of a specific segment including its conditions.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        segment_id: z.number().int().min(0).describe("The segment ID"),
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
        const s = await mailchimpRequest<any>(`/lists/${params.list_id}/segments/${params.segment_id}`);
        const lines = [
          `# Segment: ${s.name}`,
          ``,
          `- **ID**: \`${s.id}\``,
          `- **Type**: ${s.type}`,
          `- **Member count**: ${s.member_count ?? 0}`,
          `- **Created**: ${s.created_at ?? "N/A"}`,
          `- **Updated**: ${s.updated_at ?? "N/A"}`,
        ];

        if (s.options?.conditions?.length) {
          lines.push(``, `### Conditions (match: ${s.options.match ?? "any"})`);
          for (const c of s.options.conditions) {
            lines.push(`- ${c.field ?? "?"} ${c.op ?? "?"} ${c.value ?? ""}`);
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Create Segment ──────────────────────────────────────────────
  server.registerTool(
    "mailchimp_create_segment",
    {
      title: "Create Mailchimp Segment",
      description:
        "Create a new segment (saved or static) for an audience. " +
        "For static segments, provide a list of email addresses. " +
        "For saved segments, provide match conditions.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        name: z.string().min(1).describe("Segment name"),
        static_segment: z.array(z.string().email()).optional().describe(
          "For static segments: array of email addresses to include"
        ),
        conditions_match: z.enum(["any", "all"]).optional().describe("For saved segments: 'any' or 'all' conditions must match"),
        conditions: z.array(z.object({
          field: z.string().describe("Merge field or segment field to match (e.g., 'EMAIL', 'merge0', 'interests-abc123')"),
          op: z.string().describe("Operator (e.g., 'is', 'contains', 'greater', 'starts', 'ends', 'not')"),
          value: z.string().describe("Value to match against"),
        })).optional().describe("For saved segments: array of conditions"),
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

        if (params.static_segment?.length) {
          body.static_segment = params.static_segment;
        }
        if (params.conditions?.length) {
          body.options = {
            match: params.conditions_match ?? "any",
            conditions: params.conditions,
          };
        }

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/segments`,
          "POST",
          body
        );

        return {
          content: [{
            type: "text",
            text: `Segment created!\n\n- **Name**: ${data.name}\n- **ID**: \`${data.id}\`\n- **Type**: ${data.type}\n- **Members**: ${data.member_count ?? 0}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Update Segment ──────────────────────────────────────────────
  server.registerTool(
    "mailchimp_update_segment",
    {
      title: "Update Mailchimp Segment",
      description:
        "Update a segment's name or add/remove members from a static segment.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        segment_id: z.number().int().min(0).describe("The segment ID to update"),
        name: z.string().optional().describe("New name for the segment"),
        emails_to_add: z.array(z.string().email()).optional().describe("Email addresses to add to a static segment"),
        emails_to_remove: z.array(z.string().email()).optional().describe("Email addresses to remove from a static segment"),
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
        if (params.emails_to_add?.length) body.members_to_add = params.emails_to_add;
        if (params.emails_to_remove?.length) body.members_to_remove = params.emails_to_remove;

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/segments/${params.segment_id}`,
          "PATCH",
          body
        );

        return {
          content: [{
            type: "text",
            text: `Segment updated!\n\n- **Name**: ${data.name}\n- **ID**: \`${data.id}\`\n- **Members**: ${data.member_count ?? 0}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Delete Segment ──────────────────────────────────────────────
  server.registerTool(
    "mailchimp_delete_segment",
    {
      title: "Delete Mailchimp Segment",
      description: "Permanently delete a segment. This does not delete the subscribers in it.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        segment_id: z.number().int().min(0).describe("The segment ID to delete"),
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
        await mailchimpRequest(`/lists/${params.list_id}/segments/${params.segment_id}`, "DELETE");
        return { content: [{ type: "text", text: `Segment \`${params.segment_id}\` deleted.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Segment Members ────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_segment_members",
    {
      title: "List Segment Members",
      description: "List subscribers that belong to a specific segment.",
      inputSchema: PaginationSchema.extend({
        list_id: z.string().min(1).describe("The audience/list ID"),
        segment_id: z.number().int().min(0).describe("The segment ID"),
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
          `/lists/${params.list_id}/segments/${params.segment_id}/members`,
          "GET",
          undefined,
          { count: params.count, offset: params.offset }
        );
        const members = data.members ?? [];
        const total = data.total_items ?? 0;

        if (!members.length) {
          return { content: [{ type: "text", text: "No members in this segment." }] };
        }

        const lines: string[] = [`# Segment Members`, ``, `Found ${total} member(s).`, ``];
        for (const m of members) {
          lines.push(`- **${m.full_name || "(no name)"}** <${m.email_address}> — ${m.status}`);
        }

        const meta = paginationMeta(total, members.length, params.offset);
        if (meta.has_more) {
          lines.push(``, `*Showing ${members.length} of ${total}. Use offset=${meta.next_offset} to see more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
