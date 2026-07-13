// Gate: no-form-reset-in-autosave (UI-Gates-and-Lessons.md §7 row 2 + §11.3 / UI-Primitives-and-Reuse.md
// §13.1). TanStack Form's `isDirty` never auto-clears after submit (#1144); on a listener-debounced
// AUTOSAVE form, calling `reset(value)` re-baselines defaults on a LIVE draft mirror → the autosave
// infinite loop (the save bar spins forever). `createAutosaveEntityForm` strips `reset` at the TYPE
// level (`Omit<AppFormInstance, "reset">`), so `form.reset()` is a compile error on the typed surface;
// this belt catches the RUNTIME escape hatches the type can't:
//   • ARM A — a `.reset(` call on a form object in any file that IMPORTS createAutosaveEntityForm (a
//     cast past the Omit re-exposes the method at runtime). Scoped to a receiver whose name reads as a
//     form (`form`, `personaForm`, `props.form`) so an unrelated `.reset(` (a ref, an animation) is
//     left alone.
//   • ARM B — inside forms/create-autosave-entity-form.ts itself: the `Omit<…, "reset">` type strip
//     must remain present, AND no returned object may carry a `reset` property — a refactor that
//     un-strips reset or hands it back through the surface goes RED here.
//
// WHAT IT DELIBERATELY DOES NOT FLAG: `createSavedEntityForm`'s legitimate `form.reset(saved)` (the
// button-gated factory's post-submit rebaseline) — that file does NOT import createAutosaveEntityForm
// (it only references it in prose), so ARM A never scans it.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Violation } from "../harness.ts";

const CLIENT_SRC = "/packages/client/src/";
const FACTORY_NAME = "createAutosaveEntityForm";
const FACTORY_FILE = "packages/client/src/forms/create-autosave-entity-form.ts";

const RESET_MESSAGE =
  "reset() on an autosave form — reset re-baselines a live draft mirror into the TanStack Form " +
  "isDirty-never-clears loop (#1144). createAutosaveEntityForm strips reset by type; do not cast past it " +
  "(UI-Gates-and-Lessons.md §7 row 2; forms/create-autosave-entity-form.ts).";

const OMIT_MISSING_MESSAGE =
  'the reset type-strip (Omit<…, "reset">) is gone from the autosave factory\'s returned surface — ' +
  "reset MUST stay removed (it is the autosave infinite loop, UI-Gates-and-Lessons.md §7 row 2); " +
  "restore the Omit in forms/create-autosave-entity-form.ts.";

const RESET_PROP_MESSAGE =
  "the autosave factory's returned surface re-exposes `reset` — reset stays stripped so the call site " +
  "cannot trigger the isDirty loop (UI-Gates-and-Lessons.md §7 row 2; forms/create-autosave-entity-form.ts).";

function clientRel(path: string): string | undefined {
  const idx = path.indexOf(CLIENT_SRC);
  if (idx === -1) {
    return;
  }
  return `packages/client/src/${path.slice(idx + CLIENT_SRC.length)}`;
}

/** Does this file have an `import { … createAutosaveEntityForm … }` declaration? (An `export … from`
 *  re-export — forms/index.ts — is NOT an import, so the barrel is never scanned by ARM A.) */
function importsFactory(sf: SourceFile): boolean {
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getNamedImports().some((n) => n.getName() === FACTORY_NAME)) {
      return true;
    }
  }
  return false;
}

/** The receiver text of a `x.reset(...)` call reads as a form (so an unrelated `.reset(` is ignored). */
function receiverLooksLikeForm(access: Node): boolean {
  if (!Node.isPropertyAccessExpression(access)) {
    return false;
  }
  return access.getExpression().getText().toLowerCase().includes("form");
}

/** ARM A: a `.reset(` call on a form-shaped receiver. */
function resetCallViolations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const access of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (access.getName() !== "reset") {
      continue;
    }
    if (Node.isCallExpression(access.getParent()) && receiverLooksLikeForm(access)) {
      out.push({ file: rel, line: access.getStartLineNumber(), message: RESET_MESSAGE });
    }
  }
  return out;
}

