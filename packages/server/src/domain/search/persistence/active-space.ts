// Read the immutable active encoder generation for one owner and logical task.

import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { ReadOnlyDb } from "@orb/db";
import { embedGenerations, embedGenerationTargets, embedSpaceState } from "@orb/db";
import type { EmbedGenerationId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";

interface ActiveGenerationRow {
  readonly id: EmbedGenerationId;
  readonly task: "embed" | "imageEmbed";
  readonly via: "embed" | "imageEmbed";
  readonly connectionId: string | null;
  readonly fingerprint: string;
  readonly space: string;
}

type GenerationRead =
  | { readonly status: "unrecorded" }
  | { readonly status: "moving" }
  | { readonly status: "ready"; readonly generation: ActiveGenerationRow };

export async function readGeneration(db: ReadOnlyDb, ownerId: UserId, task: "embed" | "imageEmbed"): Promise<GenerationRead> {
  const states = await db
    .select({ scope: embedSpaceState.scope, generationId: embedSpaceState.activeGenerationId, candidateGenerationId: embedSpaceState.candidateGenerationId })
    .from(embedSpaceState)
    .where(eq(embedSpaceState.ownerId, ownerId));
  const required = VECTOR_SCOPES_BY_TASK[task];
  const relevant = states.filter((row) => required.includes(row.scope));
  const ids = required.map((scope) => relevant.find((row) => row.scope === scope)?.generationId ?? null);
  const id = ids[0];
  let selected = id;
  if (selected === null || selected === undefined || ids.some((candidate) => candidate !== selected)) {
    if (relevant.some((row) => row.generationId !== null || row.candidateGenerationId !== null)) {
      return { status: "moving" };
    }
    const target = await db
      .select({ generationId: embedGenerationTargets.generationId })
      .from(embedGenerationTargets)
      .where(and(eq(embedGenerationTargets.ownerId, ownerId), eq(embedGenerationTargets.task, task)))
      .limit(1);
    selected = target[0]?.generationId;
    if (selected !== undefined) {
      return { status: "moving" };
    }
  }
  if (selected === undefined) {
    return { status: "unrecorded" };
  }
  const rows = await db
    .select({
      id: embedGenerations.id,
      task: embedGenerations.task,
      via: embedGenerations.via,
      connectionId: embedGenerations.connectionId,
      fingerprint: embedGenerations.fingerprint,
      space: embedGenerations.space,
    })
    .from(embedGenerations)
    .where(and(eq(embedGenerations.id, selected), eq(embedGenerations.ownerId, ownerId)))
    .limit(1);
  const generation = rows[0];
  return generation === undefined ? { status: "moving" } : { status: "ready", generation };
}

export async function readActiveGeneration(db: ReadOnlyDb, ownerId: UserId, task: "embed" | "imageEmbed"): Promise<ActiveGenerationRow | null> {
  const read = await readGeneration(db, ownerId, task);
  return read.status === "ready" ? read.generation : null;
}
