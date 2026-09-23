// Policy: no-form-reset-in-autosave (UI-Gates-and-Lessons.md §7 row 2 / §11.3, UI-Primitives-and-Reuse.md
// §13.1). On a listener-debounced AUTOSAVE form, `reset(value)` re-baselines a LIVE draft mirror → an
// infinite autosave loop (TanStack's `isDirty` never auto-clears after submit, #1144).
// `createAutosaveEntityForm` strips `reset` at the type level; this policy catches the two RUNTIME
// escapes: ARM A — a `.reset(` call on a form-shaped receiver in any client file that imports the
// factory; ARM B — a `reset` property on the object the factory file itself hands back, which would
// re-expose the call through the returned surface whatever the type says.
//
// THE THIRD LEGACY ARM IS NOW A `-health` SIBLING. The legacy descriptor also asserted that the session's
// TYPE home still carries the `Omit<…, "reset">` strip — an ABSENCE verdict about one exact file, with no
// authored node to anchor on and nothing an occurrence waiver could address. It is `authority: "hard"`
// and `execution: "entire-population"` in `no-form-reset-in-autosave-health.ts` under this same `family`,
// which is the ratified split rule (one authority and one execution per policy, §12.1). Splitting it OUT
// is what makes THIS policy anchorable: `lib/ordinary-waiver.ts:394` requires an ordinary finding's token
// to be authored text at its own line/column, and the legacy strip arm reported `{file, line: 1}` with
// the synthetic token `omit-strip`, which would have raised a binding failure and an authority alarm on
// the first real waiver.
//
// FAMILY `editor-form-factory` — THREE members (this policy, its hard `-health` half, and
// `form-factory-for-multifield`), and the family IS its shared `lib/` reader,
// `lib/editor-form-factory.ts`: the factory-name vocabulary, the two exact file identities, and
// `importsEditorFormFactory`, the one reader for "does this module route its form through an editor form
// factory". `form-factory-for-multifield` asks it to EXEMPT and this policy asks it to ARM, which is
// exactly why it may not be two private copies — a disagreement would make a file simultaneously exempt
// from one and invisible to the other.
//
// POPULATION PORT: byte-identical. The legacy `scanRoot` was `p.includes("packages/client/src/")`, and
// `@client` IS `packages/client/src/`. The fence is pinned by `mustPass[4]`, the only row that dies
// without it.
//
// TWO LEGACY FENCES DROPPED AS MUTUALLY REDUNDANT (§4.1), not silently: the legacy per-file dispatch
// early-returned for the factory `.tsx` and for the contract `.ts` before reaching ARM A. Cut either one
// alone and every row stays green, because ARM A is already fenced by the FACTORY IMPORT and a module
// cannot import the symbol it declares — measured 2026-09-12 against both live files (neither imports
// `createAutosaveEntityForm`; the factory DECLARES it and the contract imports only `AppFormInstance`).
// They were two guards on one subject, so they are deleted rather than carried as an unfalsifiable fence.
//
// §12.7 CARRY-FORWARD (`b849e7add`, the "current source ownership and exact grant identities" row).
// `forms/` was split into `forms/editor/` by #1861; the CURRENT homes were re-read on `main` and the
// delta re-derived with `git diff 6c8424806 HEAD -- <this policy and packages/client/src/forms/>`. Both
// exact paths below, and every fixture specifier, name the POST-SPLIT homes
// (`forms/editor/create-autosave-entity-form.tsx`, `forms/editor/autosave-contract.ts`, `#forms/editor`).
// The pre-split spellings `forms/create-autosave-entity-form-model.ts` and the bare `#forms` are stale
// old-path permissions and MUST NOT be restored.
//
// LEGACY SHA: b849e7add (`git show b849e7add:tooling/src/verify/gates/no-form-reset-in-autosave.ts`).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-form-reset-in-autosave` descriptor at a4ed280d18da42e55be62960b8ce1aec1f76ff32, the parent of the conversion
// `5f8347dca` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `b849e7add`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,429 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,319 and final `population` admits 1,319.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts`
// (virtual) admitted by both; outside `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { AUTOSAVE_FORM_FACTORY, AUTOSAVE_STRIPPED_MEMBER, EDITOR_FORM_FACTORY_FILE, importsEditorFormFactory } from "../lib/editor-form-factory.ts";

