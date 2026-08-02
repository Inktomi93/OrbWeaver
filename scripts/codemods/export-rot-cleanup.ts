#!/usr/bin/env tsx
/**
 * export-rot-cleanup — executes the reviewed disposition table at
 * `docs/reviews/misc/2026-08-03-export-rot-dispositions.md`.
 *
 * The TABLE is the source of truth; this file is its executor. Every row below was upgraded from
 * "candidate" to confirmed by `pnpm ast orphans|testonly` (re-run after the declaration-node keying
 * fix `c6c20d21`), `git log -S`, a literal whole-repo sweep, and a twin-sibling liveness check — see
 * the table for the per-row evidence. Do not add a row here without adding it there.
 *
 * Six phases, in order (order is load-bearing — text offsets are computed BEFORE any mutation, and
 * the language-service renames must run after the text pass so they resolve against settled files):
 *   1. TAG      — `@public <reason>` on deliberate orphans (knip consumes `tags: ["-@public"]`).
 *   2. UNEXPORT — delete a dead declaration AND every barrel re-export of it (an unexported unused
 *                 declaration is itself dead code, so both halves go together).
 *   3. WIRE     — `EmitNotification` dies as an orphan by GAINING its consumer.
 *   4. TRUTH    — repair headers whose claims the code contradicts (the stickler-F8 defect).
 *   5. RENAME   — test-only seams adopt the server's `__reset*` / `__<verb>ForTest` convention.
 *   6. SWEEP    — a literal pass for the string/comment uses the language service cannot see.
 *
 * Run:  pnpm tsx scripts/codemods/export-rot-cleanup.ts           (dry run, default)
 *       pnpm tsx scripts/codemods/export-rot-cleanup.ts --apply
 */

import type { CodemodContext, ExportDeclaration, Plan, SourceFile, TextReplacement } from "./codemod-kit";
import { applyTextReplacements, assert, deleteFiles, findExportedDeclaration, Node, renameExportedSymbol, runCodemod, SyntaxKind } from "./codemod-kit";

// ── The table, as data ───────────────────────────────────────────────────────

interface TagRow {
  readonly file: string;
  readonly name: string;
  /** The one-line reason. Names the LIVE sibling (convention twin) or the unbuilt surface. */
  readonly reason: string;
}

