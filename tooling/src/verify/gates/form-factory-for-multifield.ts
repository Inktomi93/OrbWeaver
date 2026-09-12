// Policy: form-factory-for-multifield (D54 §13.3/§13.4, UI-Primitives-and-Reuse.md §13.4). The live
// `no-direct-useform` grit already forces the factories the moment TanStack Form is touched; the hole
// this policy closes is the form that dodges Form ENTIRELY — a `features/**` component hand-rolling ≥3
// CONCURRENT CONTROLLED inputs (a form-control tag carrying both a value binding and an onChange-family
// handler) while importing neither editor factory, which bake seed / key-remount / post-submit reset /
// reseed-guard / draft-mirror / dontUpdateMeta semantics a hand-roll re-invents subtly wrong.
//
// THE COUNT IS WHAT RENDERS AT ONCE, NOT WHAT IS WRITTEN (#620). A component that dispatches ONE control
// out of an exhaustive `switch` is a one-field component: only one arm ever renders. Counting the SUM made
// B2's `KnobField` — one control from a 4-arm switch — report "KnobField (4 fields)", and since this
// policy has no allowlist its only exits were "import a form factory" or "drop below 3 controls",
// pressuring a dynamic server-descriptor-driven knob set toward an entity-form factory that wants a FIXED
// `defaultValues` shape. So: MAX over mutually-exclusive branches, SUM over everything else.
//   Exclusive (max): `switch` arms of one switch · an `if`/`else` pair · an early-RETURN guard clause and
//     the statements after it · the two arms of ONE conditional expression.
//   NOT exclusive (sum): `&&` guards, and SIBLING conditionals — `{a && <Input/>}{b && <Input/>}` renders
//     BOTH when both hold, so collapsing those would gut the true-positive arm this policy exists for.
//   Recursion stops at a nested function-like node: that is its own component, attributed separately.
//
// FAMILY `editor-form-factory` — THREE members (this policy, `no-form-reset-in-autosave` and its hard
// `-health` half). The family IS its shared reader, `lib/editor-form-factory.ts`
// (`importsEditorFormFactory` + the factory-name vocabulary + the two exact file identities), consumed
// from opposite directions: this policy EXEMPTS a file that imports either
// factory, and that one ARMS on a file importing the autosave factory. One predicate, one home, so the two
// can never disagree about what counts as routing a form through Form. The census proposed a "shared JSX
// control fact" as well; the control vocabulary (`FORM_CONTROLS`) has exactly ONE consumer today and is
// deliberately NOT promoted — a kind minted for a single consumer is a private reader wearing a shared
// reader's clothes (§11.5).
//
// POPULATION PORT: byte-identical. The legacy `scanRoot` was
// `p.includes("packages/client/src/features/") && p.endsWith(".tsx")`; the resolved set is the same under
// `{ in: ["@client"], under: ["packages/client/src/features/**"], ext: ["tsx"] }`. Both halves are pinned
// — `mustPass[7]` dies without `under`, `mustPass[8]` dies without `ext`.
//
// ONE INTENTIONAL CORRECTION, forced by the ordinary-waiver contract. The legacy report's token was
// `` `${name} (${count} fields)` `` — e.g. `KnobField (4 fields)`. The central marker grammar's position
// group is `[^()\r\n]+` (`lib/ordinary-waiver.ts:19`), so a token containing PARENTHESES makes every
// marker against it parse as MALFORMED: the legacy spelling was structurally unwaivable, and `report.node`
// would additionally have thrown, because the token is not authored text at the reported offset. The
// position is now the offending component's FIRST controlled field's TAG NAME, read off the tag-name node,
// and the component name + concurrent count move into the per-finding MESSAGE where prose belongs. The
// permanent #620 pin (`tests/tooling/verify/gates/form-factory-for-multifield.int.test.ts`) asserted the
// old token and is re-pointed in the same commit. Marker receipt: ZERO live `@orb-gate-ignore
// form-factory-for-multifield` markers on the tree (measured 2026-09-12), so nothing re-binds or orphans.
//
// §12.7 CARRY-FORWARD (`b849e7add`, the "current source ownership and exact grant identities" row).
// `forms/` was split into `forms/editor/` by #1861; the CURRENT homes were re-read on `main` and the delta
// re-derived with `git diff 6c8424806 HEAD -- <this policy and packages/client/src/forms/>`. The factory
// subjects are named by `lib/editor-form-factory.ts`, and every fixture specifier is the post-split
// `#forms/editor`. The bare `#forms` spelling is a stale old-path permission and MUST NOT be restored.
//
// LEGACY SHA: b849e7add (`git show b849e7add:tooling/src/verify/gates/form-factory-for-multifield.ts`).
import type { JsxAttribute, Node as MorphNode, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GatePolicyReportSink } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { EDITOR_FORM_FACTORIES, importsEditorFormFactory } from "../lib/editor-form-factory.ts";

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

