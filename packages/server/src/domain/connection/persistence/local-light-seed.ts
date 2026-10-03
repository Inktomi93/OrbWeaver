// The convenience seed creates two ordinary connections; text and image tasks share the encoder.
// Existing bindings, including explicit null choices, are never overwritten.

import type { LocalLightSeedSlot, ProviderId, RoutableTask } from "@orb/contracts/inference";
import { builtinProvider, LOCAL_LIGHT_SEED_ROWS, modelIdSchema } from "@orb/contracts/inference";
import { connectionBindings, settings, userConnections } from "@orb/db";
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
const SEED_BINDINGS = [
  ...LOCAL_LIGHT_SEED_ROWS.map((seed) => ({ task: seed.task, slot: seed.task })),
  { task: "imageEmbed", slot: "embed" },
] satisfies readonly { readonly task: RoutableTask; readonly slot: LocalLightSeedSlot }[];
const SEED_TASKS: readonly RoutableTask[] = SEED_BINDINGS.map((binding) => binding.task);
const taken = alias(userConnections, "seed_slot_taken");

/** Give each empty slot the user's pre-slot seeded row for it: the unslotted local-light row on the seed's model (or an
 *  earlier seed model) that their binding for the task points at. Skipped when the slot is filled or today's label is already in use. */
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
            // A pre-slot row on an earlier seed model is adopted too; the move below then puts it on today's model.
            inArray(
              userConnections.model,
              [seed.model, ...seed.earlierModels].map((model) => modelIdSchema.parse(model)),
            ),
            isNull(userConnections.seedSlot),
            inArray(userConnections.id, boundRow),
            notExists(slotOrLabelInUse),
          ),
        ),
    );
  });
  await db.batch(batchMany(adoptions));
}

/** The seed's one-shot record that it moved this owner's slot row off the earlier models onto `model`. It lives in
 *  the shared `settings` KV, keyed per owner and per seed model, so the next default change gets a fresh one. */
function movedLatchKey(seed: (typeof LOCAL_LIGHT_SEED_ROWS)[number], ownerId: UserId): string {
  return `local-light-seed:moved:${seed.task}:${seed.model}:${ownerId}`;
}

/** Move each slot row on a model an earlier release seeded onto today's seed model, ONCE per owner. Before this
 *  release the earlier model was the only built-in choice, so no row on it was a pick of it over today's, whatever its
 *  timestamps say. After the move the latch holds, so a later pick of the earlier model (still in the catalog) stays.
 *  The binding points at the row, so a bound role follows it. */
async function moveSeedRowsOffEarlierModels(deps: LocalLightSeedDeps, ownerId: UserId, now: number): Promise<void> {
  const { db } = deps;
  const moves = LOCAL_LIGHT_SEED_ROWS.flatMap((seed) => {
    if (seed.earlierModels.length === 0) {
      return [];
    }
    const key = movedLatchKey(seed, ownerId);
    const latched = db.select({ key: settings.key }).from(settings).where(eq(settings.key, key));
    return [
      batchStmt(
        db
          .update(userConnections)
          .set({ model: modelIdSchema.parse(seed.model), updatedAt: now })
          .where(
            and(
              eq(userConnections.ownerId, ownerId),
              eq(userConnections.providerId, LOCAL_LIGHT_PROVIDER_ID),
              eq(userConnections.seedSlot, seed.task),
              inArray(
                userConnections.model,
                seed.earlierModels.map((model) => modelIdSchema.parse(model)),
              ),
              notExists(latched),
            ),
          ),
      ),
      batchStmt(db.insert(settings).values({ key, value: true, updatedAt: now }).onConflictDoNothing()),
    ];
  });
  await db.batch(batchMany(moves));
}

/** Seed ONE user's two local-light rows + bindings. Returns how many connection rows were newly inserted and
 *  which tasks this call newly bound. */
export async function seedLocalLightConnections(deps: LocalLightSeedDeps, ownerId: UserId): Promise<LocalLightSeedResult> {
  const { db } = deps;
  const now = deps.now();
  await adoptEarlierSeedRows(deps, ownerId, now);
  await moveSeedRowsOffEarlierModels(deps, ownerId, now);
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
    .select({ id: userConnections.id, seedSlot: userConnections.seedSlot, model: userConnections.model, providerId: userConnections.providerId })
    .from(userConnections)
    .where(and(eq(userConnections.ownerId, ownerId), inArray(userConnections.seedSlot, SEED_SLOTS)));
  const bound = await db
    .select({ task: connectionBindings.task })
    .from(connectionBindings)
    .where(and(eq(connectionBindings.actorKind, "user"), eq(connectionBindings.userId, ownerId), inArray(connectionBindings.task, SEED_TASKS)));
  // @orb-waive persistence-no-in-memory-state(Set): query-local membership set over the binding rows this query just returned. Ends if it outlives the call.
  const boundTasks = new Set(bound.map((row) => row.task));
  // @orb-waive persistence-no-in-memory-state(Map): query-local slot→id index over the row set this query just returned. Ends if it outlives the call.
  const rowBySlot = new Map(rows.map((row) => [row.seedSlot, row]));
  const missing = SEED_BINDINGS.flatMap((seed) => {
    const row = rowBySlot.get(seed.slot);
    const editedEncoder = seed.task === "imageEmbed" && (row?.providerId !== LOCAL_LIGHT_PROVIDER_ID || row.model !== LOCAL_LIGHT_SEED_ROWS[0].model);
    return boundTasks.has(seed.task) || row === undefined || editedEncoder
      ? []
      : [{ id: deps.newBindingId(), actorKind: "user" as const, userId: ownerId, ruleId: null, pluginId: null, task: seed.task, connectionId: row.id }];
  });
  const newlyBound =
    missing.length > 0 ? await db.insert(connectionBindings).values(missing).onConflictDoNothing().returning({ task: connectionBindings.task }) : [];
  return { inserted: inserted.length, boundTasks: newlyBound.map((row) => row.task) };
}