/** §A + §B of the table — deliberate orphans that must survive the next unused-export sweep. */
const TAG_ROWS: readonly TagRow[] = [
  // §A — convention twin of a live sibling.
  {
    file: "packages/contracts/src/assets/index.ts",
    name: "ResolveBlobRefsParams",
    reason: "type twin of `resolveBlobRefsParamsSchema`, the live `resolveBlobRefs` tRPC input.",
  },
  {
    file: "packages/contracts/src/assets/index.ts",
    name: "ResolveChatBlobRefsParams",
    reason: "type twin of `resolveChatBlobRefsParamsSchema`, the live `resolveChatBlobRefs` tRPC input.",
  },
  {
    file: "packages/contracts/src/automation/index.ts",
    name: "AutomationTriggerBus",
    reason: "member twin of `AUTOMATION_TRIGGER_BUSES`, which drives the automation_rules enum + CHECK.",
  },
  { file: "packages/contracts/src/automation/index.ts", name: "AutomationBusEventType", reason: "discriminant twin of the live `AutomationBusEvent` union." },
  { file: "packages/contracts/src/chat/bus.ts", name: "TurnAbortedOpCode", reason: "type twin of the live `TURN_ABORTED_OP_CODE` constant." },
  {
    file: "packages/contracts/src/chat/roster.ts",
    name: "AcceptInviteInput",
    reason: "type twin of `acceptInviteSchema`, the live `acceptInvite` tRPC input.",
  },
  {
    file: "packages/contracts/src/imagery/index.ts",
    name: "GeneratePictureRequest",
    reason: "type twin of `generatePictureRequestSchema`, the live `generateImage` tRPC input.",
  },
  { file: "packages/contracts/src/persona/index.ts", name: "PersonaMetadataWrite", reason: "type twin of the live `personaMetadataWriteSchema` write guard." },
  {
    file: "packages/contracts/src/preset/index.ts",
    name: "GuidedActionConfig",
    reason: "type twin of `guidedActionConfigSchema`, which shapes all six guided actions in this file.",
  },
  {
    file: "packages/contracts/src/preset/index.ts",
    name: "GreetingTransformId",
    reason: "id twin of `GREETING_TRANSFORMS`, the catalog the greeting studio renders.",
  },
  { file: "packages/contracts/src/character/index.ts", name: "CardAsset", reason: "type twin of `cardAssetSchema`, live in this file's card schema." },
  {
    file: "packages/contracts/src/chat/content-blocks.ts",
    name: "MessageMediaKind",
    reason: "type twin of `messageMediaKindSchema`, live in this file's media block.",
  },
  {
    file: "packages/contracts/src/chat/content-blocks.ts",
    name: "MessageMediaSrc",
    reason: "type twin of `messageMediaSrcSchema`, live in this file's media block.",
  },
  {
    file: "packages/contracts/src/chat/participants.ts",
    name: "participantKindSchema",
    reason: "schema twin of `PARTICIPANT_KINDS`, which drives the chat_participants enum + CHECK.",
  },
  {
    file: "packages/contracts/src/chat/roster.ts",
    name: "participantRoleSchema",
    reason: "schema twin of `PARTICIPANT_ROLES`, which drives the chat_participants role enum + CHECK.",
  },
  {
    file: "packages/contracts/src/chat/roster.ts",
    name: "talkativenessSchema",
    reason: "the named 0-1 RANGE clamp for the live `TALKATIVENESS_DEFAULT` axis (cited by seatKnobs below).",
  },
  {
    file: "packages/contracts/src/chat/roster.ts",
    name: "CharacterMemberSpec",
    reason: "type twin of `characterMemberSpecSchema`, round-trip-pinned by tests/contracts/chat/roster.contract.test.ts.",
  },
  {
    file: "packages/contracts/src/chat/roster.ts",
    name: "RosterMemberSpec",
    reason: "type twin of `rosterMemberSpecSchema`, round-trip-pinned by tests/contracts/chat/roster.contract.test.ts.",
  },
  {
    file: "packages/contracts/src/chat/roster.ts",
    name: "inviteStatusSchema",
    reason: "schema twin of `INVITE_STATUSES`, which drives the chat_invites status enum + CHECK.",
  },
  { file: "packages/contracts/src/identity/index.ts", name: "userKindSchema", reason: "schema twin of `USER_KINDS`, which drives the users.kind enum." },
  { file: "packages/contracts/src/settings/index.ts", name: "RegexSettings", reason: "type twin of `regexSettingsSchema`, live in this file's settings blob." },
  {
    file: "packages/server/src/infra/providers/contract/agent.ts",
    name: "AgentDialogKind",
    reason: "member twin of `AGENT_DIALOG_KINDS`, re-exported from the providers contract front door.",
  },
  {
    file: "packages/kit/src/ids/index.ts",
    name: "OwnerStatId",
    reason: "the owner_stats table's id brand — one member of the per-table brand block; unused as a column type only because that table has a NATURAL PK.",
  },

  // §B — pre-built / spec'd-not-built surface.
  {
    file: "packages/contracts/src/databank/index.ts",
    name: "ChunkParamsPin",
    reason: "a compile-time mutual-assignability pin — referenced by tsc, never by an importer, by design.",
  },
  { file: "packages/contracts/src/memory/index.ts", name: "ClipKind", reason: "pre-built memory surface — the clip vocabulary lands with the memory domain." },
  { file: "packages/contracts/src/memory/index.ts", name: "clipKindSchema", reason: "pre-built memory surface — schema twin of `CLIP_KINDS`." },
  {
    file: "packages/contracts/src/memory/index.ts",
    name: "ClipSourceKind",
    reason: "pre-built memory surface — provenance vocabulary (Knowledge-Cluster.md S9).",
  },
  { file: "packages/contracts/src/memory/index.ts", name: "clipSourceKindSchema", reason: "pre-built memory surface — schema twin of `CLIP_SOURCE_KINDS`." },
  { file: "packages/contracts/src/memory/index.ts", name: "ClipScope", reason: "pre-built memory surface — clip scope vocabulary." },
  { file: "packages/contracts/src/memory/index.ts", name: "clipScopeSchema", reason: "pre-built memory surface — schema twin of `CLIP_SCOPES`." },
  {
    file: "packages/contracts/src/plugin/host-v1.ts",
    name: "PluginInvocation",
    reason: "the guest-facing invocation-context shape of PluginHostV1 — the membrane does not deliver it yet (surface unbuilt, not dead).",
  },
  {
    file: "packages/server/src/domain/plugin/contract/errors.ts",
    name: "HostVersionUnservedError",
    reason: "a member of the built lifecycle error taxonomy; zero throw sites because the hostVersion gate is unbuilt.",
  },
];

interface DeleteRow {
  readonly file: string;
  readonly name: string;
}

/** §C + §D — the declarations to remove. Every one is asserted zero-ref (outside the barrels below)
 *  in-script before a byte moves. */
