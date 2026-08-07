// Gate: baseui-state-data-attributes — a @orb/ui seal styles a Base UI part's STATE through the
// `data-*` attribute Base UI already stamps on that element, never through a React state value it keeps in
// parallel. Base UI publishes each part's state surface as `<Part>State` and mirrors every key onto the DOM
// (`open` → `data-open`, `readOnly` → `data-readonly`, `highlighted` → `data-highlighted`), so a seal that
// holds `const [open, setOpen] = useState(false)` and feeds it into `className` has built a SECOND source of
// truth for a fact the framework is already telling the DOM — and the two disagree during every transition
// (Base UI keeps `data-open` through the closing animation; a React boolean flips on the first event).
//
// THE RULE IS MANIFEST-DRIVEN, NOT NAME-BASED: the state keys come from `<Part>State` in
// scripts/check/gates/baseui-surface.manifest.json, so `Select.Trigger` is judged against ITS eleven keys
// and `Popover.Popup` against its five. A hand-written list of "state-ish words" would both over- and
// under-fire, and would go stale on the next bump without a sound.
//
// MEASURED AT LANDING: ZERO live violations — an honest zero, which is the only thing a gate at zero can be:
// a ratchet against reintroduction. Getting there took two matcher narrowings, both of which are the whole
// reason this gate is not a name hunch:
//   (1) the identifier must not be the NAME side of a property access — `className={slots.value()}` mentions
//       `value`, which is `Select.Value`'s state key, and a naive identifier scan reds our own slot helper;
//   (2) the identifier must be LOCAL REACT STATE (bound by a `use*(…)` call in this file), not a prop —
//       `<Separator className={separatorVariants({ orientation })} orientation={orientation}>` threads a
//       CONTROLLED prop through a tailwind-variants call, which is the house convention in ~40 seals and is
//       not a parallel source of truth at all.
// Without both narrowings the population was 2, and both were false positives.
import type { Identifier, JsxOpeningElement, JsxSelfClosingElement, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SurfaceManifest } from "../baseui-read.ts";
import { BASE_UI_MANIFEST_REL, baseUiBindings, readManifest, repoRelative, UI_SRC } from "../baseui-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

type JsxElement = JsxOpeningElement | JsxSelfClosingElement;

const HOOK_CALL_RE = /^use[A-Z]/u;

const MESSAGE =
  "a @orb/ui seal computes a Base UI part's className from React state that Base UI already publishes as a " +
  "`data-*` attribute on that very element. That is a second source of truth for one fact: Base UI holds " +
  "`data-open` through the closing animation while a React boolean flips on the first event, so the two " +
  "disagree exactly when a transition is on screen. Base UI's state surface is documented per part " +
  "(docs/vendor/base-ui/handbook/styling.md) and this gate reads it from the installed package, not a list.";

const FIX =
  "delete the parallel state and style off the attribute Base UI stamps: `data-[open]:…` on the element " +
  "itself, or `group-data-[open]:…` from an ancestor carrying `group` — or, when the class genuinely needs " +
  "the value, Base UI's own `className={(state) => …}` render form, which is handed the same state object. " +
  `The reported token is the state key; the full state surface of every part is in ${BASE_UI_MANIFEST_REL}.`;

/** Local identifiers bound by a hook call in this file (`const [open, setOpen] = useState(false)`,
 *  `const open = useSomething()`). A PROP of the same name is deliberately NOT local state — threading a
 *  controlled prop into a variant call is the house convention, not a parallel truth. */
function localHookBindings(sf: SourceFile): Set<string> {
  const out = new Set<string>();
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    if (init === undefined || !Node.isCallExpression(init) || !HOOK_CALL_RE.test(init.getExpression().getText())) {
      continue;
    }
    const name = decl.getNameNode();
    if (Node.isIdentifier(name)) {
      out.add(name.getText());
      continue;
    }
    for (const element of name.getDescendantsOfKind(SyntaxKind.Identifier)) {
      out.add(element.getText());
    }
  }
  return out;
}

/** Is this identifier a genuine VALUE reference, or the `.value` half of a property access / a property
 *  name in an object literal? `slots.value()` and `{ value: x }` mention the word without reading the
 *  binding, and reading them as references is how this gate false-positived on its own slot helpers. */
function isValueReference(id: Identifier): boolean {
  const parent = id.getParent();
  if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) {
    return false;
  }
  if (Node.isPropertyAssignment(parent) && parent.getNameNode() === id) {
    return false;
  }
  return true;
}

