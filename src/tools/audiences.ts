import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

export function registerAudienceTools(server: McpServer): void {
  // ── List Audiences ──────────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_audiences",
    {
      title: "List Mailchimp Audiences",
      description:
        "List all audiences (also called lists) in the Mailchimp account. " +
        "Returns audience IDs, names, member counts, and key stats. " +
        "Use this first to discover audience IDs needed by other tools.",
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
        const data = await mailchimpRequest<any>("/lists", "GET", undefined, {
          count: params.count,
          offset: params.offset,
          fields:
            "lists.id,lists.name,lists.stats.member_count,lists.stats.unsubscribe_count,lists.stats.open_rate,lists.stats.click_rate,lists.date_created,total_items",
        });

        const lists = data.lists ?? [];
        const total = data.total_items ?? 0;

        if (!lists.length) {
          return { content: [{ type: "text", text: "No audiences found in this Mailchimp account." }] };
        }

        const lines: string[] = [`# Mailchimp Audiences`, ``, `Found ${total} audience(s).`, ``];
        for (const l of lists) {
          const stats = l.stats ?? {};
          lines.push(`## ${l.name}`);
          lines.push(`- **ID**: \`${l.id}\``);
          lines.push(`- **Members**: ${stats.member_count ?? "N/A"}`);
          lines.push(`- **Unsubscribed**: ${stats.unsubscribe_count ?? "N/A"}`);
          lines.push(`- **Open rate**: ${stats.open_rate != null ? (stats.open_rate * 100).toFixed(1) + "%" : "N/A"}`);
          lines.push(`- **Click rate**: ${stats.click_rate != null ? (stats.click_rate * 100).toFixed(1) + "%" : "N/A"}`);
          lines.push(`- **Created**: ${l.date_created ?? "N/A"}`);
          lines.push(``);
        }

        const meta = paginationMeta(total, lists.length, params.offset);
        if (meta.has_more) {
          lines.push(`*Showing ${lists.length} of ${total}. Use offset=${meta.next_offset} to see more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Audience Details ────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_audience",
    {
      title: "Get Mailchimp Audience Details",
      description:
        "Get detailed information about a specific audience/list by its ID. " +
        "Returns full stats, settings, and configuration.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The unique Mailchimp audience/list ID"),
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
        const data = await mailchimpRequest<any>(`/lists/${params.list_id}`);
        const stats = data.stats ?? {};

        const lines = [
          `# Audience: ${data.name}`,
          ``,
          `- **ID**: \`${data.id}\``,
          `- **Members**: ${stats.member_count ?? 0}`,
          `- **Unsubscribed**: ${stats.unsubscribe_count ?? 0}`,
          `- **Cleaned**: ${stats.cleaned_count ?? 0}`,
          `- **Open rate**: ${stats.open_rate != null ? (stats.open_rate * 100).toFixed(1) + "%" : "N/A"}`,
          `- **Click rate**: ${stats.click_rate != null ? (stats.click_rate * 100).toFixed(1) + "%" : "N/A"}`,
          `- **Last campaign sent**: ${stats.campaign_last_sent ?? "Never"}`,
          `- **Created**: ${data.date_created ?? "N/A"}`,
          `- **Double opt-in**: ${data.double_optin ? "Yes" : "No"}`,
          `- **Permission reminder**: ${data.permission_reminder ?? "N/A"}`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Create Audience ─────────────────────────────────────────────
  server.registerTool(
    "mailchimp_create_audience",
    {
      title: "Create Mailchimp Audience",
      description:
        "Create a new audience (list) in Mailchimp. Requires basic contact and campaign defaults.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Name for the new audience"),
        permission_reminder: z.string().min(1).describe("Reminder for why subscribers are on this list (e.g., 'You signed up on our website.')"),
        email_type_option: z.boolean().default(false).describe("Whether to allow subscribers to choose HTML or plain-text emails"),
        from_name: z.string().min(1).describe("Default 'From' name for campaigns"),
        from_email: z.string().email().describe("Default 'From' email for campaigns"),
        subject: z.string().min(1).describe("Default subject line for campaigns"),
        language: z.string().default("en").describe("Default language (ISO 639-1, e.g., 'en')"),
        company: z.string().min(1).describe("Company or organization name"),
        address1: z.string().min(1).describe("Street address line 1"),
        city: z.string().min(1).describe("City"),
        state: z.string().min(1).describe("State or province"),
        zip: z.string().min(1).describe("Postal/ZIP code"),
        country: z.string().min(1).default("US").describe("Country code (e.g., 'US')"),
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
          permission_reminder: params.permission_reminder,
          email_type_option: params.email_type_option,
          contact: {
            company: params.company,
            address1: params.address1,
            city: params.city,
            state: params.state,
            zip: params.zip,
            country: params.country,
          },
          campaign_defaults: {
            from_name: params.from_name,
            from_email: params.from_email,
            subject: params.subject,
            language: params.language,
          },
        };

        const data = await mailchimpRequest<any>("/lists", "POST", body);
        return {
          content: [
            {
              type: "text",
              text: `Audience created successfully!\n\n- **Name**: ${data.name}\n- **ID**: \`${data.id}\`\n\nUse this ID with other Mailchimp tools.`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Update Audience ─────────────────────────────────────────────
  server.registerTool(
    "mailchimp_update_audience",
    {
      title: "Update Mailchimp Audience",
      description:
        "Update settings for an existing audience/list. " +
        "Can modify name, permission reminder, from name/email, subject, and other audience settings.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The unique Mailchimp audience/list ID"),
        name: z.string().optional().describe("Updated audience name"),
        permission_reminder: z.string().optional().describe("Updated permission reminder text"),
        email_type_option: z.boolean().optional().describe("Whether to allow subscribers to choose HTML or plain-text emails"),
        from_name: z.string().optional().describe("Updated default 'From' name for campaigns"),
        from_email: z.string().email().optional().describe("Updated default 'From' email for campaigns"),
        subject: z.string().optional().describe("Updated default subject line for campaigns"),
        language: z.string().optional().describe("Updated default language (ISO 639-1, e.g., 'en')"),
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
        const body: any = {};
        if (params.name !== undefined) body.name = params.name;
        if (params.permission_reminder !== undefined) body.permission_reminder = params.permission_reminder;
        if (params.email_type_option !== undefined) body.email_type_option = params.email_type_option;
        if (params.from_name !== undefined || params.from_email !== undefined || params.subject !== undefined || params.language !== undefined) {
          body.campaign_defaults = {};
          if (params.from_name !== undefined) body.campaign_defaults.from_name = params.from_name;
          if (params.from_email !== undefined) body.campaign_defaults.from_email = params.from_email;
          if (params.subject !== undefined) body.campaign_defaults.subject = params.subject;
          if (params.language !== undefined) body.campaign_defaults.language = params.language;
        }

        const data = await mailchimpRequest<any>(`/lists/${params.list_id}`, "PATCH", body);
        return {
          content: [
            {
              type: "text",
              text: `Audience updated successfully!\n\n- **Name**: ${data.name}\n- **ID**: \`${data.id}\``,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Audience Growth History ─────────────────────────────────
  server.registerTool(
    "mailchimp_get_audience_growth",
    {
      title: "Get Mailchimp Audience Growth History",
      description:
        "Get monthly growth history for an audience. " +
        "Returns subscriber additions and removals for each month, showing subscription and unsubscription trends.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The unique Mailchimp audience/list ID"),
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
        const data = await mailchimpRequest<any>(`/lists/${params.list_id}/growth-history`);
        const history = data.history ?? [];

        if (!history.length) {
          return { content: [{ type: "text", text: "No growth history data available for this audience." }] };
        }

        const lines = [`# Growth History`, ``];
        for (const month of history) {
          lines.push(`## ${month.month ?? "Unknown"}`);
          lines.push(`- **Subscribes**: ${month.subscribes ?? 0}`);
          lines.push(`- **Unsubscribes**: ${month.unsubscribes ?? 0}`);
          lines.push(`- **Cleaned**: ${month.cleaned ?? 0}`);
          lines.push(`- **Pending**: ${month.pending ?? 0}`);
          lines.push(``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Audience Geographic Breakdown ────────────────────────────
  server.registerTool(
    "mailchimp_get_audience_locations",
    {
      title: "Get Mailchimp Audience Geographic Breakdown",
      description:
        "Get geographic breakdown of subscribers by country and region. " +
        "Shows subscriber distribution across different locations.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The unique Mailchimp audience/list ID"),
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
        const data = await mailchimpRequest<any>(`/lists/${params.list_id}/locations`);
        const locations = data.locations ?? [];

        if (!locations.length) {
          return { content: [{ type: "text", text: "No geographic data available for this audience." }] };
        }

        const lines = [`# Subscriber Locations`, ``];
        for (const location of locations) {
          lines.push(`## ${location.country ?? "Unknown"}`);
          lines.push(`- **Country Code**: ${location.country_code ?? "N/A"}`);
          lines.push(`- **Region**: ${location.region ?? "N/A"}`);
          lines.push(`- **Postal Code**: ${location.postal_code ?? "N/A"}`);
          lines.push(`- **Latitude**: ${location.latitude ?? "N/A"}`);
          lines.push(`- **Longitude**: ${location.longitude ?? "N/A"}`);
          lines.push(`- **Subscribers**: ${location.percent ?? 0}%`);
          lines.push(``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Email Client Statistics ──────────────────────────────────
  server.registerTool(
    "mailchimp_get_email_client_stats",
    {
      title: "Get Email Client Statistics",
      description:
        "Get email client and domain breakdown for an audience. " +
        "Shows which email clients (Gmail, Outlook, Apple Mail, etc.) and domains are used by subscribers.",
      inputSchema: z.object({
        list_id: z.string().min(1).describe("The unique Mailchimp audience/list ID"),
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
        const data = await mailchimpRequest<any>(`/lists/${params.list_id}/clients`);
        const clients = data.clients ?? [];

        if (!clients.length) {
          return { content: [{ type: "text", text: "No email client data available for this audience." }] };
        }

        const lines = [`# Email Client Statistics`, ``];
        for (const client of clients) {
          lines.push(`## ${client.client ?? "Unknown"}`);
          lines.push(`- **Icon URL**: ${client.icon ?? "N/A"}`);
          lines.push(`- **Subscribers**: ${client.members ?? 0}`);
          lines.push(`- **Members Last Campaign**: ${client.members_last_campaign ?? 0}`);
          lines.push(``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