const RESET = AUTOSAVE_STRIPPED_MEMBER;

const MESSAGE =
  "reset() survives on an autosave form — reset re-baselines a live draft mirror into the TanStack Form " +
  "isDirty-never-clears loop (#1144). createAutosaveEntityForm strips reset by type; do not call past it, " +
  "and do not hand a reset property back through the returned surface (UI-Gates-and-Lessons.md §7 row 2; " +
  "forms/editor/create-autosave-entity-form.tsx).";
const RESET_CALL_MESSAGE =
  "reset() on an autosave form — reset re-baselines a live draft mirror into the TanStack Form " +
  "isDirty-never-clears loop (#1144). createAutosaveEntityForm strips reset by type; do not cast past it " +
  "(UI-Gates-and-Lessons.md §7 row 2; forms/editor/create-autosave-entity-form.tsx).";
const RESET_PROP_MESSAGE =
  "the autosave factory hands a `reset` PROPERTY back through its returned object — the type-level strip " +
  "is then one cast away from being undone, and reset re-baselines a live draft mirror into the isDirty " +
  "loop (#1144). Do not put reset on the returned surface at all (UI-Gates-and-Lessons.md §7 row 2).";
const FIX =
  "do not cast past the `Omit<…, 'reset'>` strip and do not return a `reset` property; reset re-baselines a live draft mirror into the TanStack Form isDirty loop (#1144). A deliberate occurrence waives with `@orb-waive no-form-reset-in-autosave(reset): <reason + end condition>` — the reported position is the literal text `reset` in BOTH arms, because each report anchors on the member NAME node (the `.reset` of the call, or the `reset` key of the returned property), never the receiver and never the enclosing statement.";

/** The receiver text of a `x.reset(...)` call reads as a form (so an unrelated `.reset(` is ignored). */
function receiverLooksLikeForm(access: MorphNode): boolean {
  if (!Node.isPropertyAccessExpression(access)) {
    return false;
  }
  return access.getExpression().getText().toLowerCase().includes("form");
}

