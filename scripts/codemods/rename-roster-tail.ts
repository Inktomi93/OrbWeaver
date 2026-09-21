// One-shot codemod for #1774's LAST TWO HALVES (vocabulary-map row 155): persona's `resolvePersonasForRoster`
// family and the compose-tier `roster` locals `rename-rpg-roster-participants.ts` (the rpg-domain half)
// explicitly deferred. The rpg domain itself is CLOSED (row 155's own status line); this pass closes
// "persona + compose still owed".
//
// THE RESERVED WORD (do not cross it): `roster` / `Roster` stays the user-facing AND code word for the
// saved TEMPLATE concept — `rosterPreset`, the `roster-preset` family, "Rosters" (map row 48). Measured:
// this lane's `rg rosterPreset` / `rg -i roster-preset` over every file this script touches is EMPTY.
//
// A STALE PREMISE THIS LANE FOUND (reported, not silently "fixed" by re-deriving a different plan): row
// 155's own text says the compose lane still owes "`RosterRefIndex`, `buildRosterRefIndex`" in
// `entry/compose/rpg.ts`. Neither identifier exists on the tree — `git log -S"RosterRefIndex"` finds them
// renamed to `ActorRefIndex`/`buildActorRefIndex` by `e8fe045a5` ("#905 — C3b: retire generic roster"),
// WELL BEFORE #1774 was ever filed. The row's "STILL OWED" line is stale residue from the 2026-08-30
// research doc it quotes verbatim (`docs/reviews/research/2026-08-30-vocab-roster-cast.md:257`, itself now
// stale — its own cited line numbers `entry/compose/rpg.ts:83,95,818` don't match current code either).
// Nothing to rename under those two names; the row's status line is corrected below instead of repeating
// the stale claim forward.
//
// WHAT COMPOSE ACTUALLY STILL OWED, found by reading the live file (not the stale doc): `rosterOwnsPlayerName`
// (row 155's own literal target, confirmed live) PLUS a family of un-exported `roster` locals scattered
// across SIX sibling top-level functions in `entry/compose/rpg.ts`, all naming the same chat concept
// (`resolveRpgParticipants`'s result, or `buildActorRefIndex`'s map over it) under the retired word. Each
// function is a SEPARATE lexical scope, and two DIFFERENT new words are owed depending on shape (a LIST →
// `participants`; an `ActorRefIndex` MAP → `participantIndex`, matching the rpg domain's own PARAM_RENAMES
// convention for the same type in `tools/apply.ts`) — a single file-wide "rename every `roster`" pass would
// give the map-shaped locals the list word. `logExtractionOutcome`'s own `args.roster: ActorRefIndex`
// parameter (an inline type literal, not an interface — `renameExportedSymbol`/`renameFields`'s
// `getInterface` lookup doesn't reach it) is the seventh site and needs its own PropertySignature-rename
// helper for exactly the reason `GATE-AUTHORING`/the rpg precedent's `renameFields` doc explains: only the
// language service reaches the object-literal KEY at every one of its six call sites at once.
//
// DELIBERATELY OUT OF SCOPE (reported, not renamed):
//   • the two persona files `verbs/remove.ts` / `tests/.../update.int.test.ts` whose "roster" mentions are
//     generic English describing the ROOM'S participant list (chat concept residue, row 44's territory,
//     not a dead cite of anything renamed here) — excluded from this lane's persona-tree text census
//     (21 mentions / 8 files, not 23 / 10).
//   • `entry/compose/rpg.ts`'s OTHER "roster" prose not immediately adjacent to a renamed identifier —
//     lines describing "a roster character"/"this chat's roster" at :216-218, :305-306, :577, :604, :624,
//     :994, :1208, :1225, :1328, :1499, :568 — the full compose-tree ENGLISH prose sweep is a following
//     lane (same split the rpg lane's own header made: symbols + directly-adjacent dead cites here, the
//     generic-English census as its own pass), NOT re-litigated by this script.
//   • `tests/server/entry/compose/**` files whose "roster" describes an UNRELATED concept (`roster-preset`
//     the reserved saved-template feature; `regex.int.test.ts`'s "REVERSE-roster" reverse-lookup device;
//     `visible-rooms.int.test.ts`; the general room-membership prose in `emit-chat-changed.int.test.ts` /
//     `room-reach.int.test.ts` / `chat.int.test.ts` / `automation-plugin.int.test.ts`) — none of them cite
//     `rosterOwnsPlayerName` or the renamed `roster` locals, so none is a dead cite of this rename.
//   • `docs/reviews/research/**` and `docs/history/reviews/stickler/**` — frozen historical snapshots, not
//     live law; not ts-morph project files either (`DEFAULT_GLOBS` is `.ts`/`.tsx` only).
//
// Docs updated OUTSIDE this script (not ts-morph project files): `docs/design/vocabulary-map.md` row 155
// (LANDED) and the two `docs/architecture/core/Core-Path-Registry.md` D122 mentions.
//
// Preview:  NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/rename-roster-tail.ts
// Apply:    NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/rename-roster-tail.ts --apply
// (`node` carries no heap floor of its own — a bare invocation dies at ~4GB with exit 134, #1775.)

