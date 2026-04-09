import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

const FileTypeEnum = z.enum([
  "image",
  "document",
  "other",
]);

export function registerFileManagerTools(server: McpServer): void {
  // ── List Files ────────────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_files",
    {
      title: "List Files in File Manager",
      description:
        "List all files in the Mailchimp file manager. Optionally filter by file type. " +
        "Returns file IDs, names, sizes, types, and creation dates.",
      inputSchema: PaginationSchema.extend({
        type: FileTypeEnum.optional().describe("Optional filter by file type: image, document, or other"),
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
          "/file-manager/files",
          "GET",
          undefined,
          queryParams
        );
        const files = data.files ?? [];
        const total = data.total_items ?? 0;

        if (!files.length) {
          return { content: [{ type: "text", text: "No files found in file manager." }] };
        }

        const lines: string[] = [`# File Manager`, ``, `Found ${total} file(s).`, ``];

        for (const file of files) {
          lines.push(`## ${file.name}`);
          lines.push(`- **ID**: \`${file.id}\``);
          lines.push(`- **Type**: ${file.type || "N/A"}`);
          lines.push(`- **Size**: ${file.size ? formatBytes(file.size) : "N/A"}`);
          lines.push(`- **URL**: ${file.full_url || "N/A"}`);
          lines.push(`- **Created**: ${file.created_at ? new Date(file.created_at).toLocaleString() : "N/A"}`);
          lines.push(`- **Width**: ${file.width || "N/A"}`);
          lines.push(`- **Height**: ${file.height || "N/A"}`);
          lines.push(``);
        }

        const meta = paginationMeta(total, files.length, params.offset);
        if (meta.has_more) {
          lines.push(
            `*Showing ${files.length} of ${total}. Use offset=${meta.next_offset} to see more.*`
          );
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Upload File ──────────────────────────────────────────────
  server.registerTool(
    "mailchimp_upload_file",
    {
      title: "Upload File to File Manager",
      description:
        "Upload a new file to the Mailchimp file manager. The file content should be base64-encoded. " +
        "Supported types: images (JPG, PNG, GIF), PDFs, and other documents.",
      inputSchema: z.object({
        name: z.string().min(1).describe("The filename including extension (e.g., 'banner.jpg', 'document.pdf')"),
        file_data: z.string().min(1).describe("The file content as a base64-encoded string"),
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
          name: params.name,
          file_data: params.file_data,
        };

        const data = await mailchimpRequest<any>(
          "/file-manager/files",
          "POST",
          body
        );

        return {
          content: [
            {
              type: "text",
              text:
                `File uploaded successfully!\n\n` +
                `- **ID**: \`${data.id}\`\n` +
                `- **Name**: ${data.name}\n` +
                `- **Type**: ${data.type || "N/A"}\n` +
                `- **Size**: ${data.size ? formatBytes(data.size) : "N/A"}\n` +
                `- **URL**: ${data.full_url || "N/A"}\n` +
                `- **Created**: ${data.created_at ? new Date(data.created_at).toLocaleString() : "N/A"}`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
