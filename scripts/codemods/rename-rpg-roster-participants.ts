// One-shot codemod for #1774 / #914 (vocabulary-map row 155, the rpg-register table): the RPG DOMAIN's
// code-side `roster` family becomes the CHAT word. The register boundary (constitution §3) is the whole
// argument — game-register words stay inside the rpg domain, and an rpg surface naming a CHAT concept
// (the room's participants / seated characters) takes the chat word instead. Row 44 landed that word for
// the server chat domain at #1010; this pass closes the rpg half, which is also what closes the twin
// asymmetry `domain/chat/verbs/resolve-rpg-participants.ts:5-6` has been carrying as a stated gap:
// chat's `ResolveRpgParticipants`/`RpgParticipantActor` and rpg's `RpgResolveRoster`/`RpgRosterActor` are
// the same structural shape under two words.
//
// THE RESERVED WORD (do not cross it): `roster` / `Roster` stays the user-facing AND code word for the
// saved TEMPLATE concept — `rosterPreset`, the `roster-preset` family, "Rosters" (map row 48). Measured,
// not assumed: `rg rosterPreset` over the three rpg trees is EMPTY, so nothing below can reach it.
//
// TWO WORD CALLS this lane made from the code, because row 155 leaves them to the codemod lane:
//   • `rosterNames` → `participantNames`, NOT `characterNames`. Row 155 says `characterNames` iff the array
//     excludes the user. It does not: `RpgRosterActor` is documented at `contract/service.ts:295-297` as
//     "the chat's present participants into `character`/`user` actor refs", `chat-ops/gather.ts:118-121`
//     builds the map from EVERY entry of `ctx.resolveRoster`, and `tools/apply.ts:51` reads a `user`-kind
//     entry out of that same list to build the player self-aliases. The user is in it.
//   • the `roster: ActorRefIndex` PARAMETERS (`tools/apply.ts`) → `participantIndex`, not `participants`.
//     They hold the name→ref MAP, not the list; taking the list word for a Map is exactly the overshoot
//     #1772 had to repair on `ChatToolExecFrame` (row 44's LIST word on a single-value field). The list
//     itself — `buildActorRefIndex`'s own argument — IS `participants`, and the builder of the map keeps
//     row 155's own `participantIndexFor`.
//
// DELIBERATELY OUT OF SCOPE (reported, not renamed):
//   • `domain/persona/verbs/resolve-personas-for-roster.ts` (`resolvePersonasForRoster` family) and
//     `entry/compose/rpg.ts`'s own locals (`rosterOwnsPlayerName`, `RosterRefIndex`, `buildRosterRefIndex`)
//     — row 155 schedules those as their own lanes (persona, then compose). The language-service rename DOES
//     reach compose for the SYMBOLS renamed here (compose wires `RpgContext`); those hunks belong to the
//     symbol, not to the compose lane. The ONE compose local this lane folds in is `buildPromoteToRoster`,
//     which BUILDS a renamed op and would otherwise ship half-migrated (orchestrator ruling 2026-09-06).
//   • `domain/databank/persistence/scope.ts::resolveRosterCharacters` — a databank local, another row.
//   • row 44's own residue (`speakerOffRoster`, `"roster-card-read"`, `contracts/src/chat/roster.ts`, the
//     client `features/chat` family) — each has its own row.
//   • the ENGLISH prose sweep — SYMBOLS ONLY in this lane (orchestrator ruling 2026-09-06). The re-derived
//     census on `c993a0db4` is 624 case-insensitive `roster` mentions across the six trees; ~200 are code
//     (all of it below) and ~330 are comment/test-title English still calling the concept "roster" ("a
//     roster actor", "the chat roster's", "roster ∪ sheets"). Those are a FOLLOWING lane: only the lines
//     that would become DEAD CITES of a symbol renamed here are repaired below.
//
// Preview:  NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/rename-rpg-roster-participants.ts
// Apply:    NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/rename-rpg-roster-participants.ts --apply
// (`node` carries no heap floor of its own — a bare invocation dies at ~4GB with exit 134, #1775.)

