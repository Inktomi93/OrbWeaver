// Gate: baseui-surface-manifest — the INSTALLED @base-ui/react public surface must equal the committed
// manifest, and every anatomy part in it must carry an adjudicated disposition. This is the version-bump
// tripwire: a bump cannot land until someone has ruled on every part/prop that appeared or vanished.
// ARMS: A drift (component/part/prop/alias-target) · B `unresolved` disposition · C a disposition with no
// reason · D the reader went blind (package gone, nothing learned, expansion truncated).
//
// FOUNDING RECEIPT — why a changelog is not a substitute for a surface diff. The 1.6→1.7 structural export
// diff showed `Select`/`Combobox`/`Autocomplete` `Separator` re-implemented per component with their own
// Props/State, and `Drawer.Handle` re-pointed from dialog's `DialogHandle` to a new `DrawerHandle` — both
// filed upstream as "fixes", both material changes to types our seals consume. The manifest therefore
// records each part's ALIAS TARGET (`symbol` + `from`), not just its exported name, because a re-typing
// keeps the name and swaps what is behind it.
//
// SCOPE — the PUBLIC surface only: the `export_specifier` set of each component module's `index.d.ts` /
// `index.parts.d.ts`. Internal churn (contexts, `use*Root` hooks, the `floating-ui-react` re-exports that
// 1.7 dropped — zero importers here) is deliberately invisible, or every patch release reds this gate for
// declarations no seal can name.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { InstalledComponent, InstalledPart, ManifestComponent, ManifestPart, SurfaceManifest } from "../baseui-read.ts";
import { BASE_UI_MANIFEST_REL, BASE_UI_PKG_REL, blindParts, readInstalledSurface, readManifest, truncatedParts } from "../baseui-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

/** A real-tree anchor no self-proof example needs (GATE-AUTHORING §4.5): the GENERATED token barrel. Its
 *  presence is what entitles the blindness arms to speak; a synthetic mini-project never carries it. */
const REAL_TREE_ANCHOR = "packages/ui/src/tokens/index.ts";
const GEN = "node scripts/check/gen-baseui-surface.ts";

const MESSAGE =
  "the committed Base UI surface manifest no longer describes the installed @base-ui/react. The manifest " +
  `(${BASE_UI_MANIFEST_REL}) is the anatomy decision ledger's machine half: every component namespace, every ` +
  "anatomy part, every part's own prop names, and what @orb/ui does with each part. A version bump that " +
  "changes the surface must be ADJUDICATED, not absorbed — upstream has shipped new anatomy parts and " +
  "re-pointed alias targets under changelog entries filed as 'fixes'.";

const FIX =
  `regenerate (\`${GEN}\`), read the printed minted/vanished/unresolved lists, and give every newly-minted ` +
  "part a disposition WITH a reason: `exposed` (the seal renders it — baseui-anatomy-completeness proves " +
  "that claim), `sealed-away` (deliberately not rendered; say why AND what would end it), or `n-a` (nothing " +
  "in @orb/ui wraps this component). Record the human half of the same ruling in " +
  "docs/architecture/core/ui-package-design.md, keyed on the identical `Component.Part` string.";

const DRIFT = (what: string): string => `${what} — the manifest and the installed package disagree; regenerate (\`${GEN}\`) and adjudicate the delta.`;
const UNRESOLVED = (key: string): string =>
  `\`${key}\` has no ruling yet (disposition "unresolved"). A part arrives unresolved from a version bump and ` +
  "must be ruled before it can land: `exposed`, `sealed-away` (with the reason and its end condition), or `n-a`.";
const NO_REASON = (key: string, disposition: string): string =>
  `\`${key}\` is "${disposition}" with an empty reason. An exemption that cannot say why it exists — and what ` +
  "would end it — is a rubber stamp (GATE-AUTHORING.md §4.2); write both into the manifest's `why`.";
const NO_PACKAGE = `@base-ui/react is not installed at ${BASE_UI_PKG_REL}, so the installed surface could not be read at all — this gate is BLIND, not green (GATE-AUTHORING.md §4.6). Reinstall, or re-point BASE_UI_PKG_REL in scripts/check/baseui-read.ts.`;
const NO_MANIFEST = `${BASE_UI_MANIFEST_REL} is missing — there is nothing for the installed surface to be adjudicated against. Generate it: \`${GEN}\`.`;
const BLIND_PART = (key: string): string =>
  `the surface reader learned NOTHING about \`${key}\` — neither a prop nor a heritage arm. Its Props type ` +
  "moved to a shape scripts/check/baseui-read.ts cannot walk, so every gate keyed on this manifest is " +
  "silently green for that part. Teach the expander the new shape, then regenerate.";
const TRUNCATED_PART = (key: string): string =>
  `\`${key}\`'s prop expansion hit the depth ceiling (MAX_EXPANSION_DEPTH in scripts/check/baseui-read.ts) — ` +
  "its prop list is INCOMPLETE. Raise the ceiling and regenerate.";

