// Gate: dialog-via-composite (derive-modernization-audit.md §W1 G24) — a features/** file importing the raw
// `Dialog` root from @orb/ui/dialog is hand-assembling the modal anatomy the FormDialog composite (form +
// single-control prompt) and ConfirmDialog (alert, G7) exist to own. RED unless the file is on the
// allowlist of sanctioned NON-form species (galleries/pickers/invites/the modal host) or a genuinely-
// divergent form, each with a cited reason (D72: a machine ships WITH its seal). Both-ways ratchet: an
// allowlisted file that STOPS importing Dialog (migrated onto the composite) REDs as a stale entry so the
// allowlist can't rot. Keys on the `Dialog` root import only — a file using DialogClose/DialogTitle INSIDE a
// FormDialog (the composite renders the root) is legal and never trips this.
import type { Node, SourceFile } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";

const DIALOG_MODULE = "@orb/ui/dialog";
const DIALOG_ROOT = "Dialog";

/** Real-tree anchor (GATE-AUTHORING.md §4.5): `ctx.scope.kind === "project"` is TRUE inside conformance's
 *  synthetic mini-projects too, so scope alone cannot gate the stale arm. Deliberately NOT any ALLOWLIST
 *  row's own path — gating a row's staleness on THAT row's own file being loaded is the mode-(B) blind
 *  spot (a deleted/renamed survivor is never loaded, so a self-referential guard skips it forever instead
 *  of flagging it — the defect class three ALLOWLIST rows here carried silently: add-party-dialog.tsx,
 *  save-as-party-dialog.tsx, readable-overlay.tsx, all gone from the tree). */
const STALE_ARM_ANCHOR = "packages/ui/src/tokens/index.ts";

/** Sanctioned NON-form (or genuinely-divergent) Dialog species → the cited reason it stays raw. A stale
 *  entry (the file no longer imports Dialog — it migrated onto FormDialog/ConfirmDialog) REDs via
 *  `finalize`, so this can't rot. */
const ALLOWLIST: ExemptionTable = {
  "packages/client/src/features/app-shell/components/modal-host.tsx": {
    why: "the shell's ONE generic modal seam — renders arbitrary registry-owned modal bodies (+ a drawer presentation) in a Dialog; not a form/prompt.",
  },
  "packages/client/src/features/chat/components/rename-chat-dialog.tsx": {
    why: "§13.4 single-rename carve-out; the chat lane is held untouched this wave (active parallel work) — revisit onto FormDialog's prompt mode when the lane is free.",
  },
  "packages/client/src/features/chat/components/invite-dialog.tsx": { why: "§13.4 invite species; the chat lane is held untouched this wave." },
  "packages/client/src/features/chat/anchors/join-invite-dialog.tsx": {
    why: "the /join preview→confirm landing (loading/invalid/ready states) — a multi-state flow, not a form; chat lane.",
  },
  "packages/client/src/features/chat/anchors/character-gallery-dialog.tsx": { why: "a character-gallery picker surface (owns its Dialog root); chat lane." },
  "packages/client/src/features/chat/components/reaction-picker.tsx": {
    why: "B6 — the emoji PICKER, the species this gate's own header names first (`galleries/pickers`) and the `character-gallery-dialog` shape exactly: a grid of one-press cells over a closed contracts vocabulary, no bound fields, no submit, dismissed by the pick itself. It owns its Dialog root because BOTH row doors open it — an anchored popover is unavailable to the coarse door, whose trigger is `display:none` (`ROW_ACTION_INLINE`) and so has no box to position against.",
  },
  "packages/client/src/features/chat/components/member-card-viewer.tsx": {
    why: "the D22 read-only, level-clamped member card VIEWER (getMemberCard) — a content-display species like character-gallery-dialog/readable-overlay: no bound fields, a single Close, owns its Dialog root.",
  },
  "packages/client/src/features/chat/components/variant-wire-viewer.tsx": {
    why: "the RAWVIEW per-variant wire INSPECTOR (getVariantWire) — the member-card-viewer content-display species exactly: a host-only read-only readout of the prompt a past turn sent, no bound fields, a single Close, owns its Dialog root.",
  },
  "packages/client/src/features/preset/components/variable-editor-dialog.tsx": {
    why: "a bound-field form with a PINNED title above an internally-scrolled body (7 fields + a dynamic option list); FormDialog's single-Stack shell can't preserve the pinned-title scroll — divergent, kept raw with this citation.",
  },
  "packages/client/src/features/rpg/components/rpg-scene-cards.tsx": {
    why: "the P4 card-archive VIEWER (parity-plus §4.7): opens an archived ImmersiveCard in a lightbox-style dialog — the readable-overlay content-display species, not a form/prompt; no bound fields.",
  },
  "packages/client/src/features/persona/components/persona-from-character-dialog.tsx": {
    why: "#866 S4 — a PICKER dialog, the species this gate's own header names first: the shared CharacterPicker (a Command listbox) + one leading switch, where SELECTING a row IS the act (persona.createFromCharacter fires on pick, no submit, no bound fields; the dialog dismisses itself on success). FormDialog's submit shell has nothing to own here.",
  },
  "packages/client/src/features/persona/components/persona-connected-characters.tsx": {
    why: "#866 S4 — the Connected-characters ADD door: the same picker species (CharacterPicker body, pick = connectToCharacter, no submit, no bound fields). Deliberately NOT RelationManagerSection's built-in add dialog — its flat `available` array cannot honestly hold the keyset-paged character library (config-revamp-design.md §7.4 rider c).",
  },
};

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** The `Dialog` root named-import specifier node from `@orb/ui/dialog`, or undefined when absent. */
function dialogRootImport(sf: SourceFile): Node | undefined {
  return sf
    .getImportDeclarations()
    .filter((imp) => imp.getModuleSpecifierValue() === DIALOG_MODULE)
    .flatMap((imp) => imp.getNamedImports())
    .find((named) => named.getName() === DIALOG_ROOT);
}

