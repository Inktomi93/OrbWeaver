// Policy: baseui-state-data-attributes — a @orb/ui seal styles a Base UI part's STATE through the
// `data-*` attribute Base UI already stamps on that element, never through a React state value it keeps in
// parallel. Base UI publishes each part's state surface as `<Part>State` and mirrors every key onto the DOM
// (`open` → `data-open`, `readOnly` → `data-readonly`, `highlighted` → `data-highlighted`), so a seal that
// holds `const [open, setOpen] = useState(false)` and feeds it into `className` has built a SECOND source of
// truth for a fact the framework is already telling the DOM — and the two disagree during every transition
// (Base UI keeps `data-open` through the closing animation; a React boolean flips on the first event).
//
// THE RULE IS MANIFEST-DRIVEN, NOT NAME-BASED: the state keys come from `<Part>State` in
// tooling/src/verify/gates/baseui-surface.manifest.json, so `Select.Trigger` is judged against ITS eleven keys
// and `Popover.Popup` against its five. A hand-written list of "state-ish words" would both over- and
// under-fire, and would go stale on the next bump without a sound.
//
// MEASURED AT LANDING (legacy): ZERO live violations — an honest zero, which is the only thing a gate at zero
// can be: a ratchet against reintroduction. Getting there took two matcher narrowings, both of which are the
// whole reason this policy is not a name hunch:
//   (1) the identifier must not be the NAME side of a property access — `className={slots.value()}` mentions
//       `value`, which is `Select.Value`'s state key, and a naive identifier scan reds our own slot helper;
//   (2) the identifier must be LOCAL REACT STATE (bound by a `use*(…)` call in this file), not a prop —
//       `<Separator className={separatorVariants({ orientation })} orientation={orientation}>` threads a
//       CONTROLLED prop through a tailwind-variants call, which is the house convention in ~40 seals and is
//       not a parallel source of truth at all.
// Without both narrowings the population was 2, and both were false positives. Both are pinned: `mustPass[1]`
// and `mustPass[2]` are the rows that die when the respective clause is cut (§4.1 matrix in the report).
//
// FAMILY `baseui-read` — the shared readers are `lib/baseui-read.ts#baseUiBindings` (the file's Base UI value
// bindings) and `#surfaceManifestFrom` (the committed ledger's shape, narrowed from the strict-JSON resource
// fact). `baseui-anatomy-completeness`, `baseui-derives-not-respells`, `baseui-portal-container-seam` and
// `baseui-surface-manifest` are the other members.
//
// POPULATION PORT: `@ui` (= `packages/ui/src/`), whole, both extensions. LEGACY at 854c81c80:
// `scanRoot: (p) => p.includes(UI_SRC)` with `UI_SRC = "packages/ui/src/"`, plus an in-`run` re-test of the
// same predicate through `repoRelative`. On repo-relative authored paths the two admit the identical set, so
// the port is byte-identical and both spellings of the fence are gone. Pinned by `mustPass[4]`.
//
// WHERE THE REFUSAL LIVES — THE RUNTIME, AND THIS IS A DELIBERATE CATCH DELTA. Legacy did
// `const manifest = readManifest(ctx.root); if (manifest === undefined) return;` — a SILENT PASS whenever the
// committed ledger was absent or unparseable, which is the fail-open shape §4.6 exists to catch. The ledger is
// now a DECLARED `json:baseui-manifest` resource, so `resolveResourceDeclarations` throws at the POPULATION
// phase on missing/empty/unparseable and this policy is WITHHELD — exit 2, "this run is not a verdict", never
// green zero (`docs/law/resource-policy-contract.md` §4). The family `runPolicyPass` drives retain the complete
// runtime outcome beyond refusal-text matching: missing, unparseable, and empty ledgers each produce a
// population-phase tool error, leave the owner incomplete with zero effective findings, and withhold this
// policy; the healthy twin pins the `json:baseui-manifest` receipt with `unresolved: 0` (proof law §6.3).
// population-phase tool error, the `incomplete` owner and this policy in `withheldPolicyIds`. The path this
// line carried until 2026-09-13 — `baseui-family.test.ts` — never existed (board #2297).
//
// A ready-but-DEGENERATE ledger (valid JSON, wrong shape) is the other half and it is a FINDING rather than a
// refusal — the artifact is wrong, not the reader. `baseui-surface-manifest` OWNS that finding, exactly as it
// already owns the missing-ledger case, so this policy judges nothing and stays silent: one defect, one red.
// THE AUTHORITY IS WHY IT CANNOT LIVE HERE, and the receipt is a measured failure rather than a preference —
// the arm was authored on this policy first, and `check:policy-conformance` refused it with
// `AUTHORITY ALARM [ordinary-waiver] ordinary finding …baseui-surface.manifest.json:1:1 has no nonempty
// position token for waiver binding`. That is door-failure class 2 (guide §2.1): a file-anchored ORDINARY
// finding has no authored token at its coordinate, so it has no waiver door at all. `baseui-surface-manifest`
// is `hard`, has no door by construction, and is the single owner of every "the ledger is wrong" verdict.
//
// COMMENT POSTURE: comment-SAFE — bindings, JSX attributes and identifiers are AST nodes.
//
// ANCHOR MOVE (§4.6 category 6): legacy reported `{ token: name, offset: attr.getText().indexOf(name) }` —
// the FIRST textual occurrence of the state key anywhere in the attribute, which lands inside a class STRING
// (`className={cn("data-open:x", open && "y")}`) rather than on the binding. The position is now the
// identifier NODE's own offset through `firstAnchor`, so the caret and the waiver both name the read. Zero
// live markers name this policy in either grammar, so no translation is owed.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `baseui-state-data-attributes` descriptor at fc5cad14c0f060ce35d257d96955d778e756d605, the parent of the conversion
// `ff07e1302` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `854c81c80`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,458 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 366 and final `population` admits 366.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/ui/src/art/art-bleed/__cbbhr_in_art-bleed.tsx`
// (virtual) admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import type { JsxAttributeLike, JsxOpeningElement, JsxSelfClosingElement, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SurfaceManifest } from "../contract/baseui.ts";
import { defineGate } from "../contract/policy.ts";
import { JSON_RESOURCE_PATHS } from "../contract/resource-json.ts";
import { baseUiBindings, localReactStateBindings, stateKeyReads, surfaceManifestFrom } from "../lib/baseui-read.ts";
import { firstAnchor } from "../lib/caught-failure.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

