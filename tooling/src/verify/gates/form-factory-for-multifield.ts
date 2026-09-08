// Gate: form-factory-for-multifield (D54 §13.3/§13.4, UI-Primitives-and-Reuse.md §13.4). The live
// `no-direct-useform` grit already forces the factories the moment TanStack Form is touched; the hole
// this gate closes is the form that dodges Form ENTIRELY — a features/** component hand-rolling ≥3
// CONTROLLED inputs (a form-control tag with both a value binding and an onChange-family handler) while
// importing neither editor factory (which bake seed/key-remount/reset/reseed-guard/draft-mirror
// semantics a hand-roll re-invents, subtly wrong). Scope: packages/client/src/features/**/*.tsx; counted per enclosing component.
// The count is CONCURRENT fields, not written ones (#620): mutually-exclusive branches collapse to their
// MAX — see `countConcurrentFields` for which node kinds are exclusive and, more importantly, which are NOT.
import type { JsxAttribute, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";

const FEATURES_SRC = "/packages/client/src/features/";
const TSX_RE = /\.tsx$/u;

const FACTORY_IMPORTS = new Set(["createSavedEntityForm", "createAutosaveEntityForm"]);

// The POSITIVE control allowlist — tags that are genuinely form-FIELD inputs (raw HTML + @orb/ui field
// controls). Deliberately EXCLUDES `Tabs`/`ToggleGroup`/`Menu` etc. whose `value` is selection/nav state,
// not a field value. A single controlled member of this set is still fine (a lone search box / toggle) —
// the threshold is what makes it a form.
const FORM_CONTROLS = new Set([
  "input",
  "textarea",
  "select",
  "Input",
  "Textarea",
  "Select",
  "Switch",
  "Checkbox",
  "NumberField",
  "ColorField",
  "Slider",
  "RadioGroup",
  "Combobox",
  "Autocomplete",
  "MacroTextarea",
]);

const VALUE_PROPS = new Set(["value", "checked"]);
const CHANGE_PROPS = new Set(["onChange", "onValueChange", "onCheckedChange"]);

const THRESHOLD = 3;

function featureRel(path: string): string | undefined {
  const idx = path.indexOf(FEATURES_SRC);
  if (idx === -1 || !TSX_RE.test(path)) {
    return;
  }
  return `packages/client/src/features/${path.slice(idx + FEATURES_SRC.length)}`;
}

function importsFactory(sf: SourceFile): boolean {
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getNamedImports().some((n) => FACTORY_IMPORTS.has(n.getName()))) {
      return true;
    }
  }
  return false;
}

/** The tag name of a JSX opening/self-closing element ('Input', 'input', 'select', …). */
function tagName(el: Node): string {
  if (el.isKind(SyntaxKind.JsxOpeningElement) || el.isKind(SyntaxKind.JsxSelfClosingElement)) {
    return el.getTagNameNode().getText();
  }
  return "";
}

function attrNames(el: Node): Set<string> {
  const names = new Set<string>();
  if (!(el.isKind(SyntaxKind.JsxOpeningElement) || el.isKind(SyntaxKind.JsxSelfClosingElement))) {
    return names;
  }
  for (const attr of el.getAttributes()) {
    if (attr.isKind(SyntaxKind.JsxAttribute)) {
      names.add((attr as JsxAttribute).getNameNode().getText());
    }
  }
  return names;
}

/** A CONTROLLED form-field element: a form-control tag two-way bound (value/checked + onChange-family). */
function isControlledFormInput(el: Node): boolean {
  if (!FORM_CONTROLS.has(tagName(el))) {
    return false;
  }
  const names = attrNames(el);
  const hasValue = [...VALUE_PROPS].some((p) => names.has(p));
  const hasChange = [...CHANGE_PROPS].some((p) => names.has(p));
  return hasValue && hasChange;
}

function isFunctionLike(node: Node): boolean {
  return node.isKind(SyntaxKind.FunctionDeclaration) || node.isKind(SyntaxKind.FunctionExpression) || node.isKind(SyntaxKind.ArrowFunction);
}