import process from "node:process";
import type { CodemodContext, Plan, SourceFile } from "@orb/tooling/codemod";
import { moveFiles, Node, printDiagnostics, renameExportedSymbol, runCodemod, SyntaxKind } from "@orb/tooling/codemod";

const PERSONA = "packages/server/src/domain/persona";
const PERSONA_TESTS = "tests/server/domain/persona";
const RPG_COMPOSE = "packages/server/src/entry/compose/rpg.ts";
const SEARCH_DISCOVERY = "packages/server/src/entry/compose/search-discovery.ts";
const CHAT_COMPOSE = "packages/server/src/entry/compose/chat.ts";

/** Source + central-test moves. `moveFiles` rewrites every importer; the central test mirror moves in the
 *  same commit (the `test-layout` gate pairs `packages/<pkg>/src/<p>.ts` with `tests/<pkg>/<p>.<kind>.test.ts`). */
const MOVES: ReadonlyArray<readonly [from: string, to: string]> = [
  [`${PERSONA}/verbs/resolve-personas-for-roster.ts`, `${PERSONA}/verbs/resolve-personas-for-participants.ts`],
  [`${PERSONA_TESTS}/verbs/resolve-personas-for-roster.int.test.ts`, `${PERSONA_TESTS}/verbs/resolve-personas-for-participants.int.test.ts`],
];

/** Exported symbols, renamed through the language service (follows re-exports + the `index.ts` barrel).
 *  NOT here: `PersonaRosterView` (row 155's third target) — already renamed to `PersonaListView` by
 *  `e8fe045a5` (#905 C3b), well before #1774. Nothing named `PersonaRosterView` exists on the tree
 *  (`pnpm ast ident PersonaRosterView` — 0 hits, confirmed before this plan was written). */
const EXPORTED_RENAMES: ReadonlyArray<{ readonly file: string; readonly oldName: string; readonly newName: string }> = [
  { file: `${PERSONA}/contract/ops.ts`, oldName: "ResolvePersonasForRoster", newName: "ResolvePersonasForParticipants" },
  { file: `${PERSONA}/verbs/resolve-personas-for-participants.ts`, oldName: "createResolvePersonasForRoster", newName: "createResolvePersonasForParticipants" },
];

/** A field rename addressed by its OWNING declaration, never by bare name (the rpg precedent's rule — a
 *  file-wide "first PropertySignature called `roster`" search would silently pick a neighbour). Both rows
 *  are compose-tier interfaces that re-spell the persona op's field name at their own wiring boundary; the
 *  language service reaches the object-literal KEY, the property ACCESS, and the shorthand at once. */
interface FieldRename {
  readonly file: string;
  readonly owner: string;
  readonly oldName: string;
  readonly newName: string;
}
const FIELD_RENAMES: readonly FieldRename[] = [
  { file: SEARCH_DISCOVERY, owner: "SearchDiscoveryComposeResult", oldName: "resolvePersonasForRoster", newName: "resolvePersonasForParticipants" },
  { file: CHAT_COMPOSE, owner: "ChatComposeInput", oldName: "resolvePersonasForRoster", newName: "resolvePersonasForParticipants" },
];

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
        innerCtx.log(`  ${target.owner}.${target.oldName} → ${target.newName} (${refs.length} reference site(s))`);
      }
    },
  };
}

