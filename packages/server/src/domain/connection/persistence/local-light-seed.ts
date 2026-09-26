// The local-light CONVENIENCE SEED (inference program §7.2): every user gets the two in-process vector rows —
// the encoder (jina-clip-v2) and the reranker (MiniLM) of `LOCAL_LIGHT_SEED_ROWS` — as ORDINARY `user_connections`
// plus their two `user` bindings (`embed`, `rerank`). Not a special row: a user who deletes them reads
// `no-connection` on search like any other unset task and re-adds them from the picker.
//
// IDEMPOTENT by the `(owner_id, seed_slot)` unique, never by the label, so a relabel renames rows instead of adding
// them. A row seeded before the slot existed is adopted in place: the unslotted local-light row on the seed's model
// that the user's binding for that task points at gets the slot and today's label, and keeps its binding. Then one
// `onConflictDoNothing` insert for the slots still empty and one insert of the bindings still missing. A re-pointed
// binding is the user's and is never overwritten. This function throws only on a db error.

import type { LocalLightSeedSlot, ProviderId, RoutableTask } from "@orb/contracts/inference";
import { builtinProvider, LOCAL_LIGHT_SEED_ROWS, modelIdSchema } from "@orb/contracts/inference";
import { connectionBindings, userConnections } from "@orb/db";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { UserId } from "@orb/kit/ids";
import { and, eq, inArray, isNull, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { LocalLightSeedDeps } from "../contract/params.ts";
import type { LocalLightSeedResult } from "../contract/results.ts";

function localLightProviderId(): ProviderId {
  const provider = builtinProvider("local-light");
  if (provider === undefined) {
    throw new Error("the local-light connection seed requires its built-in provider registry row");
  }
  return provider.id;
}

const LOCAL_LIGHT_PROVIDER_ID = localLightProviderId();
const SEED_SLOTS: readonly LocalLightSeedSlot[] = LOCAL_LIGHT_SEED_ROWS.map((row) => row.task);
const SEED_TASKS: readonly RoutableTask[] = SEED_SLOTS;
const taken = alias(userConnections, "seed_slot_taken");

/** Give each empty slot the user's pre-slot seeded row for it: the unslotted local-light row on the seed's model
 *  that their binding for the task points at. Skipped when the slot is filled or today's label is already in use. */
async function adoptEarlierSeedRows(deps: LocalLightSeedDeps, ownerId: UserId, now: number): Promise<void> {
  const { db } = deps;
  const adoptions = LOCAL_LIGHT_SEED_ROWS.map((seed) => {
    const boundRow = db
      .select({ id: connectionBindings.connectionId })
      .from(connectionBindings)
      .where(and(eq(connectionBindings.actorKind, "user"), eq(connectionBindings.userId, ownerId), eq(connectionBindings.task, seed.task)));
    const slotOrLabelInUse = db
      .select({ id: taken.id })
      .from(taken)
      .where(and(eq(taken.ownerId, ownerId), or(eq(taken.seedSlot, seed.task), eq(taken.label, seed.label))));
    return batchStmt(
      db
        .update(userConnections)
        .set({ seedSlot: seed.task, label: seed.label, updatedAt: now })
        .where(
          and(
            eq(userConnections.ownerId, ownerId),
            eq(userConnections.providerId, LOCAL_LIGHT_PROVIDER_ID),
            eq(userConnections.model, modelIdSchema.parse(seed.model)),
            isNull(userConnections.seedSlot),
            inArray(userConnections.id, boundRow),
            notExists(slotOrLabelInUse),
          ),
        ),
    );
  });
  await db.batch(batchMany(adoptions));
}

/** Seed ONE user's two local-light rows + bindings. Returns how many connection rows were newly inserted and
 *  which tasks this call newly bound. */
export async function seedLocalLightConnections(deps: LocalLightSeedDeps, ownerId: UserId): Promise<LocalLightSeedResult> {
  const { db } = deps;
  const now = deps.now();
  await adoptEarlierSeedRows(deps, ownerId, now);
  const inserted = await db
    .insert(userConnections)
    .values(
      LOCAL_LIGHT_SEED_ROWS.map((seed) => ({
        id: deps.newConnectionId(),
        ownerId,
        label: seed.label,
        seedSlot: seed.task,
        providerId: LOCAL_LIGHT_PROVIDER_ID,
        credentialId: null,
        baseUrl: null,
        model: modelIdSchema.parse(seed.model),
        api: "auto" as const,
        declared: null,
        extras: null,
        transport: null,
        // The seed model is a member of the built-in catalog by construction.
        modelCheck: "listed" as const,
        // The vector tasks are background spend by definition (search indexing runs unattended); the seeded
        // rows are keyless and free, so the flag is on — the picker's explicit switch governs a real key.
        allowBackground: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
    // Untargeted: a filled slot, or a user row already holding today's label, both leave that seed row out.
    .onConflictDoNothing()
    .returning({ id: userConnections.id });
  // The rows by slot — this call's, an adopted one, or an earlier seed's — and the tasks the user already bound.
  const rows = await db
    .select({ id: userConnections.id, seedSlot: userConnections.seedSlot })
    .from(userConnections)
    .where(and(eq(userConnections.ownerId, ownerId), inArray(userConnections.seedSlot, SEED_SLOTS)));
  const bound = await db
    .select({ task: connectionBindings.task })
    .from(connectionBindings)
    .where(and(eq(connectionBindings.actorKind, "user"), eq(connectionBindings.userId, ownerId), inArray(connectionBindings.task, SEED_TASKS)));
  // @orb-waive persistence-no-in-memory-state(Set): query-local membership set over the binding rows this query just returned. Ends if it outlives the call.
  const boundTasks = new Set(bound.map((row) => row.task));
  // @orb-waive persistence-no-in-memory-state(Map): query-local slot→id index over the row set this query just returned. Ends if it outlives the call.
  const idBySlot = new Map(rows.map((row) => [row.seedSlot, row.id]));
  const missing = LOCAL_LIGHT_SEED_ROWS.flatMap((seed) => {
    const connectionId = idBySlot.get(seed.task);
    return boundTasks.has(seed.task) || connectionId === undefined
      ? []
      : [{ id: deps.newBindingId(), actorKind: "user" as const, userId: ownerId, ruleId: null, pluginId: null, task: seed.task, connectionId }];
  });
  const newlyBound =
    missing.length > 0 ? await db.insert(connectionBindings).values(missing).onConflictDoNothing().returning({ task: connectionBindings.task }) : [];
  return { inserted: inserted.length, boundTasks: newlyBound.map((row) => row.task) };
}