/** The nearest enclosing function-like node (a component), keyed by its start position + a display name. */
function enclosingComponent(el: Node): { key: number; name: string; fn: Node } | undefined {
  let found: { key: number; name: string; fn: Node } | undefined;
  let node: Node | undefined = el.getParent();
  while (node !== undefined && found === undefined) {
    if (isFunctionLike(node)) {
      found = { key: node.getStart(), name: componentName(node), fn: node };
    } else {
      node = node.getParent();
    }
  }
  return found;
}

/** #620 — THE COUNT IS WHAT RENDERS AT ONCE, NOT WHAT IS WRITTEN. A component that dispatches ONE control
 *  out of an exhaustive `switch` is a one-field component, not an N-field hand-rolled form: only one arm
 *  ever renders. Counting the SUM made B2's `KnobField` — one control from a 4-arm switch — report
 *  "KnobField (4 fields)", and since this gate has no allowlist its only exits were "import a form factory"
 *  or "drop below 3 controls", pressuring a dynamic server-descriptor-driven knob set toward an
 *  entity-form factory that wants a FIXED defaultValues shape. So: MAX over mutually-exclusive branches,
 *  SUM over everything else.
 *
 *  Exclusive (max): `switch` arms of one switch · an `if`/`else` pair · the two arms of ONE conditional
 *  expression. Each is a runtime either/or.
 *  NOT exclusive (sum): `&&` guards, and SIBLING conditionals — `{a && <Input/>}{b && <Input/>}` renders
 *  BOTH when both hold, so collapsing those would gut the true-positive arm this gate exists for.
 *  Recursion stops at a nested function-like node: that is its own component, attributed separately by
 *  `enclosingComponent` (a `.map(item => <Input/>)` callback has always counted as its own scope here). */
/** Does this statement definitely leave the enclosing function? (a `return`/`throw`, or a block ending in
 *  one). Used to recognise the GUARD-CLAUSE shape, where exclusivity is expressed by control flow rather
 *  than by an `else`. */
function alwaysExits(stmt: Node): boolean {
  if (stmt.isKind(SyntaxKind.ReturnStatement) || stmt.isKind(SyntaxKind.ThrowStatement)) {
    return true;
  }
  if (stmt.isKind(SyntaxKind.Block)) {
    const last = stmt.getStatements().at(-1);
    return last !== undefined && alwaysExits(last);
  }
  return false;
}

/** Count a statement LIST with early-return flow. `if (x) { return <A/>; } return <B/>;` has no `else`, but
 *  the trailing statements only run when the guard did NOT fire — so the guard's body and the remainder are
 *  mutually exclusive. This is the dominant React dispatch idiom (a guard clause per variant), and treating
 *  it as a sum was the same #620 false positive the `switch` case makes obvious. */
function countStatementList(statements: readonly Node[]): number {
  let total = 0;
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i];
    if (stmt === undefined) {
      continue;
    }
    if (stmt.isKind(SyntaxKind.IfStatement) && stmt.getElseStatement() === undefined && alwaysExits(stmt.getThenStatement())) {
      const guard = countConcurrentFields(stmt.getThenStatement());
      const rest = countStatementList(statements.slice(i + 1));
      return total + countConcurrentFields(stmt.getExpression()) + Math.max(guard, rest);
    }
    total += countConcurrentFields(stmt);
  }
  return total;
}

function countConcurrentFields(node: Node): number {
  if (node.isKind(SyntaxKind.Block)) {
    return countStatementList(node.getStatements());
  }
  if (node.isKind(SyntaxKind.CaseClause)) {
    return countConcurrentFields(node.getExpression()) + countStatementList(node.getStatements());
  }
  if (node.isKind(SyntaxKind.DefaultClause)) {
    return countStatementList(node.getStatements());
  }
  if (node.isKind(SyntaxKind.SwitchStatement)) {
    const arms = node.getClauses().map((clause) => countConcurrentFields(clause));
    return countConcurrentFields(node.getExpression()) + Math.max(0, ...arms);
  }
  if (node.isKind(SyntaxKind.IfStatement)) {
    const elseStatement = node.getElseStatement();
    const otherwise = elseStatement === undefined ? 0 : countConcurrentFields(elseStatement);
    return countConcurrentFields(node.getExpression()) + Math.max(countConcurrentFields(node.getThenStatement()), otherwise);
  }
  if (node.isKind(SyntaxKind.ConditionalExpression)) {
    return countConcurrentFields(node.getCondition()) + Math.max(countConcurrentFields(node.getWhenTrue()), countConcurrentFields(node.getWhenFalse()));
  }
  let total = isControlledFormInput(node) ? 1 : 0;
  for (const child of node.getChildren()) {
    if (!isFunctionLike(child)) {
      total += countConcurrentFields(child);
    }
  }
  return total;
}

