// One-shot codemod for #1772 / #1773 / #914: the two `roster`-spelled FIELDS #1010
// (`rename-roster-participants.ts`, landed at 532758261) deliberately left alone because they belong to
// DIFFERENT vocabulary-map rows than row 44's `participants`.
//
//   • #1772 — vocabulary-map row 45 (`ChatMembership`, the asker's membership role fed to `can()`): every
//     field whose TYPE is `ChatMembership` takes the word `membership`. Row 45's type half landed at
//     #903 C2; only the field half was left behind.
//   • #1773 — vocabulary-map row 41 (the founding / seated CHARACTER IDS an import writes): `characterIds`.
//
// THE RESERVED WORD (do not cross it): `roster` / `Roster` stays the user-facing AND code word for the
// saved TEMPLATE concept — `rosterPreset`, the `roster-preset` family, `rosterPresetsChanged`, "Rosters"
// (map row 48). Nothing below names any of them.
//
// DELIBERATELY OUT OF SCOPE (reported, not renamed — each needs its own row):
//   • `packages/contracts/src/chat/roster.ts` + `rosterMemberSpecSchema` (row 44 residue).
//   • `rosterRows` — the function NAME in `chat/persistence/import-write.ts`; it builds row 44's
//     participant rows, so its word is not this lane's `characterIds`.
//   • `CHAT_OP_CODES.speakerOffRoster` / `"speaker_off_roster"` (client-observable) and the
//     `"roster-card-read"` capability id (its fix string lives in `tooling/`).
//   • the rpg domain's own `roster` family, `domain/persona/verbs/resolve-personas-for-roster.ts`, and the
//     client's `features/chat/lib/roster.ts` + `use-roster-*` hooks.
//   • English PROSE saying "the founding roster" / "roster-scoped" in the import files — that names row
//     44's concept in words, not either field.
//
// TWO PREMISE REPAIRS this codemod also makes, both inside #1772's own concept:
//   • `ChatToolExecFrame.participants` (`chat/contract/context.ts`) — #1010's local `roster→participants`
//     pass reached this PropertySignature, taking row 44's LIST word for a row-45 single-`{role}` value.
//     Row 44's own residue list still says this field's word is `membership`. Repaired here.
//   • `ToolExecutionContext.roster` (`domain/tool-use/contract/params.ts`) — a third row-45 home neither
//     #1010's header nor row 44's residue list enumerated. Leaving it would emit
//     `{ kind: "chat", membership: exec.roster }`, which is half a migration.
//
// Preview:  NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/rename-roster-wire-fields.ts
// Apply:    NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/rename-roster-wire-fields.ts --apply
// (`node` carries no heap floor of its own — a bare invocation dies at ~4GB with exit 134, #1775.)

import process from "node:process";
import type { CodemodContext, Plan, SourceFile } from "@orb/tooling/codemod";
import { Node, printDiagnostics, runCodemod, SyntaxKind } from "@orb/tooling/codemod";

/** A field rename addressed by its OWNING declaration, never by bare name: a file-wide
 *  "first PropertySignature called `roster`" search would silently pick a neighbour the day one is added. */
interface FieldRename {
  readonly file: string;
  /** The `interface` / `type` the property is declared on. */
  readonly owner: string;
  readonly oldName: string;
  readonly newName: string;
  /** Why this field belongs to this lane — printed in the plan description so the preview is self-auditing. */
  readonly why: string;
}

