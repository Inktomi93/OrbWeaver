// Gate: empty-state-has-action (design-enforcement.md §3.2, D62 — rule-1 "no dead ends"). A JSX
// `<EmptyState>` render in packages/client/src/features/** must pass an `action` prop (a next-step CTA)
// OR appear in ALLOWLIST — without one an empty state strands the user. `action={…}` or a spread
// attribute (a conditional CTA the gate can't statically resolve) counts as satisfied. ALLOWLIST is a
// both-directions ratchet (no-interactive-role-in-features precedent).
import type { JsxAttributeLike, JsxSelfClosingElement } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const TAG_NAME = "EmptyState";

/** Current dead-end files → reason. See no-interactive-role-in-features.ts for the ratchet contract. */
const ALLOWLIST: Record<string, string> = {
  "packages/client/src/features/app-shell/components/section-placeholder.tsx":
    "the generic unbuilt-section placeholder (modal-body-not-placeholder's SectionPlaceholder sibling) " +
    "— has no section-specific next step to offer; the flag is on the eventual real section body, not here.",
  "packages/client/src/features/settings/components/settings-pane-placeholder.tsx": "the settings equivalent of section-placeholder.tsx — same reasoning.",
  "packages/client/src/features/preset/components/preset-library-welcome.tsx":
    'the Presets CONTENT teaching state — a "pick a preset on the left, or create one" nudge shown ' +
    "alongside the library list, which itself carries the create CTA; the next step lives in the sibling " +
    "list, so this state legitimately has no action of its own (same reasoning as preset-section-inspector.tsx).",
  "packages/client/src/features/world-info/components/world-info-welcome.tsx":
    "the World Info CONTENT teaching state — the exact twin of preset-library-welcome.tsx above: the " +
    "sibling LIST (on screen whenever this is) carries both the band's New primary and its own empty-state " +
    "CTA, so a third create button in the middle of CONTENT was the third simultaneous home for one verb.",
  "packages/client/src/features/chat/anchors/character-gallery-dialog.tsx":
    'the "Nothing left to add" state (every owned image is already in the gallery) has no next step — genuinely nothing to do.',
  "packages/client/src/features/chat/components/member-card-viewer.tsx":
    'the D22 NOT_FOUND gone-arm ("This card isn\'t available" — the character left the chat / no access) has no next step; the ' +
    "dialog's own Close is the only affordance, so this state legitimately carries no action of its own.",
  "packages/client/src/features/chat/components/variant-wire-viewer.tsx":
    "the RAWVIEW inspector's two statements of FACT — a variant that captured no prompt (an authored/imported/seeded row never ran " +
    "one) and the NOT_FOUND gone-arm (the message was deleted). Neither has a next step the host could take; the dialog's own Close " +
    "is the only affordance (the member-card-viewer precedent, same species).",
  "packages/client/src/features/preset/components/preset-section-inspector.tsx":
    'the "Select a section to inspect it" prompt shown when no rack row is selected — the next step (pick ' +
    "a row) lives in the sibling rack, not here, so this state legitimately has no action of its own; same " +
    "reasoning as preset-library-welcome.tsx.",
  // ── rpg game panel (rpg-design/11 §6) — the game surfaces are model/director-authored (pillar P1: the client
  // creates NOTHING), sibling-carried (a visible create form beside the list), or a DESIRED empty state. Each row
  // names its class so the next auditor can re-derive it. (C11 polish pass; allowlist WITH reasoning, not a bolted-on
  // decorative button — the confidence-theater ban.)
  "packages/client/src/features/world-info/components/world-info-context-body.tsx":
    'the "No book open" arm of the World Info CONTEXT pane (side-eye F-12, 2026-08-03) — the pane is a ' +
    "READOUT of an open book's attachments, and the next step (open a book) lives in the sibling LIST pane " +
    "with its own New primary, so this state legitimately carries no action of its own. Same class, and the " +
    "same reasoning, as preset-section-inspector.tsx / preset-library-welcome.tsx above; the alternative " +
    "this gate names as wrong — a bolted-on decorative button — would be a second home for the list's own " +
    "create verb.",
  "packages/client/src/features/rpg/components/cast/cast-tab.tsx":
    "read-only-by-pillar: the NPC roster is model-authored via `upsert_npc` (P1 — the client derives/creates nothing); " +
    "the cast fills as the story introduces characters, so there is no client action to offer.",
  "packages/client/src/features/rpg/components/quests/quests-tab.tsx":
    "read-only-by-pillar: quests are model-authored via `upsert_quest` (P1); the log fills as the story reveals them, " +
    "so there is no client action to offer.",
  "packages/client/src/features/rpg/components/gm/gm-eyes-tab.tsx":
    "read-only-by-pillar: the twist bank is director-authored (06 §3); the GM-eyes panel is a WINDOW into it, not an " +
    "editor, so the empty twist bank has no action of its own.",
  "packages/client/src/features/rpg/components/party/party-tab.tsx":
    "sibling-carries-CTA / read-only: this state renders ONLY for a non-host (the host branch carries the AddParty CTA); " +
    "a member's party fills as characters join the game, so the member has no create action here.",
  "packages/client/src/features/rpg/components/journal/journal-tab.tsx":
    "sibling-carries-CTA: the JournalNoteComposer sits directly above this empty state (the copy points at it — 'jot the " +
    "first note in the box above'), so the next step lives in the sibling composer, not a redundant button here.",
  "packages/client/src/features/rpg/components/gm/checkpoints-section.tsx":
    "sibling-carries-CTA: the Save-a-bookmark input + button is an always-visible sibling directly above this empty list.",
  "packages/client/src/features/rpg/components/gm/clocks-section.tsx":
    "sibling-carries-CTA: the clock create form is an always-visible sibling directly above this empty list.",
  "packages/client/src/features/rpg/components/gm/widgets-section.tsx":
    "sibling-carries-CTA: the widget create form is an always-visible sibling directly above this empty list.",
  "packages/client/src/features/rpg/components/gm/session-section.tsx":
    "sibling-carries-CTA: this is the CONCLUDED-session recap list (past sessions, informational); the host's 'Start " +
    "session' control is an always-visible sibling above it — starting a session is a distinct act from the recap history.",
  "packages/client/src/features/rpg/components/gm/death-section.tsx":
    'desired-empty: "Everyone\'s standing" — no party member is down. An empty Fallen list is the WANTED state; an action ' +
    "prompting the host to kill someone would be absurd.",
  "packages/client/src/features/rpg/components/scene/scene-view-tab.tsx":
    "read-only-by-pillar: scene art is model-generated via `request_illustration` (P1 — the client creates nothing); the " +
    "C11 scene-view tab is a WINDOW into the latest illustration, so the 'no art yet' state has no client action to offer.",
  "packages/client/src/features/rpg/components/lite/pool-defs-editor.tsx":
    "elsewhere-carried: meters attach to party MEMBERS, and a member is seated from the Party tab (its own add-to-party CTA), " +
    "not this L2 settings pane; the 'no party yet' state's next step lives in that sibling tab, so it has no action of its own.",
};

