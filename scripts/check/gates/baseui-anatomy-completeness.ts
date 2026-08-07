// Gate: baseui-anatomy-completeness — the anatomy decision LEDGER must stay TOTAL and TRUE. It reads the
// dispositions in scripts/check/gates/baseui-surface.manifest.json (never a hard-coded part list) and
// judges them against what @orb/ui actually renders.
// ARMS: A an `exposed` part the seal does not render (the ledger claims a part that is not there) ·
// B a rendered part whose ledger row says `sealed-away` / `n-a` (the seal outgrew its own ruling) ·
// C blindness — the ledger exists but the run scanned no @orb/ui seal at all.
//
// WHY LEDGER-DRIVEN AND NOT A LIST: a hard-coded "these parts are required" table is a claim written once
// and never re-examined; the crunch spike found `Combobox` missing Backdrop and `Popover`/`Menu` missing
// Viewport precisely because nobody re-derived the list after a bump. Keying on the manifest makes the
// question total by construction — every part the installed package publishes has a row, and a bump mints
// its new parts `unresolved` (which `baseui-surface-manifest` reds).
//
// DECLARED LIMIT: "renders it" means a JSX tag `<Local.Part>` / `<Local>` in a `packages/ui/src/**` file
// that imports the component as a VALUE. A part reached only through an indirection this gate cannot see
// (a part component stored in a variable, or a part rendered by a sibling package) reads as not-rendered —
// so the honest ledger entry for such a part is `sealed-away` with that fact as its reason, not `exposed`.

import type { RenderSite, SurfaceManifest } from "../baseui-read.ts";
import { BASE_UI_MANIFEST_REL, readManifest, renderedPartsByComponent, repoRelative, UI_SRC } from "../baseui-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

/** A real-tree anchor no self-proof example needs (§4.5) — the GENERATED token barrel. */
const REAL_TREE_ANCHOR = "packages/ui/src/tokens/index.ts";
const GEN = "node scripts/check/gen-baseui-surface.ts";
const SELF = "scripts/check/gates/baseui-anatomy-completeness.ts";

const MESSAGE =
  "the Base UI anatomy ledger and the @orb/ui seals disagree. Each part in " +
  `${BASE_UI_MANIFEST_REL} carries a disposition — \`exposed\` (the seal renders it), \`sealed-away\` ` +
  "(deliberately not, with the reason), or `n-a` (nothing wraps this component) — and that ruling is only " +
  "worth anything while it stays TRUE. A seal that quietly drops a part it claims to expose loses the " +
  "layout boundary the part provided; a part rendered with no ruling behind it is anatomy nobody decided on.";

const FIX =
  `render the part in its seal, or regenerate the ledger (\`${GEN}\`) and re-rule the row — \`sealed-away\` ` +
  "with a reason that says what would end it. Keep the human half in " +
  "docs/architecture/core/ui-package-design.md keyed on the same `Component.Part` string.";

const CLAIMED_NOT_RENDERED = (key: string): string =>
  `the ledger rules \`${key}\` "exposed", but no @orb/ui seal renders it. Either render it, or re-rule the ` +
  "row to `sealed-away` with the reason (and what would end it).";
const RENDERED_NOT_RULED = (key: string, disposition: string, site: RenderSite): string =>
  `\`${key}\` is rendered at ${site.file}:${site.line}, but the ledger rules it "${disposition}". The seal ` +
  `outgrew its own ruling — regenerate (\`${GEN}\`) and set the row to "exposed", or stop rendering it.`;
const NO_SEALS_SCANNED =
  "the anatomy ledger is present but this run scanned no @orb/ui file that imports @base-ui/react as a " +
  `value, so every "exposed" ruling passed for free (GATE-AUTHORING.md §4.6 — a gate keyed on a derivation ` +
  "must RED when the derivation comes back empty). Check this gate's scanRoot and the harness globs.";

function judge(ctx: GateRunCtx, manifest: SurfaceManifest, rendered: Map<string, Map<string, readonly RenderSite[]>>): void {
  for (const [name, component] of Object.entries(manifest.components)) {
    const byPart = rendered.get(name);
    for (const [partName, part] of Object.entries(component.parts)) {
      if (part.kind !== "part") {
        continue;
      }
      const key = `${name}.${partName}`;
      const sites = byPart?.get(partName) ?? [];
      const site = sites[0];
      if (part.disposition === "exposed" && site === undefined) {
        ctx.report({ file: BASE_UI_MANIFEST_REL, line: 0, column: 0, message: CLAIMED_NOT_RENDERED(key) });
        continue;
      }
      // `unresolved` is baseui-surface-manifest's finding, not this gate's — one defect, one red.
      if (site !== undefined && part.disposition !== "exposed" && part.disposition !== "unresolved") {
        ctx.report({ file: site.file, line: site.line, column: 0, message: RENDERED_NOT_RULED(key, part.disposition, site) });
      }
    }
  }
}

