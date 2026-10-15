// Seed vectors substitute only for their matching local-light encoder; generation validation remains in store.

import { findSeedEmbedding } from "@orb/default-content";
import type { EmbeddingsContext } from "../contract/service.ts";

/** Resolve the packaged local-light seed vector, or leave encoding to the live provider. */
export const precomputedSeedEmbedding: NonNullable<EmbeddingsContext["precomputedEmbedding"]> = (hash, space, kind, connection) =>
  connection.execution.seedVectors ? findSeedEmbedding(hash, space, kind) : null;
