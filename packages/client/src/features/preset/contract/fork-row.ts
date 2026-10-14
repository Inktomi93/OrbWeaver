// Client-owned projections derive their production wire/input homes; computed presentation data stays local.

import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

export type PresetForkRow = Pick<inferOutput<Trpc["preset"]["list"]>[number], "id" | "name" | "forkedFrom" | "createdAt">;