const MESSAGE =
  "<EmptyState> with no `action` CTA (design-enforcement.md §3.2) — every empty-state render must offer " +
  "a next-action affordance (an @orb/ui Button, typically) so the user isn't stranded at a dead end.";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry has NO dead-end <EmptyState> any more — every render in it now passes `action` " +
  "(ratchet down): delete the stale row in empty-state-has-action.ts: ";

function clientRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Does this `<EmptyState .../>` carry an `action` prop, or a spread that MIGHT (a conditional CTA the
 *  gate can't statically resolve, so it's given the benefit of the doubt)? */
function hasAction(el: JsxSelfClosingElement): boolean {
  return el.getAttributes().some((attr: JsxAttributeLike) => {
    if (attr.getKind() === SyntaxKind.JsxSpreadAttribute) {
      return true;
    }
    return attr.getKind() === SyntaxKind.JsxAttribute && attr.getFirstChild()?.getText() === "action";
  });
}

// An `<EmptyState … />` in features/**.tsx with no `action` prop (and no spread that might carry one).
// The live non-empty ALLOWLIST's stale arm is finalize-guarded to project scope.
const GATE_SELF = "scripts/check/gates/empty-state-has-action.ts";
const passSeenAllowlisted = new Set<string>();

export const gate: GateDescriptor = {
  name: "empty-state-has-action",
  docRow: "design-enforcement.md §3.2 (D62)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "pass an `action` prop (a next-step CTA — an @orb/ui Button, typically) so the empty state isn't a dead end.",
  scanRoot: (p) => p.includes("packages/client/src/features/") && p.endsWith(".tsx"),
  kinds: [SyntaxKind.JsxSelfClosingElement],
  begin: () => {
    passSeenAllowlisted.clear();
  },
  visit: (node, sf, ctx) => {
    const el = node.asKind(SyntaxKind.JsxSelfClosingElement);
    if (el === undefined || el.getTagNameNode().getText() !== TAG_NAME || hasAction(el)) {
      return;
    }
    const rel = clientRel(sf.getFilePath());
    if (rel in ALLOWLIST) {
      passSeenAllowlisted.add(rel);
      return;
    }
    ctx.report(node, { token: `<${TAG_NAME}>`, offset: 0 });
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project") {
      return;
    }
    for (const rel of Object.keys(ALLOWLIST)) {
      // The "went clean" ratchet only judges a file that is actually LOADED in this run — a synthetic
      // conformance/parity tree (which omits the real allowlisted files) must not falsely flag them
      // stale. On the real full-tree run every allowlisted file IS loaded, so the ratchet is preserved.
      if (!fileLoaded(ctx, rel)) {
        continue;
      }
      if (!passSeenAllowlisted.has(rel)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/empty-state-has-action.ts`,
        });
      }
    }
  },
  // NOTE: the ALLOWLIST ratchet/stale arms (suppress-allowlisted, gone-clean-is-RED, absent-is-stale)
  // are barrel/`fileLoaded`-guarded to the REAL full tree — a synthetic conformance project omits the
  // real allowlisted files, so those branches cannot run as an in-memory example. Their coverage moves
  // to the live `pnpm check:structure` run (this gate's finalize on the real tree). Only the pure
  // FLAG/PASS branches port as examples below.
  mustFlag: [
    {
      files: 'export const G = <EmptyState title="Nothing here" />;\n',
      at: "packages/client/src/features/demo/thing.tsx",
      why: "an <EmptyState> with no action CTA — a dead end that strands the user (§3.2)",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <EmptyState title="Nothing here" action={<Button>Go</Button>} />;\n',
      at: "packages/client/src/features/demo/ok.tsx",
      why: "an <EmptyState> WITH an action prop — the next-step affordance is present",
    },
    {
      files: 'export const G = <EmptyState title="Nothing here" {...(cond ? { action: 1 } : {})} />;\n',
      at: "packages/client/src/features/demo/spread.tsx",
      why: "a spread attribute might carry action (a conditional CTA the gate can't statically resolve) — treated as present",
    },
    {
      files: 'export const G = <EmptyState title="x" />;\n',
      at: "packages/ui/src/primitives/empty-state/demo.tsx",
      why: "scope: an <EmptyState> outside features/** is not scanned — passes",
    },
  ],
};
