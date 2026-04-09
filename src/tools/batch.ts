import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

export function registerBatchTools(server: McpServer): void {
  // ── Create Batch Operation ──────────────────────────────────────
  server.registerTool(
    "mailchimp_create_batch",
    {
      title: "Create Batch Operation",
      description:
        "Submit up to 500 API operations in a single batch request. " +
        "Each operation specifies a method, path, and optional body. " +
        "Useful for bulk updates, imports, and mass operations.",
      inputSchema: z.object({
        operations: z.array(z.object({
          method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
          path: z.string().min(1).describe("API path (e.g., '/lists/abc123/members')"),
          body: z.string().optional().describe("JSON body as a string (for POST/PUT/PATCH)"),
          operation_id: z.string().optional().describe("Optional ID to identify this operation in the response"),
        })).min(1).max(500).describe("Array of API operations (max 500)"),
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
        const data = await mailchimpRequest<any>("/batches", "POST", {
          operations: params.operations,
        });

        return {
          content: [{
            type: "text",
            text:
              `Batch operation submitted!\n\n` +
              `- **Batch ID**: \`${data.id}\`\n` +
              `- **Status**: ${data.status}\n` +
              `- **Operations**: ${data.total_operations ?? params.operations.length}\n` +
              `- **Submitted at**: ${data.submitted_at ?? "now"}\n\n` +
              `Use \`mailchimp_get_batch_status\` to check progress.`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Batch Status ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_batch_status",
    {
      title: "Get Batch Operation Status",
      description: "Check the status of a previously submitted batch operation.",
      inputSchema: z.object({
        batch_id: z.string().min(1).describe("The batch operation ID"),
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
        const data = await mailchimpRequest<any>(`/batches/${params.batch_id}`);

        const lines = [
          `# Batch Status`,
          ``,
          `- **Batch ID**: \`${data.id}\``,
          `- **Status**: ${data.status}`,
          `- **Total operations**: ${data.total_operations ?? 0}`,
          `- **Finished operations**: ${data.finished_operations ?? 0}`,
          `- **Errored operations**: ${data.errored_operations ?? 0}`,
          `- **Submitted at**: ${data.submitted_at ?? "N/A"}`,
          `- **Completed at**: ${data.completed_at ?? "In progress"}`,
        ];

        if (data.response_body_url) {
          lines.push(`- **Results URL**: ${data.response_body_url}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Batches ────────────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_batches",
    {
      title: "List Batch Operations",
      description: "List recent batch operations and their status.",
      inputSchema: PaginationSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const data = await mailchimpRequest<any>("/batches", "GET", undefined, {
          count: params.count,
          offset: params.offset,
        });
        const batches = data.batches ?? [];
        const total = data.total_items ?? 0;

        if (!batches.length) {
          return { content: [{ type: "text", text: "No batch operations found." }] };
        }

        const lines: string[] = [`# Batch Operations`, ``, `Found ${total} batch(es).`, ``];
        for (const b of batches) {
          lines.push(`- **\`${b.id}\`** — status: ${b.status} — ops: ${b.total_operations ?? 0} — errors: ${b.errored_operations ?? 0} — submitted: ${b.submitted_at ?? "N/A"}`);
        }

        const meta = paginationMeta(total, batches.length, params.offset);
        if (meta.has_more) {
          lines.push(``, `*Showing ${batches.length} of ${total}. Use offset=${meta.next_offset} for more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