import process from "node:process";
import type { CodemodContext, Plan, SourceFile } from "@orb/tooling/codemod";
import { Node, printDiagnostics, renameExportedSymbol, runCodemod, SyntaxKind } from "@orb/tooling/codemod";

const RPG = "packages/server/src/domain/rpg";
const RPG_TESTS = "tests/server/domain/rpg";

/** A field rename addressed by its OWNING declaration, never by bare name: a file-wide "first
 *  PropertySignature called `roster`" search would silently pick a neighbour the day one is added. */
interface FieldRename {
  readonly file: string;
  /** The `interface` the property is declared on. */
  readonly owner: string;
  readonly oldName: string;
  readonly newName: string;
  /** Why this field takes this word — printed in the plan so the preview is self-auditing. */
  readonly why: string;
}

/** Interface FIELDS. The language service follows all three reference shapes at once: the object-literal
 *  KEY (`{ resolveRoster, … }` at compose), the property ACCESS (`ctx.rosterNames`), and the shorthand. */
const FIELD_RENAMES: readonly FieldRename[] = [
  {
    file: `${RPG}/contract/service.ts`,
    owner: "RpgContext",
    oldName: "resolveRoster",
    newName: "resolveParticipants",
    why: "the injected chat op — chat's own half is already `createResolveRpgParticipants` (#1010)",
  },
  {
    file: `${RPG}/contract/service.ts`,
    owner: "RpgContext",
    oldName: "promoteToRoster",
    newName: "promoteToCharacter",
    why: "row 155 / row 4: the DESTINATION is the room's CHARACTERS (`verbs/promote-actor.ts:3` — 'becomes a roster CHARACTER')",
  },
  {
    file: `${RPG}/contract/service.ts`,
    owner: "RpgPromoteToRosterInput",
    oldName: "roster",
    newName: "participants",
    why: "the pre-write room participants, read for the name-collision refusal — a LIST, so the list word",
  },
  {
    file: `${RPG}/contract/delta.ts`,
    owner: "DeltaContext",
    oldName: "rosterNames",
    newName: "participantNames",
    why: "actorRefKey → display name for character AND user actors (the user is in it — see the header)",
  },
  {
    file: `${RPG}/contract/params.ts`,
    owner: "LiteReminderInput",
    oldName: "rosterNames",
    newName: "participantNames",
    why: "the reminder's copy of the same map, threaded from the gather",
  },
  {
    file: `${RPG_TESTS}/_support.ts`,
    owner: "RpgFakes",
    oldName: "roster",
    newName: "participants",
    why: "the harness fake behind `resolveParticipants` — every `seedLiteGame(db, { roster: … })` call site",
  },
  {
    file: `${RPG_TESTS}/field-reachability.suite.int.test.ts`,
    owner: "Carrier",
    oldName: "roster",
    newName: "participants",
    why: "the suite's per-carrier seed list, handed straight to `seedLiteGame`",
  },
];

/** Exported symbols, renamed through the language service (follows re-exports + the `index.ts` barrel). */
const EXPORTED_RENAMES: ReadonlyArray<{ readonly file: string; readonly oldName: string; readonly newName: string }> = [
  { file: `${RPG}/contract/service.ts`, oldName: "RpgRosterActor", newName: "RpgParticipantActor" },
  { file: `${RPG}/contract/service.ts`, oldName: "RpgResolveRoster", newName: "RpgResolveParticipants" },
  { file: `${RPG}/contract/service.ts`, oldName: "RpgPromoteToRoster", newName: "RpgPromoteToCharacter" },
  { file: `${RPG_TESTS}/_support.ts`, oldName: "rosterCharacter", newName: "participantCharacter" },
  { file: `${RPG_TESTS}/_support.ts`, oldName: "rosterUser", newName: "participantUser" },
];

/** Named-function PARAMETERS, addressed by (file, function, parameter) so the target is unambiguous in a
 *  file that binds the word more than once — `tools/apply.ts` binds `roster` eleven times across two
 *  different SHAPES (the list once, the index ten times). */