type JsxElement = JsxOpeningElement | JsxSelfClosingElement;

const MANIFEST_PATH = JSON_RESOURCE_PATHS["baseui-manifest"];

const MESSAGE =
  "a @orb/ui seal computes a Base UI part's className from React state that Base UI already publishes as a " +
  "`data-*` attribute on that very element. That is a second source of truth for one fact: Base UI holds " +
  "`data-open` through the closing animation while a React boolean flips on the first event, so the two " +
  "disagree exactly when a transition is on screen. Base UI's state surface is documented per part " +
  "(https://base-ui.com/react/handbook/styling) and this policy reads it from the committed surface ledger, not a list.";

const FIX =
  "delete the parallel state and style off the attribute Base UI stamps: `data-[open]:…` on the element " +
  "itself, or `group-data-[open]:…` from an ancestor carrying `group` — or, when the class genuinely needs " +
  "the value, Base UI's own `className={(state) => …}` render form, which is handed the same state object. " +
  `The full state surface of every part is in ${MANIFEST_PATH}. A deliberate occurrence waives with ` +
  "`@orb-waive baseui-state-data-attributes(<state key>): <reason + end condition>`, where <state key> is the " +
  "identifier exactly as read in the className expression (`open`), never the element or the attribute.";

/** Tag name → the part it renders, for every Base UI component this file imports as a value. */
interface StatefulPart {
  readonly owner: string;
  readonly state: readonly string[];
}

function partsByTag(sf: SourceFile, manifest: SurfaceManifest): ReadonlyMap<string, StatefulPart> {
  const byTag = new Map<string, StatefulPart>();
  for (const binding of baseUiBindings(sf)) {
    const component = manifest.components[binding.exported];
    if (binding.typeOnly || component === undefined) {
      continue;
    }
    for (const [partName, part] of Object.entries(component.parts)) {
      if (part.kind === "part" && part.state.length > 0) {
        byTag.set(component.namespaced ? `${binding.local}.${partName}` : binding.local, { owner: `${binding.exported}.${partName}`, state: part.state });
      }
    }
  }
  return byTag;
}

