// The local-light CONVENIENCE SEED (inference program §7.2): every user gets the two in-process vector rows —
// the encoder (jina-clip-v2) and the reranker (MiniLM) of `LOCAL_LIGHT_SEED_ROWS` — as ORDINARY `user_connections`
// plus their two `user` bindings (`embed`, `rerank`). Not a special row: a user who deletes them reads
// `no-connection` on search like any other unset task and re-adds them from the picker.
//
// IDEMPOTENT by the `(owner_id, label)` unique: one `onConflictDoNothing` insert for BOTH rows, one read of the
// user's existing bindings, one insert of the bindings still missing — three statements, no per-row round
// trips. A boot that runs this for every existing user and a user-create hook that runs it once converge on the
// same two rows; a re-pointed binding is the user's and is never overwritten. This function throws only on a
// db error — the caller decides whether that is a boot warning (it is) or an un-created account (never).

import type { ProviderId, RoutableTask } from "@orb/contracts/inference";
import { builtinProvider, LOCAL_LIGHT_SEED_ROWS, modelIdSchema } from "@orb/contracts/inference";
import { connectionBindings, userConnections } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import type { LocalLightSeedDeps } from "../contract/params.ts";

function localLightProviderId(): ProviderId {
  const provider = builtinProvider("local-light");
  if (provider === undefined) {
    throw new Error("the local-light connection seed requires its built-in provider registry row");
  }
  return provider.id;
}

const LOCAL_LIGHT_PROVIDER_ID = localLightProviderId();
const SEED_LABELS = LOCAL_LIGHT_SEED_ROWS.map((row) => row.label);
const SEED_TASKS: readonly RoutableTask[] = LOCAL_LIGHT_SEED_ROWS.map((row) => row.task);

/** Seed ONE user's two local-light rows + bindings. Returns how many connection rows were newly inserted. */
export async function seedLocalLightConnections(deps: LocalLightSeedDeps, ownerId: UserId): Promise<number> {
  const { db } = deps;
  const now = deps.now();
  const inserted = await db
    .insert(userConnections)
    .values(
      LOCAL_LIGHT_SEED_ROWS.map((seed) => ({
        id: deps.newConnectionId(),
        ownerId,
        label: seed.label,
        providerId: LOCAL_LIGHT_PROVIDER_ID,
        credentialId: null,
        baseUrl: null,
        model: modelIdSchema.parse(seed.model),
        api: "auto" as const,
        declared: null,
        extras: null,
        transport: null,
        modelListed: true,
        // The vector tasks are background spend by definition (search indexing runs unattended); the seeded
        // rows are keyless and free, so the flag is on — the picker's explicit switch governs a real key.
        allowBackground: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing({ target: [userConnections.ownerId, userConnections.label] })
    .returning({ id: userConnections.id });
  // The rows by label — this call's or an earlier seed's — and the tasks the user already bound.
  const rows = await db
    .select({ id: userConnections.id, label: userConnections.label })
    .from(userConnections)
    .where(and(eq(userConnections.ownerId, ownerId), inArray(userConnections.label, SEED_LABELS)));
  const bound = await db
    .select({ task: connectionBindings.task })
    .from(connectionBindings)
    .where(and(eq(connectionBindings.actorKind, "user"), eq(connectionBindings.userId, ownerId), inArray(connectionBindings.task, SEED_TASKS)));
  // @orb-waive persistence-no-in-memory-state(Set): query-local membership set over the binding rows this query just returned. Ends if it outlives the call.
  const boundTasks = new Set(bound.map((row) => row.task));
  // @orb-waive persistence-no-in-memory-state(Map): query-local label→id index over the row set this query just returned. Ends if it outlives the call.
  const idByLabel = new Map(rows.map((row) => [row.label, row.id]));
  const missing = LOCAL_LIGHT_SEED_ROWS.flatMap((seed) => {
    const connectionId = idByLabel.get(seed.label);
    return boundTasks.has(seed.task) || connectionId === undefined
      ? []
      : [{ id: deps.newBindingId(), actorKind: "user" as const, userId: ownerId, ruleId: null, pluginId: null, task: seed.task, connectionId }];
  });
  if (missing.length > 0) {
    await db.insert(connectionBindings).values(missing).onConflictDoNothing();
  }
  return inserted.length;
}
