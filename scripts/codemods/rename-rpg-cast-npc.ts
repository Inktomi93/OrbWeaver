// One-shot codemod for #906 / #914 (vocabulary-map row 149, ratified as Fork 3 of
// 2026-08-30): rpg's scene-only extra is an **npc**, so its
// actor-ref arm becomes `{kind:"npc", npcKey}` and `actorRefKey` projects `npc:<slug>`. The reserved
// cross-game library arm was renamed off the bare word FIRST (commit 1 of this lane — `libraryNpc`), which
// is what freed it.
//
// THE FENCE (`RPG_FILES` below) is the whole safety argument, because the target VALUE is the four-letter
// string `"cast"` and this tree carries five other meanings for it (research doc §3: the D137 producer, the
// assemble drive axis, `castId` the type coercion, the roster-preset template, a plugin command literally
// named "cast" that casts a spell). Nothing outside the allowlist is opened, and `assertNoResidue()` fails
// the run if a fenced pattern still matches inside it afterwards — the zero-hit census, built in.
//
// DELIBERATELY OUT OF SCOPE (reported, not renamed — each is a DIFFERENT concept or a separate lane):
//   • the rpg `roster` family (`RpgRosterActor`, `resolveRoster`, `rosterNames`, `promoteToRoster`,
//     `rosterOwnsPlayerName`, `resolvePersonasForRoster`) — that is #1774, sequenced AFTER this lane so two
//     codemods never run in one domain (orchestrator, 2026-09-06). Vocabulary-map row 44 records that the
//     map does not yet own a word for them, so inventing one here would be a third spelling.
//   • `RpgTrackerView.cast` / `presentCast` / `presentCastRenderer` — these name the PRESENCE plane, whose
//     word is "the present characters" (vocabulary map, the rpg register), not `npc`.
//   • the prose slot id `rpg.reminder.castHeader` — a PERSISTED key inside `presets.config`, whose rename
//     has its own owner-ruled data-migration class (`migrate-prose-slot-vocab.ts`, #1737). The dev-db wipe
//     this row is scheduled against does not cover shipped preset packages.
//   • the `"cast"` prompt-section id + the `{{rpgCast}}` macro (`preset/contract/packaged.ts`) — preset-owned
//     prose vocabulary, persisted in preset content strings.
//   • the three rpg surface aria-labels ("…to the roster" / "Back to the roster") — Fork 8 is an OPEN owner
//     fork, priced inside C1, not inside this row.
//   • `castId` (`@orb/kit/ids`) — vocabulary-map row 54, explicit no-action.
//
// Preview:  pnpm exec node scripts/codemods/rename-rpg-cast-npc.ts
// Apply:    pnpm exec node scripts/codemods/rename-rpg-cast-npc.ts --apply
// (`pnpm exec`, never a bare `node`: only the pnpm child carries the workspace heap floor, and a
//  whole-project language-service rename is a multi-GB run.)

import process from "node:process";
import type { CodemodContext, Plan, SourceFile } from "@orb/tooling/codemod";
import { CodemodError, moveFiles, Node, printDiagnostics, renameExportedSymbol, runCodemod, SyntaxKind } from "@orb/tooling/codemod";

const CONTRACTS = "packages/contracts/src/rpg";
const RPG = "packages/server/src/domain/rpg";
const CLIENT_RPG = "packages/client/src/features/rpg";
const TRACKER_BLOCKS = "packages/client/src/components/tracker-blocks";

/** THE FENCE. A repo-relative path is in scope iff it starts with one of these. Directory prefixes cover the
 *  rpg register's own homes; the loose files are the READERS of the wire kind, each named because its
 *  neighbours in the same directory carry one of the OTHER five `cast` meanings. */
