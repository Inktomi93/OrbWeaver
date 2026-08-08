// Gate: macro-resolution-home (owner ruling: MACROS NEVER RESOLVE IN WRITABLE FIELDS) — the client-side
// macro RESOLUTION entry points are reachable ONLY from the read-only render/preview/readout homes.
//
// THE INVARIANT. An editable surface displays and persists RAW template text: a literal `{{user}}` typed
// into a preset section, a chat injection, a guided template, a character greeting, a user-macro body is
// what the field shows and what the mutation payload carries. RESOLUTION (`{{user}}` → "Alex") happens
// only where the result is READ, never where it is written back.
//
// THE BREAKAGE CLASS THIS KILLS. An editor that renders resolved text into its own field round-trips the
// resolution on the next save: the author opens a section holding `{{user}} is here`, the field paints
// "Alex is here", the autosave driver persists what the field holds, and the TEMPLATE IS GONE — silently,
// irreversibly, and only for the values that happened to be bound at edit time. Every other persona/
// character then reads a prompt hardcoded to one name. It is a destructive write disguised as a no-op
// edit, and no test of the editor's own behavior catches it (the field faithfully saves what it shows).
//
// THE RESOLUTION ENTRY POINTS (the symbols this gate keys on):
//   • `resolveRowMacros`        — @orb/kit/macro, the ONE row atom server ASSEMBLE + client DISPLAY share
//   • `processMacros`           — @orb/kit/macro, the engine's whole-string render entry
//   • `createMacroContext`      — @orb/kit/macro, the engine door (a context exists only to resolve)
//   • `evaluateMacros`          — @orb/kit/macro, the AST→string evaluator
//   • `renderMessageForDisplay` — @orb/client `#lib/message-render`, the client display pipeline wrapper
//     (macro pass → DISPLAY regex → markdown repair) — the seam a feature actually reaches for
//
// EXPLICITLY NOT RESOLUTION, and deliberately absent from the list: `scanMacroRuns`/`parseMacros` (the
// escape-aware TOKENIZER the assembly preview chips text with — display of the template AS a template),
// `neutralizeMacros`/`swapIdentityMacros` (template→template rewrites that yield a template), and
// `resolveUserMacroInputs` (resolves an input VALUES bag, never a body's text). Those are safe in an
// editor and stay safe.
//
// SANCTIONED HOMES (`SANCTIONED` below) — each carries its reason inline. The FUTURE preset CONTEXT
// readouts (the wave-2 read-only "what this section actually contributes" panels) join that list when
// they land; they are not entries yet because they do not exist, and a speculative allowlist row is a
// hole that never closes.
//
// FAIL-LOUD, not path-rot: sanctioned files are SCANNED (not scoped out), so a sanctioned home that MOVES
// turns RED at its own import rather than silently taking its exemption with it — the opposite of the
// path-keyed-gate rot pattern. A second tripwire fires when an entry-point symbol is no longer declared
// anywhere in `packages/{kit,client}/src`: renamed past a name-keyed gate = permanently, silently green.
//
// DECLARED BLIND SPOTS (literal-shape, honestly stated):
//  • DATA FLOW. The gate keys on imports/calls, not values. A sanctioned home that resolves text and then
//    passes the RESULT down as a prop into a form field is invisible here — that is what the CT helper
//    `tests/support/ct/assert-token-roundtrip.ts` exists to catch (the wire payload is the real proof).
//  • DYNAMIC IMPORT. `(await import("@orb/kit/macro")).processMacros(…)` has no ImportSpecifier; the CALL
//    arm still fires on the bare-name form, but a property-access call off the namespace object does not.
//  • ALIASED IMPORT. `import { processMacros as p }` hides the CALL arm (the callee text is `p`), but the
//    ImportSpecifier arm still flags the import itself — the site is never silently green.
//  • SERVER. Scope is `packages/{client,ui}/src` only. Server-side resolution (assembly, the nudge/prose
//    seams, identity-macro resolution) is chat-owned and correct; it has no writable field to corrupt.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

/** The client-reachable macro RESOLUTION entry points. Name-keyed (the barrel/`#lib` re-export absorbs a
 *  module-specifier match the same way `no-direct-users-read`'s does). */
const RESOLVERS = ["resolveRowMacros", "processMacros", "createMacroContext", "evaluateMacros", "renderMessageForDisplay"] as const;
const RESOLVER_SET = new Set<string>(RESOLVERS);

