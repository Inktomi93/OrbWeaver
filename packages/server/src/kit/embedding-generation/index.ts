// Stable, non-secret identity for the concrete encoder configuration that produced a vector generation.

import type { Capability } from "@orb/contracts/inference";
import { embedDimsOf } from "@orb/contracts/inference";
import type { EmbedGenerationId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";
import { sha256Hex } from "#kit/content-hash";

interface EmbeddingConnectionIdentity {
  readonly connectionId: unknown;
  readonly providerId: unknown;
  readonly model: string;
  readonly api: unknown;
  readonly wire: unknown;
  readonly baseUrl: unknown;
  readonly capability: Capability;
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

/** The width whose generations hash no width term, so every id minted without one stays valid. */
const LEGACY_GENERATION_DIMS = 1024;

/**
 * The generation id: the concrete encoder configuration plus the width its vectors are written at.
 *
 * @remarks The width joins the hash only when it is not {@link LEGACY_GENERATION_DIMS}. Ids minted without a
 * width term all describe 1024-wide vectors, so a 1024-wide encoder keeps its id and its stored vectors stay
 * readable with no re-index; an encoder at any other width gets its own id and indexes at that width.
 */
export function generationIdOf(params: {
  readonly ownerId: unknown;
  readonly task: "embed" | "imageEmbed";
  readonly via: "embed" | "imageEmbed";
  readonly connection: EmbeddingConnectionIdentity;
  readonly space: string;
}): EmbedGenerationId {
  const { ownerId, task, via, connection, space } = params;
  const dims = embedDimsOf(connection.capability);
  return castId<EmbedGenerationId>(
    sha256Hex(
      stableStringify({
        ownerId,
        task,
        via,
        connectionId: connection.connectionId,
        fingerprint: connectionFingerprint(connection),
        space,
        ...(dims === LEGACY_GENERATION_DIMS ? {} : { dims }),
      }),
    ),
  );
}
