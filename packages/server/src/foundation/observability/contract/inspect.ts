// Consumer-owned projections derive the actual service or database row; no parallel shape is declared.

import type { characters } from "@orb/db";

/** The characters table has no updated_at column (D28), so this projection uses createdAt for recency. */
export type CharacterListRow = Pick<typeof characters.$inferSelect, "id" | "name" | "handle" | "createdAt">;