const SELF = "scripts/check/gates/baseui-surface-manifest.ts";

function fileFinding(ctx: GateRunCtx, file: string, message: string): void {
  ctx.report({ file, line: 0, column: 0, message });
}

/** One part's structural identity, as a comparable string. Alias target and heritage ride along so a
 *  re-typing (same exported name, different declaration behind it) is a visible diff. */
function identity(part: InstalledPart | ManifestPart): string {
  return `${part.kind}|${part.symbol}|${part.from}|${part.props.join(",")}|${part.inherits.join(",")}`;
}

/** One component's parts, both directions: appeared, changed shape, vanished. */
function diffParts(ctx: GateRunCtx, name: string, installed: InstalledComponent, known: ManifestComponent): void {
  for (const [partName, part] of Object.entries(installed.parts)) {
    const recorded = known.parts[partName];
    if (recorded === undefined) {
      fileFinding(ctx, BASE_UI_MANIFEST_REL, DRIFT(`\`${name}.${partName}\` appeared in the installed package and has no manifest entry`));
      continue;
    }
    if (identity(part) !== identity(recorded)) {
      fileFinding(
        ctx,
        BASE_UI_MANIFEST_REL,
        DRIFT(`\`${name}.${partName}\` changed shape: installed \`${identity(part)}\` vs manifest \`${identity(recorded)}\``),
      );
    }
  }
  for (const partName of Object.keys(known.parts)) {
    if (!(partName in installed.parts)) {
      fileFinding(ctx, BASE_UI_MANIFEST_REL, DRIFT(`\`${name}.${partName}\` vanished from the installed package but still has a manifest entry`));
    }
  }
}

function diffSurface(ctx: GateRunCtx, installed: ReturnType<typeof readInstalledSurface>, manifest: SurfaceManifest): void {
  if (installed === undefined) {
    return;
  }
  if (installed.version !== manifest.version) {
    fileFinding(ctx, BASE_UI_MANIFEST_REL, DRIFT(`installed @base-ui/react is ${installed.version}, the manifest describes ${manifest.version}`));
  }
  for (const [name, component] of Object.entries(installed.components)) {
    const known = manifest.components[name];
    if (known === undefined) {
      fileFinding(ctx, BASE_UI_MANIFEST_REL, DRIFT(`the installed package publishes component \`${name}\` (${component.module}), absent from the manifest`));
      continue;
    }
    diffParts(ctx, name, component, known);
  }
  for (const name of Object.keys(manifest.components)) {
    if (!(name in installed.components)) {
      fileFinding(ctx, BASE_UI_MANIFEST_REL, DRIFT(`component \`${name}\` vanished from the installed package but still has a manifest entry`));
    }
  }
}

function judgeDispositions(ctx: GateRunCtx, manifest: SurfaceManifest): void {
  for (const [name, component] of Object.entries(manifest.components)) {
    for (const [partName, part] of Object.entries(component.parts)) {
      const key = `${name}.${partName}`;
      if (part.disposition === "unresolved") {
        fileFinding(ctx, BASE_UI_MANIFEST_REL, UNRESOLVED(key));
        continue;
      }
      if (part.disposition !== "exposed" && part.why.trim().length === 0) {
        fileFinding(ctx, BASE_UI_MANIFEST_REL, NO_REASON(key, part.disposition));
      }
    }
  }
  for (const key of blindParts(manifest)) {
    fileFinding(ctx, SELF, BLIND_PART(key));
  }
  for (const key of truncatedParts(manifest)) {
    fileFinding(ctx, SELF, TRUNCATED_PART(key));
  }
}

function run(ctx: GateRunCtx): void {
  const realTree = fileLoaded(ctx, REAL_TREE_ANCHOR);
  const manifestPresent = existsSync(join(ctx.root, BASE_UI_MANIFEST_REL));
  const pkgPresent = existsSync(join(ctx.root, BASE_UI_PKG_REL, "package.json"));
  // The §4.6 blindness arms speak only where BOTH sides could plausibly exist: the real tree, or an
  // example that materialized one of them (an example that materialized neither is testing something else).
  if (!pkgPresent && (realTree || manifestPresent)) {
    fileFinding(ctx, SELF, NO_PACKAGE);
  }
  if (!manifestPresent && (realTree || pkgPresent)) {
    fileFinding(ctx, SELF, NO_MANIFEST);
  }
  const manifest = readManifest(ctx.root);
  if (manifest === undefined) {
    return;
  }
  diffSurface(ctx, readInstalledSurface(ctx.root), manifest);
  judgeDispositions(ctx, manifest);
}

/** A minimal installed package for the self-proofs: one namespaced component with one part. */
const PKG = `${BASE_UI_PKG_REL}`;
const INSTALLED_ONE_PART: Readonly<Record<string, string>> = {
  [`${PKG}/package.json`]: '{ "version": "9.9.9" }\n',
  [`${PKG}/select/index.d.ts`]: 'export * as Select from "./index.parts.js";\n',
  [`${PKG}/select/index.parts.d.ts`]: 'export { SelectRoot as Root } from "./root/SelectRoot.js";\n',
  [`${PKG}/select/root/SelectRoot.d.ts`]: "export interface SelectRootProps {\n  items?: readonly string[] | undefined;\n}\n",
};