/** Where the tripwire looks for each entry point's declaration (kit owns four, client owns the wrapper). */
const DECLARED_IN = /(?:^|\/)packages\/(?:kit|client)\/src\//u;

/** Scope: the surfaces that have writable fields at all. Server resolution is correct and out of scope. */
const SCANNED = /(?:^|\/)packages\/(?:client|ui)\/src\//u;

/** The read-only render/preview/readout homes, with the reason each one resolves. */
const SANCTIONED: readonly { readonly re: RegExp; readonly why: string }[] = [
  {
    re: /(?:^|\/)packages\/client\/src\/lib\/message-render\.ts$/u,
    why: "THE client display pipeline — the only client caller of the kit row atom; its output is a string for the markdown renderer, never a textarea",
  },
  {
    re: /(?:^|\/)packages\/client\/src\/features\/chat\/components\/message-content\.tsx$/u,
    why: "transcript message-content render — read-only Markdown spans; the edit path never reaches it (message-row-parts swaps in the raw-text textarea first)",
  },
  {
    re: /(?:^|\/)packages\/client\/src\/features\/chat\/components\/message-row-parts\.tsx$/u,
    why: "transcript row render helpers (settled reasoning + content); its `editing` branch returns MessageEditTextarea on the RAW MessageView, before any resolve",
  },
  {
    re: /(?:^|\/)packages\/client\/src\/features\/chat\/components\/ghost-message-row\.tsx$/u,
    why: "the streaming ghost row — live read-only render of the in-flight text/reasoning, same display pass so pre- and post-commit read identically",
  },
];

const MESSAGE =
  "a macro RESOLUTION entry point reached outside the read-only render/preview/readout homes — an editable " +
  "surface must display and persist RAW template text. An editor that paints resolved text round-trips it on " +
  "the next save: `{{user}} is here` becomes `Alex is here` in the stored template, silently and " +
  "irreversibly, and every other persona then reads a prompt hardcoded to one name. The sanctioned " +
  "read-only homes (and the reason each one resolves) are listed in scripts/check/gates/macro-resolution-home.ts.";
const FIX =
  "render the RAW string in the field (a MacroTextarea shows `{{tokens}}` on purpose) and resolve only where " +
  "the result is READ. If this really is a read-only readout, add its path to SANCTIONED in " +
  "scripts/check/gates/macro-resolution-home.ts WITH its reason — and give it a token-round-trip CT " +
  "(tests/support/ct/assert-token-roundtrip.ts) if it sits next to a writable field.";

/** Every example except the tripwire one spreads this: the five entry points DECLARED where the rename
 *  tripwire expects them, so an example proves its own arm rather than incidentally tripping the tripwire. */
const DECLARATIONS: Readonly<Record<string, string>> = {
  "packages/kit/src/macro/row-macros.ts": "export function resolveRowMacros(): string { return ''; }\n",
  "packages/kit/src/macro/engine.ts": "export function processMacros(): string { return ''; }\nexport function createMacroContext(): object { return {}; }\n",
  "packages/kit/src/macro/evaluator.ts": "export function evaluateMacros(): string { return ''; }\n",
  "packages/client/src/lib/message-render.ts": "export function renderMessageForDisplay(): string { return ''; }\n",
};

/** A consumer that both IMPORTS and CALLS the display wrapper — two findings when it isn't sanctioned. */
const IMPORT_AND_CALL = 'import { renderMessageForDisplay } from "#lib";\nexport const V = renderMessageForDisplay();\n';

/** The display pipeline's real body: the sanctioned home calling the kit row atom. */
const PIPELINE_BODY = 'import { resolveRowMacros } from "@orb/kit/macro";\nexport function renderMessageForDisplay(): string { return resolveRowMacros(); }\n';

/** The TOKENIZER — chips a template as a template. Never a resolver, so it must never flag. */
const TOKENIZER_USE = 'import { scanMacroRuns } from "@orb/kit/macro";\nexport const V = scanMacroRuns("{{char}}");\n';

function rel(ctx: GateRunCtx, sf: SourceFile): string {
  return sf.getFilePath().replace(`${ctx.root}/`, "");
}

function isSanctioned(path: string): boolean {
  return SANCTIONED.some((entry) => entry.re.test(path));
}

/** Arm 1: an ImportSpecifier naming a resolver, from any specifier (`@orb/kit/macro`, `#lib`, a barrel). */
function resolverImport(node: Node): string | undefined {
  const spec = node.asKind(SyntaxKind.ImportSpecifier);
  if (spec === undefined || !RESOLVER_SET.has(spec.getName())) {
    return;
  }
  return spec.getName();
}

