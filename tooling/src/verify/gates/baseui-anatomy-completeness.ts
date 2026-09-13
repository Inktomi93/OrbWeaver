// Policy: baseui-anatomy-completeness — the anatomy decision LEDGER must stay TOTAL and TRUE. It reads the
// dispositions in tooling/src/verify/gates/baseui-surface.manifest.json (never a hard-coded part list) and
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
// DECLARED LIMIT (pinned by `mustPass[2]`): "renders it" means a JSX tag `<Local.Part>` / `<Local>` in a
// `packages/ui/src/**` file that imports the component as a VALUE. A part reached only through an
// indirection this policy cannot see (a part component stored in a variable, or a part rendered by a
// sibling package) reads as not-rendered — so the honest ledger entry for such a part is `sealed-away` with
// that fact as its reason, not `exposed`.
//
// FAMILY `baseui-read` — the shared readers are `lib/baseui-read.ts#renderedPartsByComponent` (which parts
// of which component each @orb/ui file renders) and `#surfaceManifestFrom` (the committed ledger's shape,
// narrowed from the strict-JSON resource fact). `baseui-surface-manifest`, `baseui-derives-not-respells`
// (+ its `-health` sibling), `baseui-portal-container-seam` and `baseui-state-data-attributes` are the
// other members.
//
// AUTHORITY — `hard`, and that is forced rather than chosen. Every arm reports a FILE anchor: arm A at the
// ledger row, arm B at the seal's render site, arm C at the ledger. A file-anchored ORDINARY finding has no
// authored token at its coordinate, so `locateFinding` raises an authority ALARM on the author's first real
// waiver (guide §3, door-failure class 2) — the measurement is quoted in `baseui-state-data-attributes.ts`,
// which had the arm refused on exactly those grounds. The legacy descriptor declared no exemption grammar
// and a marker census over the whole tree finds ZERO `@orb-gate-ignore baseui-anatomy-completeness` and
// ZERO `@orb-waive baseui-anatomy-completeness`, so no door is being closed: there was none.
//
// POPULATION PORT: `@ui` (= `packages/ui/src/`), whole, both extensions. LEGACY at 1692583d6:
// `scanRoot: (p) => p.includes(UI_SRC)` with `UI_SRC = "packages/ui/src/"`, plus the SAME predicate applied
// a second time inside `renderedPartsByComponent` and a third time in the `sawSeal` test. On repo-relative
// authored paths all three admit the identical set, so the port is byte-identical; the reader keeps its own
// fence because `ops/gen/baseui-surface.ts` drives it over an unfenced file set. Measured on this tree:
// legacy `check:structure --check baseui-anatomy-completeness` reported `scanned 366/7557 files`.
//
// WHERE THE REFUSAL LIVES — THE RUNTIME. Legacy did `const manifest = readManifest(ctx.root); if (manifest
// === undefined) return;` — a SILENT PASS whenever the committed ledger was absent OR unparseable, which is
// the fail-open shape §4.6 exists to catch, and its own `mustPass[3]` enshrined it. The ledger is now a
// DECLARED `json:baseui-manifest` resource, so `resolveResourceDeclarations` throws at the POPULATION phase
// on missing/empty/unparseable and this policy is WITHHELD — exit 2, "this run is not a verdict", never a
// green zero (`resource-policy-contract.md` §4). No proof row can express a refusal (guide §4.5b); the pins
// are `runPolicyPass` drives in `tests/tooling/verify/gates/baseui-family.test.ts`.
//
// A ready-but-DEGENERATE ledger (valid JSON, wrong shape) is a FINDING rather than a refusal, and
// `baseui-surface-manifest` OWNS it — `hard`, file-anchored, single owner of every "the ledger is wrong"
// verdict. This policy judges nothing there and stays silent: one defect, one red. Pinned by `mustPass[3]`.
//
// ARM C LOST ITS ANCHOR HEURISTIC, and that is the conversion doing real work. Legacy guarded the blindness
// finding behind `fileLoaded(ctx, "packages/ui/src/tokens/index.ts")` — a hand-rolled real-tree probe whose
// only job was stopping a sibling gate's mini-project from inheriting a phantom red, because the legacy
// dispatcher could hand this gate an arbitrary file subset. `execution: "entire-population"` states that
// property in the contract instead: a narrowed request DEFERS this policy rather than letting it judge a
// subset, so an empty seal set is genuine blindness and needs no probe. The finding also moves off SELF
// (this gate's own source file, which is in neither the `@ui` population nor the resource population, so it
// would now be an `[evaluate]` tool error) onto the ledger row it is a verdict about.
//
// COMMENT POSTURE: comment-SAFE — imports and JSX tags are AST nodes; the ledger is parsed JSON.
// LEGACY SHA: 1692583d6.
import type { RenderSite, SurfaceManifest } from "../contract/baseui.ts";
import { defineGate } from "../contract/policy.ts";
import { JSON_RESOURCE_PATHS } from "../contract/resource-json.ts";
import { BASE_UI_MODULE_PREFIX, renderedPartsByComponent, surfaceManifestFrom } from "../lib/baseui-read.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MANIFEST_PATH = JSON_RESOURCE_PATHS["baseui-manifest"];
const GEN = "node tooling/src/verify/cli.ts baseline baseui-surface";