function manifestJson(parts: string): string {
  return `{\n  "version": "9.9.9",\n  "components": {\n    "Select": {\n      "module": "@base-ui/react/select",\n      "namespaced": true,\n      "parts": {${parts}}\n    }\n  }\n}\n`;
}

const ROOT_ENTRY = (disposition: string, why: string, props = '"items"'): string =>
  `\n        "Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": [${props}], "inherits": [], "disposition": "${disposition}", "why": "${why}" }\n      `;

export const gate: GateDescriptor = {
  name: "baseui-surface-manifest",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // The verdict compares two whole artifacts (installed package vs committed manifest); no per-file answer
  // exists, so a scoped run must not claim one.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  // Reads node_modules and the manifest off real disk, so its examples must be materialized to a real tree.
  fsBacked: true,
  run,

  mustFlag: [
    {
      files: {
        ...INSTALLED_ONE_PART,
        [BASE_UI_MANIFEST_REL]: manifestJson(ROOT_ENTRY("exposed", "")),
        [`${PKG}/select/separator/SelectSeparator.d.ts`]: "export interface SelectSeparatorProps {\n  orientation?: string | undefined;\n}\n",
        [`${PKG}/select/index.parts.d.ts`]:
          'export { SelectRoot as Root } from "./root/SelectRoot.js";\nexport { SelectSeparator as Separator } from "./separator/SelectSeparator.js";\n',
      },
      expect: { messageIncludes: "appeared in the installed package and has no manifest entry" },
      why: "THE FOUNDING CASE — a bump adds an anatomy part (the real 1.7 `Select.Separator`) and the manifest does not know about it; the changelog called that a fix",
    },
    {
      files: {
        ...INSTALLED_ONE_PART,
        [`${PKG}/select/root/SelectRoot.d.ts`]:
          "export interface SelectRootProps {\n  items?: readonly string[] | undefined;\n  onValueChange?: ((v: string) => void) | undefined;\n}\n",
        [BASE_UI_MANIFEST_REL]: manifestJson(ROOT_ENTRY("exposed", "")),
      },
      expect: { messageIncludes: "changed shape" },
      why: "a PROP appeared on an existing part — the finer-grained half of the same tripwire, invisible to a parts-only diff",
    },
    {
      files: {
        ...INSTALLED_ONE_PART,
        [BASE_UI_MANIFEST_REL]: manifestJson(ROOT_ENTRY("unresolved", "")),
      },
      expect: { messageIncludes: "no ruling yet" },
      why: "the birth state the generator mints for a new part — always RED, so a bump cannot be absorbed without a human ruling",
    },
    {
      files: {
        ...INSTALLED_ONE_PART,
        [BASE_UI_MANIFEST_REL]: manifestJson(ROOT_ENTRY("sealed-away", "")),
      },
      expect: { messageIncludes: "rubber stamp" },
      why: "§4.2: a `sealed-away` ruling with an empty reason cannot say what would end it — a permanent exemption by accident",
    },
    {
      files: {
        [BASE_UI_MANIFEST_REL]: manifestJson(ROOT_ENTRY("exposed", "")),
      },
      expect: { messageIncludes: "BLIND, not green" },
      why: "§4.6: the installed package is gone, so the reader can prove nothing — that must be RED, never a quiet pass",
    },
    {
      files: {
        ...INSTALLED_ONE_PART,
        [BASE_UI_MANIFEST_REL]: manifestJson(ROOT_ENTRY("exposed", "", "")),
      },
      expect: { messageIncludes: "learned NOTHING" },
      why: "the READER's own blindness tripwire: a part with neither props nor heritage means the expander walked off the end (the depth-cap defect that silently cut Combobox.Root from 44 props to 14)",
    },
  ],
  mustPass: [
    {
      files: {
        ...INSTALLED_ONE_PART,
        [BASE_UI_MANIFEST_REL]: manifestJson(ROOT_ENTRY("exposed", "")),
      },
      why: "the agreeing state: installed surface == manifest, every part ruled. `exposed` needs no `why` — its justification is the rendered JSX, which baseui-anatomy-completeness checks",
    },
    {
      files: {
        ...INSTALLED_ONE_PART,
        [BASE_UI_MANIFEST_REL]: manifestJson(ROOT_ENTRY("n-a", "no @orb/ui seal wraps Select in this example; ends when one is added.")),
      },
      why: "a DECLARED LIMIT written down: a non-`exposed` disposition WITH a reason is the sanctioned shape, not a violation",
    },
    {
      files: {
        "packages/ui/src/x/x.tsx": "export const G = 1;\n",
      },
      why: "a run carrying NEITHER the package NOR a manifest is not a real tree and not an example of this gate — the blindness arms must stay silent there, or every sibling gate's mini-project inherits a phantom red",
    },
  ],
};
