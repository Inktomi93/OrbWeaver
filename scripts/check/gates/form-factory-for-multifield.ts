// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are JSX/form fixture
// snippets (factory imports + controlled-input markup), not secrets.
// Gate: form-factory-for-multifield (D54 §13.3/§13.4, UI-Primitives-and-Reuse.md §13.4). The live
// `no-direct-useform` grit already forces the factories the moment TanStack Form is touched; the hole
// this gate closes is the form that dodges Form ENTIRELY — a features/** component hand-rolling ≥3
// CONTROLLED inputs (a form-control tag with both a value binding and an onChange-family handler) while
// importing neither editor factory (which bake seed/key-remount/reset/reseed-guard/draft-mirror
// semantics a hand-roll re-invents, subtly wrong). Scope: packages/client/src/features/**/*.tsx; counted per enclosing component.
import type { JsxAttribute, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Violation } from "../harness.ts";

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
    if (node.isKind(SyntaxKind.FunctionDeclaration) || node.isKind(SyntaxKind.FunctionExpression) || node.isKind(SyntaxKind.ArrowFunction)) {
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
  const elements = [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)];
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

// A feature .tsx whose enclosing component hand-rolls ≥3 controlled form inputs while importing neither
// editor factory. The finding names the component + count.
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
    for (const v of fileViolations(sf, rel)) {
      ctx.report({
        file: v.file,
        line: v.line,
        column: 0,
        message: v.message,
        token: "multi-field form",
      });
    }
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
        'import { createSavedEntityForm } from "#forms";\nconst use = createSavedEntityForm({});\nexport function ThingForm() {\n  return (\n    <div>\n      <Input value={a} onValueChange={set} />\n      <Select value={b} onValueChange={set} />\n      <NumberField value={c} onValueChange={set} />\n    </div>\n  );\n}\n',
      at: "packages/client/src/features/x/saved.tsx",
      why: "the file imports createSavedEntityForm — the ≥3-field form is routed through the factory, passes",
    },
    {
      // importing createAutosaveEntityForm likewise exempts the file.
      files:
        'import { createAutosaveEntityForm } from "#forms";\nconst use = createAutosaveEntityForm({});\nexport function ThingForm() {\n  return (\n    <div>\n      <Input value={a} onValueChange={set} />\n      <Select value={b} onValueChange={set} />\n      <NumberField value={c} onValueChange={set} />\n    </div>\n  );\n}\n',
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
  ],
};