const MESSAGE =
  "a feature component hand-rolls ≥3 controlled form inputs but imports no editor factory — a ≥3-field form belongs in createSavedEntityForm / createAutosaveEntityForm (they bake seed / key-remount / post-submit reset / reseed-guard / draft-mirror / dontUpdateMeta). D54 §13.4; UI-Primitives-and-Reuse.md §13.4.";
const FIX =
  "route the multi-field form through createSavedEntityForm / createAutosaveEntityForm (packages/client/src/forms/editor/) — never hand-roll ≥3 controlled inputs. A deliberate hand-roll waives with `@orb-waive form-factory-for-multifield(<position>): <reason + end condition>`, and the position is the TAG NAME of the component's FIRST controlled field (`Input`, `input`, `Select`, …), because the report anchors on that element's tag-name node. The component name and the concurrent count are in the message, never in the position — a token containing parentheses is unwaivable by construction.";

interface Component {
  readonly key: number;
  readonly name: string;
  readonly fn: MorphNode;
  readonly firstEl: MorphNode;
}

/** The tag name of a JSX opening/self-closing element ('Input', 'input', 'select', …). */
function tagNameNode(el: MorphNode): MorphNode | undefined {
  let name: MorphNode | undefined;
  if (el.isKind(SyntaxKind.JsxOpeningElement) || el.isKind(SyntaxKind.JsxSelfClosingElement)) {
    name = el.getTagNameNode();
  }
  return name;
}

