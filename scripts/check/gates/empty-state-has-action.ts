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

/** Real-tree anchor (GATE-AUTHORING.md §4.5): `ctx.scope.kind === "project"` is TRUE inside conformance's
 *  synthetic mini-projects too, so scope alone cannot gate the stale arm. Deliberately NOT any ALLOWLIST
 *  row's own path — gating a row's staleness on THAT row's own file being loaded is the mode-(B) blind
 *  spot (a deleted/renamed survivor is never loaded, so a self-referential guard skips it forever instead
 *  of flagging it — 14 rpg/preset ALLOWLIST rows here rotted this way after the rpg client flattening). */
const STALE_ARM_ANCHOR = "packages/ui/src/tokens/index.ts";

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
  "packages/client/src/features/world-info/surfaces/world-info-member-surface.tsx":
    "the GONE arm — the open book was deleted on another device (the world-info verbs are bus-driven, so the " +
    "roster refetches under the editor). The next step is picking another row in the sibling roster, which is " +
    "on screen; the tag/regex member-editor twins above, same species. (The retired World Info CONTENT " +
    "welcome's row died with the rail section at R2 — the workspace's own welcome is the config host's now.)",
  "packages/client/src/features/config/components/config-context-body.tsx":
    "the Configuration CONTEXT pane's two no-next-step arms: the no-selection state (the next step is picking a row in the " +
    "sibling LIST, which is on screen whenever this is — the preset-section-inspector precedent) and a collection that " +
    'declares `context: {kind:"none"}` ("Nothing to attach" — a tag applies wherever you put it; there is genuinely ' +
    "nothing to manage here, and the copy is the COLLECTION's own, not a host generic).",
  "packages/client/src/features/tag/surfaces/tag-member-surface.tsx":
    "the GONE arm — the open tag was deleted on another device (the tag verbs are bus-driven, so the list refetches " +
    "under the editor). The next step is picking another row in the sibling roster, which is on screen; the " +
    "member-card-viewer NOT_FOUND precedent, same species.",
  "packages/client/src/features/regex/surfaces/regex-member-surface.tsx":
    "the regex twin of the tag member editor's GONE arm above — same species, same reasoning.",
  "packages/client/src/features/regex/components/regex-context-body.tsx":
    "the regex CONTEXT pane's GONE arm (the script was deleted while its context was open) — the member-editor twin above.",
  "packages/client/src/features/chat/anchors/character-gallery-dialog.tsx":
    'the "Nothing left to add" state (every owned image is already in the gallery) has no next step — genuinely nothing to do.',
  "packages/client/src/features/chat/components/member-card-viewer.tsx":
    'the D22 NOT_FOUND gone-arm ("This card isn\'t available" — the character left the chat / no access) has no next step; the ' +
    "dialog's own Close is the only affordance, so this state legitimately carries no action of its own.",
  "packages/client/src/features/chat/components/variant-wire-viewer.tsx":
    "the RAWVIEW inspector's two statements of FACT — a variant that captured no prompt (an authored/imported/seeded row never ran " +
    "one) and the NOT_FOUND gone-arm (the message was deleted). Neither has a next step the host could take; the dialog's own Close " +
    "is the only affordance (the member-card-viewer precedent, same species).",
  "packages/client/src/features/world-info/components/world-info-context-body.tsx":
    "the GONE arm of the world-info CONTEXT pane — the open book was deleted while its attachments were on " +
    "screen. (Its predecessor, the rail section's 'No book open' arm, retired with the section at R2: a " +
    '`{kind:"body"}` collection arm is only ever called WITH a member, and the no-selection copy is the ' +
    "config host's own `context.empty`.) The next step is picking another row in the sibling roster, which is " +
    "on screen; the regex-context-body twin above, same species.",
  "packages/client/src/features/databank/components/databank-context-body.tsx":
    "the databank CONTEXT pane's two no-next-step arms: the NO-SELECTION arm (a `single` context body is " +
    "mounted unconditionally and must render the section's own `context.empty` copy itself — the next step " +
    "is picking a row in the sibling LIST, which is on screen whenever this is; the config-context-body " +
    "precedent) and the GONE arm (the open document was deleted while its activation panel was up — the " +
    "world-info/tag/regex context twins above, same species).",
  "packages/client/src/features/databank/surfaces/databank-detail-surface.tsx":
    "the Databank CONTENT teaching state — a 'pick a document on the left, or add one' nudge shown alongside " +
    "the library list, which itself carries BOTH create doors (the band's Add primary and the empty bank's " +
    "own CTA). The next step lives in the sibling list, so this state legitimately has no action of its own: " +
    "the preset-library-welcome.tsx precedent, same species, same reasoning.",
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
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, STALE_ARM_ANCHOR)) {
      return; // the stale arm is a whole-tree claim — never fire it below project scope or off the anchor (§4.5)
    }
    for (const rel of Object.keys(ALLOWLIST)) {
      // NOT gated on the row's own file being loaded — that is precisely the mode-(B) blind spot (a
      // deleted/renamed file is never loaded, so it would never be judged stale). `passSeenAllowlisted`
      // is only ever set by a live `visit` hit, so "never seen" already covers both a fixed file (A) and
      // a gone one (B).
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
  mustFlag: [
    {
      files: 'export const G = <EmptyState title="Nothing here" />;\n',
      at: "packages/client/src/features/demo/thing.tsx",
      why: "an <EmptyState> with no action CTA — a dead end that strands the user (§3.2)",
    },
    {
      // Mode-(B) proof (GATE-AUTHORING.md §4.3b): a project that loads the real-tree anchor but NONE of
      // the ALLOWLIST paths — exactly what a deleted/renamed survivor looks like from this gate's
      // vantage. Before the fix this arm was gated on the row's OWN file being loaded, so a project like
      // this one (which never loads any ALLOWLIST path) silently reported nothing; 14 rpg/preset rows
      // rotted this way after the rpg client flattening.
      files: { [STALE_ARM_ANCHOR]: "export const x = 1;\n" },
      expect: { messageIncludes: "ALLOWLIST entry has NO dead-end" },
      why: "the real-tree anchor loads but no ALLOWLIST row's file does (the mode-B shape: gone from the tree) — every row must RED, not silently pass",
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