/** Tag name → the part it renders, for every Base UI component this file imports as a value. */
function partsByTag(sf: SourceFile, manifest: SurfaceManifest): Map<string, { owner: string; state: readonly string[] }> {
  const byTag = new Map<string, { owner: string; state: readonly string[] }>();
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

function judgeElement(
  ctx: GateRunCtx,
  el: JsxElement,
  byTag: ReadonlyMap<string, { owner: string; state: readonly string[] }>,
  local: ReadonlySet<string>,
): void {
  const info = byTag.get(el.getTagNameNode().getText());
  if (info === undefined) {
    return;
  }
  for (const attr of el.getAttributes()) {
    if (!Node.isJsxAttribute(attr) || attr.getNameNode().getText() !== "className") {
      continue;
    }
    const init = attr.getInitializer();
    if (init === undefined || !Node.isJsxExpression(init)) {
      continue;
    }
    for (const id of init.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const name = id.getText();
      if (!(local.has(name) && info.state.includes(name) && isValueReference(id))) {
        continue;
      }
      ctx.report(attr, { token: name, offset: Math.max(attr.getText().indexOf(name), 0) });
    }
  }
}

function run(ctx: GateRunCtx): void {
  const manifest = readManifest(ctx.root);
  if (manifest === undefined) {
    return; // baseui-surface-manifest owns the missing-ledger finding.
  }
  for (const sf of ctx.files) {
    if (!repoRelative(sf.getFilePath()).includes(UI_SRC)) {
      continue;
    }
    const byTag = partsByTag(sf, manifest);
    if (byTag.size === 0) {
      continue;
    }
    const local = localHookBindings(sf);
    if (local.size === 0) {
      continue;
    }
    for (const el of [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)]) {
      judgeElement(ctx, el, byTag, local);
    }
  }
}

// ── self-proof substrate ────────────────────────────────────────────────────────────────────────────
const MANIFEST_FILE: Readonly<Record<string, string>> = {
  [BASE_UI_MANIFEST_REL]:
    '{ "version": "9.9.9", "components": { "Popover": { "module": "@base-ui/react/popover", "namespaced": true, "parts": {' +
    '"Popup": { "kind": "part", "symbol": "PopoverPopup", "from": "./popup/PopoverPopup.js", "props": [], "handlers": {}, "state": ["open", "side"], "inherits": ["BaseUIComponentProps"], "disposition": "exposed", "why": "" }' +
    "} } } }\n",
};
const SEAL_PATH = "packages/ui/src/primitives/popover/probe-popover.tsx";

function seal(body: string): Readonly<Record<string, string>> {
  return {
    ...MANIFEST_FILE,
    [SEAL_PATH]: `import { Popover as BasePopover } from "@base-ui/react/popover";\nimport { useState } from "react";\nexport function Seal({ side }: { side: string }) {\n${body}}\n`,
  };
}

export const gate: GateDescriptor = {
  name: "baseui-state-data-attributes",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // Per-file: the verdict needs this file's JSX, this file's hook bindings, and the committed ledger.
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes(UI_SRC),
  // The ledger's `<Part>State` keys are read off disk.
  fsBacked: true,
  run,

  mustFlag: [
    {
      files: seal('  const [open] = useState(false);\n  return <BasePopover.Popup className={open ? "a" : "b"} />;\n'),
      expect: { count: 1 },
      why: "the founding shape: a React mirror of `open` driving the class, on the very element Base UI stamps `data-open` on — the two disagree for the whole closing animation",
    },
    {
      files: seal('  const [open] = useState(false);\n  return <BasePopover.Popup className={cn("x", open && "y")}>{null}</BasePopover.Popup>;\n'),
      expect: { count: 1 },
      why: "the PAIRED-TAG spelling through a `cn()` carrier — a self-closing-only or bare-ternary-only matcher is the §5 lying-proof class",
    },
  ],
  mustPass: [
    {
      files: seal('  return <BasePopover.Popup className="data-[open]:opacity-100" />;\n'),
      why: "the remedy — the state is read off the attribute Base UI already renders",
    },
    {
      files: seal("  return <BasePopover.Popup className={variants({ side })} />;\n"),
      why: "MEASURED FALSE POSITIVE #2, kept as a written limit: a CONTROLLED PROP threaded into a tailwind-variants call is the house convention in ~40 seals (separator.tsx is the live case) — it is not a parallel source of truth",
    },
    {
      files: seal("  const [open] = useState(false);\n  return <BasePopover.Popup className={slots.open()} data-x={open} />;\n"),
      why: "MEASURED FALSE POSITIVE #1, kept as a written limit: `slots.open()` MENTIONS a state key as a method name without reading the binding — select.tsx's `slots.value()` is the live case",
    },
    {
      files: seal('  const [count] = useState(0);\n  return <BasePopover.Popup className={count > 1 ? "a" : "b"} />;\n'),
      why: "local state that is NOT part of Base UI's state surface for this part — the seal's own business, and nothing on the DOM already answers it",
    },
  ],
};