function run(ctx: GateRunCtx): void {
  const manifest = readManifest(ctx.root);
  if (manifest === undefined) {
    return; // baseui-surface-manifest owns the missing-ledger finding; two gates reporting it is noise.
  }
  const rendered = renderedPartsByComponent(ctx.files, manifest);
  const sawSeal = ctx.files.some((sf) => repoRelative(sf.getFilePath()).includes(UI_SRC) && sf.getText().includes("@base-ui/react/"));
  if (!sawSeal) {
    if (fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      ctx.report({ file: SELF, line: 1, column: 0, message: NO_SEALS_SCANNED });
    }
    return;
  }
  judge(ctx, manifest, rendered);
}

const MANIFEST = (disposition: string, why = ""): Readonly<Record<string, string>> => ({
  [BASE_UI_MANIFEST_REL]:
    `{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true, "parts": {` +
    `"Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": ["items"], "inherits": [], "disposition": "exposed", "why": "" },` +
    `"Backdrop": { "kind": "part", "symbol": "SelectBackdrop", "from": "./backdrop/SelectBackdrop.js", "props": [], "inherits": ["BaseUIComponentProps"], "disposition": "${disposition}", "why": "${why}" }` +
    "} } } }\n",
});

const SEAL = (body: string): string => `import { Select as BaseSelect } from "@base-ui/react/select";\nexport const Seal = () => (\n${body}\n);\n`;
const SEAL_PATH = "packages/ui/src/primitives/select/probe-select.tsx";
const ROOT_ONLY = SEAL("  <BaseSelect.Root items={[]} />");
const ROOT_AND_BACKDROP = SEAL("  <BaseSelect.Root items={[]}>\n    <BaseSelect.Backdrop />\n  </BaseSelect.Root>");

export const gate: GateDescriptor = {
  name: "baseui-anatomy-completeness",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // Coverage across every seal + the committed ledger: a per-file verdict does not exist.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes(UI_SRC),
  // The ledger is read off disk, so the examples must be materialized to a real tree.
  fsBacked: true,
  run,

  mustFlag: [
    {
      files: { ...MANIFEST("exposed"), [SEAL_PATH]: ROOT_ONLY },
      expect: { messageIncludes: 'rules `Select.Backdrop` "exposed", but no @orb/ui seal renders it' },
      why: "ARM A — the founding shape: the ledger claims an anatomy part the seal never renders (the crunch's Combobox-missing-Backdrop / Popover-missing-Viewport class)",
    },
    {
      files: { ...MANIFEST("sealed-away", "deliberately omitted"), [SEAL_PATH]: ROOT_AND_BACKDROP },
      expect: { messageIncludes: "outgrew its own ruling" },
      why: "ARM B, the other direction: the seal renders a part the ledger says is sealed away — a ruling that has silently stopped being true is exactly as bad as a missing part",
    },
    {
      files: { ...MANIFEST("exposed"), "packages/ui/src/tokens/index.ts": "export const TOKENS = 1;\n" },
      expect: { messageIncludes: "must RED when the derivation comes back empty" },
      why: "§4.6 blindness: the ledger is there, the real-tree anchor is there, but the run saw no seal at all — every `exposed` ruling would otherwise pass for free",
    },
  ],
  mustPass: [
    {
      files: { ...MANIFEST("exposed"), [SEAL_PATH]: ROOT_AND_BACKDROP },
      why: "the agreeing state — every `exposed` part rendered, nothing rendered without a ruling",
    },
    {
      files: {
        ...MANIFEST("sealed-away", "the modal backdrop is opt-in behind a `backdrop` prop; ends if the seal starts rendering it unconditionally"),
        [SEAL_PATH]: ROOT_ONLY,
      },
      why: "the SANCTIONED omission: a deliberate `sealed-away` ruling with a reason is a decision, not a defect — this gate exists to keep the decision honest, not to force every part into every seal",
    },
    {
      files: { ...MANIFEST("unresolved"), [SEAL_PATH]: ROOT_ONLY },
      why: "a DECLARED LIMIT: `unresolved` is baseui-surface-manifest's red. One defect gets one finding, from one gate — double-reporting trains people to skim",
    },
    {
      files: { [SEAL_PATH]: ROOT_ONLY },
      why: "no ledger on disk = nothing to judge. baseui-surface-manifest owns the missing-ledger finding; this gate staying silent keeps that single-owner property true in a scoped run too",
    },
  ],
};