const RPG_FILES: readonly string[] = [
  `${CONTRACTS}/`,
  `${RPG}/`,
  `${CLIENT_RPG}/`,
  `${TRACKER_BLOCKS}/`,
  "packages/client/src/agent-seed/index.ts",
  // The demo seeder's actor SEAT is an rpg actor ref by construction (its own JSDoc resolves the slug
  // through `rpgCastSlug`), and `entry/compose/demo-chat-game.ts` is the seam that builds the ref from it.
  // Nothing else in `domain/chat` is opened: this is the "domain/chat ONLY where an rpg symbol is imported"
  // carve-out, not a reach into the participants family.
  "packages/server/src/domain/chat/contract/seeder.ts",
  "packages/server/src/domain/chat/seeder/demo-chats.ts",
  "packages/server/src/entry/compose/rpg.ts",
  "packages/server/src/entry/compose/demo-chat-game.ts",
  "scripts/probes/rpg-extraction/",
  "tests/contracts/rpg/",
  "tests/server/domain/rpg/",
  "tests/server/entry/compose/rpg.int.test.ts",
  "tests/server/transport/cross-tenant-sweep.suite.int.test.ts",
  "tests/client/features/rpg/",
  "tests/client/components/tracker-blocks/",
  "tests/client/agent-seed/index.test.ts",
  "tests/e2e/rpg-lite-loop.spec.ts",
  "tests/e2e/support/trpc.ts",
  "tests/e2e/support/mirror-parity.test-d.ts",
  "tests/support/zod-leaf-paths.ts",
  // kit is NOT rpg, and nothing here is renamed by the LS — the file's only match is a COMMENT citing
  // `rpgCastSlug` as the sibling slug engine (`slugifyHandle`'s header). A citation of a symbol that no
  // longer exists is a drifted comment, which the register boundary calls a defect on sight.
  "packages/kit/src/speaker-label/index.ts",
];

/**
 * Files neither rewritten nor censused, because their `cast` spellings are the OLD one ON PURPOSE.
 *
 * Two, and both had to be measured rather than predicted:
 *   • this codemod, whose whole job is to NAME the old spellings;
 *   • the stale-key hazard suite, whose fixtures ARE pre-#906 persisted rows. The first apply rewrote them
 *     and turned all three of its pins into tautologies about the CURRENT spelling — a green suite
 *     asserting nothing, which is worse than a red one. A fixture whose entire value is that it is stale is
 *     invisible to a rename that reads only syntax, so the exemption has to be declared.
 *
 * A blanket "skip scripts/codemods and *.suite.int.test.ts" would let a future sweep hide real residue, so
 * the list is exact paths.
 */
const REWRITE_EXEMPT: readonly string[] = ["scripts/codemods/rename-rpg-cast-npc.ts", "tests/server/domain/rpg/stale-actor-key.suite.int.test.ts"];

/** Exported symbols, renamed through the language service (it follows the `rpg/index.ts` barrel and every
 *  re-export, which a text pass cannot see). */
const EXPORTED_RENAMES: ReadonlyArray<{ readonly file: string; readonly oldName: string; readonly newName: string }> = [
  { file: `${CONTRACTS}/actor.ts`, oldName: "rpgCastSlug", newName: "rpgNpcSlug" },
  { file: `${CONTRACTS}/actor.ts`, oldName: "rpgCastRefSchema", newName: "rpgNpcRefSchema" },
  { file: `${CONTRACTS}/actor.ts`, oldName: "RpgCastRef", newName: "RpgNpcRef" },
  { file: `${CONTRACTS}/actor.ts`, oldName: "RPG_CAST_GUIDE_FIELDS", newName: "RPG_NPC_GUIDE_FIELDS" },
  { file: `${CONTRACTS}/actor.ts`, oldName: "RpgCastGuideField", newName: "RpgNpcGuideField" },
  // The reminder's on-stage block header. The PROSE SLOT ID it resolves stays `rpg.reminder.castHeader`
  // (see the header's out-of-scope list) — the function is code, the id is persisted data.
  { file: `${RPG}/substrate/reminder.ts`, oldName: "castHeader", newName: "npcHeader" },
  { file: `${TRACKER_BLOCKS}/cast-card-slots.tsx`, oldName: "CastCard", newName: "NpcCard" },
  { file: `${TRACKER_BLOCKS}/cast-card-slots.tsx`, oldName: "CastCardProps", newName: "NpcCardProps" },
  { file: `${TRACKER_BLOCKS}/cast-card-slots.tsx`, oldName: "CastField", newName: "NpcField" },
  { file: `${CLIENT_RPG}/components/rpg-scene-cast.tsx`, oldName: "SceneCast", newName: "SceneNpcs" },
  { file: `${CLIENT_RPG}/components/rpg-scene-cast.tsx`, oldName: "SceneCastEdit", newName: "SceneNpcEdit" },
];