const MESSAGE =
  "the Base UI anatomy ledger and the @orb/ui seals disagree. Each part in " +
  `${MANIFEST_PATH} carries a disposition — \`exposed\` (the seal renders it), \`sealed-away\` ` +
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
  'value, so every "exposed" ruling passed for free (a policy keyed on a derivation must RED when the ' +
  "derivation comes back empty). Check this policy's `@ui` population and the harness globs.";

type ReportFile = (path: string, details?: { readonly line?: number; readonly message?: string }) => void;

function judge(report: ReportFile, manifest: SurfaceManifest, rendered: Map<string, Map<string, readonly RenderSite[]>>): void {
  for (const [name, component] of Object.entries(manifest.components)) {
    const byPart = rendered.get(name);
    for (const [partName, part] of Object.entries(component.parts)) {
      if (part.kind !== "part") {
        continue;
      }
      const key = `${name}.${partName}`;
      const site = byPart?.get(partName)?.[0];
      if (part.disposition === "exposed" && site === undefined) {
        report(MANIFEST_PATH, { line: 1, message: CLAIMED_NOT_RENDERED(key) });
        continue;
      }
      // `unresolved` is baseui-surface-manifest's finding, not this policy's — one defect, one red.
      if (site !== undefined && part.disposition !== "exposed" && part.disposition !== "unresolved") {
        report(site.file, { line: site.line, message: RENDERED_NOT_RULED(key, part.disposition, site) });
      }
    }
  }
}

// ── self-proof substrate ────────────────────────────────────────────────────────────────────────────
const MANIFEST = (disposition: string, why = ""): Readonly<Record<string, string>> => ({
  [MANIFEST_PATH]:
    `{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true, "parts": {` +
    `"Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": ["items"], "inherits": [], "disposition": "exposed", "why": "" },` +
    `"Backdrop": { "kind": "part", "symbol": "SelectBackdrop", "from": "./backdrop/SelectBackdrop.js", "props": [], "inherits": ["BaseUIComponentProps"], "disposition": "${disposition}", "why": "${why}" }` +
    "} } } }\n",
});

const SEAL = (body: string): string => `import { Select as BaseSelect } from "@base-ui/react/select";\nexport const Seal = () => (\n${body}\n);\n`;
const SEAL_PATH = "packages/ui/src/primitives/select/probe-select.tsx";
const ROOT_ONLY = SEAL("  <BaseSelect.Root items={[]} />");
const ROOT_AND_BACKDROP = SEAL("  <BaseSelect.Root items={[]}>\n    <BaseSelect.Backdrop />\n  </BaseSelect.Root>");

