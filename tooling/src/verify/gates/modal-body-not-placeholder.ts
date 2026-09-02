// Gate: modal-body-not-placeholder (client-architecture-lockdown.md §6d / §16 G13) — a ModalDefinition
// (features/**/lib/*-modal.tsx) whose FUNCTION-arm `body` renders a `<SectionPlaceholder>` is RED. An
// unbuilt modal uses the DECLARED-PLANNED arm (`body: { planned: "<reason>" }`); a placeholder-rendering
// function body is the silent-sparkle anti-pattern, now unspellable. Walks every `**/lib/*-modal.tsx`.
//
// SUPPRESSION: the finding is NODE-anchored and carries the modal's own name as its token, so
// `// @orb-gate-ignore modal-body-not-placeholder("themeModal"): <reason>` works. It reported through the
// explicit-`Finding` overload until 2026-08-08, which bypasses `hasGateIgnore` by construction
// (GATE-AUTHORING §1) — every marker on this gate was inert and nothing said so.
//
// FAIL-CLOSED DISCOVERY (#944, 2026-09-01). The reader used to `return` on any initializer that was not a
// bare object literal, so `export const xModal: ModalDefinition = importedDefinition;` made the whole gate
// silently absent while the file still sat at its sanctioned `*-modal.tsx` path. §6d gives the definition
// ONE home and sanctions no builder for modals, so an unreadable initializer is not a shape to resolve —
// it is the co-location law being unestablishable, and it REDS. Same-file indirection and
// `as`/`satisfies` wrappers ARE resolved (`readObjectLiteral`): both are still co-located. The gate also
// declares its DEFINITION POPULATION (#946) so a shrinking subject can never hide behind a healthy file count.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { readObjectLiteral } from "../lib/ast-read.ts";

const PLACEHOLDER_TAG = "SectionPlaceholder";
/** A co-located modal definition file: `features/<owner>/lib/<id>-modal.tsx`. */
const MODAL_FILE_RE = /\/lib\/[^/]+-modal\.tsx$/;

/** Does this subtree render a `<SectionPlaceholder …>` (open or self-closing) JSX element? */
function rendersPlaceholder(node: Node): boolean {
  for (const el of node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    if (el.getTagNameNode().getText() === PLACEHOLDER_TAG) {
      return true;
    }
  }
  for (const el of node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    if (el.getTagNameNode().getText() === PLACEHOLDER_TAG) {
      return true;
    }
  }
  return false;
}

/** The declaration population this pass judged, reset in `begin` and declared in `finalize` (#946): the
 *  DEFINITIONS behind the verdict, which the harness's file count cannot see. Lifetime = the pass. */
let definitionsSeen = 0;
let definitionsUnresolved = 0;
/** The population's stable name — what a reader diffs run over run. */
const POPULATION = "ModalDefinition";