const PARAM_RENAMES: ReadonlyArray<{ readonly file: string; readonly fn: string; readonly oldName: string; readonly newName: string }> = [
  { file: `${RPG}/tools/apply.ts`, fn: "buildActorRefIndex", oldName: "roster", newName: "participants" },
  ...[
    "refForTarget",
    "resolveActor",
    "applyUpdateParty",
    "applyUpdateInventory",
    "applyPresencePatch",
    "applyUpdateScene",
    "reachableActorRefs",
    "ghostTargetRefs",
    "applyActorArgs",
    "extractionToStateDelta",
  ].map((fn) => ({ file: `${RPG}/tools/apply.ts`, fn, oldName: "roster", newName: "participantIndex" })),
];

/** Non-exported declarations, renamed per FILE. Each row is one (file, name) group; every declaration of
 *  that name in that file takes the new word, one language-service pass at a time. */
const LOCAL_RENAMES: ReadonlyArray<{ readonly file: string; readonly oldName: string; readonly newName: string }> = [
  // The two non-exported halves of the promotion op's signature (knip-invisible by design).
  { file: `${RPG}/contract/service.ts`, oldName: "RpgPromoteToRosterInput", newName: "RpgPromoteToCharacterInput" },
  { file: `${RPG}/contract/service.ts`, oldName: "RpgPromoteToRosterResult", newName: "RpgPromoteToCharacterResult" },
  // The name→ref index builder — row 155 names this one directly.
  { file: `${RPG}/tools/index.ts`, oldName: "rosterIndexFor", newName: "participantIndexFor" },
  // Landed by #1468 AFTER this lane's first dry run (the merge of `bb9da54bb` brought it in): the shared
  // generic label a participant ref degrades to when nothing names it. A module const spelling the retired
  // word is the same defect class as the rest of this table.
  { file: `${RPG}/substrate/delta.ts`, oldName: "ROSTER_GENERIC", newName: "PARTICIPANT_GENERIC" },
  // The tracker-view projection's three locals (row 155 names `rosterActors`/`rosterKeys`).
  { file: `${RPG}/chat-ops/tracker-view.ts`, oldName: "roster", newName: "participants" },
  { file: `${RPG}/chat-ops/tracker-view.ts`, oldName: "rosterActors", newName: "participantActors" },
  { file: `${RPG}/chat-ops/tracker-view.ts`, oldName: "rosterKeys", newName: "participantKeys" },
  // The gather. `rosterNames` is a SHORTHAND carrier twice (`{ rosterNames, … }` at :171 and :199): the
  // field rename above rewrites the KEY and leaves the binding, so the binding is renamed here or the
  // apply lands `{ participantNames }` beside `const rosterNames = …` (TS18004, and the harness refuses).
  { file: `${RPG}/chat-ops/gather.ts`, oldName: "roster", newName: "participants" },
  { file: `${RPG}/chat-ops/gather.ts`, oldName: "rosterNames", newName: "participantNames" },
  // The promotion verb — its `roster` local rides into `ctx.promoteToCharacter({ …, roster })` as a shorthand.
  { file: `${RPG}/verbs/promote-actor.ts`, oldName: "roster", newName: "participants" },
  // The harness: the op const (shorthand into the ctx literal) + the destructured input field.
  // NOT listed: the destructured `{ …, roster, … }` input of the promotion fake. Measured on the first dry
  // run — ts-morph's `rename()` leaves `usePrefixAndSuffixText` off, so a SHORTHAND reference is renamed
  // WHOLESALE (binding included) by the field pass above; a follow-up row here throws "declares no roster".
  { file: `${RPG_TESTS}/_support.ts`, oldName: "resolveRoster", newName: "resolveParticipants" },
  // The suites' own locals. A dynamic seam ships with its lens — a fixture still named `NO_ROSTER` is how
  // the next grep for the retired word comes back with a false positive.
  { file: `${RPG_TESTS}/authority.suite.int.test.ts`, oldName: "seedGameWithRoster", newName: "seedGameWithParticipants" },
  { file: `${RPG_TESTS}/tools/apply.test.ts`, oldName: "NO_ROSTER", newName: "NO_PARTICIPANTS" },
  { file: `${RPG_TESTS}/tools/apply.test.ts`, oldName: "roster", newName: "participantIndex" },
  { file: `${RPG_TESTS}/chat-ops/tracker-view.int.test.ts`, oldName: "roster", newName: "participants" },
  { file: `${RPG_TESTS}/verbs/read/get-tracker-view.int.test.ts`, oldName: "roster", newName: "participants" },
  // NOT `participants`: these two hold `CharacterId[]`, the seat ids the projection is composed against —
  // row 41's word for that list, matching chat's own `participantCharacterIds` (#1010).
  { file: `${RPG_TESTS}/persistence/sheets.int.test.ts`, oldName: "roster", newName: "participantCharacterIds" },
  // The rpg-extraction PROBE's own locals. Not anticipated — found by this lane's `pnpm ast ident` zero-hit
  // receipt, which came back 2 hits for `rosterActors`. The probe is already in the blast radius (it CALLS the
  // renamed appliers), and its projection deliberately MIRRORS `chat-ops/tracker-view.ts`, so it carries the
  // same three names; leaving them would make the lane's own zero-hit receipt false.
  { file: "scripts/probes/rpg-extraction/local-8b-vehicles.ts", oldName: "ROSTER", newName: "PARTICIPANTS" },
  // Same class, found by the same receipt: an ALL-CAPS fixture const is not a rename target of any symbol
  // above, so only the literal sweep sees it. It is handed straight to a field already called `participants`.
  { file: "tests/client/features/rpg/lib/archived-cards.test.ts", oldName: "ROSTER", newName: "PARTICIPANTS" },
  { file: "scripts/probes/rpg-extraction/local-8b-vehicles.ts", oldName: "rosterActors", newName: "participantActors" },
  { file: "scripts/probes/rpg-extraction/local-8b-vehicles.ts", oldName: "roster", newName: "participantIndex" },
  // The ONE compose local this lane folds in (orchestrator ruling 2026-09-06): it BUILDS the op renamed
  // above, so leaving it would ship `buildPromoteToRoster(): RpgContext["promoteToCharacter"]` — a
  // half-migrated name, which the constitution's "no leaving the OLD structure beside the new" bans. Row
  // 155 names it in the same bullet as `promoteToRoster`. Compose's OTHER `roster` locals
  // (`rosterOwnsPlayerName`, `RosterRefIndex`, `buildRosterRefIndex`) stay with the compose lane.
  { file: "packages/server/src/entry/compose/rpg.ts", oldName: "buildPromoteToRoster", newName: "buildPromoteToCharacter" },
];

