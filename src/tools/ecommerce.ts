import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mailchimpRequest, handleApiError } from "../services/mailchimp-client.js";
import { PaginationSchema, paginationMeta } from "../schemas/common.js";

export function registerEcommerceTools(server: McpServer): void {
  // ── List Ecommerce Stores ──────────────────────────────────────
  server.registerTool(
    "mailchimp_list_ecommerce_stores",
    {
      title: "List Mailchimp Ecommerce Stores",
      description:
        "List all connected ecommerce stores. Returns store IDs, names, platforms, and domains. " +
        "Use store IDs with other ecommerce tools.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const data = await mailchimpRequest<any>("/ecommerce/stores", "GET");
        const stores = data.stores ?? [];

        if (!stores.length) {
          return { content: [{ type: "text", text: "No ecommerce stores connected." }] };
        }

        const lines: string[] = [`# Ecommerce Stores`, ``, `Found ${stores.length} store(s).`, ``];
        for (const store of stores) {
          lines.push(`## ${store.name}`);
          lines.push(`- **ID**: \`${store.id}\``);
          lines.push(`- **Platform**: ${store.platform || "N/A"}`);
          lines.push(`- **Domain**: ${store.domain || "N/A"}`);
          lines.push(`- **Currency**: ${store.currency || "N/A"}`);
          lines.push(`- **Created**: ${store.created_at ? new Date(store.created_at).toLocaleString() : "N/A"}`);
          lines.push(``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Store Products ────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_store_products",
    {
      title: "List Store Products",
      description:
        "List all products in an ecommerce store. Returns product IDs, names, SKUs, prices, and inventory.",
      inputSchema: PaginationSchema.extend({
        store_id: z.string().min(1).describe("The store ID"),
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

        const data = await mailchimpRequest<any>(
          `/ecommerce/stores/${params.store_id}/products`,
          "GET",
          undefined,
          queryParams
        );
        const products = data.products ?? [];
        const total = data.total_items ?? 0;

        if (!products.length) {
          return { content: [{ type: "text", text: `No products found in store \`${params.store_id}\`.` }] };
        }

        const lines: string[] = [
          `# Store Products: \`${params.store_id}\``,
          ``,
          `Found ${total} product(s).`,
          ``,
        ];

        for (const p of products) {
          lines.push(`## ${p.title || "(untitled)"}`);
          lines.push(`- **ID**: \`${p.id}\``);
          lines.push(`- **SKU**: ${p.sku || "N/A"}`);
          lines.push(`- **Price**: ${p.price ? `$${p.price}` : "N/A"}`);
          lines.push(`- **Inventory**: ${p.inventory ?? "N/A"}`);
          lines.push(`- **URL**: ${p.url || "N/A"}`);
          lines.push(``);
        }

        const meta = paginationMeta(total, products.length, params.offset);
        if (meta.has_more) {
          lines.push(
            `*Showing ${products.length} of ${total}. Use offset=${meta.next_offset} to see more.*`
          );
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Store Orders ──────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_store_orders",
    {
      title: "List Store Orders",
      description:
        "List all orders in an ecommerce store. Optionally filter by campaign ID to see revenue attribution. " +
        "Returns order IDs, customer info, total amounts, and dates.",
      inputSchema: PaginationSchema.extend({
        store_id: z.string().min(1).describe("The store ID"),
        campaign_id: z.string().optional().describe("Optional campaign ID to filter orders for revenue attribution"),
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
        if (params.campaign_id) queryParams.campaign_id = params.campaign_id;

        const data = await mailchimpRequest<any>(
          `/ecommerce/stores/${params.store_id}/orders`,
          "GET",
          undefined,
          queryParams
        );
        const orders = data.orders ?? [];
        const total = data.total_items ?? 0;

        if (!orders.length) {
          return { content: [{ type: "text", text: `No orders found in store \`${params.store_id}\`.` }] };
        }

        const lines: string[] = [
          `# Store Orders: \`${params.store_id}\``,
          ``,
          `Found ${total} order(s).`,
          params.campaign_id ? `(filtered by campaign \`${params.campaign_id}\`)` : "",
          ``,
        ];

        for (const o of orders) {
          lines.push(`## Order ${o.id}`);
          lines.push(`- **Customer**: ${o.customer?.email_address || "N/A"}`);
          lines.push(`- **Total**: $${o.order_total ?? 0}`);
          lines.push(`- **Discount**: $${o.discount_total ?? 0}`);
          lines.push(`- **Tax**: $${o.tax_total ?? 0}`);
          lines.push(`- **Items**: ${o.line_items?.length ?? 0}`);
          lines.push(`- **Order Date**: ${o.processed_at ? new Date(o.processed_at).toLocaleString() : "N/A"}`);
          lines.push(`- **Status**: ${o.fulfillment_status || "N/A"}`);
          lines.push(``);
        }

        const meta = paginationMeta(total, orders.length, params.offset);
        if (meta.has_more) {
          lines.push(
            `*Showing ${orders.length} of ${total}. Use offset=${meta.next_offset} to see more.*`
          );
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── Get Ecommerce Customer ────────────────────────────────────
  server.registerTool(
    "mailchimp_get_ecommerce_customer",
    {
      title: "Get Ecommerce Customer Details",
      description:
        "Get detailed information about a specific customer in an ecommerce store. " +
        "Includes email, name, address, and order history.",
      inputSchema: z.object({
        store_id: z.string().min(1).describe("The store ID"),
        customer_id: z.string().min(1).describe("The customer ID"),
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
          `/ecommerce/stores/${params.store_id}/customers/${params.customer_id}`
        );

        const lines = [
          `# Customer: ${data.email_address || "(unknown)"}`,
          ``,
          `- **ID**: \`${data.id}\``,
          `- **Email**: ${data.email_address || "N/A"}`,
          `- **First Name**: ${data.first_name || "N/A"}`,
          `- **Last Name**: ${data.last_name || "N/A"}`,
          `- **Phone**: ${data.phone || "N/A"}`,
          ``,
          `### Address`,
          `- **Street**: ${data.address?.address1 || "N/A"}`,
          `- **City**: ${data.address?.city || "N/A"}`,
          `- **State**: ${data.address?.province || "N/A"}`,
          `- **Postal Code**: ${data.address?.postal_code || "N/A"}`,
          `- **Country**: ${data.address?.country_code || "N/A"}`,
          ``,
          `### Account Info`,
          `- **Opted In**: ${data.opt_in_status ? "Yes" : "No"}`,
          `- **Total Spent**: $${data.total_spent ?? 0}`,
          `- **Created**: ${data.created_at ? new Date(data.created_at).toLocaleString() : "N/A"}`,
          `- **Last Updated**: ${data.updated_at ? new Date(data.updated_at).toLocaleString() : "N/A"}`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Store Carts ───────────────────────────────────────────
  server.registerTool(
    "mailchimp_list_store_carts",
    {
      title: "List Abandoned Carts",
      description:
        "List abandoned shopping carts in a store. Useful for identifying customers who didn't complete their purchase.",
      inputSchema: PaginationSchema.extend({
        store_id: z.string().min(1).describe("The store ID"),
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

        const data = await mailchimpRequest<any>(
          `/ecommerce/stores/${params.store_id}/carts`,
          "GET",
          undefined,
          queryParams
        );
        const carts = data.carts ?? [];
        const total = data.total_items ?? 0;

        if (!carts.length) {
          return { content: [{ type: "text", text: `No abandoned carts found in store \`${params.store_id}\`.` }] };
        }

        const lines: string[] = [
          `# Abandoned Carts: \`${params.store_id}\``,
          ``,
          `Found ${total} cart(s).`,
          ``,
        ];

        for (const c of carts) {
          lines.push(`## Cart ${c.id}`);
          lines.push(`- **Customer**: ${c.customer?.email_address || "Unknown"}`);
          lines.push(`- **Cart Value**: $${c.cart_total ?? 0}`);
          lines.push(`- **Items**: ${c.line_items?.length ?? 0}`);
          lines.push(`- **Created**: ${c.created_at ? new Date(c.created_at).toLocaleString() : "N/A"}`);
          lines.push(`- **Abandoned At**: ${c.updated_at ? new Date(c.updated_at).toLocaleString() : "N/A"}`);
          lines.push(``);
        }

        const meta = paginationMeta(total, carts.length, params.offset);
        if (meta.has_more) {
          lines.push(
            `*Showing ${carts.length} of ${total}. Use offset=${meta.next_offset} to see more.*`
          );
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── List Store Promo Codes ────────────────────────────────────
  server.registerTool(
    "mailchimp_list_store_promo_codes",
    {
      title: "List Promo Codes",
      description:
        "List all promo codes for a specific promo rule in a store. " +
        "Returns codes, discount amounts, and usage statistics.",
      inputSchema: z.object({
        store_id: z.string().min(1).describe("The store ID"),
        promo_rule_id: z.string().min(1).describe("The promo rule ID"),
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
          `/ecommerce/stores/${params.store_id}/promo-rules/${params.promo_rule_id}/promo-codes`,
          "GET"
        );
        const codes = data.promo_codes ?? [];

        if (!codes.length) {
          return {
            content: [
              {
                type: "text",
                text: `No promo codes found for rule \`${params.promo_rule_id}\`.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `# Promo Codes for Rule \`${params.promo_rule_id}\``,
          ``,
          `Found ${codes.length} code(s).`,
          ``,
        ];

        for (const code of codes) {
          lines.push(`## ${code.code}`);
          lines.push(`- **ID**: \`${code.id}\``);
          lines.push(`- **Discount**: ${code.discount_type === "percent" ? `${code.discount_value}%` : `$${code.discount_value}`}`);
          lines.push(`- **Usage Count**: ${code.usage_count ?? 0}`);
          lines.push(`- **Max Uses**: ${code.max_uses !== null ? code.max_uses : "Unlimited"}`);
          lines.push(`- **Enabled**: ${code.enabled ? "Yes" : "No"}`);
          lines.push(`- **Created**: ${code.created_at ? new Date(code.created_at).toLocaleString() : "N/A"}`);
          lines.push(``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