export const gate: GateDescriptor = {
  name: "modal-body-not-placeholder",
  docRow: "client-architecture-lockdown.md §6d / §16 G13",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a ModalDefinition is unreadable or dishonest: an initializer this gate cannot resolve to a co-located " +
    "object literal (an imported/builder definition — §6d gives the definition ONE home, so the placeholder " +
    "law cannot be established through it), or a function `body` that renders <SectionPlaceholder> — an " +
    'unbuilt modal is the DECLARED-PLANNED arm (`body: { planned: "<reason>" }`), never a ' +
    "placeholder-rendering function body (client-architecture-lockdown.md §6d).",
  fix: 'write the definition as a co-located object literal (a same-file const and an `as`/`satisfies` wrapper both read fine — an IMPORT does not); use `body: { planned: "<reason>" }` for an unbuilt modal, or render a real body.',
  scanRoot: (p) => MODAL_FILE_RE.test(p),
  kinds: [SyntaxKind.VariableDeclaration],
  begin: () => {
    definitionsSeen = 0;
    definitionsUnresolved = 0;
  },
  finalize: (ctx) => {
    ctx.scan({ population: [{ source: POPULATION, members: definitionsSeen, unresolved: definitionsUnresolved }] });
  },
  visit: (node, _sf, ctx) => {
    if (!Node.isVariableDeclaration(node)) {
      return;
    }
    const typeNode = node.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("ModalDefinition")) {
      return;
    }
    // FAIL CLOSED: an initializer that is not a co-located object literal is the law being unestablishable,
    // never a silent skip. `readObjectLiteral` still resolves same-file indirection + as/satisfies wrappers.
    const read = readObjectLiteral(node.getInitializer());
    if (read.kind === "unresolved") {
      definitionsUnresolved += 1;
      ctx.report(node, { token: `"${node.getName()}" — unreadable definition: ${read.shape}`, offset: 0 });
      return;
    }
    definitionsSeen += 1;
    const init = read.object;
    const bodyProp = init.getProperty("body");
    if (bodyProp === undefined || !Node.isPropertyAssignment(bodyProp)) {
      return;
    }
    const body = bodyProp.getInitializer();
    // Only a FUNCTION body can render JSX; the `{ planned }` arm is an object literal (legal, skip).
    if (body === undefined || !(Node.isArrowFunction(body) || Node.isFunctionExpression(body))) {
      return;
    }
    if (!rendersPlaceholder(body)) {
      return;
    }
    ctx.report(node, { token: `"${node.getName()}"`, offset: 0 });
  },
  mustFlag: [
    {
      files: "export const themeModal: ModalDefinition = { id: 'theme', body: () => <SectionPlaceholder /> };\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
      expect: { count: 1, token: '"themeModal"' },
      why: "a ModalDefinition function body rendering <SectionPlaceholder> — the silent-sparkle anti-pattern",
    },
    {
      files: {
        "packages/client/src/features/x/lib/definition.tsx": "export const def = { id: 'x', body: () => <SectionPlaceholder /> };\n",
        "packages/client/src/features/x/lib/x-modal.tsx": 'import { def } from "./definition.tsx";\nexport const xModal: ModalDefinition = def;\n',
      },
      expect: {
        token: '"xModal" — unreadable definition: the identifier `def` (not an object literal declared in this file — an imported or re-exported definition)',
      },
      why: "THE #944 CONTROL: the definition body lives in an IMPORTED object and the placeholder is invisible from the sanctioned `*-modal.tsx` file. Before the fail-closed arm this returned silently — the file was still co-located, so every path check stayed green while the gate judged nothing",
    },
  ],
  mustPass: [
    {
      files: "export const draftModal: ModalDefinition = { id: 'draft', body: { planned: 'build pending' } };\n",
      at: "packages/client/src/features/x/lib/draft-modal.tsx",
      why: "the DECLARED-PLANNED arm (object literal, not a function) — the sanctioned unbuilt state, passes",
    },
    {
      files: "export const themeModal: ModalDefinition = { id: 'theme', body: () => <ThemePanel /> };\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
      why: "a function body rendering a REAL body (no <SectionPlaceholder>) — the false branch, passes",
    },
    {
      files: "const themeModalDef = { id: 'theme', body: () => <ThemePanel /> };\nexport const themeModal: ModalDefinition = themeModalDef;\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
      why: "SAME-FILE indirection — still co-located, so `readObjectLiteral` follows it and the gate judges the real body. The declared limit this row writes down: only an import/builder fails closed, never a local const",
    },
    {
      files: "export const themeModal: ModalDefinition = { id: 'theme', body: () => <ThemePanel /> } satisfies ModalDefinition;\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
      why: "a WHOLE-literal `satisfies` wrapper — the shape the plain ObjectLiteral check treated as unreadable and silently passed before #944 (the same wrapper class config-group-completeness's `literalInit` closed on 2026-08-30)",
    },
  ],
};