/** `logExtractionOutcome`'s `args` parameter is an INLINE type literal, not an interface — `getInterface`
 *  cannot reach it. Same LS instrument as `renameFields`, addressed via the function + its first parameter's
 *  type node instead of `getInterface`. */
function renameLogExtractionRosterParam(): Plan {
  const owner = "logExtractionOutcome";
  const oldName = "roster";
  const newName = "participantIndex";
  return {
    description: `Rename ${owner}'s inline-type field .${oldName} → .${newName}`,
    touchedFiles: [RPG_COMPOSE],
    transform(innerCtx): void {
      const sf = innerCtx.project.getSourceFile(RPG_COMPOSE);
      if (sf === undefined) {
        throw new Error(`renameLogExtractionRosterParam: ${RPG_COMPOSE} is not in the project`);
      }
      const fn = sf.getFunction(owner);
      if (fn === undefined) {
        throw new Error(`renameLogExtractionRosterParam: ${RPG_COMPOSE} declares no function "${owner}"`);
      }
      const param = fn.getParameters()[0];
      const typeNode = param?.getTypeNode();
      if (typeNode === undefined || !Node.isTypeLiteral(typeNode)) {
        throw new Error(`renameLogExtractionRosterParam: ${owner}'s first parameter carries no inline type literal`);
      }
      const prop = typeNode.getProperty(oldName);
      if (prop === undefined) {
        throw new Error(`renameLogExtractionRosterParam: ${owner}'s params type has no property "${oldName}"`);
      }
      if (!(Node.isRenameable(prop) && Node.isReferenceFindable(prop))) {
        throw new Error(`renameLogExtractionRosterParam: ${owner}.${oldName} is not renameable/reference-findable (${prop.getKindName()})`);
      }
      const refs = prop.findReferencesAsNodes();
      for (const ref of refs) {
        innerCtx.snapshot(ref.getSourceFile());
      }
      prop.rename(newName);
      innerCtx.log(`  ${owner}(args.${oldName} → args.${newName}) (${refs.length} reference site(s))`);
    },
  };
}

/** Declaration kinds a LOCAL rename may target — the rpg precedent's set (`BindingElement` for a destructured
 *  array/object element such as `const [roster, game] = …`; `PropertySignature`/`InterfaceDeclaration` unused
 *  here but kept for parity with the shared pattern). */
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

const MAX_RENAME_PASSES = 64;

function declaredName(decl: Node): string | null {
  if (Node.isNamed(decl) || Node.isNameable(decl) || Node.isBindingNamed(decl) || Node.isPropertyNamed(decl)) {
    return decl.getNameNode()?.getText() ?? null;
  }
  return null;
}

/** Find the first still-unrenamed local declaration of `oldName` anywhere in `sf` (file-scoped — safe only
 *  when `oldName` is unambiguous in the WHOLE file). Re-queried after every rename: `rename()` re-parses the
 *  file, invalidating every node held across it. */
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

/** Find the first still-unrenamed local declaration of `oldName` within ONE function's descendants — for the
 *  case `findLocalDeclaration` cannot handle: the SAME name declared in SEVERAL sibling functions in one file,
 *  each owed a DIFFERENT new word (rpg.ts's `roster`: a LIST in `resolveExtractionRefs`, an `ActorRefIndex`
 *  MAP everywhere else). Scoping the search to `fn`'s descendants (not `sf`'s) is what keeps the two meanings
 *  from colliding into one file-wide rename target. */
function findFnLocalDeclaration(fn: Node, oldName: string): Node | null {
  if (!Node.isFunctionDeclaration(fn)) {
    return null;
  }
  for (const kind of LOCAL_DECL_KINDS) {
    for (const decl of fn.getDescendantsOfKind(kind)) {
      if (declaredName(decl) === oldName) {
        return decl;
      }
    }
  }
  return null;
}

function renameOneDeclGroup(ctx: CodemodContext, find: () => Node | null, newName: string, label: string): number {
  let passes = 0;
  for (;;) {
    const decl = find();
    if (decl === null) {
      return passes;
    }
    passes += 1;
    if (passes > MAX_RENAME_PASSES) {
      throw new Error(`${label}: still finds an unrenamed declaration after ${MAX_RENAME_PASSES} passes`);
    }
    if (!Node.isRenameable(decl)) {
      throw new Error(`${label}: the declaration is not renameable (${decl.getKindName()})`);
    }
    if (Node.isReferenceFindable(decl)) {
      for (const ref of decl.findReferencesAsNodes()) {
        ctx.snapshot(ref.getSourceFile());
      }
    }
    decl.rename(newName);
  }
}