function attrNames(el: MorphNode): Set<string> {
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
function isControlledFormInput(el: MorphNode): boolean {
  const tag = tagNameNode(el)?.getText();
  if (tag === undefined || !FORM_CONTROLS.has(tag)) {
    return false;
  }
  const names = attrNames(el);
  const hasValue = [...VALUE_PROPS].some((p) => names.has(p));
  const hasChange = [...CHANGE_PROPS].some((p) => names.has(p));
  return hasValue && hasChange;
}

function isFunctionLike(node: MorphNode): boolean {
  return node.isKind(SyntaxKind.FunctionDeclaration) || node.isKind(SyntaxKind.FunctionExpression) || node.isKind(SyntaxKind.ArrowFunction);
}

/** A readable name for the component a controlled input lives in (declaration name, assigned var, else <anon>). */
function componentName(fn: MorphNode): string {
  if (fn.isKind(SyntaxKind.FunctionDeclaration)) {
    return fn.getName() ?? "<anonymous>";
  }
  const varDecl = fn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return varDecl?.getName() ?? "<anonymous>";
}

/** The nearest enclosing function-like node (a component), keyed by its start position + a display name. */
function enclosingComponent(el: MorphNode): { key: number; name: string; fn: MorphNode } | undefined {
  let found: { key: number; name: string; fn: MorphNode } | undefined;
  let node: MorphNode | undefined = el.getParent();
  while (node !== undefined && found === undefined) {
    if (isFunctionLike(node)) {
      found = { key: node.getStart(), name: componentName(node), fn: node };
    } else {
      node = node.getParent();
    }
  }
  return found;
}

/** Does this statement definitely leave the enclosing function? (a `return`/`throw`, or a block ending in
 *  one). Used to recognise the GUARD-CLAUSE shape, where exclusivity is expressed by control flow rather
 *  than by an `else`. */
function alwaysExits(stmt: MorphNode): boolean {
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
function countStatementList(statements: readonly MorphNode[]): number {
  let total = 0;
  for (let index = 0; index < statements.length; index += 1) {
    const stmt = statements[index];
    if (stmt === undefined) {
      continue;
    }
    if (stmt.isKind(SyntaxKind.IfStatement) && stmt.getElseStatement() === undefined && alwaysExits(stmt.getThenStatement())) {
      const guard = countConcurrentFields(stmt.getThenStatement());
      const rest = countStatementList(statements.slice(index + 1));
      return total + countConcurrentFields(stmt.getExpression()) + Math.max(guard, rest);
    }
    total += countConcurrentFields(stmt);
  }
  return total;
}

function countExclusiveStatement(node: MorphNode): number | undefined {
  let counted: number | undefined;
  if (node.isKind(SyntaxKind.SwitchStatement)) {
    const arms = node.getClauses().map((clause) => countConcurrentFields(clause));
    counted = countConcurrentFields(node.getExpression()) + Math.max(0, ...arms);
  } else if (node.isKind(SyntaxKind.IfStatement)) {
    const elseStatement = node.getElseStatement();
    const otherwise = elseStatement === undefined ? 0 : countConcurrentFields(elseStatement);
    counted = countConcurrentFields(node.getExpression()) + Math.max(countConcurrentFields(node.getThenStatement()), otherwise);
  } else if (node.isKind(SyntaxKind.ConditionalExpression)) {
    counted = countConcurrentFields(node.getCondition()) + Math.max(countConcurrentFields(node.getWhenTrue()), countConcurrentFields(node.getWhenFalse()));
  }
  return counted;
}

function countBranchedFields(node: MorphNode): number | undefined {
  let counted: number | undefined;
  if (node.isKind(SyntaxKind.Block)) {
    counted = countStatementList(node.getStatements());
  } else if (node.isKind(SyntaxKind.CaseClause)) {
    counted = countConcurrentFields(node.getExpression()) + countStatementList(node.getStatements());
  } else if (node.isKind(SyntaxKind.DefaultClause)) {
    counted = countStatementList(node.getStatements());
  } else {
    counted = countExclusiveStatement(node);
  }
  return counted;
}

function countConcurrentFields(node: MorphNode): number {
  const branched = countBranchedFields(node);
  if (branched !== undefined) {
    return branched;
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
function componentFieldCount(fn: MorphNode): number {
  const body =
    fn.isKind(SyntaxKind.FunctionDeclaration) || fn.isKind(SyntaxKind.FunctionExpression) || fn.isKind(SyntaxKind.ArrowFunction) ? fn.getBody() : undefined;
  return body === undefined ? 0 : countConcurrentFields(body);
}

/** One file's components, judged: each component past the threshold reports ONCE, anchored on its FIRST
 *  controlled field's TAG NAME — the only paren-free authored token at that coordinate, and therefore the
 *  only spelling a `@orb-waive` position can carry. */
function reportHandRolledForms(components: ReadonlyMap<number, Component>, report: GatePolicyReportSink["node"]): void {
  for (const { name, fn, firstEl } of components.values()) {
    const count = componentFieldCount(fn);
    const tag = tagNameNode(firstEl);
    if (count < THRESHOLD || tag === undefined) {
      continue;
    }
    report(firstEl, {
      token: tag.getText(),
      offset: tag.getStart() - firstEl.getStart(),
      message: `${MESSAGE} Component \`${name}\` renders ${count} concurrent controlled fields.`,
      fix: FIX,
    });
  }
}

export const gate = defineGate({
  id: "form-factory-for-multifield",
  family: "editor-form-factory",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/features/**"], ext: ["tsx"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // Per-file, first-in-document-order controlled field per enclosing component. Allocated inside
    // `create`; the visitors deliver opening and self-closing elements in two kind streams, so the
    // FIRST-element decision is made here rather than by whichever kind the walk happened to emit first.
    const perFile = new Map<SourceFile, Map<number, Component>>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
          visit: (node, sourceFile): void => {
            if (!isControlledFormInput(node)) {
              return;
            }
            const comp = enclosingComponent(node);
            if (comp === undefined) {
              return;
            }
            const components = perFile.get(sourceFile) ?? new Map<number, Component>();
            perFile.set(sourceFile, components);
            const seen = components.get(comp.key);
            if (seen === undefined || node.getStart() < seen.firstEl.getStart()) {
              components.set(comp.key, { ...comp, firstEl: node });
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const [sourceFile, components] of perFile) {
          if (!importsEditorFormFactory(sourceFile, EDITOR_FORM_FACTORIES)) {
            reportHandRolledForms(components, ctx.report.node);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/hand-rolled.tsx":
          "export const F = () => (\n  <div>\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n    <input value={c} onChange={z} />\n  </div>\n);\n",
      },
      expect: { count: 1, token: "input", line: 3 },
      why: "THE FOUNDING ROW — a feature component with 3 controlled inputs and no factory import: a hand-rolled form (§13.4). ONE finding per component, anchored on the FIRST controlled field (line 3), and the position is that element's TAG NAME",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/raw.tsx":
          "export function ThingForm() {\n  return (\n    <form>\n      <input value={a} onChange={set} />\n      <textarea value={b} onChange={set} />\n      <select value={c} onChange={set} />\n    </form>\n  );\n}\n",
      },
      expect: { count: 1, token: "input", messageIncludes: "`ThingForm` renders 3 concurrent" },
      why: "raw controlled input/textarea/select tags count too, not just the @orb/ui field controls — three hand-rolled fields, no factory. The message carries the component name and the count that used to live (unwaivably) in the position token",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/guarded.tsx":
          "export function Guarded() {\n  return (\n    <div>\n      {a && <Input value={x} onValueChange={set} />}\n      {b && <Input value={y} onValueChange={set} />}\n      {c && <Input value={z} onValueChange={set} />}\n    </div>\n  );\n}\n",
      },
      expect: { count: 1, token: "Input", messageIncludes: "renders 3 concurrent" },
      why: "#620 TRUE-POSITIVE GUARD: three `&&`-guarded fields all render together — SIBLING conditionals SUM, they are not switch arms. This is the arm a naive collapse-every-conditional fix would have gutted",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/fat-arm.tsx":
          'export function OneFatArm({ kind }) {\n  switch (kind) {\n    case "a":\n      return <Input value={x} onValueChange={set} />;\n    default:\n      return (\n        <div>\n          <Input value={x} onValueChange={set} />\n          <Select value={y} onValueChange={set} />\n          <NumberField value={z} onValueChange={set} />\n        </div>\n      );\n  }\n}\n',
      },
      expect: { count: 1, token: "Input", messageIncludes: "renders 3 concurrent" },
      why: "#620: exclusivity COLLAPSES each arm, it does not EXEMPT the component — the MAX arm carries 3 concurrent fields, so it is still a hand-rolled form",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/mixed.tsx":
          'export function Mixed({ kind }) {\n  return (\n    <div>\n      {kind === "a" ? <Input value={x} onValueChange={set} /> : <Select value={x} onValueChange={set} />}\n      <Input value={y} onValueChange={set} />\n      <NumberField value={z} onValueChange={set} />\n    </div>\n  );\n}\n',
      },
      expect: { count: 1, token: "Input", messageIncludes: "renders 3 concurrent" },
      why: "#620: ONE ternary's two arms collapse to 1, and that 1 ADDS to the 2 unconditional siblings = 3 concurrent fields — still a form",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/nested.tsx":
          "export function Outer() {\n  return (\n    <div>\n      {items.map((item) => (\n        <div key={item}>\n          <Input value={v} onValueChange={set} />\n          <Select value={v} onValueChange={set} />\n          <NumberField value={v} onValueChange={set} />\n        </div>\n      ))}\n      <Input value={w} onChange={set} />\n    </div>\n  );\n}\n",
      },
      expect: { count: 1, token: "Input", messageIncludes: "`<anonymous>` renders 3 concurrent" },
      why: "SCOPE: a nested render callback is its OWN component — the `.map` callback carries 3 concurrent fields and fires under the `<anonymous>` name, while the outer `Outer` carries 1 and does not. Exactly one finding, and its message names which scope it belongs to",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/two-field.tsx":
          "export const F = () => (\n  <div>\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n  </div>\n);\n",
      },
      why: "THE THRESHOLD, pinned: only 2 controlled inputs (a search box plus a toggle, a 2-field login). Lower `THRESHOLD` below 3 and this is the row that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/saved.tsx":
          'import { createSavedEntityForm } from "#forms/editor";\nconst use = createSavedEntityForm({});\nexport function ThingForm() {\n  return (\n    <div>\n      <Input value={a} onValueChange={set} />\n      <Select value={b} onValueChange={set} />\n      <NumberField value={c} onValueChange={set} />\n    </div>\n  );\n}\n',
      },
      why: "THE FACTORY FENCE (saved half), pinned: the file imports createSavedEntityForm, so the ≥3-field form IS routed through Form. Drop `importsEditorFormFactory` and this row dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/autosave.tsx":
          'import { createAutosaveEntityForm } from "#forms/editor";\nconst use = createAutosaveEntityForm({});\nexport function ThingForm() {\n  return (\n    <div>\n      <Input value={a} onValueChange={set} />\n      <Select value={b} onValueChange={set} />\n      <NumberField value={c} onValueChange={set} />\n    </div>\n  );\n}\n',
      },
      why: "THE FACTORY FENCE (autosave half), pinned separately: both names in the shared `EDITOR_FORM_FACTORIES` vocabulary exempt, so dropping either member from `lib/editor-form-factory.ts` reds exactly one of these two rows",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/tabs.tsx":
          "export function Panel() {\n  return (\n    <Tabs value={t} onValueChange={set}>\n      <Tabs value={t} onValueChange={set} />\n      <Tabs value={t} onValueChange={set} />\n      <Tabs value={t} onValueChange={set} />\n    </Tabs>\n  );\n}\n",
      },
      why: "THE CONTROL VOCABULARY, pinned: `Tabs` value/onValueChange is ACTIVE-TAB state, not a field value. Add `Tabs` to `FORM_CONTROLS` — or drop the allowlist and count every controlled tag — and this row dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/readonly.tsx":
          "export function ReadOnly() {\n  return (\n    <div>\n      <Input value={a} />\n      <Input value={b} />\n      <Input value={c} />\n    </div>\n  );\n}\n",
      },
      why: "THE TWO-WAY-BINDING test, pinned: uncontrolled inputs (a value, no onChange-family handler) are display, not fields. Drop the `hasChange` half and this row dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/per-component.tsx":
          "export function A() {\n  return (<div><Input value={v} onValueChange={set} /><Select value={v} onValueChange={set} /></div>);\n}\nexport function B() {\n  return (<div><Input value={v} onValueChange={set} /><Select value={v} onValueChange={set} /></div>);\n}\n",
      },
      why: "THE PER-COMPONENT attribution, pinned: two separate 2-field components do not aggregate into one 4-field form. Count per FILE instead of per enclosing component and this row dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/anchor.tsx": "export const anchor = () => null;\n",
        "packages/client/src/features/demo/hooks/use-thing.ts": "export const x = 1;\n",
      },
      why: 'THE EXTENSION FENCE, and it is UNFALSIFIABLE rather than pinned — recorded honestly instead of faked (§4.1, fourth outcome). `ext: ["tsx"]` is a declared PERFORMANCE PREFILTER: a `.ts` file cannot contain a JSX element at all (`<Input />` there parses as a type assertion, not an element), so admitting one can never ADD a finding and NO fixture discriminates. Measured 2026-09-12: dropping `ext` leaves every row in this module green. The fence stays because it is the lossless port of the legacy `p.endsWith(".tsx")` and it keeps the walk off every `.ts` file in `features/**`. The clean `anchor.tsx` beside the `.ts` file is still mandatory: a row whose only file sits outside the population admits zero paths and tool-errors instead of reporting',
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/anchor.tsx": "export const anchor = () => null;\n",
        "packages/client/src/lib/hand-rolled.tsx":
          "export const F = () => (\n  <div>\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n    <input value={c} onChange={z} />\n  </div>\n);\n",
      },
      why: 'THE DIRECTORY FENCE, pinned: the identical hand-roll in `client/src/lib/**` is not a FEATURE surface — §13.4 is a rule about feature components, and the shared tier has its own primitives law. Drop `under: ["packages/client/src/features/**"]` and this row is the one that dies',
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/knob-field.tsx":
          'export function KnobField({ knob }) {\n  switch (knob.kind) {\n    case "number":\n      return <NumberField value={v} onValueChange={set} />;\n    case "toggle":\n      return <Switch checked={v} onCheckedChange={set} />;\n    case "choice":\n      return <Select value={v} onValueChange={set} />;\n    default:\n      return <Input value={v} onChange={set} />;\n  }\n}\n',
      },
      why: "#620 THE FOUNDING FALSE POSITIVE: B2's `KnobField` — ONE control dispatched from an exhaustive switch over the knob's kind. Four controls are WRITTEN; exactly one ever renders. It reported 'KnobField (4 fields)' and pressured a dynamic server-descriptor knob set toward a fixed-shape entity-form factory",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/either.tsx":
          "export function Either({ flag }) {\n  if (flag) {\n    return (\n      <div>\n        <Input value={a} onValueChange={set} />\n        <Select value={b} onValueChange={set} />\n      </div>\n    );\n  } else {\n    return (\n      <div>\n        <NumberField value={c} onValueChange={set} />\n        <Switch checked={d} onCheckedChange={set} />\n      </div>\n    );\n  }\n}\n",
      },
      why: "#620: an explicit if/ELSE pair is exclusive — 4 written, at most 2 concurrent, under the threshold",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/guard.tsx":
          "export function Guard({ flag }) {\n  if (flag) {\n    return (\n      <div>\n        <Input value={a} onValueChange={set} />\n        <Select value={b} onValueChange={set} />\n      </div>\n    );\n  }\n  return (\n    <div>\n      <NumberField value={c} onValueChange={set} />\n      <Switch checked={d} onCheckedChange={set} />\n    </div>\n  );\n}\n",
      },
      why: "#620 THE GUARD CLAUSE, kept distinct from the `else` row above: an early-RETURN guard has no `else` at all, and the trailing return only runs when the guard did not fire. This is the dominant React dispatch idiom, and a sum here was the same false positive the `switch` case makes obvious — drop `alwaysExits`/`countStatementList`'s early-return branch and this row is the one that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/waived.tsx":
          "export const F = () => (\n  <div>\n    {/* @orb-waive form-factory-for-multifield(input): the proof's stand-in reason; ends when this fixture stops flagging. */}\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n    <input value={c} onChange={z} />\n  </div>\n);\n",
      },
      why: "POSITIONAL IDENTITY (§4.2): the report anchors on the FIRST controlled field's TAG NAME, so an author waives the field the finding points at — and the `{/* … */}` JSX carrier is the only comment form that survives inside JSX children. The fixture is mustFlag[0] (count 1) plus the marker, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