/** The concurrently-rendered field count for one component — its body, with nested components excluded. */
function componentFieldCount(fn: Node): number {
  const body =
    fn.isKind(SyntaxKind.FunctionDeclaration) || fn.isKind(SyntaxKind.FunctionExpression) || fn.isKind(SyntaxKind.ArrowFunction) ? fn.getBody() : undefined;
  return body === undefined ? 0 : countConcurrentFields(body);
}

/** A readable name for the component a controlled input lives in (declaration name, assigned var, else <anon>). */
function componentName(fn: Node): string {
  if (fn.isKind(SyntaxKind.FunctionDeclaration)) {
    return fn.getName() ?? "<anonymous>";
  }
  const varDecl = fn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return varDecl?.getName() ?? "<anonymous>";
}

/** Reports directly (node overload) at the FIRST offending element of each component past THRESHOLD — the
 *  component name + count travel in `token`, since the node overload carries no per-finding message
 *  (GATE-AUTHORING.md §1). */
function reportFileViolations(sf: SourceFile, ctx: GateRunCtx): void {
  const perComponent = new Map<number, { name: string; fn: Node; firstEl: Node }>();
  // Sorted into document order: the two descendant sweeps concatenate opening-then-self-closing, so the
  // report would otherwise anchor on whichever KIND came first rather than the first field on the page.
  const elements = [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)].sort(
    (a, b) => a.getStart() - b.getStart(),
  );
  for (const el of elements) {
    if (!isControlledFormInput(el)) {
      continue;
    }
    const comp = enclosingComponent(el);
    if (comp === undefined || perComponent.has(comp.key)) {
      continue;
    }
    perComponent.set(comp.key, { name: comp.name, fn: comp.fn, firstEl: el });
  }
  for (const { name, fn, firstEl } of perComponent.values()) {
    // The count is CONCURRENT fields (#620), not written ones — exclusive branches collapse to their max.
    const count = componentFieldCount(fn);
    if (count >= THRESHOLD) {
      ctx.report(firstEl, { token: `${name} (${count} fields)`, offset: 0 });
    }
  }
}

