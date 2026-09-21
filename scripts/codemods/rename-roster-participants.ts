// One-shot codemod for #1010 / #914 (vocabulary-map row 44): the server chat domain's code-side
// `roster` family becomes `participants`. The db table already says `chat_participants`, so the
// concept IS participants and only the code word diverged.
//
// THE RESERVED WORD (do not cross it): `roster` / `Roster` stays the user-facing AND code word for the
// saved TEMPLATE concept — `rosterPreset`, the `roster-preset` feature/domain/router/table family, the
// `rosterPresetsChanged` user-bus member, the "Rosters" library. Nothing below names any of them: every
// target is either a chat-domain file path, a chat-domain exported symbol, or a chat-domain LOCAL
// declaration listed by file. Vocabulary-map row 45 (`ChatMembership`) and row 48 (`roster` is reserved)
// are the other two halves of the same ruling.
//
// DELIBERATELY OUT OF SCOPE (reported, not renamed — each needs its own ruling because it is a WIRE
// value or lives outside the chat domain):
//   • `ChatResource.roster` (`@orb/contracts/identity`) + `ChatContext.roster` + `toolRoster` — these
//     spell row 45's concept (`ChatMembership`), so their word is `membership`, not `participants`.
//   • `BulkImportChatInput.roster` (`@orb/contracts/chat/bulk-import`) — a wire field.
//   • `CHAT_OP_CODES.speakerOffRoster` / `"speaker_off_roster"` — a client-observable reason code.
//   • the `"roster-card-read"` capability id — its fix string lives in `tooling/`, banned in this lane.
//   • `packages/contracts/src/chat/roster.ts` (+ `rosterMemberSpecSchema`), the rpg domain's own
//     `roster` family, `domain/persona/verbs/resolve-personas-for-roster.ts`, and the client's
//     `features/chat/lib/roster.ts` + `use-roster-*` hooks.
//
// Preview:  pnpm codemod:run scripts/codemods/rename-roster-participants.ts
// Apply:    pnpm codemod:run scripts/codemods/rename-roster-participants.ts --apply

import process from "node:process";
import type { CodemodContext, Plan, SourceFile } from "@orb/tooling/codemod";
import { moveFiles, Node, printDiagnostics, renameExportedSymbol, runCodemod, SyntaxKind } from "@orb/tooling/codemod";

const CHAT = "packages/server/src/domain/chat";
const CHAT_TESTS = "tests/server/domain/chat";

/** Source moves. `moveFiles` rewrites every importer; the central test mirror moves in the same commit
 *  (the `test-layout` gate pairs `packages/<pkg>/src/<p>.ts` with `tests/<pkg>/<p>.<kind>.test.ts`). */
const MOVES: ReadonlyArray<readonly [from: string, to: string]> = [
  // `persistence/participant.ts` already holds the membership-lifecycle WRITES; this module is the READ
  // + the initial-row builder, so the file name carries the `-read` qualifier (owner ruling, #1010 fork 3)
  // rather than landing a `participants.ts` that differs from its neighbour by one letter.
  [`${CHAT}/persistence/roster.ts`, `${CHAT}/persistence/participants-read.ts`],
  [`${CHAT}/verbs/roster.ts`, `${CHAT}/verbs/participants.ts`],
  [`${CHAT}/verbs/resolve-rpg-roster.ts`, `${CHAT}/verbs/resolve-rpg-participants.ts`],
  [`${CHAT}/substrate/roster-host.ts`, `${CHAT}/substrate/participants-host.ts`],
  [`${CHAT}/substrate/roster-humans.ts`, `${CHAT}/substrate/participants-humans.ts`],
  [`${CHAT_TESTS}/persistence/roster.int.test.ts`, `${CHAT_TESTS}/persistence/participants-read.int.test.ts`],
  [`${CHAT_TESTS}/verbs/roster.int.test.ts`, `${CHAT_TESTS}/verbs/participants.int.test.ts`],
  [`${CHAT_TESTS}/verbs/resolve-rpg-roster.int.test.ts`, `${CHAT_TESTS}/verbs/resolve-rpg-participants.int.test.ts`],
  [`${CHAT_TESTS}/substrate/roster-host.test.ts`, `${CHAT_TESTS}/substrate/participants-host.test.ts`],
  [`${CHAT_TESTS}/substrate/roster-humans.test.ts`, `${CHAT_TESTS}/substrate/participants-humans.test.ts`],
];

/** Exported symbols, renamed through the language service (follows re-exports + the `index.ts` barrel).
 *  Paths are the PRE-move paths: the renames run before the moves. */
const EXPORTED_RENAMES: ReadonlyArray<{ readonly file: string; readonly oldName: string; readonly newName: string }> = [
  { file: `${CHAT}/persistence/roster.ts`, oldName: "loadRoster", newName: "loadParticipants" },
  { file: `${CHAT}/persistence/roster.ts`, oldName: "buildInitialRosterRows", newName: "buildInitialParticipantRows" },
  { file: `${CHAT}/verbs/roster.ts`, oldName: "createRoster", newName: "createParticipants" },
  { file: `${CHAT}/verbs/resolve-rpg-roster.ts`, oldName: "createResolveRpgRoster", newName: "createResolveRpgParticipants" },
  { file: `${CHAT}/contract/context.ts`, oldName: "ResolveRpgRoster", newName: "ResolveRpgParticipants" },
  { file: `${CHAT}/contract/context.ts`, oldName: "RpgRosterActor", newName: "RpgParticipantActor" },
];

