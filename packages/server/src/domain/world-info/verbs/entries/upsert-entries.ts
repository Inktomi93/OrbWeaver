// verb: upsertEntries — the SHARED, hand-edit-safe machine-writer bulk upsert (D58 satellite; chat-crew-design
// /02 §7, /03 §1; CC-D). The ONE home the chat agents keeper, the rpg lorebook upkeep, and the D46 automation
// writer all inject — none forks a compare/parse copy. Upserts entries by (bookId, title): an existing entry
// with the same title is UPDATED in place (a keeper re-run over the same span replaces its own entry), a new
// title is INSERTED. The hand-edit belt: an existing entry whose CURRENT content no longer hashes to the
// `metadata.provenance.contentHash` the writer last stamped was curated by a human — it is SKIPPED (the host's hand
// always wins). Caller policy (caps, merge-mode, span-stamped titles, mark advance) stays with the caller; the
// SKIP semantic lives here so every consumer inherits it. Keyed entries fire through the normal keyword match.

import type { EntryMetadata, LoreEntryProvenance, UpsertLoreEntryInput, WorldInfoScope } from "@orb/contracts/world-info";
import { entryMetadataSchema } from "@orb/contracts/world-info";
import { worldEntries } from "@orb/db";
import type { ChatId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { resolveEntryScope } from "@orb/kit/world-info";
import { eq } from "drizzle-orm";
import { sha256Hex } from "#kit/content-hash";
import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { UpsertEntriesParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { listBookEntries, listChatIdsForBook, loadOwnedBook } from "../../persistence/queries.ts";

type EntryRow = Awaited<ReturnType<typeof listBookEntries>>[number];

/** One upsert's disposition + (for emits) the entry id & derived scope. `insert` / `update` = a write happened;
 *  `skip` = the hand-edit guard fired (a human curated it). The 3-state axis is inlined on the property (no
 *  cross-file consumer — no importable-tuple obligation). */
interface UpsertOutcome {
  readonly outcome: "insert" | "update" | "skip";
  readonly entryId: WorldEntryId;
  readonly scope: WorldInfoScope;
}

function provenanceOf(input: UpsertLoreEntryInput): LoreEntryProvenance {
  return { contentHash: sha256Hex(input.content), ...(input.span !== undefined ? { span: input.span } : {}) };
}

/** True when a prior entry was hand-edited since the writer last stamped it (stored hash ≠ current content). */
function handEdited(prior: EntryRow): boolean {
  const storedHash = entryMetadataSchema.nullable().catch(null).parse(prior.metadata)?.provenance?.contentHash;
  return storedHash !== undefined && sha256Hex(prior.content) !== storedHash;
}

/** Upsert ONE entry, hand-edit-safe. Returns the outcome + (for emits) the entry id & derived scope. */
async function upsertOne(
  ctx: WorldInfoContext,
  args: { bookId: WorldBookId; input: UpsertLoreEntryInput; prior: EntryRow | undefined; at: number },
): Promise<UpsertOutcome> {
  const { bookId, input, prior, at } = args;
  const keys = input.keys.length > 0 ? [...input.keys] : null;
  const provenance = provenanceOf(input);

  if (prior !== undefined) {
    if (handEdited(prior)) {
      return { outcome: "skip", entryId: prior.id, scope: "keyword" };
    }
    const metadata = entryMetadataSchema.parse({ ...(prior.metadata ?? {}), provenance } satisfies EntryMetadata);
    await ctx.db.update(worldEntries).set({ content: input.content, keys, enabled: true, metadata, updatedAt: at }).where(eq(worldEntries.id, prior.id));
    return { outcome: "update", entryId: prior.id, scope: resolveEntryScope(metadata, keys !== null) };
  }

  const metadata = entryMetadataSchema.parse({ provenance } satisfies EntryMetadata);
  const entryId = ctx.newEntryId();
  await ctx.db.insert(worldEntries).values({
    id: entryId,
    worldBookId: bookId,
    title: input.title,
    description: null,
    content: input.content,
    keys,
    enabled: true,
    priority: 0,
    ignoreBudget: false,
    metadata,
    createdAt: at,
    updatedAt: at,
  });
  return { outcome: "insert", entryId, scope: resolveEntryScope(metadata, keys !== null) };
}

/** Fan `wiEntryAttached` out over every chat the book is attached to (pool-freshness — a keeper entry must be
 *  able to fire in a later turn's WI match). Empty fan-out is correct for an unattached book. */
async function emitEntry(
  emitWiEvent: WorldInfoContext["emitWiEvent"],
  chatIds: readonly ChatId[],
  entryId: WorldEntryId,
  scope: WorldInfoScope,
): Promise<void> {
  for (const chatId of chatIds) {
    // biome-ignore lint/performance/noAwaitInLoops: the chat bus assigns a monotonic seq per emit — sequential fan-out keeps per-chat ordering deterministic (the createEntry precedent).
    await emitWiEvent({ type: "wiEntryAttached", chatId, surface: "chat", entryId, scope });
  }
}

export function createUpsertEntries(ctx: WorldInfoContext): WorldInfoService["upsertEntries"] {
  return async ({ principal, bookId, entries }: UpsertEntriesParams) => {
    const ownerId = principal.userId;
    const book = await loadOwnedBook(ctx.db, ownerId, bookId);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }

    const byTitle = new Map((await listBookEntries(ctx.db, bookId)).map((row: EntryRow) => [row.title, row]));
    const chatIds = await listChatIdsForBook(ctx.db, bookId);
    const at = ctx.now();
    const counts = { inserted: 0, updated: 0, skippedHandEdited: 0 };

    for (const input of entries) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential per-entry upsert (≤ the caller's per-run cap) — a maintenance-time write, not a hot path.
      const { outcome, entryId, scope } = await upsertOne(ctx, { bookId, input, prior: byTitle.get(input.title), at });
      if (outcome === "skip") {
        counts.skippedHandEdited += 1;
        continue;
      }
      counts[outcome === "insert" ? "inserted" : "updated"] += 1;
      await emitEntry(ctx.emitWiEvent, chatIds, entryId, scope);
    }

    if (counts.inserted > 0 || counts.updated > 0) {
      ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
    }
    return counts;
  };
}