const DELETE_DECLARATIONS: readonly DeleteRow[] = [
  { file: "packages/client/src/state/chrome-registry-context.ts", name: "ChromeRegistryContext" },
  { file: "packages/client/src/state/modal-registry-context.ts", name: "ModalRegistryContext" },
  { file: "packages/client/src/state/section-registry-context.ts", name: "SectionRegistryContext" },
  { file: "packages/client/src/state/settings-pane-registry-context.ts", name: "SettingsPaneRegistryContext" },
  { file: "packages/client/src/state/settings-section-registry-context.ts", name: "SettingsSectionRegistryContext" },
  { file: "packages/server/src/domain/connection/contract/service.ts", name: "ConnectionServiceDeps" },
  { file: "packages/server/src/domain/credentials/contract/service.ts", name: "CredentialsServiceDeps" },
  { file: "packages/server/src/domain/discovery/contract/service.ts", name: "DiscoveryServiceDeps" },
  { file: "packages/server/src/domain/embeddings/contract/service.ts", name: "EmbeddingsServiceDeps" },
  { file: "packages/server/src/domain/search/contract/service.ts", name: "SearchServiceDeps" },
  { file: "packages/server/src/foundation/observability/debug/routes.ts", name: "debugAuthMiddleware" },
  { file: "packages/server/src/infra/providers/backends/kit/history.ts", name: "assertMappedHistoryRole" },
  { file: "packages/server/src/domain/connection/contract/views.ts", name: "ModelCatalogView" },
  { file: "packages/server/src/domain/connection/contract/views.ts", name: "ModelCapabilityView" },
  { file: "packages/client/src/lib/injection-copy.ts", name: "NEEDS_ASSISTANT_REPLY" },
  { file: "packages/client/src/lib/injection-copy.ts", name: "WAND_NEEDS_TEXT" },
  { file: "packages/contracts/src/preset/index.ts", name: "PROMPT_MACRO_NAMES" },
  { file: "packages/contracts/src/settings/index.ts", name: "clampImageVariantQuality" },
  { file: "packages/contracts/src/settings/index.ts", name: "StreamScrollMode" },
  { file: "packages/contracts/src/tag/index.ts", name: "TagTargetId" },
  { file: "packages/contracts/src/portability/index.ts", name: "PortableEnvelope" },
  { file: "packages/contracts/src/chat/messages.ts", name: "MessageVariant" },
  { file: "packages/contracts/src/chat/bus.ts", name: "TurnRef" },
];

/** The barrel re-exports of the deleted declarations. A `<file, name>` pair per `export { name } from`
 *  specifier. These are the ONLY references the zero-ref assertion tolerates. */
const DELETE_BARREL_SPECIFIERS: readonly DeleteRow[] = [
  { file: "packages/client/src/state/index.ts", name: "ChromeRegistryContext" },
  { file: "packages/client/src/state/index.ts", name: "ModalRegistryContext" },
  { file: "packages/client/src/state/index.ts", name: "SectionRegistryContext" },
  { file: "packages/client/src/state/index.ts", name: "SettingsPaneRegistryContext" },
  { file: "packages/client/src/state/index.ts", name: "SettingsSectionRegistryContext" },
  { file: "packages/server/src/domain/connection/index.ts", name: "ConnectionServiceDeps" },
  { file: "packages/server/src/domain/credentials/index.ts", name: "CredentialsServiceDeps" },
  { file: "packages/server/src/domain/discovery/index.ts", name: "DiscoveryServiceDeps" },
  { file: "packages/server/src/domain/embeddings/index.ts", name: "EmbeddingsServiceDeps" },
  { file: "packages/server/src/domain/search/index.ts", name: "SearchServiceDeps" },
  { file: "packages/server/src/foundation/observability/debug/index.ts", name: "debugAuthMiddleware" },
  { file: "packages/server/src/foundation/observability/index.ts", name: "debugAuthMiddleware" },
  { file: "packages/server/src/infra/providers/backends/kit/index.ts", name: "assertMappedHistoryRole" },
  { file: "packages/server/src/domain/connection/index.ts", name: "ModelCatalogView" },
  { file: "packages/server/src/domain/connection/index.ts", name: "ModelCapabilityView" },
  { file: "packages/client/src/lib/index.ts", name: "NEEDS_ASSISTANT_REPLY" },
  { file: "packages/client/src/lib/index.ts", name: "WAND_NEEDS_TEXT" },
  { file: "packages/contracts/src/chat/index.ts", name: "MessageVariant" },
  { file: "packages/contracts/src/chat/index.ts", name: "TurnRef" },
  // DiscoveryError — the class dies with its whole file (see DELETE_FILES).
  { file: "packages/server/src/domain/discovery/index.ts", name: "DiscoveryError" },
];