/** Arm 2: a `resolveRowMacros(...)` call matched by NAME — catches a local re-binding / re-export dodge. */
function resolverCall(node: Node): string | undefined {
  const call = node.asKind(SyntaxKind.CallExpression);
  if (call === undefined) {
    return;
  }
  const callee = call.getExpression().getText();
  return RESOLVER_SET.has(callee) ? callee : undefined;
}

export const gate: GateDescriptor = {
  name: "macro-resolution-home",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) · owner ruling: macros never resolve in writable fields",
  status: "active",
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => SCANNED.test(`/${p}`),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression],
  visit: (node, sf, ctx) => {
    const token = resolverImport(node) ?? resolverCall(node);
    if (token === undefined || isSanctioned(rel(ctx, sf))) {
      return;
    }
    // NODE overload (GATE-AUTHORING §1) — the token is the resolver NAME, which is both the arm's stable
    // position and what a `// @orb-gate-ignore macro-resolution-home(resolveRowMacros): <reason>` names.
    ctx.report(node, { token, offset: 0 });
  },
  // Fail-loud rename tripwire: a resolver renamed out from under this name-keyed gate would leave every
  // arm above matching nothing, forever green. Self-guards on a whole-project run (a `--changed` scope
  // loads a partial tree, where "not declared anywhere" is an artifact, not a verdict).
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project") {
      return;
    }
    // THE SANCTIONED Finding overload (§1): this tripwire anchors on the GATE FILE, not on a source node —
    // there is nothing to hang a marker off, and a blindness alarm must not be suppressible anyway.
    const sources = ctx.project.getSourceFiles().filter((sf) => DECLARED_IN.test(sf.getFilePath()));
    for (const name of RESOLVERS) {
      if (sources.some((sf) => sf.getFunction(name) !== undefined)) {
        continue;
      }
      ctx.report({
        file: "scripts/check/gates/macro-resolution-home.ts",
        line: 0,
        column: 0,
        message: `\`${name}\` is no longer declared under packages/{kit,client}/src — this gate keys on that exact name, so it is now blind to that entry point. Retarget RESOLVERS in scripts/check/gates/macro-resolution-home.ts at the renamed resolver.`,
      });
    }
  },
  mustFlag: [
    {
      files: {
        ...DECLARATIONS,
        "packages/client/src/features/preset/components/section-body-editor.tsx": IMPORT_AND_CALL,
      },
      // Both arms fire: the ImportSpecifier + the CallExpression.
      expect: { count: 2, token: "renderMessageForDisplay" },
      why: "a prompt-section EDITOR resolving its own field value — the corruption class verbatim (the saved template loses its {{tokens}})",
    },
    {
      files: {
        ...DECLARATIONS,
        // No import at all — the symbol arrives via a re-export/rebind. The CALL arm still matches by name.
        "packages/client/src/features/chat/components/injections-manager.tsx": "declare function processMacros(): string;\nexport const V = processMacros();\n",
      },
      expect: { count: 1, token: "processMacros" },
      why: "the CALL arm matches by NAME — a barrel re-export / local re-binding cannot launder a resolver into an editor",
    },
    {
      files: {
        // Every resolver renamed away (no DECLARATIONS spread): the tripwire, the only thing between a
        // rename and a permanently green gate. Five findings — one per un-declared entry point.
        "packages/client/src/features/chat/components/message-content.tsx": "export const x = 1;\n",
      },
      expect: { count: 5, messageIncludes: "now blind" },
      why: "the resolvers renamed out from under a name-keyed gate — must be RED, never silently green",
    },
  ],
  mustPass: [
    {
      files: {
        ...DECLARATIONS,
        "packages/client/src/lib/message-render.ts": PIPELINE_BODY,
      },
      why: "the sanctioned display pipeline calling the kit row atom — the ONE client resolution home",
    },
    {
      files: {
        ...DECLARATIONS,
        "packages/client/src/features/chat/components/message-content.tsx": IMPORT_AND_CALL,
      },
      why: "the transcript's read-only message-content render — a sanctioned readout, and the reason the allowlist exists",
    },
    {
      files: {
        ...DECLARATIONS,
        "packages/client/src/features/preset/components/preview-model.ts": TOKENIZER_USE,
      },
      why: "the assembly preview TOKENIZES (scanMacroRuns) rather than resolving — chipping a template as a template is the correct editor-adjacent behavior and must never flag",
    },
  ],
};