/** Declaration kinds a LOCAL rename may target (the `rename-roster-participants` set). */
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

/** Non-exported declarations, renamed per FILE. Each names the SCENE NPC concept — nothing here is one of
 *  the other five `cast` meanings, which is why the list is spelled file-by-file rather than swept. */
const LOCAL_RENAMES: ReadonlyArray<{ readonly file: string; readonly oldName: string; readonly newName: string }> = [
  { file: `${CONTRACTS}/actor.ts`, oldName: "CAST_SLUG_STRIP", newName: "NPC_SLUG_STRIP" },
  { file: `${CONTRACTS}/actor.ts`, oldName: "CAST_SLUG_TRIM", newName: "NPC_SLUG_TRIM" },
  { file: `${CONTRACTS}/actor.ts`, oldName: "CAST_SLUG_FALLBACK", newName: "NPC_SLUG_FALLBACK" },
  { file: `${CONTRACTS}/actor.ts`, oldName: "CAST_SLUG_FALLBACK_MARK", newName: "NPC_SLUG_FALLBACK_MARK" },
  { file: `${CONTRACTS}/actor.ts`, oldName: "CAST_SLUG_FALLBACK_RE", newName: "NPC_SLUG_FALLBACK_RE" },
  { file: `${CONTRACTS}/actor.ts`, oldName: "CAST_GUIDE_CARD_LABEL", newName: "NPC_GUIDE_CARD_LABEL" },
  { file: `${RPG}/tools/apply.ts`, oldName: "mergeCastIdentity", newName: "mergeNpcIdentity" },
  { file: `${RPG}/chat-ops/macro-view.ts`, oldName: "CastRenderCtx", newName: "NpcRenderCtx" },
  { file: `${RPG}/chat-ops/macro-view.ts`, oldName: "castBlock", newName: "npcBlock" },
  { file: `${RPG}/chat-ops/macro-view.ts`, oldName: "castCtx", newName: "npcCtx" },
  // Added AFTER the apply, once a post-run prose census found it (this file stays the complete record of the
  // rename even though the run itself is one-shot against the pre-rename tree, so a re-run would abort on the
  // already-renamed exported symbols). Applied by hand in the same commit.
  { file: `${RPG}/chat-ops/macro-view.ts`, oldName: "cast", newName: "npcs" },
  { file: `${RPG}/chat-ops/tracker-view.ts`, oldName: "castActors", newName: "npcActors" },
  { file: `${TRACKER_BLOCKS}/cast-card-slots.tsx`, oldName: "CastRelationship", newName: "NpcRelationship" },
  { file: `${TRACKER_BLOCKS}/cast-card-slots.tsx`, oldName: "CastRelationshipProps", newName: "NpcRelationshipProps" },
  { file: `${TRACKER_BLOCKS}/cast-card-slots.tsx`, oldName: "CastGuides", newName: "NpcGuides" },
  { file: `${TRACKER_BLOCKS}/cast-card-slots.tsx`, oldName: "CastGuidesProps", newName: "NpcGuidesProps" },
  { file: `${TRACKER_BLOCKS}/cast-card-slots.tsx`, oldName: "CastMood", newName: "NpcMood" },
  { file: `${TRACKER_BLOCKS}/cast-card-slots.tsx`, oldName: "CastMoodProps", newName: "NpcMoodProps" },
  { file: `${CLIENT_RPG}/components/rpg-scene-cast.tsx`, oldName: "SceneCastCard", newName: "SceneNpcCard" },
  // `SceneNpcs`' own prop: it holds the ON-STAGE NPC actors (`npcActors.filter(presence)` at the call
  // site), so it is the scene-npc concept, not the presence plane. Renamed as a DECLARATION (the LS
  // carries the JSX attribute at the call site with it) rather than by the `cast:` text rule, which is
  // deliberately blind to a property.
  { file: `${CLIENT_RPG}/components/rpg-scene-cast.tsx`, oldName: "cast", newName: "npcs" },
  { file: `${CLIENT_RPG}/components/rpg-scene-tab.tsx`, oldName: "castEdit", newName: "npcEdit" },
  { file: `${CLIENT_RPG}/components/rpg-scene-tab.tsx`, oldName: "castActors", newName: "npcActors" },
  // The field-reachability matrix keys its CARRIERS record by the actor-ref kind union itself (`Record<
  // CarrierKind, Carrier>`), so the record KEY is a union member, not prose — the `cast:` text rule is
  // deliberately blind to a `cast: ` property, so it is renamed here as the declaration it is.
  { file: "tests/server/domain/rpg/field-reachability.suite.int.test.ts", oldName: "cast", newName: "npc" },
];