/** Non-exported, file-UNAMBIGUOUS declarations. Each row is one (file, name) group. */
const LOCAL_RENAMES: ReadonlyArray<{ readonly file: string; readonly oldName: string; readonly newName: string }> = [
  // The compose local carrying the created op (feeds the shorthand return at :367 once the field above is
  // already renamed — the field rename splits the shorthand, this pass puts it back together).
  { file: SEARCH_DISCOVERY, oldName: "resolvePersonasForRoster", newName: "resolvePersonasForParticipants" },
  // NOT `services.ts`: `createServices`'s destructured binding off `searchDiscovery` (`SearchDiscoveryComposeResult`)
  // and its own re-spread shorthand into `buildChatService`'s input object are BOTH typed references to the
  // field renamed above — the language service follows the property rename through the destructuring and its
  // shorthand re-use in one pass (measured on the first dry run: a `services.ts` row here throws "declares no
  // resolvePersonasForRoster" because nothing is left to rename by the time this pass runs).
  // The resolved persona map in `resolveForeignInputs` — unique in this file (verified: the file's other
  // 10 "roster" hits are all inside comments, never a declared identifier).
  { file: CHAT_COMPOSE, oldName: "roster", newName: "personas" },
  // Unique in rpg.ts (2 references, both inside `resolveExtractionRefs`) — no collision with the ambiguous
  // `roster` name handled function-scoped below.
  { file: RPG_COMPOSE, oldName: "rosterOwnsPlayerName", newName: "participantOwnsPlayerName" },
];

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
        const passes = renameOneDeclGroup(
          innerCtx,
          () => findLocalDeclaration(sf, target.oldName),
          target.newName,
          `renameLocalSymbols(${target.file}:${target.oldName})`,
        );
        if (passes === 0) {
          throw new Error(`renameLocalSymbols: ${target.file} declares no "${target.oldName}"`);
        }
        innerCtx.log(`  ${target.file}: ${target.oldName} → ${target.newName} (${passes} declaration${passes === 1 ? "" : "s"})`);
      }
    },
  };
}

/** rpg.ts's `roster` family: the SAME name, declared in SEVEN different function scopes, owed TWO different
 *  new words depending on shape (see the header). Addressed by (file, function, oldName) so each pass only
 *  ever sees its own function's descendants. */
const FN_LOCAL_RENAMES: ReadonlyArray<{ readonly fn: string; readonly oldName: string; readonly newName: string }> = [
  { fn: "resolveExtractionRefs", oldName: "roster", newName: "participants" },
  { fn: "buildRunExtraction", oldName: "roster", newName: "participantIndex" },
  { fn: "buildRunToolRound", oldName: "roster", newName: "participantIndex" },
  { fn: "buildFoldTurnToolCalls", oldName: "roster", newName: "participantIndex" },
  { fn: "resyncViaToolRound", oldName: "roster", newName: "participantIndex" },
  { fn: "resyncViaStructured", oldName: "roster", newName: "participantIndex" },
  { fn: "buildRunPopulateExtraction", oldName: "roster", newName: "participantIndex" },
];

function renameFnLocalSymbols(targets: typeof FN_LOCAL_RENAMES): Plan {
  return {
    description: `Rename ${targets.length} function-scoped local declaration group(s) in ${RPG_COMPOSE}`,
    touchedFiles: [RPG_COMPOSE],
    transform(innerCtx): void {
      const sf = innerCtx.project.getSourceFile(RPG_COMPOSE);
      if (sf === undefined) {
        throw new Error(`renameFnLocalSymbols: ${RPG_COMPOSE} is not in the project`);
      }
      for (const referencing of sf.getReferencingSourceFiles()) {
        innerCtx.snapshot(referencing);
      }
      for (const target of targets) {
        // Re-look-up the function EVERY target: a prior rename in this loop re-parses the file, which
        // invalidates any FunctionDeclaration handle held across it (the same footgun `findLocalDeclaration`
        // is re-queried for).
        const findFn = (): Node | null => {
          const fn = sf.getFunction(target.fn);
          if (fn === undefined) {
            throw new Error(`renameFnLocalSymbols: ${RPG_COMPOSE} declares no function "${target.fn}"`);
          }
          return findFnLocalDeclaration(fn, target.oldName);
        };
        const passes = renameOneDeclGroup(innerCtx, findFn, target.newName, `renameFnLocalSymbols(${target.fn}:${target.oldName})`);
        if (passes === 0) {
          throw new Error(`renameFnLocalSymbols: ${target.fn} in ${RPG_COMPOSE} declares no "${target.oldName}"`);
        }
        innerCtx.log(`  ${target.fn}(): ${target.oldName} → ${target.newName} (${passes} declaration${passes === 1 ? "" : "s"})`);
      }
    },
  };
}