/** #1772 — row 45. Every field below is typed `ChatMembership` (`| null` / `| undefined` arms included). */
const MEMBERSHIP_FIELDS: readonly FieldRename[] = [
  {
    file: "packages/contracts/src/identity/index.ts",
    owner: "ChatResource",
    oldName: "roster",
    newName: "membership",
    why: "the can() chat-resource payload — the key every `{ kind: 'chat', … }` literal spells",
  },
  {
    file: "packages/server/src/domain/chat/contract/context.ts",
    owner: "ChatToolExecFrame",
    oldName: "participants",
    newName: "membership",
    why: "#1010 overshoot: row 44's LIST word landed on a row-45 single-{role} value",
  },
  {
    file: "packages/server/src/domain/chat/contract/results.ts",
    owner: "TurnPrep",
    oldName: "toolRoster",
    newName: "toolMembership",
    why: "the prep's carrier for the same value, threaded into ChatToolExecFrame",
  },
  {
    file: "packages/server/src/domain/tool-use/contract/params.ts",
    owner: "ToolExecutionContext",
    oldName: "roster",
    newName: "membership",
    why: "the tool handler's copy, read by the capability ceiling",
  },
];

/** #1773 — row 41. The wire field and the one mapper deps shape that feeds it. */
const CHARACTER_ID_FIELDS: readonly FieldRename[] = [
  {
    file: "packages/contracts/src/chat/bulk-import.ts",
    owner: "BulkImportChatInput",
    oldName: "roster",
    newName: "characterIds",
    why: "the wire field: the ADDITIONAL character seats beyond the run's primary",
  },
  {
    file: "packages/server/src/domain/import/contract/views.ts",
    owner: "GroupChatInputDeps",
    oldName: "roster",
    newName: "characterIds",
    why: "the ST group mapper's deps field, passed straight into the wire field above",
  },
];

/** File-local PARAMETER names carrying the same two concepts. Renamed so the receiving file stops
 *  spelling a word its own field no longer uses. */
const PARAM_RENAMES: ReadonlyArray<{ readonly file: string; readonly fn: string; readonly oldName: string; readonly newName: string }> = [
  { file: "packages/server/src/domain/admin/guard.ts", fn: "decideChat", oldName: "roster", newName: "membership" },
  // NOT `characterIds`: the one call site in this file already binds that word for the RESULT
  // (`characterIds: seatedCharacterIds(characterId, …)`), and this parameter holds only the EXTRAS beyond
  // the primary. A truer word, not a suppressed collision (the #1010 `fork.ts`/`sourceParticipants` precedent).
  { file: "packages/server/src/domain/chat/persistence/import-write.ts", fn: "seatedCharacterIds", oldName: "roster", newName: "additionalCharacterIds" },
];

/**
 * Local `const`s whose only job is to be passed as one of the renamed fields THROUGH A SHORTHAND
 * (`{ …, roster }`). Measured on the first dry run, not anticipated: the language service rewrites the
 * shorthand's KEY and leaves the binding alone, which lands `{ characterIds }` beside `const roster = …`
 * — TS18004 + TS6133, and the harness refuses the apply. Renaming the binding is the fix; widening the
 * shorthand back to `characterIds: roster` would keep the old word alive at the call site.
 */
const VARIABLE_RENAMES: ReadonlyArray<{ readonly file: string; readonly oldName: string; readonly newName: string }> = [
  { file: "packages/server/src/domain/import/verbs/import-group-chats.ts", oldName: "roster", newName: "characterIds" },
  { file: "tests/server/domain/tool-use/substrate/capability.test.ts", oldName: "roster", newName: "membership" },
];

/** How many rename passes one (file, name) pair may take before we call it a loop. Each pass removes at
 *  least one declaration of `oldName`, so the cap is a guard against a rename that silently no-ops. */
const MAX_RENAME_PASSES = 32;

/** The first still-unrenamed `VariableDeclaration` named `oldName`. Re-queried after every rename:
 *  `rename()` re-parses the file, which invalidates every node held across it (the kit's §13 footgun). */
function findVariableDeclaration(sf: SourceFile, oldName: string): Node | null {
  for (const decl of sf.getVariableDeclarations()) {
    if (decl.getName() === oldName) {
      return decl;
    }
  }
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    if (decl.getName() === oldName) {
      return decl;
    }
  }
  return null;
}

