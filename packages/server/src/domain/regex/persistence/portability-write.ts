// domain/regex/persistence/portability-write — the four portability factories (contract/portability.ts):
// the card LIFT, the card RE-EMBED, and the backup-bundle export/import pair. Standalone factories (db +
// clock + id minter only) so the import path can be wired at compose without dragging the whole service.
//
// QUERIES-ONLY, by the rule the `persistence-no-in-memory-state` gate enforces: every file here reads and
// writes, and the DECISION about what to write lives in `substrate/dedup` (which owns the dedup rule and
// the in-memory index it needs). The shape is read → plan → ONE batch: a lift that half-minted its rows
// before failing to attach them would leave the library with orphan scripts and the card with none.

import type { PortableRegexScript } from "@orb/contracts/regex";
import { characterRegexScripts, globalRegexScripts, regexScripts } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { DomainOperationError } from "@orb/kit/errors";
import { slugifyHandle } from "@orb/kit/slug";
import { and, asc, eq } from "drizzle-orm";
import { portableParseError } from "#kit/serde/lib";
import { buildRegexScriptFile, parseRegexScriptFile, REGEX_SCRIPT_SCHEMA_KIND } from "#kit/serde/regex";
import type {
  ExportCardScripts,
  ExportedRegexScriptFile,
  ExportRegexScripts,
  ImportCardScripts,
  ImportCardScriptsResult,
  ImportRegexScript,
  RegexPortabilityContext,
} from "../contract/portability.ts";
import { findDuplicate, planCardLift, splitScript } from "../substrate/dedup.ts";
import { listOwnedScripts, loadOwnedScriptsByIds, toRow } from "./queries.ts";

/**
 * The card LIFT (the `importLorebook` twin). Reads the owner's library + the carried references THIS owner
 * actually holds, hands both to the pure planner, and writes its verdict in one batch. The attachment order
 * IS the plan's `attachIds` order (index = junction `position`), so a character's execution order is the
 * card's own script order.
 */
export function createImportCardScripts(ctx: RegexPortabilityContext): ImportCardScripts {
  return async ({ ownerId, characterId, scripts, carried }): Promise<ImportCardScriptsResult> => {
    // Owner-gated: a carried id naming a row this owner does not have simply does not come back, so the
    // reference channel can never launder a foreign script onto this character.
    const [carriedRows, existing] = await Promise.all([loadOwnedScriptsByIds(ctx.db, ownerId, carried), listOwnedScripts(ctx.db, ownerId)]);

    const plan = planCardLift({
      existing: existing.map(toRow),
      carriedIds: carriedRows.map((r) => r.id),
      scripts,
      mintId: ctx.newScriptId,
    });

    const at = ctx.now();
    const stmts: BatchStmt[] = [
      ...plan.inserts.map((row) =>
        ctx.db.insert(regexScripts).values({ id: row.id, ownerId, name: row.name, enabled: row.enabled, behavior: row.behavior, createdAt: at }),
      ),
      ...plan.attachIds.map((regexScriptId, position) =>
        ctx.db.insert(characterRegexScripts).values({ characterId, regexScriptId, position, createdAt: at }).onConflictDoNothing(),
      ),
    ];
    if (stmts.length > 0) {
      await ctx.db.batch(batchMany(stmts));
    }
    return { created: plan.inserts.length, reused: plan.reused };
  };
}

/** The card RE-EMBED: the character's attached rows, in junction order, projected onto the ST card wire +
 *  the reference list the same-install re-import re-links by. */
export function createExportCardScripts(ctx: Pick<RegexPortabilityContext, "db">): ExportCardScripts {
  return async ({ ownerId, characterId }) => {
    const rows = await ctx.db
      .select({ script: regexScripts })
      .from(characterRegexScripts)
      .innerJoin(regexScripts, eq(characterRegexScripts.regexScriptId, regexScripts.id))
      .where(and(eq(characterRegexScripts.characterId, characterId), eq(regexScripts.ownerId, ownerId)))
      .orderBy(asc(characterRegexScripts.position), asc(regexScripts.createdAt));
    const scripts = rows.map((r) => toRow(r.script));
    return { scripts, carried: scripts.map((s) => s.id) };
  };
}

/** The backup-bundle EXPORT half — one `regex/<slug>-<id>.json` per owned script. The GLOBAL attachment
 *  rides in the file (it is a property of the script); the other three scopes point at rows the bundle can't
 *  guarantee and are therefore not carried. */
export function createExportRegexScripts(ctx: Pick<RegexPortabilityContext, "db">): ExportRegexScripts {
  return async ({ ownerId }): Promise<readonly ExportedRegexScriptFile[]> => {
    const records = await listOwnedScripts(ctx.db, ownerId);
    // Owner-scoped through the join (never a bare table scan of a junction the caller doesn't own).
    const globalRows = await ctx.db
      .select({ id: globalRegexScripts.regexScriptId })
      .from(globalRegexScripts)
      .innerJoin(regexScripts, eq(globalRegexScripts.regexScriptId, regexScripts.id))
      .where(eq(regexScripts.ownerId, ownerId));
    const globalIds: readonly string[] = globalRows.map((r) => r.id);
    return records.map((record): ExportedRegexScriptFile => {
      const { id, name, enabled, ...behavior } = toRow(record);
      const payload: PortableRegexScript = { name, enabled, ...behavior, global: globalIds.includes(id) };
      return { filename: `${slugifyHandle(name)}-${id}.json`, bytes: buildRegexScriptFile(payload) };
    });
  };
}

/** The backup-bundle IMPORT half — one file, dedup-gated by the shared rule. Re-importing the same bundle
 *  twice writes nothing the second time; a file whose script is already in the library only (re)asserts its
 *  GLOBAL attachment. */
export function createImportRegexScript(ctx: RegexPortabilityContext): ImportRegexScript {
  return async ({ ownerId, bytes }): Promise<{ readonly created: boolean }> => {
    const parsed = parseRegexScriptFile(bytes);
    if (!parsed.ok) {
      throw new DomainOperationError("regex_script_unparseable", portableParseError(REGEX_SCRIPT_SCHEMA_KIND, parsed.reason));
    }
    const payload = parsed.value;
    const candidate = splitScript(payload);
    const existing = await listOwnedScripts(ctx.db, ownerId);
    const match = findDuplicate(existing.map(toRow), candidate);
    const at = ctx.now();
    const id = match ?? ctx.newScriptId();
    const stmts: BatchStmt[] =
      match === null
        ? [ctx.db.insert(regexScripts).values({ id, ownerId, name: candidate.name, enabled: candidate.enabled, behavior: candidate.behavior, createdAt: at })]
        : [];
    if (payload.global) {
      stmts.push(ctx.db.insert(globalRegexScripts).values({ regexScriptId: id, createdAt: at }).onConflictDoNothing());
    }
    if (stmts.length > 0) {
      await ctx.db.batch(batchMany(stmts));
    }
    return { created: match === null };
  };
}
