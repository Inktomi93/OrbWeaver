// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are JSX fixture snippets, not secrets.
// Gate: dialog-via-composite (derive-modernization-audit.md §W1 G24) — a features/** file importing the raw
// `Dialog` root from @orb/ui/dialog is hand-assembling the modal anatomy the FormDialog composite (form +
// single-control prompt) and ConfirmDialog (alert, G7) exist to own. RED unless the file is on the
// allowlist of sanctioned NON-form species (galleries/pickers/invites/the modal host) or a genuinely-
// divergent form, each with a cited reason (D72: a machine ships WITH its seal). Both-ways ratchet: an
// allowlisted file that STOPS importing Dialog (migrated onto the composite) REDs as a stale entry so the
// allowlist can't rot. Keys on the `Dialog` root import only — a file using DialogClose/DialogTitle INSIDE a
// FormDialog (the composite renders the root) is legal and never trips this.
import { join } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const DIALOG_MODULE = "@orb/ui/dialog";
const DIALOG_ROOT = "Dialog";

/** Sanctioned NON-form (or genuinely-divergent) Dialog species → the cited reason it stays raw. A stale
 *  entry (the file no longer imports Dialog — it migrated onto FormDialog/ConfirmDialog) REDs via
 *  `finalize`, so this can't rot. */
const ALLOWLIST: Record<string, string> = {
  "packages/client/src/features/app-shell/components/modal-host.tsx":
    "the shell's ONE generic modal seam — renders arbitrary registry-owned modal bodies (+ a drawer presentation) in a Dialog; not a form/prompt.",
  "packages/client/src/features/chat/components/rename-chat-dialog.tsx":
    "§13.4 single-rename carve-out; the chat lane is held untouched this wave (active parallel work) — revisit onto FormDialog's prompt mode when the lane is free.",
  "packages/client/src/features/chat/components/invite-dialog.tsx": "§13.4 invite species; the chat lane is held untouched this wave.",
  "packages/client/src/features/chat/anchors/join-invite-dialog.tsx":
    "the /join preview→confirm landing (loading/invalid/ready states) — a multi-state flow, not a form; chat lane.",
  "packages/client/src/features/chat/anchors/character-gallery-dialog.tsx": "a character-gallery picker surface (owns its Dialog root); chat lane.",
  "packages/client/src/features/chat/components/add-party-dialog.tsx":
    "a saved-party PICKER surface (cmdk RosterPresetPicker owns search/keyboard-nav) — a picker species like character-gallery-dialog, not a form (RP2, saved-rosters §6).",
  "packages/client/src/features/chat/components/save-as-party-dialog.tsx":
    "a name PROMPT with a live RP-D1 drop-surfacing readout over the room snapshot — a §13.4 single-control prompt species (the rename-chat-dialog precedent), not a bound-field form; chat lane (RP2).",
  "packages/client/src/features/preset/components/variable-editor-dialog.tsx":
    "a bound-field form with a PINNED title above an internally-scrolled body (7 fields + a dynamic option list); FormDialog's single-Stack shell can't preserve the pinned-title scroll — divergent, kept raw with this citation.",
  "packages/client/src/features/rpg/components/journal/readable-overlay.tsx":
    "a read-only READING viewer (the C11 §12.2 parchment overlay for a journal item/note) — a content-display species like character-gallery-dialog, not a form/prompt; owns its Dialog root, no bound fields, a single Close.",
};

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** The `Dialog` root named-import specifier node from @orb/ui/dialog, or undefined when absent. */
function dialogRootImport(sf: SourceFile): Node | undefined {
  return sf
    .getImportDeclarations()
    .filter((imp) => imp.getModuleSpecifierValue() === DIALOG_MODULE)
    .flatMap((imp) => imp.getNamedImports())
    .find((named) => named.getName() === DIALOG_ROOT);
}

const seenAllowlistEntries = new Set<string>();
const GATE_SELF = "scripts/check/gates/dialog-via-composite.ts";

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
    if (ctx.scope.kind !== "project") {
      return;
    }
    for (const path of Object.keys(ALLOWLIST)) {
      // Only judge an allowlisted file that EXISTS in this run's project — a synthetic conformance tree
      // lacking the real allowlisted files must not misfire the stale arm (on the real run they all exist,
      // so the ratchet holds; the motion-token-purity existsSync precedent).
      if (ctx.project.getSourceFile(join(ctx.root, path)) !== undefined && !seenAllowlistEntries.has(path)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `stale ALLOWLIST entry — "${path}" no longer imports Dialog (migrated onto a composite): delete the row in scripts/check/gates/dialog-via-composite.ts`,
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