// A feature .tsx whose enclosing component hand-rolls ≥3 controlled form inputs while importing neither
// editor factory. The token names the component + count.
export const gate: GateDescriptor = {
  name: "form-factory-for-multifield",
  docRow: "D54 §13.4 (UI-Primitives-and-Reuse.md §13.4)",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a feature component hand-rolls ≥3 controlled form inputs but imports no editor factory — a ≥3-field form belongs in createSavedEntityForm / createAutosaveEntityForm (they bake seed / key-remount / post-submit reset / reseed-guard / draft-mirror / dontUpdateMeta). D54 §13.4; UI-Primitives-and-Reuse.md §13.4.",
  fix: "route the multi-field form through createSavedEntityForm / createAutosaveEntityForm (packages/client/src/forms/) — never hand-roll ≥3 controlled inputs.",
  scanRoot: (p) => p.includes("packages/client/src/features/") && p.endsWith(".tsx"),
  visitFile: (sf, ctx: GateRunCtx) => {
    const rel = featureRel(sf.getFilePath());
    if (rel === undefined || importsFactory(sf)) {
      return;
    }
    reportFileViolations(sf, ctx);
  },
  mustFlag: [
    {
      files:
        "export const F = () => (\n  <div>\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n    <input value={c} onChange={z} />\n  </div>\n);\n",
      at: "packages/client/src/features/x/hand-rolled.tsx",
      expect: { messageIncludes: "hand-rolls" },
      why: "a feature component with 3 controlled inputs + no factory import — a hand-rolled form (§13.4)",
    },
    {
      // raw controlled input/textarea/select tags count too (not just the @orb/ui field controls).
      files:
        "export function ThingForm() {\n  return (\n    <form>\n      <input value={a} onChange={set} />\n      <textarea value={b} onChange={set} />\n      <select value={c} onChange={set} />\n    </form>\n  );\n}\n",
      at: "packages/client/src/features/x/raw.tsx",
      expect: { messageIncludes: "hand-rolls" },
      why: "raw controlled input/textarea/select tags count too — three hand-rolled fields, no factory",
    },
    {
      // #620 TRUE-POSITIVE GUARD: `&&` guards are NOT exclusive — all three render when all three hold,
      // so they must still SUM. This is the arm a naive "collapse every conditional" fix would have gutted.
      files:
        "export function Guarded() {\n  return (\n    <div>\n      {a && <Input value={x} onValueChange={set} />}\n      {b && <Input value={y} onValueChange={set} />}\n      {c && <Input value={z} onValueChange={set} />}\n    </div>\n  );\n}\n",
      at: "packages/client/src/features/x/guarded.tsx",
      expect: { messageIncludes: "hand-rolls" },
      why: "#620: three `&&`-guarded fields all render together — SIBLING conditionals sum, they are not switch arms",
    },
    {
      // #620: exclusivity collapses each arm, it does not exempt the component. One arm carrying a whole
      // 3-field form is still a hand-rolled form.
      files:
        'export function OneFatArm({ kind }) {\n  switch (kind) {\n    case "a":\n      return <Input value={x} onValueChange={set} />;\n    default:\n      return (\n        <div>\n          <Input value={x} onValueChange={set} />\n          <Select value={y} onValueChange={set} />\n          <NumberField value={z} onValueChange={set} />\n        </div>\n      );\n  }\n}\n',
      at: "packages/client/src/features/x/fat-arm.tsx",
      expect: { messageIncludes: "hand-rolls" },
      why: "#620: the MAX arm carries 3 concurrent fields — collapsing arms must not exempt a real hand-rolled form",
    },
    {
      // #620: an exclusive branch's MAX ADDS to the fields rendered unconditionally beside it.
      files:
        'export function Mixed({ kind }) {\n  return (\n    <div>\n      {kind === "a" ? <Input value={x} onValueChange={set} /> : <Select value={x} onValueChange={set} />}\n      <Input value={y} onValueChange={set} />\n      <NumberField value={z} onValueChange={set} />\n    </div>\n  );\n}\n',
      at: "packages/client/src/features/x/mixed.tsx",
      expect: { messageIncludes: "hand-rolls" },
      why: "#620: ONE ternary's two arms collapse to 1, and that 1 ADDS to the 2 unconditional siblings = 3 concurrent fields — still a form",
    },
  ],
  mustPass: [
    {
      files: "export const F = () => (\n  <div>\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n  </div>\n);\n",
      at: "packages/client/src/features/x/two-field.tsx",
      why: "only 2 controlled inputs — under the ≥3 threshold (a lone search / login 2-field), passes",
    },
    {
      // importing createSavedEntityForm exempts the file — the form is routed through the factory.
      files:
        'import { createSavedEntityForm } from "#forms/editor";\nconst use = createSavedEntityForm({});\nexport function ThingForm() {\n  return (\n    <div>\n      <Input value={a} onValueChange={set} />\n      <Select value={b} onValueChange={set} />\n      <NumberField value={c} onValueChange={set} />\n    </div>\n  );\n}\n',
      at: "packages/client/src/features/x/saved.tsx",
      why: "the file imports createSavedEntityForm — the ≥3-field form is routed through the factory, passes",
    },
    {
      // importing createAutosaveEntityForm likewise exempts the file.
      files:
        'import { createAutosaveEntityForm } from "#forms/editor";\nconst use = createAutosaveEntityForm({});\nexport function ThingForm() {\n  return (\n    <div>\n      <Input value={a} onValueChange={set} />\n      <Select value={b} onValueChange={set} />\n      <NumberField value={c} onValueChange={set} />\n    </div>\n  );\n}\n',
      at: "packages/client/src/features/x/autosave.tsx",
      why: "the file imports createAutosaveEntityForm — routed through the factory, passes",
    },
    {
      // Tabs value/onValueChange is active-tab state, not a form field — excluded from FORM_CONTROLS.
      files:
        "export function Panel() {\n  return (\n    <Tabs value={t} onValueChange={set}>\n      <Tabs value={t} onValueChange={set} />\n      <Tabs value={t} onValueChange={set} />\n      <Tabs value={t} onValueChange={set} />\n    </Tabs>\n  );\n}\n",
      at: "packages/client/src/features/x/tabs.tsx",
      why: "Tabs value/onValueChange is active-tab state, not a field — not counted, passes",
    },
    {
      // uncontrolled inputs (value present, no onChange handler) are not controlled fields.
      files:
        "export function ReadOnly() {\n  return (\n    <div>\n      <Input value={a} />\n      <Input value={b} />\n      <Input value={c} />\n    </div>\n  );\n}\n",
      at: "packages/client/src/features/x/readonly.tsx",
      why: "uncontrolled inputs (value, no onChange) are not two-way bound fields — not counted, passes",
    },
    {
      // the count is per-component — two separate 2-field components do not aggregate.
      files:
        "export function A() {\n  return (<div><Input value={v} onValueChange={set} /><Select value={v} onValueChange={set} /></div>);\n}\nexport function B() {\n  return (<div><Input value={v} onValueChange={set} /><Select value={v} onValueChange={set} /></div>);\n}\n",
      at: "packages/client/src/features/x/per-component.tsx",
      why: "the count is per enclosing component — two separate 2-field components do not aggregate, passes",
    },
    {
      // scope: a non-.tsx feature file is not scanned.
      files: "export const x = 1;\n",
      at: "packages/client/src/features/demo/hooks/use-thing.ts",
      why: "scope: a non-.tsx feature file is out of scope — not scanned, passes",
    },
    {
      // #620 THE FOUNDING FALSE POSITIVE: B2's `KnobField` shape — ONE control dispatched from an
      // exhaustive switch over the knob's kind. Four controls are WRITTEN; exactly one ever renders.
      files:
        'export function KnobField({ knob }) {\n  switch (knob.kind) {\n    case "number":\n      return <NumberField value={v} onValueChange={set} />;\n    case "toggle":\n      return <Switch checked={v} onCheckedChange={set} />;\n    case "choice":\n      return <Select value={v} onValueChange={set} />;\n    default:\n      return <Input value={v} onChange={set} />;\n  }\n}\n',
      at: "packages/client/src/features/x/knob-field.tsx",
      why: "#620 the founding false positive: a 4-arm exhaustive switch renders ONE control — 4 written, 1 concurrent. It reported 'KnobField (4 fields)' and pressured a dynamic server-descriptor knob set toward a fixed-shape entity-form factory",
    },
    {
      // #620: if/else is the same either/or as a switch.
      files:
        "export function Either({ flag }) {\n  if (flag) {\n    return (\n      <div>\n        <Input value={a} onValueChange={set} />\n        <Select value={b} onValueChange={set} />\n      </div>\n    );\n  }\n  return (\n    <div>\n      <NumberField value={c} onValueChange={set} />\n      <Switch checked={d} onCheckedChange={set} />\n    </div>\n  );\n}\n",
      at: "packages/client/src/features/x/either.tsx",
      why: "#620: an if/else pair is exclusive — 4 written, at most 2 concurrent, under the threshold, passes",
    },
    {
      // #620: the GUARD-CLAUSE shape — exclusivity by control flow, with no `else` at all. The dominant
      // React dispatch idiom, and a sum here was the same false positive the switch case makes obvious.
      files:
        "export function Guard({ flag }) {\n  if (flag) {\n    return (\n      <div>\n        <Input value={a} onValueChange={set} />\n        <Select value={b} onValueChange={set} />\n      </div>\n    );\n  }\n  return (\n    <div>\n      <NumberField value={c} onValueChange={set} />\n      <Switch checked={d} onCheckedChange={set} />\n    </div>\n  );\n}\n",
      at: "packages/client/src/features/x/guard.tsx",
      why: "#620: an early-RETURN guard has no `else`, but the trailing return only runs when the guard did not fire — 4 written, at most 2 concurrent, passes",
    },
  ],
};
