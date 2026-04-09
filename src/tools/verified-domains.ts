import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";

export function registerVerifiedDomainTools(server: McpServer): void {
  // ── List Verified Domains ───────────────────────────────────────
  server.registerTool(
    "mailchimp_list_verified_domains",
    {
      title: "List Verified Domains",
      description:
        "List all verified sending domains for the account. " +
        "Shows domain name, verification status, and authentication (DKIM/SPF) status.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const data = await mailchimpRequest<any>("/verified-domains");
        const domains = data.domains ?? [];

        if (!domains.length) {
          return { content: [{ type: "text", text: "No verified domains found." }] };
        }

        const lines: string[] = [`# Verified Domains`, ``, `Found ${domains.length} domain(s).`, ``];
        for (const d of domains) {
          lines.push(`## ${d.domain}`);
          lines.push(`- **Verified**: ${d.verified ? "Yes" : "No"}`);
          lines.push(`- **Authenticated**: ${d.authenticated ? "Yes" : "No"}`);
          lines.push(`- **Verification Email**: ${d.verification_email || "N/A"}`);
          lines.push(`- **Verification Sent**: ${d.verification_sent ?? "N/A"}`);
          lines.push(``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Add Verified Domain ─────────────────────────────────────────
  server.registerTool(
    "mailchimp_add_verified_domain",
    {
      title: "Add Verified Domain",
      description:
        "Add a new domain to verify for sending. Mailchimp will send a verification email to the domain.",
      inputSchema: z.object({
        verification_email: z.string().email().describe("Email address at the domain to receive the verification (e.g., admin@example.com)"),
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
        const data = await mailchimpRequest<any>(
          "/verified-domains",
          "POST",
          { verification_email: params.verification_email }
        );
        return {
          content: [{
            type: "text",
            text:
              `Domain verification initiated!\n\n` +
              `- **Domain**: ${data.domain}\n` +
              `- **Verification email sent to**: ${data.verification_email}\n` +
              `- **Verified**: ${data.verified ? "Yes" : "Not yet"}\n\n` +
              `Check the verification email and use mailchimp_verify_domain to complete verification.`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Verify Domain ───────────────────────────────────────────────
  server.registerTool(
    "mailchimp_verify_domain",
    {
      title: "Verify Domain",
      description:
        "Submit a verification code to verify a domain. " +
        "Use the code from the verification email sent by mailchimp_add_verified_domain.",
      inputSchema: z.object({
        domain_name: z.string().min(1).describe("The domain name to verify (e.g., example.com)"),
        code: z.string().min(1).describe("The verification code from the email"),
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
        const data = await mailchimpRequest<any>(
          `/verified-domains/${params.domain_name}/actions/verify`,
          "POST",
          { code: params.code }
        );
        return {
          content: [{
            type: "text",
            text:
              `Domain verification result:\n\n` +
              `- **Domain**: ${data.domain}\n` +
              `- **Verified**: ${data.verified ? "Yes" : "No"}\n` +
              `- **Authenticated**: ${data.authenticated ? "Yes" : "No"}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Delete Verified Domain ──────────────────────────────────────
  server.registerTool(
    "mailchimp_delete_verified_domain",
    {
      title: "Delete Verified Domain",
      description: "Remove a verified domain from the account.",
      inputSchema: z.object({
        domain_name: z.string().min(1).describe("The domain name to delete (e.g., example.com)"),
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
        await mailchimpRequest(`/verified-domains/${params.domain_name}`, "DELETE");
        return { content: [{ type: "text", text: `Domain \`${params.domain_name}\` removed.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