/**
 * Files whose ENTIRE export surface is on the delete list — a module left holding only a header and an
 * import is rot in its own right, so the file goes with its last export.
 *   · discovery `contract/errors.ts` held only `DiscoveryError`.
 *   · connection `contract/views.ts` held only the two bypassed `Model*View` aliases.
 */
const DELETE_FILES = ["packages/server/src/domain/discovery/contract/errors.ts", "packages/server/src/domain/connection/contract/views.ts"] as const;

interface RenameRow {
  readonly file: string;
  readonly oldName: string;
  readonly newName: string;
}

/** §G — the server's convention: `__reset<Noun>` for a state reset, `__<verb>ForTest` otherwise. */
const RENAMES: readonly RenameRow[] = [
  { file: "packages/client/src/state/character-library-store.ts", oldName: "clearTagFilter", newName: "__resetTagFilter" },
  { file: "packages/client/src/state/message-edit-draft.ts", oldName: "readMessageEditDraft", newName: "__readMessageEditDraftForTest" },
  { file: "packages/client/src/state/message-selection-store.ts", oldName: "clearSelection", newName: "__resetSelection" },
  { file: "packages/client/src/state/preset-selection-store.ts", oldName: "clearPresetSelection", newName: "__resetPresetSelection" },
  { file: "packages/client/src/state/preset-selection-store.ts", oldName: "clearPresetSection", newName: "__resetPresetSection" },
  { file: "packages/client/src/state/preset-selection-store.ts", oldName: "dismissPresetSection", newName: "__dismissPresetSectionForTest" },
  { file: "packages/client/src/state/preset-template-selection-store.ts", oldName: "clearPresetTemplate", newName: "__resetPresetTemplate" },
  { file: "packages/client/src/state/recent-models-store.ts", oldName: "readRecentModels", newName: "__readRecentModelsForTest" },
  { file: "packages/client/src/state/recent-models-store.ts", oldName: "clearAllRecentModels", newName: "__resetAllRecentModels" },
  { file: "packages/client/src/state/steer-recovery-store.ts", oldName: "readRecentSteers", newName: "__readRecentSteersForTest" },
  { file: "packages/client/src/state/steer-recovery-store.ts", oldName: "clearRecentSteers", newName: "__resetRecentSteers" },
  { file: "packages/client/src/state/chat-stream.ts", oldName: "setFrameScheduler", newName: "__setFrameSchedulerForTest" },
];

/** §4 — headers whose claims the code contradicts, plus the one WIRE edit. `find` must match exactly
 *  once across the file, or the codemod aborts (a silently-missed repair is the failure mode here). */
interface EditRow {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly note: string;
}