export const gate = defineGate({
  id: "no-form-reset-in-autosave",
  family: "editor-form-factory",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAccessExpression],
        visit: (node, sourceFile): void => {
          if (!Node.isPropertyAccessExpression(node) || node.getName() !== RESET) {
            return;
          }
          if (!Node.isCallExpression(node.getParent())) {
            return;
          }
          if (!receiverLooksLikeForm(node)) {
            return;
          }
          if (!importsEditorFormFactory(sourceFile, AUTOSAVE_FORM_FACTORY)) {
            return;
          }
          ctx.report.node(node.getNameNode(), { message: RESET_CALL_MESSAGE, fix: FIX });
        },
      },
      {
        kinds: [SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment],
        visit: (node, sourceFile): void => {
          if (!(Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node))) {
            return;
          }
          if (node.getName() !== RESET) {
            return;
          }
          if (ctx.relativePath(sourceFile) !== EDITOR_FORM_FACTORY_FILE) {
            return;
          }
          ctx.report.node(node.getNameNode(), { message: RESET_PROP_MESSAGE, fix: FIX });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/x.ts":
          'import { createAutosaveEntityForm } from "#forms/editor";\nexport function f(personaForm: { reset: (v?: unknown) => void }) {\n  personaForm.reset();\n}\n',
      },
      expect: { count: 1, token: RESET, messageIncludes: "isDirty-never-clears" },
      why: "THE FOUNDING ROW — a `.reset(` on a form-shaped receiver in a file importing the autosave factory: the isDirty-loop escape the type strip cannot stop once someone casts past it",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/forms/editor/create-autosave-entity-form.tsx":
          'export function createAutosaveEntityForm(): Omit<{ reset: () => void; x: 1 }, "reset"> {\n  return { reset: () => {}, x: 1 };\n}\n',
      },
      expect: { count: 1, token: RESET, messageIncludes: "reset` PROPERTY back" },
      why: "ARM B — the factory file hands a `reset` property back through its returned object. Carried from the legacy descriptor, whose token was the synthetic `reset-prop`; the position is now the authored key `reset`, which is what a marker can actually bind to",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/shorthand.ts":
          'import { createAutosaveEntityForm } from "#forms/editor";\nexport const useIt = createAutosaveEntityForm;\nexport function g(presetForm: { reset: (v?: unknown) => void }) {\n  presetForm.reset({});\n}\n',
      },
      expect: { count: 1, token: RESET },
      why: "the SEEDED spelling — `reset(value)` with an argument is the exact re-baseline call #1144 is about, and a differently-named form receiver (`presetForm`) is the same subject: the receiver test is a shape test, not a name allowlist",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/y.ts": "export function f(personaForm: { reset: (v?: unknown) => void }) {\n  personaForm.reset();\n}\n",
      },
      why: "THE FACTORY-IMPORT FENCE, pinned: the same `.reset(` in a file that does NOT import the autosave factory is a plain TanStack form doing the legal thing. Drop `importsEditorFormFactory` and this row is the one that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/timer.ts":
          'import { createAutosaveEntityForm } from "#forms/editor";\nexport function f(debounceTimer: { reset: () => void }) {\n  debounceTimer.reset();\n}\n',
      },
      why: "THE RECEIVER FENCE, pinned: a `.reset(` on something that is not form-shaped (`debounceTimer`) in a file that DOES import the factory. Drop `receiverLooksLikeForm` and this row is the one that dies — every `.reset(` in every factory-importing file would flag",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/ref.ts":
          'import { createAutosaveEntityForm } from "#forms/editor";\nexport function f(personaForm: { reset: (v?: unknown) => void }) {\n  const handle = personaForm.reset;\n  void handle;\n}\n',
      },
      why: "THE CALL FENCE, pinned: reading `.reset` without CALLING it re-baselines nothing. Drop the `isCallExpression(parent)` test and this row is the one that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/prop.ts": "export const surface = { reset: () => {}, x: 1 };\n",
      },
      why: "THE ARM-B FILE FENCE, pinned: a `reset` PROPERTY in any client file that is not the autosave factory is an ordinary object member — the returned-surface arm is about the ONE factory's own returned object. Drop the `EDITOR_FORM_FACTORY_FILE` test and this row is the one that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/anchor.ts": "export const anchor = 1;\n",
        "packages/server/src/domain/persona/verbs/x.ts":
          'import { createAutosaveEntityForm } from "#forms/editor";\nexport function f(personaForm: { reset: (v?: unknown) => void }) {\n  personaForm.reset();\n}\n',
      },
      why: 'THE POPULATION FENCE, pinned: the identical shape in `@server` is not a finding — this is a CLIENT form law and there is no autosave draft mirror on the server. Drop `population: "@client"` and this is the only row that dies. The clean client `anchor.ts` beside it is mandatory: a fence falsifier whose only file sits outside the population admits zero paths and tool-errors instead of reporting',
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/waived.ts":
          'import { createAutosaveEntityForm } from "#forms/editor";\n' +
          "export function f(personaForm: { reset: (v?: unknown) => void }) {\n" +
          "  // @orb-waive no-form-reset-in-autosave(reset): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "  personaForm.reset();\n" +
          "}\n",
      },
      why: "POSITIONAL IDENTITY (§4.2): the report anchors on the member NAME node, so an author waives the `reset` CALL — not the receiver and not the file. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
