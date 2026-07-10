// Gate: form-factory-for-multifield (D54 §13.3/§13.4 + UI-Primitives-and-Reuse.md §13.4's threshold
// rule). The live `no-direct-useform` grit already forces `useAppForm`/the factories the moment TanStack
// Form is TOUCHED. The HOLE this gate closes is the form that dodges Form ENTIRELY: a features/**
// component that hand-rolls ≥3 CONTROLLED inputs (value/checked + an onChange-family handler on the same
// element) yet imports neither editor factory. Per §13.4 the trigger for a factory is "≥3 fields OR
// validation OR save/draft semantics" — a hand-rolled multi-field form is exactly the drift the factories
// exist to prevent (seed / key-remount / post-submit reset / reseed-guard / draft-mirror / dontUpdateMeta
// all re-invented, subtly wrong).
//
// DETECTION (honest, low-FP — a POSITIVE control allowlist, never a `value=`-anywhere sweep):
//   • Scope: packages/client/src/features/**/*.tsx (feature components only).
//   • A CONTROLLED input = a JSX element whose tag is in FORM_CONTROLS (raw input/textarea/select + the
//     @orb/ui field controls) AND that carries BOTH a value binding (`value`/`checked`) AND an
//     onChange-family handler (`onChange`/`onValueChange`/`onCheckedChange`). Tabs/Slider-as-weight/
//     filter-Select `value=` do NOT count unless the tag is a form control AND it's two-way bound.
//   • Count per enclosing component (nearest function-like ancestor). ≥3 in one component, in a file that
//     imports NEITHER `createSavedEntityForm` NOR `createAutosaveEntityForm` = RED.
//
// The doc's exemption list (search box · lone toggle · single rename · login 2-field) is respected for
// FREE — all four are ≤2 controlled inputs, under the threshold. `Tabs` is deliberately excluded from
// FORM_CONTROLS (its `value`/`onValueChange` is active-tab state, not a field).
//
// DORMANT: not in report.ts's ALL_CHECKS — self-tested by tests/tooling/form-factory-for-multifield.int
// .test.ts, held out pending its Layer-3 ACTIVE row + count bump in the FROZEN
// Core-Enforcement-Active-Gates.md (SYNC WITH the DORMANT_GATES sets in
// enforcement-registry-parity.ts + check-gates.int.test.ts).
import type { JsxAttribute, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

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

const MESSAGE = (component: string, count: number): string =>
  `feature component \`${component}\` hand-rolls ${count} controlled form inputs but imports no editor ` +
  "factory — a ≥3-field form belongs in createSavedEntityForm / createAutosaveEntityForm (they bake " +
  "seed / key-remount / post-submit reset / reseed-guard / draft-mirror / dontUpdateMeta). " +
  "(D54 §13.4; packages/client/src/forms/, UI-Primitives-and-Reuse.md §13.4)";

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

/** The nearest enclosing function-like node (a component), keyed by its start position + a display name. */
function enclosingComponent(el: Node): { key: number; name: string } | undefined {
  let found: { key: number; name: string } | undefined;
  let node: Node | undefined = el.getParent();
  while (node !== undefined && found === undefined) {
    if (
      node.isKind(SyntaxKind.FunctionDeclaration) ||
      node.isKind(SyntaxKind.FunctionExpression) ||
      node.isKind(SyntaxKind.ArrowFunction)
    ) {
      found = { key: node.getStart(), name: componentName(node) };
    } else {
      node = node.getParent();
    }
  }
  return found;
}

/** A readable name for the component a controlled input lives in (declaration name, assigned var, else <anon>). */
function componentName(fn: Node): string {
  if (fn.isKind(SyntaxKind.FunctionDeclaration)) {
    return fn.getName() ?? "<anonymous>";
  }
  const varDecl = fn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return varDecl?.getName() ?? "<anonymous>";
}

function fileViolations(sf: SourceFile, rel: string): Violation[] {
  const perComponent = new Map<number, { name: string; count: number; line: number }>();
  const elements = [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];
  for (const el of elements) {
    if (!isControlledFormInput(el)) {
      continue;
    }
    const comp = enclosingComponent(el);
    if (comp === undefined) {
      continue;
    }
    const entry = perComponent.get(comp.key);
    if (entry === undefined) {
      perComponent.set(comp.key, { name: comp.name, count: 1, line: el.getStartLineNumber() });
    } else {
      entry.count += 1;
    }
  }
  const violations: Violation[] = [];
  for (const { name, count, line } of perComponent.values()) {
    if (count >= THRESHOLD) {
      violations.push({ file: rel, line, message: MESSAGE(name, count) });
    }
  }
  return violations;
}

export const formFactoryForMultifield: Check = {
  name: "form-factory-for-multifield",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const rel = featureRel(sf.getFilePath());
      if (rel === undefined || importsFactory(sf)) {
        continue;
      }
      violations.push(...fileViolations(sf, rel));
    }
    return violations;
  },
};