/** File moves — the module names follow their contents. `moveFiles` rewrites every importer; neither file
 *  has a 1:1 test mirror (both are covered by aggregate CTs), so nothing moves under `tests/`. */
const MOVES: ReadonlyArray<readonly [from: string, to: string]> = [
  [`${TRACKER_BLOCKS}/cast-card-slots.tsx`, `${TRACKER_BLOCKS}/npc-card-slots.tsx`],
  [`${CLIENT_RPG}/components/rpg-scene-cast.tsx`, `${CLIENT_RPG}/components/rpg-scene-npcs.tsx`],
];

/**
 * THE VALUE PASS — anchored text rewrites the language service structurally cannot do.
 *
 * `"cast"` is a wire VALUE and `cast:<slug>` is a persisted KEY PREFIX; neither is a symbol, so no rename
 * reaches them. Every pattern is ANCHORED on the syntax it appears in (a discriminant position, a template
 * head, a comparison) rather than being a bare `cast` sweep — a bare sweep is what would eat `broadcast`,
 * `castId` and the plugin's spell-casting command, and the fence alone is not an argument for correctness
 * inside a file that legitimately holds two meanings.
 */
const VALUE_PATTERNS: ReadonlyArray<{ readonly find: RegExp; readonly replace: string; readonly label: string }> = [
  // The property. Word-bounded, and `castKey` has exactly one meaning in this tree (chat's was retired by
  // #903) — `assertNoResidue` proves the zero afterwards.
  { find: /\bcastKey\b/gu, replace: "npcKey", label: "castKey → npcKey" },
  // The discriminant, in every syntactic position it occupies: an object literal / type member, a zod
  // literal, a comparison, and the one `.toBe` pin.
  { find: /\bkind: "cast"/gu, replace: 'kind: "npc"', label: 'kind: "cast" → "npc"' },
  { find: /\bkind (===|!==) "cast"/gu, replace: 'kind $1 "npc"', label: 'kind === "cast" → "npc"' },
  { find: /z\.literal\("cast"\)/gu, replace: 'z.literal("npc")', label: 'z.literal("cast") → "npc"' },
  { find: /\bkind\)\.toBe\("cast"\)/gu, replace: 'kind).toBe("npc")', label: 'kind).toBe("cast") → "npc"' },
  // The carrier-kind tuple in the field-reachability suite.
  { find: /"character", "cast"\]/gu, replace: '"character", "npc"]', label: 'carrier kinds tuple → "npc"' },
  // The two contract-test fixtures that BUILD the key prefix by hand off the carrier class.
  { find: /\? "cast" : "user"/gu, replace: '? "npc" : "user"', label: 'hand-built key prefix → "npc"' },
  // The KEY PREFIX itself — `actorRefKey`'s template, its test expectations, its lock paths, and the
  // `cast:<slug>` spelling in prose. Inside the fence this token has exactly one referent.
  // `(?!\s)` is load-bearing: the KEY prefix is always glued to its slug / `${` / `<`, while a bare
  // `cast: ` with a space is a TypeScript property (`RpgTrackerView.cast`, `SceneNpcs`'s prop — the PRESENCE
  // plane, whose word is "the present characters", not `npc`) or English prose ("no cast: the scene fills").
  // Without the guard this rule silently retyped the presence plane, which the dry run caught as a TS2339.
  { find: /\bcast:(?!\s)/gu, replace: "npc:", label: "cast:<slug> → npc:<slug>" },
  // The two rendered slot names on the moved card (`data-slot` is the client's structural handle).
  { find: /data-slot="cast-card"/gu, replace: 'data-slot="npc-card"', label: "slot cast-card → npc-card" },
  { find: /data-slot="cast-guides"/gu, replace: 'data-slot="npc-guides"', label: "slot cast-guides → npc-guides" },
  // THE COMMENT TAIL. The language service renames DECLARATIONS and REFERENCES; it does not touch prose, so
  // after the rename passes above, every surviving spelling of these names is inside a comment or a
  // `{@link}` — a citation of a symbol that no longer exists. Ordered longest-first so no rule truncates a
  // sibling (`RPG_CAST_GUIDE_FIELDS` before `RpgCastGuideField` before `RpgCastRef`).
  { find: /\bRPG_CAST_GUIDE_FIELDS\b/gu, replace: "RPG_NPC_GUIDE_FIELDS", label: "comment: RPG_CAST_GUIDE_FIELDS" },
  { find: /\bRpgCastGuideField\b/gu, replace: "RpgNpcGuideField", label: "comment: RpgCastGuideField" },
  { find: /\brpgCastRefSchema\b/gu, replace: "rpgNpcRefSchema", label: "comment: rpgCastRefSchema" },
  { find: /\brpgCastSlug\b/gu, replace: "rpgNpcSlug", label: "comment: rpgCastSlug" },
  { find: /\bRpgCastRef\b/gu, replace: "RpgNpcRef", label: "comment: RpgCastRef" },
  { find: /\bCAST_GUIDE_CARD_LABEL\b/gu, replace: "NPC_GUIDE_CARD_LABEL", label: "comment: CAST_GUIDE_CARD_LABEL" },
  { find: /\bCAST_SLUG_(STRIP|TRIM|FALLBACK_MARK|FALLBACK_RE|FALLBACK)\b/gu, replace: "NPC_SLUG_$1", label: "comment: CAST_SLUG_*" },
];