/** Comment/JSDoc/string-literal mentions the language service cannot reach — every line that would otherwise
 *  become a DEAD CITE of a symbol/local renamed above, addressed as exact one-line strings so a near-miss
 *  THROWS instead of silently skipping (the rpg precedent's honesty mechanism for a prose-enforced
 *  vocabulary rule, constitution §3). */
const COMMENT_FIXES: ReadonlyArray<{ readonly file: string; readonly from: string; readonly to: string }> = [
  // ── persona domain (8 files, 21 mentions — the lane's own census) ──────────────────────────────────
  {
    file: `${PERSONA}/persistence/queries.ts`,
    from: "/** The ROSTER read (the multi-human widening — `contract/ops.ts`): the rows among `personaIds` whose owner",
    to: "/** The PARTICIPANTS read (the multi-human widening — `contract/ops.ts`): the rows among `personaIds` whose owner",
  },
  {
    file: `${PERSONA}/persistence/queries.ts`,
    from: " *  instead of one caller. No avatar join: the roster view is the presentation surface (name/description/",
    to: " *  instead of one caller. No avatar join: the participants view is the presentation surface (name/description/",
  },
  {
    file: `${PERSONA}/contract/ops.ts`,
    from: "/** Resolve the presentation surface of personas a room's ROSTER consents to.",
    to: "/** Resolve the presentation surface of personas a room's PARTICIPANTS consent to.",
  },
  {
    file: `${PERSONA}/verbs/resolve-personas-for-participants.ts`,
    from: "// op: resolvePersonasForRoster — the ROOM-plane persona read (the multi-human resolution widening). A",
    to: "// op: resolvePersonasForParticipants — the ROOM-plane persona read (the multi-human resolution widening). A",
  },
  {
    file: `${PERSONA_TESTS}/verbs/resolve-personas-for-participants.int.test.ts`,
    from: "// op: resolvePersonasForRoster — the PRINCIPAL-LESS room-plane read (the multi-human resolution widening).",
    to: "// op: resolvePersonasForParticipants — the PRINCIPAL-LESS room-plane read (the multi-human resolution widening).",
  },
  {
    file: `${PERSONA_TESTS}/verbs/resolve-personas-for-participants.int.test.ts`,
    from: 'describe("resolvePersonasForRoster", () => {',
    to: 'describe("resolvePersonasForParticipants", () => {',
  },
  {
    file: `${PERSONA}/contract/views.ts`,
    from: "/** A persona's PRESENTATION SURFACE for a room whose roster consents to it (the multi-human resolution",
    to: "/** A persona's PRESENTATION SURFACE for a room whose participants consent to it (the multi-human resolution",
  },
  {
    file: `${PERSONA}/contract/views.ts`,
    from: " *  widening — the `ResolvePersonasForRoster` op, `contract/ops.ts`). Deliberately NARROWER than {@link PersonaDetail}: name +",
    to: " *  widening — the `ResolvePersonasForParticipants` op, `contract/ops.ts`). Deliberately NARROWER than {@link PersonaDetail}: name +",
  },
  {
    file: `${PERSONA_TESTS}/verbs/set-active.int.test.ts`,
    from: "  // ── REAL chat-wire (the two ops the composition root binds to chat's own gate + roster write) ──",
    to: "  // ── REAL chat-wire (the two ops the composition root binds to chat's own gate + participant write) ──",
  },
  {
    file: `${PERSONA_TESTS}/verbs/set-active.int.test.ts`,
    from: "    // Bind the REAL chat fns exactly as compose does: the guard over {db, can}; the roster write over db + emit.",
    to: "    // Bind the REAL chat fns exactly as compose does: the guard over {db, can}; the participant write over db + emit.",
  },
  {
    file: `${PERSONA_TESTS}/verbs/set-active.int.test.ts`,
    from: "    // The real roster write emits personaSwitched (from null → the new persona).",
    to: "    // The real participant write emits personaSwitched (from null → the new persona).",
  },
  {
    file: `${PERSONA_TESTS}/verbs/set-active.int.test.ts`,
    from: "    // The write never ran — the real gate refused before the roster op.",
    to: "    // The write never ran — the real gate refused before the participant write.",
  },
  {
    file: `${PERSONA}/contract/service.ts`,
    from: " *  (the `emit` path above) would resolve ∅ and no co-member would repaint — their roster identity would",
    to: " *  (the `emit` path above) would resolve ∅ and no co-member would repaint — their participant identity would",
  },
  // ── compose wiring (the field's own JSDoc + the two chat/persona neighbours that cite it by name) ──
  {
    file: SEARCH_DISCOVERY,
    from: "  /** The persona domain's PRINCIPAL-LESS roster op — injected into the chat compose (the FOREIGN-inputs",
    to: "  /** The persona domain's PRINCIPAL-LESS participants op — injected into the chat compose (the FOREIGN-inputs",
  },
  {
    file: SEARCH_DISCOVERY,
    from: "  // `PersonaService` and the PRINCIPAL-LESS roster op (`domain/persona/contract/ops.ts`) the chat",
    to: "  // `PersonaService` and the PRINCIPAL-LESS participants op (`domain/persona/contract/ops.ts`) the chat",
  },
  {
    file: "tests/server/entry/compose/search-discovery.test.ts",
    from: '        "resolvePersonasForRoster",',
    to: '        "resolvePersonasForParticipants",',
  },
  {
    file: CHAT_COMPOSE,
    from: "  /** The persona domain's PRINCIPAL-LESS roster op (`domain/persona/contract/ops.ts`) — the ONE room-plane",
    to: "  /** The persona domain's PRINCIPAL-LESS participants op (`domain/persona/contract/ops.ts`) — the ONE room-plane",
  },
  {
    file: CHAT_COMPOSE,
    from: " * roster read as every other arm, so `active === anchor` is byte-identical to the anchor projection and the",
    to: " * participants read as every other arm, so `active === anchor` is byte-identical to the anchor projection and the",
  },
  {
    file: "packages/server/src/domain/chat/persistence/identity.ts",
    from: '//   • NOT the pin layer: `resolvePersonasForRoster` (D122) answers "who is {{user}} NOW"; this producer',
    to: '//   • NOT the pin layer: `resolvePersonasForParticipants` (D122) answers "who is {{user}} NOW"; this producer',
  },
  {
    file: "packages/server/src/domain/chat/verbs/resolve-standing-asks.ts",
    from: "// Principal (the `resolvePersonasForRoster` / `postNarratorMessage` Principal-less precedent) because its",
    to: "// Principal (the `resolvePersonasForParticipants` / `postNarratorMessage` Principal-less precedent) because its",
  },
  // ── compose/rpg.ts — the three dead cites of the ALREADY-renamed rpg-domain op (`resolveRpgRoster`
  // never existed post-#1774's rpg pass; these three comments just never caught up) plus the prose
  // immediately adjacent to the locals renamed above ──
  {
    file: RPG_COMPOSE,
    from: "// resolveRpgRoster/postNarratorMessage) flow the OTHER way, off `chatCompose.rpgChatOps` — chat learns nothing",
    to: "// resolveRpgParticipants/postNarratorMessage) flow the OTHER way, off `chatCompose.rpgChatOps` — chat learns nothing",
  },
  {
    file: RPG_COMPOSE,
    from: "  /** chat's rpg-facing ops (getMembership/postNarratorMessage/setRpgPointer/resolveRpgRoster) — off chat's",
    to: "  /** chat's rpg-facing ops (getMembership/postNarratorMessage/setRpgPointer/resolveRpgParticipants) — off chat's",
  },
  {
    file: RPG_COMPOSE,
    from: " *  `resolveRpgRoster` reads roster character cards under the room host's ownership — a card owned by anyone",
    to: " *  `resolveRpgParticipants` reads participant character cards under the room host's ownership — a card owned by anyone",
  },
  {
    file: RPG_COMPOSE,
    from: " *     (`buildActorRefIndex` gives an explicit roster name precedence over the self-alias; a roster char",
    to: " *     (`buildActorRefIndex` gives an explicit participant name precedence over the self-alias; a participant char",
  },
  {
    file: RPG_COMPOSE,
    from: ' *   • the semantic `player` token — ADDED only when NO roster member already occupies the name "player"',
    to: ' *   • the semantic `player` token — ADDED only when NO participant member already occupies the name "player"',
  },
  {
    file: RPG_COMPOSE,
    from: " *   • every roster member's display name (incl. a \"Player\"-named char and the user's persona name);",
    to: " *   • every participant member's display name (incl. a \"Player\"-named char and the user's persona name);",
  },
  {
    file: RPG_COMPOSE,
    from: "  // R6 — the per-actor write surface needs each roster actor's SHEET exceptions (grants/revokes). One read,",
    to: "  // R6 — the per-actor write surface needs each participant actor's SHEET exceptions (grants/revokes). One read,",
  },
  {
    file: RPG_COMPOSE,
    from: "  // write surface by name-dedup order, so a roster character standing in the scene was `npcs` to one and",
    to: "  // write surface by name-dedup order, so a participant character standing in the scene was `npcs` to one and",
  },
  {
    file: RPG_COMPOSE,
    from: '  // The stable semantic token leads — UNLESS a roster member already claims "player" (that char owns it, F10).',
    to: '  // The stable semantic token leads — UNLESS a participant member already claims "player" (that char owns it, F10).',
  },
  {
    file: RPG_COMPOSE,
    from: '    // every roster display name is valid (persona-name + the F10 "Player"-named char)',
    to: '    // every participant display name is valid (persona-name + the F10 "Player"-named char)',
  },
  {
    file: RPG_COMPOSE,
    from: "    // semantic `player` token + roster/persona names + existing scene npcs + npc-actor keys + tracker keys)",
    to: "    // semantic `player` token + participant/persona names + existing scene npcs + npc-actor keys + tracker keys)",
  },
  {
    file: RPG_COMPOSE,
    from: "    // The roster index resolves an extracted party/inventory target NAME to its roster ref (F2 — the same",
    to: "    // The participant index resolves an extracted party/inventory target NAME to its participant ref (F2 — the same",
  },
  {
    file: RPG_COMPOSE,
    from: "    // two more reads (the game row + a SECOND roster) whose only consumer is a log field. The roster index is",
    to: "    // two more reads (the game row + a SECOND participant index) whose only consumer is a log field. The participant index is",
  },
  {
    file: RPG_COMPOSE,
    from: "    // genuinely needed (it resolves target names to roster refs and backs the ghost guard), and the log's",
    to: "    // genuinely needed (it resolves target names to participant refs and backs the ghost guard), and the log's",
  },
];