/** How many rename passes one (file, name) pair may take before we call it a loop. Each pass removes at
 *  least one declaration of `oldName`, so the cap is a guard against a rename that silently no-ops. */
const MAX_RENAME_PASSES = 64;

/** Declaration kinds a LOCAL rename may target. `BindingElement` is here because a destructured op input
 *  (`({ chatId, …, roster, name }) => …`) is where an LS field rename SPLITS a shorthand; `PropertySignature`
 *  because a file-local param-object shape's only consumers are the call sites the LS rewrites with it. */
const LOCAL_DECL_KINDS = [
  SyntaxKind.VariableDeclaration,
  SyntaxKind.Parameter,
  SyntaxKind.BindingElement,
  SyntaxKind.PropertySignature,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.PropertyAssignment,
] as const;

/** The name text of a declaration node, or `null` when the node carries no readable name node (a
 *  destructuring pattern, a computed property key). */
function declaredName(decl: Node): string | null {
  if (Node.isNamed(decl) || Node.isNameable(decl) || Node.isBindingNamed(decl) || Node.isPropertyNamed(decl)) {
    return decl.getNameNode()?.getText() ?? null;
  }
  return null;
}

/** Find the first still-unrenamed local declaration of `oldName` in `sf`. Re-queried after every rename:
 *  `rename()` re-parses the file, which invalidates every node held across it (the kit's §13 footgun). */
function findLocalDeclaration(sf: SourceFile, oldName: string): Node | null {
  for (const kind of LOCAL_DECL_KINDS) {
    for (const decl of sf.getDescendantsOfKind(kind)) {
      if (declaredName(decl) === oldName) {
        return decl;
      }
    }
  }
  return null;
}