function classNameAttribute(el: JsxElement): JsxAttributeLike | undefined {
  return el.getAttributes().find((attribute) => Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === "className");
}

/** The `className={expr}` attribute of this element, when it HAS one with an expression initializer. Split
 *  out of the visitor so the judgment below is one loop rather than a staircase of early returns. */
function classNameExpressionAttribute(el: JsxElement): JsxAttributeLike | undefined {
  const attr = classNameAttribute(el);
  if (attr === undefined || !Node.isJsxAttribute(attr)) {
    return;
  }
  const init = attr.getInitializer();
  return init !== undefined && Node.isJsxExpression(init) ? attr : undefined;
}

/** A per-SourceFile memo: both file-level derivations are computed once per file per invocation, held in
 *  `create`'s closure rather than in module state. */
function memoByFile<T>(compute: (sf: SourceFile) => T): (sf: SourceFile) => T {
  const cache = new Map<SourceFile, T>();
  return (sf) => {
    const hit = cache.get(sf);
    if (hit !== undefined) {
      return hit;
    }
    const computed = compute(sf);
    cache.set(sf, computed);
    return computed;
  };
}

// ── self-proof substrate ────────────────────────────────────────────────────────────────────────────
const SEAL_PATH = "packages/ui/src/primitives/popover/probe-popover.tsx";

/** The ledger a proof row supplies: one namespaced component, one part, two state keys. */
function manifestJson(): string {
  return (
    '{ "version": "9.9.9", "components": { "Popover": { "module": "@base-ui/react/popover", "namespaced": true, "parts": {' +
    '"Popup": { "kind": "part", "symbol": "PopoverPopup", "from": "./popup/PopoverPopup.js", "props": [], "handlers": {}, "state": ["open", "side"], "inherits": ["BaseUIComponentProps"], "disposition": "exposed", "why": "" }' +
    "} } } }\n"
  );
}

function seal(body: string): string {
  return `import { Popover as BasePopover } from "@base-ui/react/popover";\nimport { useState } from "react";\nexport function Seal({ side }: { side: string }) {\n${body}}\n`;
}