/** How many rename passes one (file, name) pair may take before we call it a loop. */
const MAX_RENAME_PASSES = 64;

/** Is this repo-relative path inside the fence? */
function inFence(repoRelativePath: string): boolean {
  return RPG_FILES.some((prefix) => repoRelativePath.startsWith(prefix));
}

/** The repo-relative path of a source file (the project loads absolute paths). */
function relPath(sf: SourceFile, repoRoot: string): string {
  const abs = sf.getFilePath();
  return abs.startsWith(repoRoot) ? abs.slice(repoRoot.length).replace(/^\//u, "") : abs;
}

/** The name text of a declaration node, or `null` when it carries no readable name node. */
function declaredName(decl: Node): string | null {
  if (Node.isNamed(decl) || Node.isNameable(decl) || Node.isBindingNamed(decl) || Node.isPropertyNamed(decl)) {
    return decl.getNameNode()?.getText() ?? null;
  }
  return null;
}

/** The first still-unrenamed local declaration of `oldName` in `sf`. Re-queried after every rename:
 *  `rename()` re-parses the file, invalidating every node held across it (the kit's §13 footgun). */
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
 *  declaration's reference set is declared (`ctx.snapshot`) immediately before its rename — a file-local
 *  NAME can be referenced from a file the declaring one does not import, which
 *  `getReferencingSourceFiles()` does not report. */
function renameOneLocalGroup(
  ctx: CodemodContext,
  sf: SourceFile,
  target: { readonly file: string; readonly oldName: string; readonly newName: string },
): number {
  const { file, oldName, newName } = target;
  let passes = 0;
  for (;;) {
    const decl = findLocalDeclaration(sf, oldName);
    if (decl === null) {
      return passes;
    }
    passes += 1;
    if (passes > MAX_RENAME_PASSES) {
      throw new CodemodError(
        `renameLocalSymbols: ${file} still declares "${oldName}" after ${MAX_RENAME_PASSES} passes`,
        "The rename is a no-op — check the declaration kind.",
      );
    }
    if (!Node.isRenameable(decl)) {
      throw new CodemodError(
        `renameLocalSymbols: the "${oldName}" declaration in ${file} is not renameable (${decl.getKindName()})`,
        "Widen LOCAL_DECL_KINDS or move it to a text rule.",
      );
    }
    if (Node.isReferenceFindable(decl)) {
      for (const ref of decl.findReferencesAsNodes()) {
        ctx.snapshot(ref.getSourceFile());
      }
    }
    decl.rename(newName);
  }
}

/** Rename file-local declarations through the language service. */
function renameLocalSymbols(targets: typeof LOCAL_RENAMES): Plan {
  const files = [...new Set(targets.map((t) => t.file))];
  return {
    description: `Rename ${targets.length} file-local declaration group(s) across ${files.length} file(s)`,
    touchedFiles: files,
    transform(innerCtx): void {
      for (const target of targets) {
        const sf = innerCtx.project.getSourceFile(target.file);
        if (sf === undefined) {
          throw new CodemodError(
            `renameLocalSymbols: ${target.file} is not in the project`,
            "Check the path — the codemod's globs cover packages/*/src, tests/ and scripts/.",
          );
        }
        for (const referencing of sf.getReferencingSourceFiles()) {
          innerCtx.snapshot(referencing);
        }
        const passes = renameOneLocalGroup(innerCtx, sf, target);
        innerCtx.log(`  ${target.file}: ${target.oldName} → ${target.newName} (${passes} declaration${passes === 1 ? "" : "s"})`);
      }
    },
  };
}

/** Apply {@link VALUE_PATTERNS} to every FENCED file. Files are declared via `ctx.snapshot` immediately
 *  before mutation because which ones actually match is only knowable at transform time. */
/** Apply every {@link VALUE_PATTERNS} rule to ONE file's text, tallying hits per rule. */
function rewriteOneFile(text: string, counts: Map<string, number>): string {
  let out = text;
  for (const { find, replace, label } of VALUE_PATTERNS) {
    const hits = out.match(find)?.length ?? 0;
    if (hits === 0) {
      continue;
    }
    counts.set(label, (counts.get(label) ?? 0) + hits);
    out = out.replace(find, replace);
  }
  return out;
}

function rewriteValues(): Plan {
  return {
    description: `Rewrite the wire value + persisted key prefix across the ${RPG_FILES.length}-entry fence`,
    touchedFiles: [],
    transform(innerCtx): void {
      const counts = new Map<string, number>();
      for (const sf of innerCtx.project.getSourceFiles()) {
        const rel = relPath(sf, innerCtx.repoRoot);
        if (!inFence(rel) || REWRITE_EXEMPT.includes(rel)) {
          continue;
        }
        const before = sf.getFullText();
        const after = rewriteOneFile(before, counts);
        if (after === before) {
          continue;
        }
        innerCtx.snapshot(sf);
        sf.replaceWithText(after);
      }
      for (const [label, n] of [...counts].sort((a, b) => b[1] - a[1])) {
        innerCtx.log(`  ${label}: ${n}`);
      }
    },
  };
}

/**
 * THE ZERO-HIT CENSUS, as a plan the run cannot skip.
 *
 * A rename whose only receipt is "the suites still pass" is a rename that may have left half the tree on the
 * old spelling — the suites do not run every reader. This walks the WHOLE project (not just the fence) and
 * refuses if any renamed token survives anywhere the rename was supposed to reach.
 */
const FORBIDDEN_RESIDUE: ReadonlyArray<{ readonly find: RegExp; readonly what: string }> = [
  { find: /\bcastKey\b/u, what: "castKey" },
  // `(?!\s)` fences out English prose — "the ONE cast: build a plain array", "no-loose-id-cast: an
  // `as never` launder". The KEY prefix is always glued to its slug / `${` / `<`.
  { find: /\bcast:(?!\s)/u, what: "the cast:<slug> key prefix" },
  { find: /\bkind: "cast"/u, what: 'kind: "cast"' },
  { find: /\bkind (===|!==) "cast"/u, what: 'kind ===/!== "cast"' },
  // Spelled EXACTLY, never a `RPG_CAST_` prefix: `enums.ts` deliberately names the long-deleted
  // `RPG_CAST_FIELD_KINDS` as archaeology, and renaming a symbol that no longer exists would be a lie.
  { find: /\brpgCastSlug\b|\brpgCastRefSchema\b|\bRpgCastRef\b|\bRPG_CAST_GUIDE_FIELDS\b|\bRpgCastGuideField\b/u, what: "an rpg cast SYMBOL" },
  // EVERY renamed name, not just the contract half. The first version of this census listed only the five
  // contract symbols and reported a clean ZERO while thirteen CT test TITLES still said `CastCard` — a title
  // is a string literal, so it is invisible to `pnpm ast ident` AND to every identifier-shaped rule above.
  // An `rg` second method is what found them; a census that enumerates a SUBSET of what it renamed is a
  // false clean, so the list below is the complete rename set.
  { find: /\bCastCard\b|\bCastCardProps\b|\bCastField\b|\bCastGuides\b|\bCastMood\b|\bCastRelationship\b/u, what: "a client npc-card SYMBOL" },
  { find: /\bSceneCast\b|\bSceneCastEdit\b|\bSceneCastCard\b/u, what: "a scene-npcs SYMBOL" },
  { find: /\bmergeCastIdentity\b|\bcastHeader\(|\bCastRenderCtx\b|\bcastBlock\b/u, what: "an rpg server npc SYMBOL" },
  { find: /\bCAST_SLUG_|\bCAST_GUIDE_CARD_LABEL\b/u, what: "an rpg contract npc CONSTANT" },
];

/** Every forbidden token still present in ONE file, as report lines. */
function residueIn(sf: SourceFile, repoRoot: string): string[] {
  const rel = relPath(sf, repoRoot);
  if (REWRITE_EXEMPT.includes(rel)) {
    return [];
  }
  const text = sf.getFullText();
  return FORBIDDEN_RESIDUE.filter(({ find }) => find.test(text)).map(({ what }) => `    • ${rel} — ${what}`);
}

function assertNoResidue(): Plan {
  return {
    description: "Census: refuse if any renamed token survives anywhere in the project",
    touchedFiles: [],
    transform(innerCtx): void {
      const survivors = innerCtx.project.getSourceFiles().flatMap((sf) => residueIn(sf, innerCtx.repoRoot));
      if (survivors.length > 0) {
        throw new CodemodError(
          `Residue census FAILED — ${survivors.length} surviving occurrence site(s):\n${survivors.sort((a, b) => a.localeCompare(b)).join("\n")}`,
          "Either the file belongs in RPG_FILES (add it, with the reason), or it is one of the OTHER five `cast` " +
            "meanings and the pattern that matched is too loose. A residue census that passes trivially is worth nothing, " +
            "so this refuses rather than reporting a count.",
        );
      }
      innerCtx.log(`  residue census: 0 surviving occurrences across ${innerCtx.project.getSourceFiles().length} project files`);
    },
  };
}

await runCodemod(
  "rename-rpg-cast-npc",
  (ctx) => {
    for (const { file, oldName, newName } of EXPORTED_RENAMES) {
      ctx.plan(renameExportedSymbol(ctx, file, { oldName, newName }, { note: `${oldName} → ${newName}` }));
    }
    ctx.plan(renameLocalSymbols(LOCAL_RENAMES));
    ctx.plan(rewriteValues());
    // `moveFiles` forgets the phantom pre-move source (#1778) and restores the `.tsx` on every specifier
    // it rewrites (#1781) since the kit fix; the two hand-rolled plans that used to do it here are gone.
    ctx.plan(moveFiles(ctx, MOVES, { note: "the scene-npc modules follow their contents" }));
    ctx.plan(assertNoResidue());
    // `--diagnose` prints the pre-emit diagnostics the harness only COUNTS — how a collision is LOCATED
    // rather than guessed at.
    if (process.argv.slice(2).includes("--diagnose")) {
      printDiagnostics(ctx);
    }
  },
  { argv: process.argv.slice(2) },
);
