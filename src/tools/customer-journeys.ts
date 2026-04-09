import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";

export function registerCustomerJourneyTools(server: McpServer): void {
  // ── Trigger Journey Step ────────────────────────────────────────
  server.registerTool(
    "mailchimp_trigger_journey_step",
    {
      title: "Trigger Customer Journey Step",
      description:
        "Trigger a specific step in a Customer Journey for a contact. " +
        "Use this to programmatically add contacts to a journey at a specific step. " +
        "You need the journey ID and step ID from the Mailchimp UI.",
      inputSchema: z.object({
        journey_id: z.number().int().min(1).describe("The Customer Journey ID"),
        step_id: z.number().int().min(1).describe("The Journey step ID to trigger"),
        email_address: z.string().email().describe("The contact's email address"),
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
        await mailchimpRequest(
          `/customer-journeys/journeys/${params.journey_id}/steps/${params.step_id}/actions/trigger`,
          "POST",
          { email_address: params.email_address }
        );
        return {
          content: [{
            type: "text",
            text: `Journey step triggered for \`${params.email_address}\` (journey: ${params.journey_id}, step: ${params.step_id}).`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