function fixComments(): Plan {
  const files = [...new Set(COMMENT_FIXES.map((f) => f.file))];
  return {
    description: `Repair ${COMMENT_FIXES.length} comment/JSDoc/string-literal mention(s) the language service cannot reach`,
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
  "rename-roster-tail",
  (ctx: CodemodContext) => {
    ctx.plan(moveFiles(ctx, MOVES, { note: "persona resolve-personas-for-roster → resolve-personas-for-participants" }));
    for (const { file, oldName, newName } of EXPORTED_RENAMES) {
      ctx.plan(renameExportedSymbol(ctx, file, { oldName, newName }, { note: `${oldName} → ${newName}` }));
    }
    // Fields FIRST: a field/property rename splits every shorthand that carries it, and the local passes
    // below are what put those shorthands back together under the new word.
    ctx.plan(renameFields(FIELD_RENAMES));
    ctx.plan(renameLogExtractionRosterParam());
    ctx.plan(renameFnLocalSymbols(FN_LOCAL_RENAMES));
    ctx.plan(renameLocalSymbols(LOCAL_RENAMES));
    ctx.plan(fixComments());
    if (process.argv.slice(2).includes("--diagnose")) {
      printDiagnostics(ctx);
    }
  },
  { argv: process.argv.slice(2) },
);