/** Declaration kinds a LOCAL rename may target. A `PropertySignature` is included because the chat
 *  domain's param-object shapes (`{ readonly roster: … }`) are file-local types whose only consumers are
 *  the shorthand call sites the language service rewrites with them. */
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

/** Non-exported declarations, renamed per FILE. The file list is the fence: every excluded chat file
 *  either spells row 45's `membership` concept or carries a wire field (see the header). */
const LOCAL_RENAMES: ReadonlyArray<{ readonly file: string; readonly oldName: string; readonly newName: string }> = [
  // The room-participants row list, spelled `roster` as a local/param/param-object field.
  ...[
    "verbs/edit.ts",
    "verbs/chat-lifecycle.ts",
    "verbs/read.ts",
    "verbs/turn.ts",
    "verbs/claim-chat.ts",
    "verbs/resolve-rpg-card-corpus.ts",
    "verbs/post-narrator-message.ts",
    "verbs/extract-quiet.ts",
    "verbs/resolve-rpg-roster.ts",
    "service.ts",
    "engine/engine.ts",
    "substrate/roster-host.ts",
    "substrate/roster-humans.ts",
    "substrate/handoff-copy.ts",
    "verbs/roster.ts",
    "substrate/backfill.ts",
  ].map((rel) => ({ file: `${CHAT}/${rel}`, oldName: "roster", newName: "participants" })),
  // `fork.ts` already binds BOTH neighbouring words in the same scope — `participants` is the new room's
  // resolved `ParticipantView[]` and `participantRows` is its insert payload — so the SOURCE room's loaded
  // seats take a third, unambiguous spelling. The two TS2451s the dry run raised here were resolved by
  // finding a TRUER word for what this binding holds, never by suppressing the collision.
  { file: `${CHAT}/verbs/fork.ts`, oldName: "roster", newName: "sourceParticipants" },
  // The remaining chat-domain `roster`-bearing local names.
  { file: `${CHAT}/verbs/roster.ts`, oldName: "RosterDeps", newName: "ParticipantDeps" },
  { file: `${CHAT}/verbs/roster.ts`, oldName: "RosterVerbs", newName: "ParticipantVerbs" },
  { file: `${CHAT}/verbs/resolve-rpg-roster.ts`, oldName: "RosterRow", newName: "ParticipantRow" },
  { file: `${CHAT}/verbs/read.ts`, oldName: "rosterCharacterIds", newName: "participantCharacterIds" },
  { file: `${CHAT}/verbs/start-chat.ts`, oldName: "rosterRows", newName: "participantRows" },
  // The entry-tier field that carries the renamed op into the rpg composition root.
  { file: "packages/server/src/entry/compose/chat.ts", oldName: "resolveRpgRoster", newName: "resolveRpgParticipants" },
];

/** How many rename passes one (file, name) pair may take before we call it a loop. Each pass removes at
 *  least one declaration of `oldName`, so the cap is a guard against a rename that silently no-ops. */
const MAX_RENAME_PASSES = 64;

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
 *  file-local NAME can still be referenced from a file the DECLARING file does not import (a test that
 *  builds the shape structurally), which `getReferencingSourceFiles()` does not report. */
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

/** Rename file-local declarations through the language service. A local rename's blast radius is its own
 *  file plus any file holding a reference the LS resolves (a shorthand call site, a re-export of a local
 *  type) — `sf.getReferencingSourceFiles()` is declared BEFORE the first mutation, per the harness's
 *  declaration law. */
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
        innerCtx.log(`  ${target.file}: ${target.oldName} → ${target.newName} (${passes} declaration${passes === 1 ? "" : "s"})`);
      }
    },
  };
}

await runCodemod(
  "rename-roster-participants",
  (ctx) => {
    for (const { file, oldName, newName } of EXPORTED_RENAMES) {
      ctx.plan(renameExportedSymbol(ctx, file, { oldName, newName }, { note: `${oldName} → ${newName}` }));
    }
    ctx.plan(renameLocalSymbols(LOCAL_RENAMES));
    // `moveFiles` forgets the phantom pre-move source (#1778) and restores the `.ts` on every specifier
    // it rewrites (#1781) since the kit fix; the two hand-rolled plans that used to do it here are gone.
    ctx.plan(moveFiles(ctx, MOVES, { note: "chat roster modules → participants" }));
    // `--diagnose` prints the pre-emit diagnostics the harness only COUNTS. The harness refuses to apply
    // on a non-zero count, so this is how a collision (a renamed local shadowing an existing
    // `participants`) is located rather than guessed at.
    if (process.argv.slice(2).includes("--diagnose")) {
      printDiagnostics(ctx);
    }
  },
  { argv: process.argv.slice(2) },
);
