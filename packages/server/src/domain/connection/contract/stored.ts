// Read JSON bytes only after owner admission; a corrupt row never produces a stand-in a write can persist.

import type { UserConnection } from "@orb/contracts/inference";
import { declaredCapabilitySchema, SUMMARIZE_CONCURRENCY_MAX, userConnectionSchema } from "@orb/contracts/inference";
import type { userConnections } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import { z } from "zod";
import { STORED_CONFIG_UNREADABLE } from "#primitives/stored-config";

const CONNECTION_JSON_FIELDS = ["declared", "extras", "transport", "promptCache"] as const satisfies readonly (keyof UserConnection)[];
type ConnectionJsonField = (typeof CONNECTION_JSON_FIELDS)[number];
type ConnectionRow = typeof userConnections.$inferSelect;
export type StoredConnectionRow = Pick<ConnectionRow, Exclude<keyof ConnectionRow, ConnectionJsonField>> & Record<ConnectionJsonField, string | null>;

const featuresSchema = declaredCapabilitySchema.shape.features.unwrap();
const storedDeclaredSchema = declaredCapabilitySchema.extend({
  features: featuresSchema
    .extend({
      concurrency: featuresSchema.shape.concurrency
        .unwrap()
        .extend({
          summarize: z
            .int()
            .positive()
            .transform((value) => Math.min(value, SUMMARIZE_CONCURRENCY_MAX))
            .optional(),
        })
        .optional(),
    })
    .optional(),
});
const storedConnectionSchema = userConnectionSchema.extend({ declared: storedDeclaredSchema.nullable() });

function columnJson(text: string | null): unknown {
  return text === null ? null : JSON.parse(text);
}

/** Parse the stored row without rewriting bytes; only the documented old summarize cap is normalized. */
export function parseStoredConnection(row: StoredConnectionRow): UserConnection {
  try {
    const normalized = storedConnectionSchema.parse({
      ...row,
      declared: columnJson(row.declared),
      extras: columnJson(row.extras),
      transport: columnJson(row.transport),
      promptCache: columnJson(row.promptCache),
    });
    return userConnectionSchema.parse(normalized);
  } catch {
    // biome-ignore lint/style/useErrorCause: Raw parser errors may contain stored credential material; this public refusal intentionally excludes their cause.
    throw new DomainOperationError(STORED_CONFIG_UNREADABLE, "The stored connection could not be read. The existing row is untouched.");
  }
}