/** Rename every local declaration of `oldName` in ONE file, one language-service pass at a time. Each
 *  declaration's own reference set is declared (`ctx.snapshot`) immediately before its rename — a
 *  file-local NAME can still be referenced from a file the DECLARING file does not import, which
 *  `getReferencingSourceFiles()` does not report. */
function renameOneLocalGroup(ctx: CodemodContext, sf: SourceFile, target: (typeof LOCAL_RENAMES)[number]): number {
  const { file, oldName, newName } = target;
  let passes = 0;
  for (;;) {
    const decl = findLocalDeclaration(sf, oldName);
    if (decl === null) {
      return passes;
    }
    passes += 1;
    if (passes > MAX_RENAME_PASSES) {
      throw new Error(`renameLocalSymbols: ${file} still declares "${oldName}" after ${MAX_RENAME_PASSES} passes`);
    }
    if (!Node.isRenameable(decl)) {
      throw new Error(`renameLocalSymbols: the "${oldName}" declaration in ${file} is not renameable (${decl.getKindName()})`);
    }
    if (Node.isReferenceFindable(decl)) {
      for (const ref of decl.findReferencesAsNodes()) {
        ctx.snapshot(ref.getSourceFile());
      }
    }
    decl.rename(newName);
  }
}

/** Rename file-local declarations through the language service. THROWS on a group that matched nothing: a
 *  rename that silently found zero declarations is the failure mode a dry run cannot show you. */
function renameLocalSymbols(targets: typeof LOCAL_RENAMES): Plan {
  const files = [...new Set(targets.map((t) => t.file))];
  return {
    description: `Rename ${targets.length} file-local declaration group(s) across ${files.length} file(s)`,
    touchedFiles: files,
    transform(innerCtx): void {
      for (const target of targets) {
        const sf = innerCtx.project.getSourceFile(target.file);
        if (sf === undefined) {
          throw new Error(`renameLocalSymbols: ${target.file} is not in the project`);
        }
        for (const referencing of sf.getReferencingSourceFiles()) {
          innerCtx.snapshot(referencing);
        }
        const passes = renameOneLocalGroup(innerCtx, sf, target);
        if (passes === 0) {
          throw new Error(`renameLocalSymbols: ${target.file} declares no "${target.oldName}"`);
        }
        innerCtx.log(`  ${target.file}: ${target.oldName} → ${target.newName} (${passes} declaration${passes === 1 ? "" : "s"})`);
      }
    },
  };
}

/** Locate the PropertySignature `oldName` on the interface `owner` in `sf`. Throws rather than no-ops. */
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
 * `renameExportedSymbol` cannot reach a field — it resolves the EXPORTED declaration (the interface), and a
 * property is a member of it, not an export of the file. The LS's `rename()` on the PropertySignature is the
 * right instrument and the only one that follows the object-literal KEY, the property ACCESS and the
 * shorthand at once. A text sweep over `roster:` would have hit dozens of unrelated keys.
 *
 * The blast radius is only knowable at transform time, so each declaration's own reference set is declared
 * (`ctx.snapshot`) immediately before its rename — the seam `run.ts` documents for exactly this.
 */