const seenAllowlistEntries = new Set<string>();
const GATE_SELF = "tooling/src/verify/gates/dialog-via-composite.ts";

export const gate: GateDescriptor = {
  name: "dialog-via-composite",
  docRow: "derive-modernization-audit.md §W1 (G24)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a features/** file imports the raw `Dialog` root from @orb/ui/dialog — a form/prompt dialog belongs on " +
    "the FormDialog composite (or ConfirmDialog for an alert, G7); a genuinely-different species earns an " +
    "allowlist entry with a cited reason (derive-modernization-audit.md §W1 — D72: a machine ships WITH its seal).",
  fix: "compose FormDialog (form body via FormSubmitButton, or a single-control prompt via `submit`) / TagPickerDialog / ConfirmDialog from #components; allowlist a genuine non-form species in dialog-via-composite.ts WITH a cited reason.",
  scanRoot: (p) => p.includes("packages/client/src/features/") && p.endsWith(".tsx"),
  begin: () => {
    seenAllowlistEntries.clear();
  },
  visitFile: (sf, ctx) => {
    const named = dialogRootImport(sf);
    if (named === undefined) {
      return;
    }
    const path = rel(sf.getFilePath());
    if (ALLOWLIST[path] !== undefined) {
      seenAllowlistEntries.add(path);
      return;
    }
    ctx.report(named, { token: DIALOG_ROOT, offset: 0 });
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, STALE_ARM_ANCHOR)) {
      return; // the stale arm is a whole-tree claim — never fire it below project scope or off the anchor (§4.5)
    }
    for (const path of Object.keys(ALLOWLIST)) {
      // NOT gated on the row's own file being loaded — that is precisely the mode-(B) blind spot (a
      // deleted/renamed file is never loaded, so it would never be judged stale). `seenAllowlistEntries`
      // is only ever set by a live `visitFile` hit, so "never seen" already covers both a migrated file
      // (A) and a gone one (B).
      if (!seenAllowlistEntries.has(path)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `stale ALLOWLIST entry — "${path}" no longer imports Dialog (migrated onto a composite): delete the row in tooling/src/verify/gates/dialog-via-composite.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files:
        'import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";\n' +
        "export const X = () => (\n" +
        "  <Dialog open={open} onOpenChange={onOpenChange}>\n" +
        "    <DialogPopup>\n" +
        "      <DialogTitle>Edit thing</DialogTitle>\n" +
        "    </DialogPopup>\n" +
        "  </Dialog>\n" +
        ");\n",
      at: "packages/client/src/features/demo/components/demo-dialog.tsx",
      why: "a feature file hand-assembling Dialog+DialogPopup+DialogTitle — not on the allowlist, flags",
    },
    {
      // Mode-(B) proof (GATE-AUTHORING.md §4.4a): a project that loads the real-tree anchor but NONE of
      // the ALLOWLIST paths — exactly what a deleted/renamed survivor file looks like from this gate's
      // vantage. Before the fix this arm was gated on the row's OWN file being loaded, so a project like
      // this one (which never loads any ALLOWLIST path) silently reported nothing; three real rows
      // (add-party-dialog.tsx, save-as-party-dialog.tsx, readable-overlay.tsx) rotted this way.
      files: { [STALE_ARM_ANCHOR]: "export const x = 1;\n" },
      expect: { messageIncludes: "stale ALLOWLIST entry" },
      why: "the real-tree anchor loads but no ALLOWLIST row's file does (the mode-B shape: gone from the tree) — every row must RED, not silently pass",
    },
  ],
  mustPass: [
    {
      files:
        'import { FormDialog, FormSubmitButton } from "#components";\n' +
        "export const X = () => (\n" +
        '  <FormDialog open={open} onOpenChange={onOpenChange} title="Edit thing">\n' +
        '    <FormSubmitButton testKey="x" disabled={false} label="Save" onSubmit={save} />\n' +
        "  </FormDialog>\n" +
        ");\n",
      at: "packages/client/src/features/demo/components/demo-form-dialog.tsx",
      why: "a FormDialog consumer — imports no raw Dialog root, passes",
    },
    {
      files:
        'import { DialogClose } from "@orb/ui/dialog";\n' +
        'import { FormDialog } from "#components";\n' +
        "export const X = () => (\n" +
        '  <FormDialog open={open} onOpenChange={onOpenChange} title="Edit thing">\n' +
        "    <form>\n" +
        "      <DialogClose render={<button>Cancel</button>} />\n" +
        "    </form>\n" +
        "  </FormDialog>\n" +
        ");\n",
      at: "packages/client/src/features/demo/components/demo-native-form-dialog.tsx",
      why: "DialogClose used INSIDE a FormDialog (the composite renders the Dialog root) — no raw `Dialog` import, passes",
    },
    {
      files:
        'import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";\n' +
        "export const RenameChatDialog = () => (\n" +
        "  <Dialog open={open} onOpenChange={onOpenChange}>\n" +
        '    <DialogPopup size="sm">\n' +
        "      <DialogTitle>Rename chat</DialogTitle>\n" +
        "    </DialogPopup>\n" +
        "  </Dialog>\n" +
        ");\n",
      at: "packages/client/src/features/chat/components/rename-chat-dialog.tsx",
      why: "an allowlisted non-form species (the §13.4 chat rename) — imports Dialog but is on the allowlist, passes",
    },
  ],
};
