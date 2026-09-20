// Stable, non-secret identity for the concrete encoder configuration that produced a vector generation.

import { stableStringify } from "@orb/kit/stable-stringify";
import { sha256Hex } from "#kit/content-hash";

interface EmbeddingConnectionIdentity {
  readonly connectionId: unknown;
  readonly providerId: unknown;
  readonly model: string;
  readonly api: unknown;
  readonly wire: unknown;
  readonly baseUrl: unknown;
  readonly capability: unknown;
  readonly features: unknown;
  readonly extras: unknown;
  readonly transport: unknown;
}

export function connectionFingerprint(connection: EmbeddingConnectionIdentity): string {
  return sha256Hex(
    stableStringify({
      connectionId: connection.connectionId,
      providerId: connection.providerId,
      model: connection.model,
      api: connection.api,
      wire: connection.wire,
      baseUrl: connection.baseUrl,
      capability: connection.capability,
      features: connection.features,
      extras: connection.extras,
      transport: connection.transport,
    }),
  );
}

/** Compatibility identity for vector comparison. Distinct user connection rows may serve the same
 * provider/endpoint configuration, so connectionId is deliberately excluded. */
export function vectorSpaceFingerprint(connection: EmbeddingConnectionIdentity): string {
  return sha256Hex(
    stableStringify({
      providerId: connection.providerId,
      model: connection.model,
      api: connection.api,
      wire: connection.wire,
      baseUrl: connection.baseUrl,
      capability: connection.capability,
      features: connection.features,
      extras: connection.extras,
      transport: connection.transport,
    }),
  );
}

export function generationIdOf(params: {
  readonly ownerId: unknown;
  readonly task: "embed" | "imageEmbed";
  readonly via: "embed" | "imageEmbed";
  readonly connection: EmbeddingConnectionIdentity;
  readonly space: string;
}): string {
  const { ownerId, task, via, connection, space } = params;
  return sha256Hex(stableStringify({ ownerId, task, via, connectionId: connection.connectionId, fingerprint: connectionFingerprint(connection), space }));
}