export const gate = defineGate({
  id: "baseui-state-data-attributes",
  family: "baseui-read",
  authority: "ordinary",
  severity: "error",
  // Per-FILE verdicts compose: one seal file's JSX and hook bindings plus the complete declared manifest
  // are everything this answer needs. A source-only request visits that selected subset; touching the
  // manifest reselects all declared @ui sources so a changed state surface is checked against every seal.
  population: "@ui",
  analysis: "resource",
  execution: "selected-files",
  facts: [],
  resources: [{ kind: "json", id: "baseui-manifest" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const read = surfaceManifestFrom(readyResourceValue(ctx.resources.json("baseui-manifest")).value);
    const manifest = read.ok ? read.manifest : undefined;
    const statefulTags = memoByFile((sf) => (manifest === undefined ? new Map<string, StatefulPart>() : partsByTag(sf, manifest)));
    const localBindings = memoByFile(localReactStateBindings);
    const judge = (el: JsxElement): void => {
      const sf = el.getSourceFile();
      const info = statefulTags(sf).get(el.getTagNameNode().getText());
      const attr = info === undefined ? undefined : classNameExpressionAttribute(el);
      if (info === undefined || attr === undefined) {
        return;
      }
      const local = localBindings(sf);
      for (const id of stateKeyReads(
        attr,
        info.state.filter((key) => local.has(key)),
      )) {
        ctx.report.node(attr, { ...firstAnchor(attr, [id]), message: MESSAGE, fix: FIX });
      }
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
          visit: (node): void => {
            if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
              judge(node);
            }
          },
        },
      ],
    };
  },

  mustFlag: [
    {
      mode: "resource",
      files: {
        [MANIFEST_PATH]: manifestJson(),
        [SEAL_PATH]: seal('  const [open] = useState(false);\n  return <BasePopover.Popup className={open ? "a" : "b"} />;\n'),
      },
      expect: { count: 1, token: "open" },
      why: "the founding shape: a React mirror of `open` driving the class, on the very element Base UI stamps `data-open` on — the two disagree for the whole closing animation. The token is the IDENTIFIER, which is the §4.2 waiver position",
    },
    {
      mode: "resource",
      files: {
        [MANIFEST_PATH]: manifestJson(),
        [SEAL_PATH]: seal(
          '  const [open] = useState(false);\n  return <BasePopover.Popup className={cn("data-open:x", open && "y")}>{null}</BasePopover.Popup>;\n',
        ),
      },
      expect: { count: 1, token: "open" },
      why: "the PAIRED-TAG spelling through a `cn()` carrier — a self-closing-only or bare-ternary-only matcher is the §5 lying-proof class. The class STRING also contains the substring `open`, which is exactly the site the legacy `indexOf` anchor bound to; the identifier anchor is what makes this row's token land on the read",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { [MANIFEST_PATH]: manifestJson(), [SEAL_PATH]: seal('  return <BasePopover.Popup className="data-[open]:opacity-100" />;\n') },
      why: "the remedy — the state is read off the attribute Base UI already renders",
    },
    {
      mode: "resource",
      files: {
        [MANIFEST_PATH]: '{ "version": "9.9.9", "components": { "Popover": { "module": "@base-ui/react/popover", "namespaced": true } } }\n',
        [SEAL_PATH]: seal('  const [open] = useState(false);\n  return <BasePopover.Popup className={open ? "a" : "b"} />;\n'),
      },
      why: "THE SINGLE-OWNER LIMIT, written down: a ledger that is valid JSON and is not a ledger (no `parts`) leaves this policy with nothing to judge, and `baseui-surface-manifest` — `hard`, so it has a door for a file-anchored finding where an ordinary policy has none — reports it. An ordinary policy accusing here was AUTHORED, measured, and refused by the engine; the header records the exact alarm",
    },
    {
      mode: "resource",
      files: { [MANIFEST_PATH]: manifestJson(), [SEAL_PATH]: seal("  return <BasePopover.Popup className={variants({ side })} />;\n") },
      why: "MEASURED FALSE POSITIVE #2, and the row that dies when the LOCAL-STATE clause is cut: a CONTROLLED PROP threaded into a tailwind-variants call is the house convention in ~40 seals (separator.tsx is the live case) — it is not a parallel source of truth",
    },
    {
      mode: "resource",
      files: {
        [MANIFEST_PATH]: manifestJson(),
        [SEAL_PATH]: seal("  const [open] = useState(false);\n  return <BasePopover.Popup className={slots.open()} data-x={open} />;\n"),
      },
      why: "MEASURED FALSE POSITIVE #1, and the row that dies when `isValueReference` is cut: `slots.open()` MENTIONS a state key as a method name without reading the binding — select.tsx's `slots.value()` is the live case",
    },
    {
      mode: "resource",
      files: {
        [MANIFEST_PATH]: manifestJson(),
        [SEAL_PATH]: seal('  const [count] = useState(0);\n  return <BasePopover.Popup className={count > 1 ? "a" : "b"} />;\n'),
      },
      why: "local state that is NOT part of Base UI's state surface for this part — the seal's own business, and nothing on the DOM already answers it",
    },
    {
      mode: "resource",
      files: {
        [MANIFEST_PATH]: manifestJson(),
        "packages/ui/src/primitives/popover/clean.tsx": "export const Clean = true;\n",
        "packages/client/src/features/x/surfaces/pane.tsx": seal(
          '  const [open] = useState(false);\n  return <BasePopover.Popup className={open ? "a" : "b"} />;\n',
        ),
      },
      why: "THE POPULATION FENCE, pinned with an in-population ANCHOR beside it (a falsifier admitting nothing tool-errors instead of passing): the identical founding shape under `@client` is not this policy's finding, because features compose SEALED primitives and never render Base UI parts directly. Widen past `@ui` and this is the only row that dies",
    },
    {
      mode: "resource",
      files: {
        [MANIFEST_PATH]: manifestJson(),
        [SEAL_PATH]: seal(
          '  const [open] = useState(false);\n  // @orb-waive baseui-state-data-attributes(open): the proof\'s stand-in reason; ends when this fixture stops flagging.\n  return <BasePopover.Popup className={open ? "a" : "b"} />;\n',
        ),
      },
      why: "§4.2 POSITIONAL IDENTITY: the position is the state KEY as read (`open`), so an author waives that one read rather than the element or the file. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume; the arm ends if that row changes",
    },
  ],
});
