import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

export function registerAutomationTools(server: McpServer): void {
  // ── List Automations ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_automations",
    {
      title: "List Mailchimp Automations",
      description:
        "List all classic automations (workflows) in the account. " +
        "Returns automation IDs, names, status, and trigger info.",
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
        const data = await mailchimpRequest<any>("/automations", "GET", undefined, {
          count: params.count,
          offset: params.offset,
        });
        const automations = data.automations ?? [];
        const total = data.total_items ?? 0;

        if (!automations.length) {
          return { content: [{ type: "text", text: "No automations found." }] };
        }

        const lines: string[] = [`# Automations`, ``, `Found ${total} automation(s).`, ``];
        for (const a of automations) {
          const settings = a.settings ?? {};
          lines.push(`## ${settings.title || "(untitled)"}`);
          lines.push(`- **ID**: \`${a.id}\``);
          lines.push(`- **Status**: ${a.status}`);
          lines.push(`- **List ID**: \`${a.recipients?.list_id ?? "N/A"}\``);
          lines.push(`- **Emails sent**: ${a.emails_sent ?? 0}`);
          lines.push(`- **Start time**: ${a.start_time ?? "Not started"}`);
          lines.push(`- **Created**: ${a.create_time ?? "N/A"}`);
          lines.push(``);
        }

        const meta = paginationMeta(total, automations.length, params.offset);
        if (meta.has_more) {
          lines.push(`*Showing ${automations.length} of ${total}. Use offset=${meta.next_offset} to see more.*`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Automation ──────────────────────────────────────────────
  server.registerTool(
    "mailchimp_get_automation",
    {
      title: "Get Mailchimp Automation Details",
      description: "Get detailed information about a specific classic automation workflow.",
      inputSchema: z.object({
        workflow_id: z.string().min(1).describe("The automation workflow ID"),
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
        const a = await mailchimpRequest<any>(`/automations/${params.workflow_id}`);
        const settings = a.settings ?? {};
        const trigger = a.trigger_settings ?? {};

        const lines = [
          `# Automation: ${settings.title || "(untitled)"}`,
          ``,
          `- **ID**: \`${a.id}\``,
          `- **Status**: ${a.status}`,
          `- **List ID**: \`${a.recipients?.list_id ?? "N/A"}\``,
          `- **From name**: ${settings.from_name ?? "N/A"}`,
          `- **Reply-to**: ${settings.reply_to ?? "N/A"}`,
          `- **Trigger type**: ${trigger.workflow_type ?? "N/A"}`,
          `- **Emails sent**: ${a.emails_sent ?? 0}`,
          `- **Start time**: ${a.start_time ?? "Not started"}`,
          `- **Created**: ${a.create_time ?? "N/A"}`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Automation Emails ──────────────────────────────────────
  server.registerTool(
    "mailchimp_list_automation_emails",
    {
      title: "List Automation Emails",
      description: "List all emails in a specific automation workflow.",
      inputSchema: z.object({
        workflow_id: z.string().min(1).describe("The automation workflow ID"),
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
        const data = await mailchimpRequest<any>(`/automations/${params.workflow_id}/emails`);
        const emails = data.emails ?? [];

        if (!emails.length) {
          return { content: [{ type: "text", text: "No emails in this automation." }] };
        }

        const lines: string[] = [`# Automation Emails`, ``];
        for (const e of emails) {
          const settings = e.settings ?? {};
          lines.push(`## ${settings.subject_line || "(no subject)"}`);
          lines.push(`- **Email ID**: \`${e.id}\``);
          lines.push(`- **Status**: ${e.status}`);
          lines.push(`- **Position**: ${e.position ?? "N/A"}`);
          lines.push(`- **Emails sent**: ${e.emails_sent ?? 0}`);
          lines.push(`- **Open rate**: ${e.report_summary?.open_rate != null ? (e.report_summary.open_rate * 100).toFixed(1) + "%" : "N/A"}`);
          lines.push(`- **Click rate**: ${e.report_summary?.click_rate != null ? (e.report_summary.click_rate * 100).toFixed(1) + "%" : "N/A"}`);
          lines.push(``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Start Automation ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_start_automation",
    {
      title: "Start Mailchimp Automation",
      description: "Start all emails in a classic automation workflow.",
      inputSchema: z.object({
        workflow_id: z.string().min(1).describe("The automation workflow ID to start"),
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
        await mailchimpRequest(`/automations/${params.workflow_id}/actions/start-all-emails`, "POST");
        return { content: [{ type: "text", text: `Automation \`${params.workflow_id}\` started.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Pause Automation ────────────────────────────────────────────
  server.registerTool(
    "mailchimp_pause_automation",
    {
      title: "Pause Mailchimp Automation",
      description: "Pause all emails in a classic automation workflow.",
      inputSchema: z.object({
        workflow_id: z.string().min(1).describe("The automation workflow ID to pause"),
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
        await mailchimpRequest(`/automations/${params.workflow_id}/actions/pause-all-emails`, "POST");
        return { content: [{ type: "text", text: `Automation \`${params.workflow_id}\` paused.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Start Automation Email ──────────────────────────────────────
  server.registerTool(
    "mailchimp_start_automation_email",
    {
      title: "Start Individual Automation Email",
      description: "Start a specific email within a classic automation workflow.",
      inputSchema: z.object({
        workflow_id: z.string().min(1).describe("The automation workflow ID"),
        email_id: z.string().min(1).describe("The automation email ID to start"),
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
        await mailchimpRequest(
          `/automations/${params.workflow_id}/emails/${params.email_id}/actions/start`,
          "POST"
        );
        return { content: [{ type: "text", text: `Automation email \`${params.email_id}\` started.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Pause Automation Email ──────────────────────────────────────
  server.registerTool(
    "mailchimp_pause_automation_email",
    {
      title: "Pause Individual Automation Email",
      description: "Pause a specific email within a classic automation workflow.",
      inputSchema: z.object({
        workflow_id: z.string().min(1).describe("The automation workflow ID"),
        email_id: z.string().min(1).describe("The automation email ID to pause"),
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
        await mailchimpRequest(
          `/automations/${params.workflow_id}/emails/${params.email_id}/actions/pause`,
          "POST"
        );
        return { content: [{ type: "text", text: `Automation email \`${params.email_id}\` paused.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Automation Email Queue ─────────────────────────────────
  server.registerTool(
    "mailchimp_list_automation_queue",
    {
      title: "List Automation Email Queue",
      description: "List subscribers in the queue for a specific automation email.",
      inputSchema: z.object({
        workflow_id: z.string().min(1).describe("The automation workflow ID"),
        email_id: z.string().min(1).describe("The automation email ID"),
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
          `/automations/${params.workflow_id}/emails/${params.email_id}/queue`
        );
        const queue = data.queue ?? [];

        if (!queue.length) {
          return { content: [{ type: "text", text: "No subscribers in the queue for this automation email." }] };
        }

        const lines: string[] = [`# Automation Email Queue`, ``, `${queue.length} subscriber(s) queued.`, ``];
        for (const item of queue) {
          lines.push(`- **${item.email_address}** — next send: ${item.next_send ?? "N/A"}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Remove Subscriber from Automation ───────────────────────────
  server.registerTool(
    "mailchimp_remove_automation_subscriber",
    {
      title: "Remove Subscriber from Automation",
      description:
        "Remove a subscriber from a classic automation workflow. " +
        "The subscriber will no longer receive emails from this automation.",
      inputSchema: z.object({
        workflow_id: z.string().min(1).describe("The automation workflow ID"),
        email_address: z.string().email().describe("The subscriber's email address to remove"),
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
        await mailchimpRequest(
          `/automations/${params.workflow_id}/removed-subscribers`,
          "POST",
          { email_address: params.email_address }
        );
        return {
          content: [{
            type: "text",
            text: `Subscriber \`${params.email_address}\` removed from automation \`${params.workflow_id}\`.`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