/** Rename every binding of `oldName` in ONE file, one language-service pass at a time. Returns the count. */
function renameOneVariableGroup(ctx: CodemodContext, sf: SourceFile, target: (typeof VARIABLE_RENAMES)[number]): number {
  let passes = 0;
  for (;;) {
    const decl = findVariableDeclaration(sf, target.oldName);
    if (decl === null) {
      return passes;
    }
    passes += 1;
    if (passes > MAX_RENAME_PASSES) {
      throw new Error(`renameVariables: ${target.file} still declares "${target.oldName}" after ${MAX_RENAME_PASSES} passes`);
    }
    if (!Node.isRenameable(decl)) {
      throw new Error(`renameVariables: the "${target.oldName}" binding in ${target.file} is not renameable`);
    }
    if (Node.isReferenceFindable(decl)) {
      for (const ref of decl.findReferencesAsNodes()) {
        ctx.snapshot(ref.getSourceFile());
      }
    }
    decl.rename(target.newName);
  }
}

/** Rename the shorthand-carrying local bindings listed in {@link VARIABLE_RENAMES}. */
function renameVariables(targets: typeof VARIABLE_RENAMES): Plan {
  return {
    description: `Rename ${targets.length} shorthand-carrying local binding(s) — ${targets.map((t) => `${t.oldName}→${t.newName}`).join(", ")}`,
    touchedFiles: targets.map((t) => t.file),
    transform(innerCtx): void {
      for (const target of targets) {
        const sf = innerCtx.project.getSourceFile(target.file);
        if (sf === undefined) {
          throw new Error(`renameVariables: ${target.file} is not in the project`);
        }
        const passes = renameOneVariableGroup(innerCtx, sf, target);
        if (passes === 0) {
          throw new Error(`renameVariables: ${target.file} declares no variable "${target.oldName}"`);
        }
        innerCtx.log(`  ${target.file}: ${target.oldName} → ${target.newName} (${passes} binding${passes === 1 ? "" : "s"})`);
      }
    },
  };
}

/** Locate the PropertySignature `oldName` on the interface `owner` in `sf`. Throws rather than no-ops: a
 *  rename that silently found nothing is the failure mode the harness's dry run cannot show you. */
function findOwnedProperty(sf: SourceFile, target: FieldRename): Node {
  const decl = sf.getInterface(target.owner);
  if (decl === undefined) {
    throw new Error(`renameFields: ${target.file} declares no interface "${target.owner}"`);
  }
  const prop = decl.getProperty(target.oldName);
  if (prop === undefined) {
    throw new Error(`renameFields: ${target.owner} in ${target.file} has no property "${target.oldName}"`);
  }
  return prop;
}

/**
 * Rename interface FIELDS through the language service.
 *
 * `renameExportedSymbol` cannot reach a field — it resolves the EXPORTED declaration (the interface), and
 * a property is a member of it, not an export of the file. The LS's `rename()` on the PropertySignature is
 * the right instrument and the only one that follows all three reference shapes at once: the object-literal
 * KEY (`{ kind: "chat", roster: … }`), the property ACCESS (`exec.roster`, `ci.roster`), and the shorthand.
 * A text sweep over `roster:` would have hit 60+ unrelated keys across the client and the rpg domain.
 *
 * The blast radius is only knowable at transform time, so each declaration's own reference set is declared
 * (`ctx.snapshot`) immediately before its rename — the seam `run.ts` documents for exactly this.
 */