export const gate = defineGate({
  id: "baseui-anatomy-completeness",
  family: "baseui-read",
  authority: "hard",
  severity: "error",
  population: "@ui",
  analysis: "resource",
  // Coverage across EVERY seal plus the committed ledger: a per-file verdict does not exist, and a
  // narrowed request must DEFER rather than let arm C read a subset as blindness.
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "json", id: "baseui-manifest" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const read = surfaceManifestFrom(readyResourceValue(ctx.resources.json("baseui-manifest")).value);
      if (!read.ok) {
        // `baseui-surface-manifest` owns every "the ledger is wrong" finding — one defect, one red.
        return;
      }
      if (!ctx.files.some((sf) => sf.getText().includes(BASE_UI_MODULE_PREFIX))) {
        ctx.report.file(MANIFEST_PATH, { line: 1, message: NO_SEALS_SCANNED });
        return;
      }
      judge(ctx.report.file, read.manifest, renderedPartsByComponent(ctx.files, read.manifest));
    },
  }),

  mustFlag: [
    {
      mode: "resource",
      files: { ...MANIFEST("exposed"), [SEAL_PATH]: ROOT_ONLY },
      expect: { count: 1, messageIncludes: 'rules `Select.Backdrop` "exposed", but no @orb/ui seal renders it' },
      why: "ARM A — the founding shape: the ledger claims an anatomy part the seal never renders (the crunch's Combobox-missing-Backdrop / Popover-missing-Viewport class)",
    },
    {
      mode: "resource",
      files: { ...MANIFEST("sealed-away", "deliberately omitted"), [SEAL_PATH]: ROOT_AND_BACKDROP },
      expect: { count: 1, messageIncludes: "outgrew its own ruling" },
      why: "ARM B, the other direction: the seal renders a part the ledger says is sealed away — a ruling that has silently stopped being true is exactly as bad as a missing part. The count is 1 because the finding anchors on the FIRST render site, so a part rendered twice is still one ruling that is wrong",
    },
    {
      mode: "resource",
      files: { ...MANIFEST("exposed"), "packages/ui/src/tokens/index.ts": "export const TOKENS = 1;\n" },
      expect: { count: 1, messageIncludes: "must RED when the derivation comes back empty" },
      why: "ARM C blindness: the ledger is there and the population admits a real @orb/ui file, but no file imports @base-ui/react at all — every `exposed` ruling would otherwise pass for free. The in-population anchor file is what makes this a FINDING rather than a `[population]` tool error",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...MANIFEST("exposed"), [SEAL_PATH]: ROOT_AND_BACKDROP },
      why: "the agreeing state — every `exposed` part rendered, nothing rendered without a ruling",
    },
    {
      mode: "resource",
      files: {
        ...MANIFEST("sealed-away", "the modal backdrop is opt-in behind a `backdrop` prop; ends if the seal starts rendering it unconditionally"),
        [SEAL_PATH]: ROOT_ONLY,
      },
      why: "the SANCTIONED omission: a deliberate `sealed-away` ruling with a reason is a decision, not a defect — this policy exists to keep the decision honest, not to force every part into every seal",
    },
    {
      mode: "resource",
      files: { ...MANIFEST("unresolved"), [SEAL_PATH]: ROOT_ONLY },
      why: "a DECLARED LIMIT: `unresolved` is baseui-surface-manifest's red. One defect gets one finding, from one policy — double-reporting trains people to skim",
    },
    {
      mode: "resource",
      files: {
        [MANIFEST_PATH]: '{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true } } }\n',
        [SEAL_PATH]: ROOT_ONLY,
      },
      why: "THE SINGLE-OWNER LIMIT: a ledger that is valid JSON and is not a ledger (no `parts`) leaves this policy with nothing to judge. `baseui-surface-manifest` — `hard`, and the owner of every ledger-shape verdict — reports it. Note what this row is NOT: the legacy `mustPass` it replaces supplied NO ledger at all, which under this contract is a population-phase REFUSAL rather than a silent pass",
    },
    {
      mode: "resource",
      files: {
        ...MANIFEST("exposed"),
        [SEAL_PATH]: ROOT_AND_BACKDROP,
        "packages/client/src/features/x/surfaces/pane.tsx": SEAL("  <BaseSelect.Root items={[]} />"),
      },
      why: "THE POPULATION FENCE, with an in-population anchor beside it: a `@client` feature rendering Base UI directly is not this policy's evidence — features compose SEALED primitives, and a ruling proved true by a file outside `@ui` would be proved by the wrong thing. Widen past `@ui` and nothing here changes, which is why the fence's falsifier is arm A's row under the widened population rather than this one",
    },
  ],
});