const TEXT_EDITS: readonly EditRow[] = [
  // WIRE — the one genuine re-spell of `EmitNotification` (chat's and automation-plugin's sites are
  // IMPLEMENTATIONS, and chat's is a different two-arg `NotificationsEmitOp`).
  {
    file: "packages/server/src/entry/compose/automation-watcher.ts",
    find: "  readonly emitNotification: (event: NotificationEvent) => Promise<void>;",
    replace: "  readonly emitNotification: EmitNotification;",
    note: "wire EmitNotification (was an inline re-spell)",
  },
  {
    file: "packages/server/src/entry/compose/automation-watcher.ts",
    find: 'import type { NotificationEvent } from "@orb/contracts/notifications";\n',
    replace: "",
    note: "drop the now-unused NotificationEvent import",
  },
  {
    file: "packages/server/src/entry/compose/automation-watcher.ts",
    find: 'import { loadTurnOrigin } from "#domain/chat";',
    replace: 'import { loadTurnOrigin } from "#domain/chat";\nimport type { EmitNotification } from "#domain/notifications";',
    note: "import the one-home EmitNotification type",
  },
  // TRUTH — headers naming a deleted alias.
  {
    file: "packages/server/src/domain/credentials/contract/service.ts",
    find: "// The typed API surface: CredentialContext (the DI bundle), CredentialsServiceDeps (entry-root deps), and\n// CredentialsService (the verb interface).",
    replace:
      "// The typed API surface: CredentialContext (the DI bundle, which the entry root passes straight to\n// createCredentialsService) and CredentialsService (the verb interface).",
    note: "header named the deleted CredentialsServiceDeps alias",
  },
  {
    file: "packages/server/src/domain/search/contract/service.ts",
    find: "// domain/search/contract/service — typed API surface: SearchContext (DI bundle), SearchServiceDeps\n// (entry-root input, identical to the context), SearchService (the verb interface).",
    replace:
      "// domain/search/contract/service — typed API surface: SearchContext (the DI bundle, which is also the\n// entry-root input) and SearchService (the verb interface).",
    note: "header named the deleted SearchServiceDeps alias",
  },
  // TRUTH — discovery mints no typed errors; state the reality where it cannot be silently re-minted.
  {
    file: "packages/server/src/domain/discovery/index.ts",
    find: "// (2026-07-10; the dossier client queries it directly); discovery's image analytics stay retrieval-free.",
    replace:
      "// (2026-07-10; the dossier client queries it directly); discovery's image analytics stay retrieval-free.\n" +
      "//\n" +
      "// NO TYPED ERRORS, deliberately (2026-08-03): discovery mints none. An engine/infra fault PROPAGATES\n" +
      "// unchanged (verbs/analyze.ts), a validation failure DEGRADES to the ungrounded result, and an empty\n" +
      "// corpus is a zero-count result, not a fault. The former `contract/errors.ts` claimed a DiscoveryError\n" +
      "// these paths throw — nothing ever threw it. Growing a real taxonomy here is a design change, not a\n" +
      "// re-add of the class.",
    note: "truth-repair: discovery has no typed errors, and why",
  },
  // TRUTH — document the sanctioned `.Context` consumer so the next lens run does not re-litigate it.
  {
    file: "packages/client/src/lib/create-registry-context.tsx",
    find: "/** The trio a `createRegistryContext` call yields: the raw Context (assembled at main.tsx, G8), the read\n *  hook (throws when no Provider is mounted), and the Provider that delivers the registry down. */",
    replace:
      "/** The trio a `createRegistryContext` call yields: the raw Context (assembled at main.tsx, G8), the read\n" +
      " *  hook (throws when no Provider is mounted), and the Provider that delivers the registry down.\n" +
      " *\n" +
      " *  `Context` is a SANCTIONED escape hatch, not incidental surface: a consumer that must tolerate a\n" +
      " *  MISSING provider reads `useContext(X)` directly for the nullable value, because `useRegistry()`\n" +
      " *  throws by design (message-tool-calls.tsx, use-slash-commands.tsx). Re-export a registry's\n" +
      " *  `.Context` ONLY when such a consumer exists — five re-exports with no optional reader were\n" +
      " *  deleted 2026-08-03. Everything else uses the hook. */",
    note: "document the optional-read pattern as .Context's sanctioned consumer",
  },
];

/**
 * §G literal-sweep arm — the string/comment uses `renameExportedSymbol` cannot see (a zustand devtools
 * action label, test titles, gate-file prose). Applied AFTER the renames, so every surviving occurrence
 * is by definition a non-code one.
 *
 * `scripts/codemods/` is EXCLUDED: an unscoped sweep rewrites the `oldName` column of the RENAMES table
 * above, silently making this file's own record of the rename a lie (caught in the first dry run).
 */
const LITERAL_SWEEP: readonly (readonly [RegExp, string])[] = RENAMES.map((r) => [new RegExp(`\\b${r.oldName}\\b`, "g"), r.newName] as const);
const SWEEP_EXCLUDED_PATHS = ["/scripts/codemods/"] as const;