function renameFields(label: string, targets: readonly FieldRename[]): Plan {
  return {
    description: `${label}: rename ${targets.length} interface field(s) — ${targets.map((t) => `${t.owner}.${t.oldName}→${t.newName}`).join(", ")}`,
    touchedFiles: targets.map((t) => t.file),
    transform(innerCtx): void {
      for (const target of targets) {
        const sf = innerCtx.project.getSourceFile(target.file);
        if (sf === undefined) {
          throw new Error(`renameFields: ${target.file} is not in the project`);
        }
        const prop = findOwnedProperty(sf, target);
        if (!Node.isRenameable(prop)) {
          throw new Error(`renameFields: ${target.owner}.${target.oldName} is not renameable (${prop.getKindName()})`);
        }
        if (!Node.isReferenceFindable(prop)) {
          throw new Error(`renameFields: ${target.owner}.${target.oldName} has no reference set (${prop.getKindName()})`);
        }
        const refs = prop.findReferencesAsNodes();
        for (const ref of refs) {
          innerCtx.snapshot(ref.getSourceFile());
        }
        prop.rename(target.newName);
        innerCtx.log(`  ${target.owner}.${target.oldName} → ${target.newName} (${refs.length} reference site(s)) — ${target.why}`);
      }
    },
  };
}

/** Rename a named function's parameter. Same LS instrument, addressed by (file, function, parameter) so the
 *  target is unambiguous in a file that binds the word more than once. */
function renameParams(targets: typeof PARAM_RENAMES): Plan {
  return {
    description: `Rename ${targets.length} function parameter(s) — ${targets.map((t) => `${t.fn}(${t.oldName}→${t.newName})`).join(", ")}`,
    touchedFiles: targets.map((t) => t.file),
    transform(innerCtx): void {
      for (const target of targets) {
        const sf = innerCtx.project.getSourceFile(target.file);
        if (sf === undefined) {
          throw new Error(`renameParams: ${target.file} is not in the project`);
        }
        const fn = sf.getFunction(target.fn);
        if (fn === undefined) {
          throw new Error(`renameParams: ${target.file} declares no function "${target.fn}"`);
        }
        const param = fn.getParameter(target.oldName);
        if (param === undefined) {
          throw new Error(`renameParams: ${target.fn} in ${target.file} has no parameter "${target.oldName}"`);
        }
        for (const ref of param.findReferencesAsNodes()) {
          innerCtx.snapshot(ref.getSourceFile());
        }
        param.rename(target.newName);
        innerCtx.log(`  ${target.fn}(${target.oldName} → ${target.newName})`);
      }
    },
  };
}

/** The JSDoc / comment mentions the language service cannot see: an `{@link X.field}` target and the two
 *  prose lines that name a field this codemod renames. Addressed as exact one-line strings so a near-miss
 *  throws instead of silently skipping — a drifted comment is the honesty mechanism for a prose-enforced
 *  vocabulary rule (constitution §6), so it lands in the SAME pass as the rename. */