function renameFields(targets: readonly FieldRename[]): Plan {
  return {
    description: `Rename ${targets.length} interface field(s) — ${targets.map((t) => `${t.owner}.${t.oldName}→${t.newName}`).join(", ")}`,
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

/** Rename a named function's parameter. Same LS instrument, addressed by (file, function, parameter). */
function renameParams(targets: typeof PARAM_RENAMES): Plan {
  const files = [...new Set(targets.map((t) => t.file))];
  return {
    description: `Rename ${targets.length} function parameter(s) across ${files.length} file(s)`,
    touchedFiles: files,
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

/**
 * The comment/JSDoc mentions the language service cannot see — every line that would otherwise become a
 * DEAD CITE of a symbol renamed above (a backticked `` `ctx.rosterNames` `` in prose is not a reference and
 * is not rewritten; a JSDoc `{@link Owner.field}` target IS one and is left out of this list on purpose).
 *
 * Addressed as exact one-line strings so a near-miss THROWS instead of silently skipping — a drifted comment
 * is the honesty mechanism for a prose-enforced vocabulary rule (constitution §3), so it lands in the SAME
 * pass as the rename. The generic-English prose sweep is deliberately NOT here (see the header).
 */
const COMMENT_FIXES: ReadonlyArray<{ readonly file: string; readonly from: string; readonly to: string }> = [
  {
    file: `${RPG}/context.ts`,
    from: "// (`getMembership`/`setPointer`/`resolveRoster`/`postNarratorMessage`/`resolveStateDelivery`) flow IN from",
    to: "// (`getMembership`/`setPointer`/`resolveParticipants`/`postNarratorMessage`/`resolveStateDelivery`) flow IN from",
  },
  {
    file: `${RPG}/index.ts`,
    from: "// The injected-op SHAPES (`RpgGetMembership`/`RpgSetPointer`/`RpgResolveRoster`/`RpgPostNarratorMessage`/",
    to: "// The injected-op SHAPES (`RpgGetMembership`/`RpgSetPointer`/`RpgResolveParticipants`/`RpgPostNarratorMessage`/",
  },
  {
    file: `${RPG}/index.ts`,
    from: "// `RpgResolveStateDelivery` + `RpgRosterActor`/`RpgIdMints`) are re-exported type-only so compose wires",
    to: "// `RpgResolveStateDelivery` + `RpgParticipantActor`/`RpgIdMints`) are re-exported type-only so compose wires",
  },
  {
    file: `${RPG}/contract/service.ts`,
    from: "// (`resolveRoster`), the narrator-slot mint for restore (`postNarratorMessage`), and the honest-arms",
    to: "// (`resolveParticipants`), the narrator-slot mint for restore (`postNarratorMessage`), and the honest-arms",
  },
  {
    file: `${RPG}/contract/service.ts`,
    from: "/** One roster actor projected for the tracker view (roster ∪ sheets, §4.3). The injected `resolveRoster` op",
    to: "/** One participant actor projected for the tracker view (participants ∪ sheets, §4.3). The injected `resolveParticipants` op",
  },
  {
    // Both non-exported halves carry this line VERBATIM; one `replaceAll` row repairs the pair.
    file: `${RPG}/contract/service.ts`,
    from: " *  Non-exported: reachable only through `RpgPromoteToRoster`'s signature — no consumer names it (knip). */",
    to: " *  Non-exported: reachable only through `RpgPromoteToCharacter`'s signature — no consumer names it (knip). */",
  },
  {
    file: `${RPG}/contract/service.ts`,
    from: " *  resolvable (`resolveRpgRoster` reads character cards under the room host's ownership) and the stats",
    to: " *  resolvable (`resolveRpgParticipants` reads character cards under the room host's ownership) and the stats",
  },
  {
    file: `${RPG}/contract/delta.ts`,
    from: " *  NOT in the two snapshots, arriving as DATA so the registry stays PURE (no I/O). `rosterNames` maps an",
    to: " *  NOT in the two snapshots, arriving as DATA so the registry stays PURE (no I/O). `participantNames` maps an",
  },
  {
    file: `${RPG}/contract/delta.ts`,
    from: ' *  "character HP 12→16" — the gather resolves it from `ctx.resolveRoster`). `trackerDefs` are the game\'s',
    to: ' *  "character HP 12→16" — the gather resolves it from `ctx.resolveParticipants`). `trackerDefs` are the game\'s',
  },
  {
    file: `${RPG}/contract/params.ts`,
    from: ' *  roster actors ("Kael HP 12→16", not "character HP 12→16"). Resolved by the gather from `ctx.resolveRoster`;',
    to: ' *  participant actors ("Kael HP 12→16", not "character HP 12→16"). Resolved by the gather from `ctx.resolveParticipants`;',
  },
  {
    file: `${RPG}/substrate/delta.ts`,
    from: ' *  `ctx.rosterNames` ("Kael Vitality 12→16", not "character Vitality 12→16"); an `npc` actor',
    to: ' *  `ctx.participantNames` ("Kael Vitality 12→16", not "character Vitality 12→16"); an `npc` actor',
  },
  {
    file: `${RPG}/substrate/delta.ts`,
    from: " *  `ctx.rosterNames`, not on the row. Spelling the join a second time is how a branded `character:chr_…` id",
    to: " *  `ctx.participantNames`, not on the row. Spelling the join a second time is how a branded `character:chr_…` id",
  },
  {
    file: `${RPG}/substrate/delta.ts`,
    from: " *  ROSTER actor's name lives in `ctx.rosterNames`, not on her row. Resolving without it printed the raw",
    to: " *  PARTICIPANT actor's name lives in `ctx.participantNames`, not on her row. Resolving without it printed the raw",
  },
  {
    file: `${RPG}/chat-ops/macro-view.ts`,
    from: " *  the view + hands in the delta context (the same `rosterNames`/`trackerDefs`/`relationshipHints` the reminder",
    to: " *  the view + hands in the delta context (the same `participantNames`/`trackerDefs`/`relationshipHints` the reminder",
  },
  {
    file: `${RPG}/chat-ops/gather.ts`,
    from: '  // actors ("Kael HP 12→16", not "character HP 12→16"). Resolved HERE (the gather has `ctx.resolveRoster` reach —',
    to: '  // actors ("Kael HP 12→16", not "character HP 12→16"). Resolved HERE (the gather has `ctx.resolveParticipants` reach —',
  },
  {
    file: `${RPG}/chat-ops/gather.ts`,
    from: "  // the reminder's (same rosterNames/castFields/relationshipHints) so the `{{rpgDelta}}` macro == the reminder's",
    to: "  // the reminder's (same participantNames/castFields/relationshipHints) so the `{{rpgDelta}}` macro == the reminder's",
  },
  {
    file: `${RPG}/verbs/promote-actor.ts`,
    from: "//   1. the DURABLE half (`ctx.promoteToRoster`, an injected compose op over the character + chat front doors —",
    to: "//   1. the DURABLE half (`ctx.promoteToCharacter`, an injected compose op over the character + chat front doors —",
  },
  {
    file: `${RPG}/verbs/promote-actor.ts`,
    from: "      // the card must be minted under them (`resolveRpgRoster` reads roster cards under the host's ownership —",
    to: "      // the card must be minted under them (`resolveRpgParticipants` reads participant cards under the host's ownership —",
  },
  // The CHAT-side twin's own comments. The asymmetry these three lines describe as a standing gap is what
  // this codemod closes, so the text is repaired in the same pass. Comment-only: no chat CODE is touched.
  {
    file: "packages/server/src/domain/chat/contract/context.ts",
    from: " *  name/avatar joins live HERE (chat/character). Structurally the rpg-facing `RpgRosterActor` (rpg declares its",
    to: " *  name/avatar joins live HERE (chat/character). Structurally the rpg-facing `RpgParticipantActor` (rpg declares its",
  },
  {
    file: "packages/server/src/domain/chat/contract/context.ts",
    from: " *  injected-op precedent). Wired into `RpgContext.resolveRoster` at the composition root (W1c-b). */",
    to: " *  injected-op precedent). Wired into `RpgContext.resolveParticipants` at the composition root (W1c-b). */",
  },
  {
    file: "packages/server/src/domain/chat/index.ts",
    from: "// name/avatar; wired into `RpgContext.resolveRoster` at the composition root (W1c-b). Standalone + principal-free.",
    to: "// name/avatar; wired into `RpgContext.resolveParticipants` at the composition root (W1c-b). Standalone + principal-free.",
  },
  {
    file: "packages/server/src/domain/chat/verbs/resolve-rpg-participants.ts",
    from: "// rpg domain still declares its own structural twin as `RpgRosterActor`/`RpgResolveRoster`. #1010 renamed the\n// SERVER CHAT DOMAIN only; the rpg family's word (and `promoteToRoster`'s) needs its own vocabulary-map row",
    to: "// rpg domain declares the same structural twin as `RpgParticipantActor`/`RpgResolveParticipants` (#1774 closed\n// the asymmetry #1010 left: #1010 renamed the SERVER CHAT DOMAIN, vocabulary-map row 155 ruled the rpg word)",
  },
  {
    file: "packages/server/src/domain/character/persistence/handoff-copy-write.ts",
    from: " *  the RECIPIENT's own namespace (nothing addresses a character by it — the `promoteToRoster` mint states the",
    to: " *  the RECIPIENT's own namespace (nothing addresses a character by it — the `promoteToCharacter` mint states the",
  },
  {
    file: "packages/server/src/entry/compose/services.ts",
    from: "    // R4 promotion's durable half — the two front doors the injected `promoteToRoster` op mints through (a",
    to: "    // R4 promotion's durable half — the two front doors the injected `promoteToCharacter` op mints through (a",
  },
  {
    // NOT a comment and NOT a symbol: the ONE user-facing string this lane changes (orchestrator ruling
    // 2026-09-06 — applying the landed C1 ruling, not minting a word). The breadcrumb button's VISIBLE label
    // said "Roster" while its own `aria-label` already said "Back to the characters": a visible-label /
    // accessible-name disagreement, and row 50's word for the SAVED TEMPLATE spent on the room's characters,
    // which vocabulary-map:146 rules is "Characters" ("the Status tab's seated characters are Characters,
    // not 'the roster'"). Pinned by a CT that reads the text off the button the accname addresses.
    file: "packages/client/src/features/rpg/components/rpg-character-detail.tsx",
    from: "          Roster\n",
    to: "          Characters\n",
  },
  {
    // NOT a comment: the `Pick<RpgFakes, … | "roster" | …>` KEY LITERAL, twice (`makeRpgService` and
    // `seedLiteGame` each spell the same allow-list). Measured on the first dry run, not anticipated — the
    // language service does NOT follow a property rename into a `Pick`/`keyof` string literal, and the 28
    // pre-emit diagnostics the harness counted were ALL this one root cause (TS2344 here, then TS2353 at
    // every `seedLiteGame(db, { participants: … })` call site). Both lines are byte-identical, so one
    // `replaceAll` row repairs the pair.
    file: `${RPG_TESTS}/_support.ts`,
    from: '      | "roster"\n',
    to: '      | "participants"\n',
  },
  {
    file: `${RPG_TESTS}/_support.ts`,
    from: "  /** R4 — the promotion mints fired (`promoteToRoster`): the room, the HOST userId the card was minted under",
    to: "  /** R4 — the promotion mints fired (`promoteToCharacter`): the room, the HOST userId the card was minted under",
  },
  {
    file: `${RPG_TESTS}/substrate/delta.test.ts`,
    from: "// The SCENE OPENS block names a ROSTER actor through `ctx.rosterNames` — the ONE presence-key→name join",
    to: "// The SCENE OPENS block names a PARTICIPANT actor through `ctx.participantNames` — the ONE presence-key→name join",
  },
  {
    file: `${RPG_TESTS}/field-reachability.suite.int.test.ts`,
    from: '    "addressing — the per-actor renderers LABEL a line through `rosterNames`/the npc key (`actorLabel`), never by printing the ref.",',
    to: '    "addressing — the per-actor renderers LABEL a line through `participantNames`/the npc key (`actorLabel`), never by printing the ref.",',
  },
];

/** Apply the comment fixes. Whole-string swaps rather than `applyTextReplacements` offsets: these run AFTER
 *  the renames have re-parsed every file, so any offset computed up front would be stale. */
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
  "rename-rpg-roster-participants",
  (ctx: CodemodContext) => {
    // Fields FIRST: a field rename splits every shorthand that carries it, and the local passes below are
    // what put those shorthands back together under the new word.
    ctx.plan(renameFields(FIELD_RENAMES));
    for (const { file, oldName, newName } of EXPORTED_RENAMES) {
      ctx.plan(renameExportedSymbol(ctx, file, { oldName, newName }, { note: `${oldName} → ${newName}` }));
    }
    ctx.plan(renameParams(PARAM_RENAMES));
    ctx.plan(renameLocalSymbols(LOCAL_RENAMES));
    ctx.plan(fixComments());
    // `--diagnose` prints the pre-emit diagnostics the harness only COUNTS, so a collision is LOCATED rather
    // than guessed at (the harness refuses to apply on a non-zero count).
    if (process.argv.slice(2).includes("--diagnose")) {
      printDiagnostics(ctx);
    }
  },
  { argv: process.argv.slice(2) },
);