/** ARM B: the factory file must keep the `Omit<…, "reset">` strip and expose no `reset` property. */
function factoryFileViolations(sf: SourceFile): Violation[] {
  const out: Violation[] = [];
  const stripsReset = sf
    .getDescendantsOfKind(SyntaxKind.TypeReference)
    .some((ref) => ref.getTypeName().getText() === "Omit" && ref.getText().includes('"reset"'));
  if (!stripsReset) {
    out.push({ file: FACTORY_FILE, line: 1, message: OMIT_MISSING_MESSAGE });
  }
  const props = [
    ...sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment),
    ...sf.getDescendantsOfKind(SyntaxKind.ShorthandPropertyAssignment),
  ];
  for (const prop of props) {
    if (prop.getName() === "reset") {
      out.push({
        file: FACTORY_FILE,
        line: prop.getStartLineNumber(),
        message: RESET_PROP_MESSAGE,
      });
    }
  }
  return out;
}

// Two arms, per-FILE dispatch: the factory file runs ARM B (the Omit<…, "reset"> strip must be present,
// and no returned `reset` property), every OTHER client file that imports the factory runs ARM A (a
// `.reset(` call on a form-shaped receiver).
function overrideFinding(v: Violation, token: string): Finding {
  return { file: v.file, line: v.line, column: 0, message: v.message, token };
}

export const gate: GateDescriptor = {
  name: "no-form-reset-in-autosave",
  docRow: "UI-Gates-and-Lessons.md §7 row 2 (§11.3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: RESET_MESSAGE,
  fix: "do not cast past the `Omit<…, 'reset'>` strip; reset re-baselines a live draft mirror into the TanStack Form isDirty loop.",
  scanRoot: (p) => p.includes("packages/client/src/"),
  visitFile: (sf, ctx: GateRunCtx) => {
    const rel = clientRel(sf.getFilePath());
    if (rel === undefined) {
      return;
    }
    if (rel === FACTORY_FILE) {
      for (const v of factoryFileViolations(sf)) {
        ctx.report(
          overrideFinding(v, v.message === OMIT_MISSING_MESSAGE ? "omit-strip" : "reset-prop"),
        );
      }
      return;
    }
    if (importsFactory(sf)) {
      for (const v of resetCallViolations(sf, rel)) {
        ctx.report(overrideFinding(v, "reset()"));
      }
    }
  },
  mustFlag: [
    {
      files:
        'import { createAutosaveEntityForm } from "@orb/x";\nexport function f(personaForm: { reset: (v?: unknown) => void }) {\n  personaForm.reset();\n}\n',
      at: "packages/client/src/features/persona/x.ts",
      why: "a .reset( on a form receiver in a file importing the autosave factory — the isDirty-loop escape",
    },
    {
      files: "export function createAutosaveEntityForm() {\n  return { field: 1 };\n}\n",
      at: "packages/client/src/forms/create-autosave-entity-form.ts",
      why: 'ARM B OMIT_MISSING — the factory file with no Omit<…,"reset"> strip on its surface',
      expect: { messageIncludes: "type-strip" },
    },
    {
      files:
        'export function createAutosaveEntityForm(): Omit<{ reset: () => void; x: 1 }, "reset"> {\n  return { reset: () => {}, x: 1 };\n}\n',
      at: "packages/client/src/forms/create-autosave-entity-form.ts",
      why: "ARM B RESET_PROP — the factory file hands a `reset` property back through its returned object",
      expect: { messageIncludes: "re-exposes `reset`" },
    },
  ],
  mustPass: [
    {
      files:
        "export function f(personaForm: { reset: (v?: unknown) => void }) {\n  personaForm.reset();\n}\n",
      at: "packages/client/src/features/persona/y.ts",
      why: "the same .reset( in a file that does NOT import the autosave factory — ARM A never scans it",
    },
  ],
};