const COMMENT_FIXES: ReadonlyArray<{ readonly file: string; readonly from: string; readonly to: string }> = [
  // NOT listed: `{@link BulkImportChatInput.roster}` in `bulk-import.ts`. Measured, not assumed — the first
  // dry run threw here because TypeScript's rename engine treats a JSDoc `{@link Owner.field}` target as a
  // real reference and had already rewritten it. A backticked `` `roster` `` in prose is NOT a reference and
  // is not rewritten, which is why every other row below exists.
  {
    file: "packages/server/src/domain/chat/contract/context.ts",
    from: " *  principal-blind. `roster` is null until a chat-scoped registrant exists. */",
    to: " *  principal-blind. `membership` is null until a chat-scoped registrant exists. */",
  },
  {
    file: "packages/server/src/domain/tool-use/substrate/capability.ts",
    from: '/** null capability = the member floor — passes. A scope:"chat" ceiling with a null roster is a denial. */',
    to: '/** null capability = the member floor — passes. A scope:"chat" ceiling with a null membership is a denial. */',
  },
  {
    file: "packages/server/src/domain/tool-use/substrate/capability.ts",
    from: '    throw new DomainForbiddenError("chat-scoped tool executed outside a chat (no roster)");',
    to: '    throw new DomainForbiddenError("chat-scoped tool executed outside a chat (no membership)");',
  },
  {
    file: "packages/server/src/domain/admin/guard.ts",
    from: "/** The chat-scope decision — a pure verdict over the roster fed in. Exhaustive over `ChatAction`: a new",
    to: "/** The chat-scope decision — a pure verdict over the membership fed in. Exhaustive over `ChatAction`: a new",
  },
  {
    file: "packages/server/src/domain/import/contract/views.ts",
    from: "  /** The seats ST had DISABLED, which the room seats MUTED (#1687) — a subset of the primary + `roster`, so",
    to: "  /** The seats ST had DISABLED, which the room seats MUTED (#1687) — a subset of the primary + `characterIds`, so",
  },
  {
    file: "packages/server/src/domain/import/substrate/chat-input.ts",
    from: " * plus the room's extra seats (`roster`), the per-slot speaker attribution, and the room-behavior blob carried",
    to: " * plus the room's extra seats (`characterIds`), the per-slot speaker attribution, and the room-behavior blob carried",
  },
  // The two test TITLES that name the field. A dynamic seam ships with its lens: a test whose title still
  // says `roster` is how the next grep for the old word comes back with a false positive.
  {
    file: "tests/server/domain/tool-use/substrate/capability.test.ts",
    from: '  test("a chat-scoped ceiling with NO roster (executed outside a chat) refuses BEFORE calling can()", () => {',
    to: '  test("a chat-scoped ceiling with NO membership (executed outside a chat) refuses BEFORE calling can()", () => {',
  },
  {
    file: "tests/server/domain/tool-use/substrate/capability.test.ts",
    from: '  test("a chat-scoped ceiling with a roster forwards it verbatim to can()", () => {',
    to: '  test("a chat-scoped ceiling with a membership forwards it verbatim to can()", () => {',
  },
  {
    file: "packages/server/src/domain/import/verbs/import-chat-bundle.ts",
    from: "  /** Every seat, primary FIRST — the shape `BulkImportChatInput.roster` expects to be a superset of. */",
    to: "  /** Every seat, primary FIRST — the shape `BulkImportChatInput.characterIds` expects to be a superset of. */",
  },
];

/** Apply the comment fixes. Whole-line string swaps rather than `applyTextReplacements` offsets: these run
 *  AFTER the renames have re-parsed every file, so any offset computed up front would be stale. */
function fixComments(): Plan {
  const files = [...new Set(COMMENT_FIXES.map((f) => f.file))];
  return {
    description: `Repair ${COMMENT_FIXES.length} comment/JSDoc mention(s) the language service cannot reach`,
    touchedFiles: files,
    transform(innerCtx): void {
      for (const fix of COMMENT_FIXES) {
        const sf = innerCtx.project.getSourceFile(fix.file);
        if (sf === undefined) {
          throw new Error(`fixComments: ${fix.file} is not in the project`);
        }
        const before = sf.getFullText();
        if (!before.includes(fix.from)) {
          throw new Error(`fixComments: ${fix.file} does not contain the expected text:\n  ${fix.from}`);
        }
        sf.replaceWithText(before.replaceAll(fix.from, fix.to));
      }
    },
  };
}

await runCodemod(
  "rename-roster-wire-fields",
  (ctx: CodemodContext) => {
    ctx.plan(renameFields("#1772 (row 45 · membership)", MEMBERSHIP_FIELDS));
    ctx.plan(renameFields("#1773 (row 41 · characterIds)", CHARACTER_ID_FIELDS));
    ctx.plan(renameParams(PARAM_RENAMES));
    ctx.plan(renameVariables(VARIABLE_RENAMES));
    ctx.plan(fixComments());
    // `--diagnose` prints the pre-emit diagnostics the harness only COUNTS, so a collision is LOCATED
    // rather than guessed at (the harness refuses to apply on a non-zero count).
    if (process.argv.slice(2).includes("--diagnose")) {
      printDiagnostics(ctx);
    }
  },
  { argv: process.argv.slice(2) },
);
