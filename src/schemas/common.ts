import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

/** Reusable pagination schema */
export const PaginationSchema = z.object({
  count: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe("Maximum number of results to return (1–100, default 20)"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination (default 0)"),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;

/** Helper to build pagination metadata for responses */
export function paginationMeta(total: number, count: number, offset: number) {
  return {
    total_items: total,
    count,
    offset,
    has_more: total > offset + count,
    ...(total > offset + count ? { next_offset: offset + count } : {}),
  };
}
