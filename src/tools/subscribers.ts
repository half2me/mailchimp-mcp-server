import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";
import { CHARACTER_LIMIT } from "../constants.js";

const SubscriberStatusEnum = z.enum([
  "subscribed",
  "unsubscribed",
  "cleaned",
  "pending",
  "transactional",
]);

export function registerSubscriberTools(server: McpServer): void {
  // ── List Subscribers ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_subscribers",
    {
      title: "List Mailchimp Subscribers",
      description:
        "List members/subscribers in a specific audience. " +
        "Can filter by status (subscribed, unsubscribed, cleaned, pending). " +
        "Returns email, name, status, and tags.",
      inputSchema: PaginationSchema.extend({
        list_id: z.string().min(1).describe("The audience/list ID"),
        status: SubscriberStatusEnum.optional().describe(
          "Filter by subscription status (subscribed, unsubscribed, cleaned, pending, transactional)"
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
          fields:
            "members.id,members.email_address,members.full_name,members.status,members.tags,members.timestamp_opt,total_items",
        };
        if (params.status) queryParams.status = params.status;

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/members`,
          "GET",
          undefined,
          queryParams
        );

        const members = data.members ?? [];
        const total = data.total_items ?? 0;

        if (!members.length) {
          return {
            content: [{ type: "text", text: `No subscribers found${params.status ? ` with status '${params.status}'` : ""}.` }],
          };
        }

        const lines: string[] = [`# Subscribers`, ``, `Found ${total} subscriber(s).`, ``];
        for (const m of members) {
          const tags = (m.tags ?? []).map((t: any) => t.name).join(", ") || "none";
          lines.push(`- **${m.full_name || "(no name)"}** <${m.email_address}> — ${m.status} — tags: ${tags}`);
        }

        const meta = paginationMeta(total, members.length, params.offset);
        if (meta.has_more) {
          lines.push(``, `*Showing ${members.length} of ${total}. Use offset=${meta.next_offset} to see more.*`);
        }

        let text = lines.join("\n");
        if (text.length > CHARACTER_LIMIT) {
          text = text.slice(0, CHARACTER_LIMIT) + "\n\n*[Response truncated — use pagination to see more.]*";
        }

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Search Subscribers ──────────────────────────────────────────
  server.registerTool(
    "mailchimp_search_subscribers",
    {
      title: "Search Mailchimp Subscribers",
      description:
        "Search for subscribers across all audiences by email address or name. " +
        "Uses Mailchimp's search-members endpoint.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Search query — an email address or name to search for"),
        list_id: z.string().optional().describe("Optional audience/list ID to limit search to"),
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
        const queryParams: Record<string, unknown> = { query: params.query };
        if (params.list_id) queryParams.list_id = params.list_id;

        const data = await mailchimpRequest<any>(
          "/search-members",
          "GET",
          undefined,
          queryParams
        );

        const matches = data.exact_matches?.members ?? [];
        const fullMatches = data.full_search?.members ?? [];
        const all = [...matches, ...fullMatches];

        if (!all.length) {
          return { content: [{ type: "text", text: `No subscribers found matching '${params.query}'.` }] };
        }

        const lines: string[] = [`# Search Results for '${params.query}'`, ``];
        if (matches.length) {
          lines.push(`## Exact Matches (${matches.length})`, ``);
          for (const m of matches) {
            lines.push(`- **${m.full_name || "(no name)"}** <${m.email_address}> — ${m.status} — list: \`${m.list_id}\``);
          }
          lines.push(``);
        }
        if (fullMatches.length) {
          lines.push(`## Partial Matches (${fullMatches.length})`, ``);
          for (const m of fullMatches) {
            lines.push(`- **${m.full_name || "(no name)"}** <${m.email_address}> — ${m.status} — list: \`${m.list_id}\``);
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Add/Update Subscriber ──────────────────────────────────────
  server.registerTool(
    "mailchimp_add_subscriber",
    {
      title: "Add or Update Mailchimp Subscriber",
      description:
        "Add a new subscriber to an audience, or update them if they already exist (upsert). " +
        "Uses the PUT /lists/{list_id}/members/{hash} endpoint for safe upsert behavior.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        email_address: z.string().email().describe("Subscriber email address"),
        status: z.enum(["subscribed", "pending", "unsubscribed"]).default("subscribed")
          .describe("Subscription status. Use 'pending' to send a confirmation email (double opt-in)."),
        first_name: z.string().optional().describe("Subscriber first name"),
        last_name: z.string().optional().describe("Subscriber last name"),
        tags: z.array(z.string()).optional().describe("Tags to assign to the subscriber"),
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
        // Mailchimp uses MD5 hash of lowercase email as subscriber ID
        const crypto = await import("crypto");
        const subscriberHash = crypto
          .createHash("md5")
          .update(params.email_address.toLowerCase())
          .digest("hex");

        const mergeFields: Record<string, string> = {};
        if (params.first_name) mergeFields.FNAME = params.first_name;
        if (params.last_name) mergeFields.LNAME = params.last_name;

        const body: Record<string, unknown> = {
          email_address: params.email_address,
          status_if_new: params.status,
          ...(Object.keys(mergeFields).length ? { merge_fields: mergeFields } : {}),
        };

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/members/${subscriberHash}`,
          "PUT",
          body
        );

        // Handle tags separately if provided
        if (params.tags?.length) {
          const tagBody = {
            tags: params.tags.map((t) => ({ name: t, status: "active" })),
          };
          await mailchimpRequest(
            `/lists/${params.list_id}/members/${subscriberHash}/tags`,
            "POST",
            tagBody
          );
        }

        return {
          content: [
            {
              type: "text",
              text: `Subscriber added/updated successfully!\n\n- **Email**: ${data.email_address}\n- **Status**: ${data.status}\n- **ID**: \`${data.id}\`${params.tags?.length ? `\n- **Tags**: ${params.tags.join(", ")}` : ""}`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Single Subscriber ────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_subscriber",
    {
      title: "Get Mailchimp Subscriber Details",
      description:
        "Get full details for a single subscriber by email address, including " +
        "merge fields, tags, stats, and subscription status.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        email_address: z.string().email().describe("Subscriber email address"),
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
        const crypto = await import("crypto");
        const hash = crypto.createHash("md5").update(params.email_address.toLowerCase()).digest("hex");

        const m = await mailchimpRequest<any>(`/lists/${params.list_id}/members/${hash}`);
        const mergeFields = m.merge_fields ?? {};
        const tags = (m.tags ?? []).map((t: any) => t.name).join(", ") || "none";

        const lines = [
          `# Subscriber: ${m.full_name || m.email_address}`,
          ``,
          `- **Email**: ${m.email_address}`,
          `- **Status**: ${m.status}`,
          `- **ID**: \`${m.id}\``,
          `- **Rating**: ${m.member_rating ?? "N/A"}/5`,
          `- **Tags**: ${tags}`,
          `- **Opted in**: ${m.timestamp_opt ?? "N/A"}`,
          `- **Last changed**: ${m.last_changed ?? "N/A"}`,
          `- **Email client**: ${m.email_client ?? "N/A"}`,
          `- **Language**: ${m.language ?? "N/A"}`,
          `- **IP signup**: ${m.ip_signup ?? "N/A"}`,
          `- **Location**: ${m.location?.country_code ?? "N/A"}`,
        ];

        if (Object.keys(mergeFields).length) {
          lines.push(``, `### Merge Fields`);
          for (const [key, val] of Object.entries(mergeFields)) {
            if (val) lines.push(`- **${key}**: ${val}`);
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Archive Subscriber ──────────────────────────────────────────
  server.registerTool(
    "mailchimp_archive_subscriber",
    {
      title: "Archive Mailchimp Subscriber",
      description:
        "Archive (soft-delete) a subscriber from an audience. The subscriber's data is kept " +
        "but they will no longer receive emails. They can be re-added later.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        email_address: z.string().email().describe("Email address to archive"),
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
        const crypto = await import("crypto");
        const hash = crypto.createHash("md5").update(params.email_address.toLowerCase()).digest("hex");

        await mailchimpRequest(`/lists/${params.list_id}/members/${hash}`, "DELETE");

        return {
          content: [{ type: "text", text: `Subscriber ${params.email_address} archived from list \`${params.list_id}\`.` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Batch Subscribe Members ─────────────────────────────────────
  server.registerTool(
    "mailchimp_batch_subscribe",
    {
      title: "Batch Subscribe Members",
      description:
        "Add or update multiple subscribers at once (up to 500). " +
        "Uses Mailchimp's batch member endpoint for efficient bulk operations.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        members: z.array(z.object({
          email_address: z.string().email().describe("Subscriber email"),
          status: z.enum(["subscribed", "pending", "unsubscribed"]).default("subscribed").describe("Status"),
          first_name: z.string().optional().describe("First name"),
          last_name: z.string().optional().describe("Last name"),
        })).min(1).max(500).describe("Array of members to add/update (max 500)"),
        update_existing: z.boolean().default(true).describe("Whether to update existing members or skip them"),
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
        const body = {
          members: params.members.map((m) => {
            const mergeFields: Record<string, string> = {};
            if (m.first_name) mergeFields.FNAME = m.first_name;
            if (m.last_name) mergeFields.LNAME = m.last_name;
            return {
              email_address: m.email_address,
              status: m.status,
              ...(Object.keys(mergeFields).length ? { merge_fields: mergeFields } : {}),
            };
          }),
          update_existing: params.update_existing,
        };

        const data = await mailchimpRequest<any>(`/lists/${params.list_id}`, "POST", body);

        const newCount = data.new_members?.length ?? 0;
        const updatedCount = data.updated_members?.length ?? 0;
        const errorCount = data.errors?.length ?? 0;

        const lines = [
          `# Batch Subscribe Results`,
          ``,
          `- **New members**: ${newCount}`,
          `- **Updated members**: ${updatedCount}`,
          `- **Errors**: ${errorCount}`,
          `- **Total submitted**: ${params.members.length}`,
        ];

        if (data.errors?.length) {
          lines.push(``, `### Errors`);
          for (const e of data.errors.slice(0, 10)) {
            lines.push(`- ${e.email_address}: ${e.error}`);
          }
          if (data.errors.length > 10) {
            lines.push(`- ... and ${data.errors.length - 10} more`);
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Remove Subscriber ──────────────────────────────────────────
  server.registerTool(
    "mailchimp_unsubscribe",
    {
      title: "Unsubscribe Mailchimp Subscriber",
      description:
        "Unsubscribe a member from an audience. This sets their status to 'unsubscribed' " +
        "rather than permanently deleting them.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        email_address: z.string().email().describe("Email address of the subscriber to unsubscribe"),
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
        const crypto = await import("crypto");
        const subscriberHash = crypto
          .createHash("md5")
          .update(params.email_address.toLowerCase())
          .digest("hex");

        await mailchimpRequest(
          `/lists/${params.list_id}/members/${subscriberHash}`,
          "PATCH",
          { status: "unsubscribed" }
        );

        return {
          content: [
            { type: "text", text: `Successfully unsubscribed ${params.email_address}.` },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Manage Tags ────────────────────────────────────────────────
  server.registerTool(
    "mailchimp_manage_tags",
    {
      title: "Manage Mailchimp Subscriber Tags",
      description:
        "Add or remove tags on a subscriber. Provide a list of tag names and whether to activate or inactivate each.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        email_address: z.string().email().describe("Subscriber email address"),
        tags: z.array(
          z.object({
            name: z.string().min(1).describe("Tag name"),
            status: z.enum(["active", "inactive"]).describe("'active' to add, 'inactive' to remove"),
          })
        ).min(1).describe("Tags to add or remove"),
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
        const crypto = await import("crypto");
        const subscriberHash = crypto
          .createHash("md5")
          .update(params.email_address.toLowerCase())
          .digest("hex");

        await mailchimpRequest(
          `/lists/${params.list_id}/members/${subscriberHash}/tags`,
          "POST",
          { tags: params.tags }
        );

        const added = params.tags.filter((t) => t.status === "active").map((t) => t.name);
        const removed = params.tags.filter((t) => t.status === "inactive").map((t) => t.name);
        const parts: string[] = [];
        if (added.length) parts.push(`Added tags: ${added.join(", ")}`);
        if (removed.length) parts.push(`Removed tags: ${removed.join(", ")}`);

        return {
          content: [{ type: "text", text: `Tags updated for ${params.email_address}.\n${parts.join("\n")}` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Subscriber Activity ─────────────────────────────────────
  server.registerTool(
    "mailchimp_get_subscriber_activity",
    {
      title: "Get Subscriber Activity",
      description:
        "Get recent activity for a specific subscriber — opens, clicks, bounces, etc.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        email_address: z.string().email().describe("Subscriber email address"),
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
        const crypto = await import("crypto");
        const hash = crypto.createHash("md5").update(params.email_address.toLowerCase()).digest("hex");

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/members/${hash}/activity`,
          "GET",
          undefined,
          { count: 50 }
        );
        const activities = data.activity ?? [];

        if (!activities.length) {
          return { content: [{ type: "text", text: `No recent activity for ${params.email_address}.` }] };
        }

        const lines: string[] = [`# Activity for ${params.email_address}`, ``];
        for (const a of activities) {
          const ts = a.timestamp ? new Date(a.timestamp).toLocaleString() : "N/A";
          lines.push(`- **${a.action}** — ${ts} — campaign: \`${a.campaign_id || "N/A"}\`${a.title ? ` (${a.title})` : ""}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Subscriber Notes ────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_subscriber_notes",
    {
      title: "List Subscriber Notes",
      description: "List notes attached to a specific subscriber.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        email_address: z.string().email().describe("Subscriber email address"),
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
        const crypto = await import("crypto");
        const hash = crypto.createHash("md5").update(params.email_address.toLowerCase()).digest("hex");

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/members/${hash}/notes`,
          "GET",
          undefined,
          { count: 50 }
        );
        const notes = data.notes ?? [];

        if (!notes.length) {
          return { content: [{ type: "text", text: `No notes for ${params.email_address}.` }] };
        }

        const lines: string[] = [`# Notes for ${params.email_address}`, ``];
        for (const n of notes) {
          const ts = n.created_at ? new Date(n.created_at).toLocaleString() : "N/A";
          lines.push(`### Note \`${n.note_id}\` — ${ts}`);
          lines.push(n.note ?? "(empty)");
          lines.push(``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Add Subscriber Note ─────────────────────────────────────────
  server.registerTool(
    "mailchimp_add_subscriber_note",
    {
      title: "Add Subscriber Note",
      description: "Add a text note to a subscriber's profile.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        email_address: z.string().email().describe("Subscriber email address"),
        note: z.string().min(1).describe("Note text to add"),
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
        const crypto = await import("crypto");
        const hash = crypto.createHash("md5").update(params.email_address.toLowerCase()).digest("hex");

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/members/${hash}/notes`,
          "POST",
          { note: params.note }
        );

        return {
          content: [{ type: "text", text: `Note added to ${params.email_address}.\n\n- **Note ID**: \`${data.note_id}\`` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Permanently Delete Subscriber ───────────────────────────────
  server.registerTool(
    "mailchimp_delete_subscriber_permanent",
    {
      title: "Permanently Delete Subscriber",
      description:
        "Permanently delete a subscriber and all their data from an audience. " +
        "WARNING: This is irreversible — the subscriber's data will be completely removed.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        email_address: z.string().email().describe("Email address to permanently delete"),
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
        const crypto = await import("crypto");
        const hash = crypto.createHash("md5").update(params.email_address.toLowerCase()).digest("hex");

        await mailchimpRequest(
          `/lists/${params.list_id}/members/${hash}/actions/delete-permanent`,
          "POST"
        );

        return {
          content: [{ type: "text", text: `Subscriber ${params.email_address} permanently deleted from list \`${params.list_id}\`.` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Merge Fields ───────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_merge_fields",
    {
      title: "List Audience Merge Fields",
      description:
        "List merge fields (custom fields) for an audience. " +
        "Merge fields are the custom data you can store on subscribers (e.g., FNAME, LNAME, BIRTHDAY).",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
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
          `/lists/${params.list_id}/merge-fields`,
          "GET",
          undefined,
          { count: 100 }
        );
        const fields = data.merge_fields ?? [];

        if (!fields.length) {
          return { content: [{ type: "text", text: "No merge fields found." }] };
        }

        const lines: string[] = [`# Merge Fields`, ``];
        for (const f of fields) {
          lines.push(`- **${f.name}** — tag: \`${f.tag}\` — type: ${f.type} — required: ${f.required ? "Yes" : "No"} — ID: ${f.merge_id}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Create Merge Field ───────────────────────────────────────────
  server.registerTool(
    "mailchimp_create_merge_field",
    {
      title: "Create Merge Field",
      description:
        "Create a custom merge field (custom data field) for an audience. " +
        "Merge fields let you store extra data on subscribers (e.g., birthday, company, phone).",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        name: z.string().min(1).describe("Display name for the field (e.g., 'Company', 'Birthday')"),
        tag: z.string().min(1).max(10).describe("Merge tag (uppercase, max 10 chars, e.g., 'COMPANY', 'BDAY')"),
        type: z.enum(["text", "number", "address", "phone", "date", "url", "imageurl", "radio", "dropdown", "birthday", "zip"])
          .describe("Field data type"),
        required: z.boolean().default(false).describe("Whether the field is required for new subscribers"),
        default_value: z.string().optional().describe("Default value for the field"),
        public: z.boolean().default(true).describe("Whether the field is shown on signup forms"),
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
          tag: params.tag,
          type: params.type,
          required: params.required,
          public: params.public,
        };
        if (params.default_value) body.default_value = params.default_value;

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/merge-fields`,
          "POST",
          body
        );

        return {
          content: [{
            type: "text",
            text: `Merge field created!\n\n- **Name**: ${data.name}\n- **Tag**: \`${data.tag}\`\n- **Type**: ${data.type}\n- **ID**: ${data.merge_id}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Interest Categories ────────────────────────────────────
  server.registerTool(
    "mailchimp_list_interest_categories",
    {
      title: "List Interest Categories",
      description:
        "List interest categories (groups) for an audience. " +
        "Interest categories organize subscriber preferences (e.g., 'Topics', 'Frequency').",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
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
          `/lists/${params.list_id}/interest-categories`,
          "GET",
          undefined,
          { count: 100 }
        );
        const categories = data.categories ?? [];

        if (!categories.length) {
          return { content: [{ type: "text", text: "No interest categories found." }] };
        }

        const lines: string[] = [`# Interest Categories`, ``];
        for (const c of categories) {
          lines.push(`- **${c.title}** — ID: \`${c.id}\` — type: ${c.type}`);
        }
        lines.push(``, `Use the category ID with mailchimp_list_interests to see the individual interests within each.`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Interests ──────────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_interests",
    {
      title: "List Interests in Category",
      description: "List individual interests within an interest category.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        category_id: z.string().min(1).describe("The interest category ID"),
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
          `/lists/${params.list_id}/interest-categories/${params.category_id}/interests`,
          "GET",
          undefined,
          { count: 100 }
        );
        const interests = data.interests ?? [];

        if (!interests.length) {
          return { content: [{ type: "text", text: "No interests in this category." }] };
        }

        const lines: string[] = [`# Interests`, ``];
        for (const i of interests) {
          lines.push(`- **${i.name}** — ID: \`${i.id}\` — subscribers: ${i.subscriber_count ?? 0}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Search Tags ─────────────────────────────────────────────────
  server.registerTool(
    "mailchimp_search_tags",
    {
      title: "Search Audience Tags",
      description: "Search for tags in an audience by name.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The audience/list ID"),
        name: z.string().optional().describe("Tag name to search for (partial match)"),
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
        const queryParams: Record<string, unknown> = {};
        if (params.name) queryParams.name = params.name;

        const data = await mailchimpRequest<any>(
          `/lists/${params.list_id}/tag-search`,
          "GET",
          undefined,
          queryParams
        );
        const tags = data.tags ?? [];

        if (!tags.length) {
          return { content: [{ type: "text", text: "No tags found." }] };
        }

        const lines: string[] = [`# Tags`, ``];
        for (const t of tags) {
          lines.push(`- **${t.name}** — ID: \`${t.id}\``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