function literalSweep(ctx: CodemodContext, rewrites: readonly (readonly [RegExp, string])[]): Plan {
  return {
    description: `Literal sweep of ${rewrites.length} renamed seam name(s) in strings/comments`,
    // Whole-project, like the kit's own `repointAliasPaths` — the harness snapshots these BEFORE the
    // transform, which is the only way the sweep's edits appear in the preview diff at all.
    touchedFiles: ctx.project.getSourceFiles().map((sf) => sf.getFilePath()),
    transform(innerCtx): void {
      for (const sf of innerCtx.project.getSourceFiles()) {
        const path = sf.getFilePath();
        if (SWEEP_EXCLUDED_PATHS.some((p) => path.includes(p))) {
          continue;
        }
        const before = sf.getFullText();
        let after = before;
        for (const [pattern, replacement] of rewrites) {
          after = after.replace(pattern, replacement);
        }
        if (after !== before) {
          sf.replaceWithText(after);
        }
      }
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** The STATEMENT a declaration belongs to — a `const`'s declaration node is nested two levels inside
 *  its `VariableStatement`, and removing only the inner node would leave a dangling `export const`. */
function declarationStatement(decl: Node): Node {
  const varStatement = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  return varStatement ?? decl;
}

/** The offset of the first character on `pos`'s line — so a removal takes the whole line, not a
 *  fragment that leaves stray indentation behind. */
function lineStart(text: string, pos: number): number {
  const nl = text.lastIndexOf("\n", pos - 1);
  return nl === -1 ? 0 : nl + 1;
}

/**
 * The full removal range for a statement: from the start of the line holding its leading JSDoc (a
 * doc comment describing a deleted symbol is itself rot) through the newline ending it — plus one
 * extra blank line when the removal would otherwise collapse two blank lines into a double gap.
 */
function statementRemovalRange(sf: SourceFile, statement: Node): { start: number; end: number } {
  const text = sf.getFullText();
  const start = lineStart(text, statement.getStart(true));
  let end = text.indexOf("\n", statement.getEnd());
  end = end === -1 ? statement.getEnd() : end + 1;
  // Collapse a blank-before + blank-after pair down to a single blank line.
  if (start >= 2 && text[start - 1] === "\n" && text[start - 2] === "\n" && text[end] === "\n") {
    end += 1;
  }
  return { start, end };
}

/**
 * The replacements that drop `names` from a file's `export { … } from "…"` clauses.
 *
 * Rewriting the whole SPECIFIER SPAN per clause (rather than one range per name) is what makes this
 * correct when two names go from the same clause — the naive per-name range aliases the shared comma
 * and the kit's overlap guard rejects it. Leading and trailing removals fall out of the span bounds
 * for free; an interior one is spliced with its following separator, so the survivors keep their
 * original single-line or multi-line formatting exactly.
 */
function clauseRemovalReplacement(sf: SourceFile, decl: ExportDeclaration, names: ReadonlySet<string>): TextReplacement | null {
  const specs = decl.getNamedExports();
  const doomed = specs.filter((s) => names.has(s.getName()));
  if (doomed.length === 0) {
    return null;
  }
  const filePath = sf.getFilePath();
  const label = `drop re-export(s) ${doomed.map((s) => s.getName()).join(", ")}`;
  const kept = specs.filter((s) => !names.has(s.getName()));
  if (kept.length === 0) {
    const range = statementRemovalRange(sf, decl);
    return { filePath, start: range.start, end: range.end, text: "", label };
  }
  const first = kept[0];
  const last = kept.at(-1);
  const spanStart = specs[0]?.getStart();
  const spanEnd = specs.at(-1)?.getEnd();
  if (first === undefined || last === undefined || spanStart === undefined || spanEnd === undefined) {
    return null;
  }
  // Start at the first survivor and end at the last, so leading/trailing removals fall outside the
  // window for free. Interior ones are spliced end-descending, keeping earlier offsets valid.
  const base = first.getStart();
  let inner = sf.getFullText().slice(base, last.getEnd());
  for (let i = specs.length - 1; i >= 0; i--) {
    const spec = specs[i];
    const next = specs[i + 1];
    if (spec === undefined || next === undefined || !names.has(spec.getName())) {
      continue;
    }
    inner = inner.slice(0, spec.getStart() - base) + inner.slice(next.getStart() - base);
  }
  return { filePath, start: spanStart, end: spanEnd, text: inner, label };
}

function barrelRemovalReplacements(sf: SourceFile, names: ReadonlySet<string>): TextReplacement[] {
  const out: TextReplacement[] = [];
  for (const decl of sf.getExportDeclarations()) {
    const replacement = clauseRemovalReplacement(sf, decl, names);
    if (replacement !== null) {
      out.push(replacement);
    }
  }
  return out;
}

/**
 * The `@public` tag insert for one declaration. When the declaration already carries a JSDoc block we
 * MERGE into it rather than stacking a second block above — two adjacent doc comments are ambiguous
 * to every reader, human and tooling alike. Otherwise we insert a fresh one-line block.
 */
function tagReplacement(sf: SourceFile, statement: Node, reason: string): TextReplacement {
  const text = sf.getFullText();
  const docs = Node.isJSDocable(statement) ? statement.getJsDocs() : [];
  const lastDoc = docs.at(-1);
  const filePath = sf.getFilePath();
  if (lastDoc !== undefined) {
    const raw = lastDoc.getText();
    const body = raw.slice("/**".length, raw.length - "*/".length).trimEnd();
    return {
      filePath,
      start: lastDoc.getStart(),
      end: lastDoc.getEnd(),
      text: `/**${body}\n *\n *  @public ${reason} */`,
      label: "merge @public into the existing JSDoc",
    };
  }
  const start = lineStart(text, statement.getStart(true));
  return { filePath, start, end: start, text: `/** @public ${reason} */\n`, label: "add an @public JSDoc" };
}

/**
 * Drop import specifiers a deletion just orphaned — deleting `export type StreamScrollMode = ScrollMode`
 * leaves `ScrollMode` imported and unused, which is the same rot one layer down.
 *
 * The liveness test is deliberately CONSERVATIVE: the local name must appear nowhere in the file outside
 * its own import declarations, checked on raw text so a `{@link Foo}` in a doc comment counts as a use.
 * Re-queries after every removal (a `replaceText`/`remove` invalidates every held node), and runs as its
 * own Plan so it sees the post-deletion tree.
 */
function pruneOrphanedImports(files: readonly string[]): Plan {
  return {
    description: `Prune import specifiers orphaned by the deletions (${files.length} file(s))`,
    // Declared, not empty: the harness snapshots `touchedFiles` BEFORE the transform runs, and a plan
    // that under-declares has its edits captured as the "original" — silently invisible in the preview.
    touchedFiles: files,
    transform(innerCtx): void {
      for (const file of files) {
        // Fixpoint: one removal per pass, re-reading the file each time (a `remove()` invalidates
        // every node held from the previous pass). Bounded by the file's import count.
        while (pruneOneOrphanedImport(innerCtx, file)) {
          // keep going until the file has no orphaned specifier left
        }
      }
    },
  };
}

/** Is `local` referenced anywhere in `text` OUTSIDE the file's import declarations? Raw-text based on
 *  purpose, so a `{@link Foo}` in a doc comment counts as a use and the specifier survives. */
function isReferencedOutsideImports(text: string, local: string, importSpans: readonly (readonly [number, number])[]): boolean {
  const pattern = new RegExp(`\\b${local}\\b`, "g");
  return [...text.matchAll(pattern)].some((match) => !importSpans.some(([start, end]) => match.index >= start && match.index < end));
}

/** Remove ONE orphaned import specifier from `file` (dropping the declaration if that empties it).
 *  Returns whether anything was removed, so the caller can loop to a fixpoint. */
function pruneOneOrphanedImport(ctx: CodemodContext, file: string): boolean {
  const sf = ctx.project.getSourceFile(file);
  if (sf === undefined) {
    return false; // the whole file was deleted by an earlier plan
  }
  const text = sf.getFullText();
  const importSpans = sf.getImportDeclarations().map((d) => [d.getStart(), d.getEnd()] as const);
  for (const decl of sf.getImportDeclarations()) {
    const dead = decl.getNamedImports().find((spec) => !isReferencedOutsideImports(text, spec.getAliasNode()?.getText() ?? spec.getName(), importSpans));
    if (dead === undefined) {
      continue;
    }
    ctx.log(`prune orphaned import { ${dead.getName()} } from ${file}`);
    dead.remove();
    if (decl.getNamedImports().length === 0 && decl.getDefaultImport() === undefined && decl.getNamespaceImport() === undefined) {
      decl.remove();
    }
    return true;
  }
  return false;
}

/** Every reference to `name` that is NOT its own declaration and NOT one of the barrel specifiers we
 *  are removing in the same pass. A non-empty result means the row's verdict is wrong — abort. */
function unexpectedReferences(ctx: CodemodContext, row: DeleteRow, allowedFiles: ReadonlySet<string>): string[] {
  const sf = ctx.project.getSourceFile(row.file);
  assert(sf !== undefined, `delete row's file is not in the project: ${row.file}`, "Check the path in the disposition table.");
  const decl = findExportedDeclaration(sf, row.name);
  assert(decl !== undefined, `no exported "${row.name}" in ${row.file}`, "The table is stale — re-run `pnpm ast orphans` and fix the row.");
  if (!Node.isReferenceFindable(decl)) {
    return [];
  }
  const out: string[] = [];
  for (const ref of decl.findReferencesAsNodes()) {
    const refFile = ref.getSourceFile().getFilePath();
    if (refFile.endsWith(row.file) || allowedFiles.has(refFile)) {
      continue;
    }
    out.push(`${refFile}:${ref.getStartLineNumber()}`);
  }
  return out;
}

// ── The codemod ──────────────────────────────────────────────────────────────

await runCodemod("export-rot-cleanup", (ctx) => {
  const replacements: TextReplacement[] = [];

  // ── Phase 1 — TAG ──────────────────────────────────────────────────────────
  for (const row of TAG_ROWS) {
    const sf = ctx.project.getSourceFile(row.file);
    assert(sf !== undefined, `tag row's file is not in the project: ${row.file}`);
    const decl = findExportedDeclaration(sf, row.name);
    assert(decl !== undefined, `tag row has no exported "${row.name}" in ${row.file}`, "The table is stale — re-check the row.");
    replacements.push(tagReplacement(sf, declarationStatement(decl), row.reason));
  }
  ctx.log(`TAG: ${TAG_ROWS.length} @public tag(s)`);

  // ── Phase 2 — UNEXPORT (declarations + their barrel re-exports) ────────────
  // Every barrel file we are about to strip is an ALLOWED reference site; anything else is a live
  // consumer the table missed, and the run aborts rather than deleting reachable code.
  const barrelFiles = new Set<string>();
  for (const row of DELETE_BARREL_SPECIFIERS) {
    const sf = ctx.project.getSourceFile(row.file);
    assert(sf !== undefined, `barrel row's file is not in the project: ${row.file}`);
    barrelFiles.add(sf.getFilePath());
  }

  for (const row of DELETE_DECLARATIONS) {
    const unexpected = unexpectedReferences(ctx, row, barrelFiles);
    assert(
      unexpected.length === 0,
      `"${row.name}" is NOT dead — ${unexpected.length} live reference(s): ${unexpected.join(", ")}`,
      "Re-verify the row with `pnpm ast refs` and correct the disposition table before re-running.",
    );
    const sf = ctx.project.getSourceFileOrThrow(row.file);
    const decl = findExportedDeclaration(sf, row.name);
    assert(decl !== undefined, `no exported "${row.name}" in ${row.file}`);
    const range = statementRemovalRange(sf, declarationStatement(decl));
    replacements.push({ filePath: sf.getFilePath(), start: range.start, end: range.end, text: "", label: `delete declaration ${row.name}` });
  }
  ctx.log(`UNEXPORT: ${DELETE_DECLARATIONS.length} declaration(s), all asserted zero-ref`);

  // Group by file so a clause losing two names is rewritten once, not aliased twice.
  const barrelNamesByFile = new Map<string, Set<string>>();
  for (const row of DELETE_BARREL_SPECIFIERS) {
    const sf = ctx.project.getSourceFileOrThrow(row.file);
    const found = sf.getExportDeclarations().some((d) => d.getNamedExports().some((s) => s.getName() === row.name));
    assert(found, `no re-export specifier "${row.name}" in ${row.file}`, "The table is stale — check the barrel.");
    const set = barrelNamesByFile.get(row.file) ?? new Set<string>();
    set.add(row.name);
    barrelNamesByFile.set(row.file, set);
  }
  for (const [file, names] of barrelNamesByFile) {
    replacements.push(...barrelRemovalReplacements(ctx.project.getSourceFileOrThrow(file), names));
  }
  ctx.log(`UNEXPORT: ${DELETE_BARREL_SPECIFIERS.length} barrel re-export(s) across ${barrelNamesByFile.size} file(s)`);

  // ── Phases 3 + 4 — WIRE and TRUTH-REPAIR ──────────────────────────────────
  for (const edit of TEXT_EDITS) {
    const sf = ctx.project.getSourceFile(edit.file);
    assert(sf !== undefined, `edit row's file is not in the project: ${edit.file}`);
    const text = sf.getFullText();
    const start = text.indexOf(edit.find);
    assert(start !== -1, `edit target not found in ${edit.file}: ${edit.note}`, "The source drifted — re-read the file and update the edit row.");
    assert(text.indexOf(edit.find, start + 1) === -1, `edit target is ambiguous (matches twice) in ${edit.file}: ${edit.note}`);
    replacements.push({ filePath: sf.getFilePath(), start, end: start + edit.find.length, text: edit.replace, label: edit.note });
  }
  ctx.log(`WIRE + TRUTH: ${TEXT_EDITS.length} targeted edit(s)`);

  // One pass, end-descending — every offset above was computed before any mutation.
  ctx.plan(applyTextReplacements(ctx, replacements, { note: "tags, un-exports, wire, truth-repair" }));

  // Files whose last export just died go with it.
  ctx.plan(deleteFiles(ctx, [...DELETE_FILES], { confirm: true, note: "every export in these files was on the delete list" }));

  // A deletion can orphan the import that fed it — same rot, one layer down.
  ctx.plan(pruneOrphanedImports([...new Set(DELETE_DECLARATIONS.map((r) => r.file))]));

  // ── Phase 5 — RENAME (language service; updates importers + re-exports) ───
  for (const row of RENAMES) {
    ctx.plan(renameExportedSymbol(ctx, row.file, { oldName: row.oldName, newName: row.newName }));
  }
  ctx.log(`RENAME: ${RENAMES.length} test-only seam(s) onto the __reset* / __…ForTest convention`);

  // ── Phase 6 — the literal sweep the language service cannot do ─────────────
  ctx.plan(literalSweep(ctx, LITERAL_SWEEP));
});
