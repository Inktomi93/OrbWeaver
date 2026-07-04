// Gate: diagnostic-legibility (Documentation-Law.md — machine-first: an error message IS the amnesiac
// agent's documentation at the moment of blocking). Every custom-gate + grit diagnostic STRING must
// carry a resolvable pointer — a `*.md` doc path, a code-home path/file, or an explicit `// terse-ok:
// <reason>` marker — so a blocked cold agent gets a navigable next step, never a dead-end "no". This
// makes the W1-D normalization PERMANENT: the next gate/grit someone writes CANNOT regress to a
// bare/pointerless message (a bare `§N`, or "do X" with no home).
//
// WHAT COUNTS AS A POINTER (any one):
//   • a doc path:  `<Name>.md` (optionally `<Name>.md §N`)
//   • a code home: a concrete `<file>.ts`/`.tsx`, a `packages/…|features/…|domain/…|…/` dir path,
//     or an `@orb/<pkg>` package specifier
//   • the escape: a `// terse-ok: <reason>` comment ON the diagnostic's line or the line above (for a
//     genuinely self-contained message whose fix is obvious IN the message AND that no doc covers).
//
// WHAT IT READS (the diagnostic strings, not incidental strings):
//   • gate files (scripts/check/gates/*.ts): every `message:` object-property value — inline literal,
//     or resolved ONE level through a same-file `const …MESSAGE` string; plus every string value of a
//     `const MSG`/`MESSAGES` object table (the shorthand-`{ message }` idiom, e.g. test-presence.ts).
//   • grit files (tools/grit/*.grit): every `register_diagnostic(… message="…" …)` string.
// It does NOT scan arbitrary strings (regex literals, ban-lists, span vars) — only the message surface,
// so it can't false-fire on a non-diagnostic string.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const GATES_REL = "scripts/check/gates";
const GRIT_REL = "tools/grit";

// A pointer token: a doc, a concrete source file, a code dir path, or an @orb package specifier.
const MD = /[\w.-]+\.md\b/u;
const SRC_FILE = /\b[\w-]+\.(?:ts|tsx)\b/u;
const CODE_DIR =
  /(?:^|[\s(/"'`])(?:packages|features|domain|infra|foundation|entry|transport|contracts?|kit|db|server|client|ui|tools|scripts|tests|lib|data|forms|state|hooks|surfaces|anchors|components|engine|substrate|persistence|verbs|guard)\//u;
const PKG_SPEC = /@orb\/[\w-]+/u;
const TERSE_OK = /terse-ok/u;
const GRIT_MSG = /message\s*=\s*"(?<msg>(?:[^"\\]|\\.)*)"/gu;
const MSG_TABLE_NAME = /^(?:MSG|MESSAGES)$/u;

const POINTER_HELP =
  "diagnostic must carry a pointer — end the message with a `<Doc>.md §N` doc path, a code-home (packages/…, features/…, an @orb/… specifier, or a concrete file.ts), or mark it `// terse-ok: <reason>` if the fix is fully self-contained and no doc covers it (Documentation-Law.md — the error message IS the agent's doc).";

/** Does the diagnostic text itself carry a resolvable doc/code-home pointer? (terse-ok is checked
 *  separately, against the surrounding source comment, not the string.) */
export function hasPointer(text: string): boolean {
  return MD.test(text) || SRC_FILE.test(text) || CODE_DIR.test(text) || PKG_SPEC.test(text);
}

/** A `// terse-ok:` escape on the diagnostic's own line or the line directly above it. */
function terseOkNear(lines: readonly string[], line1: number): boolean {
  const cur = lines[line1 - 1] ?? "";
  const prev = lines[line1 - 2] ?? "";
  return TERSE_OK.test(cur) || TERSE_OK.test(prev);
}

type Diag = { readonly line: number; readonly text: string };

/** Strip `as const` / `satisfies` / parentheses so the underlying literal or object is reachable. */
function unwrap(node: Node): Node {
  let n = node;
  while (
    Node.isAsExpression(n) ||
    Node.isSatisfiesExpression(n) ||
    Node.isParenthesizedExpression(n)
  ) {
    n = n.getExpression();
  }
  return n;
}

/** The literal text of a string / no-substitution template / template-with-`${}` / concat node, else
 *  undefined (a non-literal, e.g. a bare param). Templates keep their `${…}` spans — fine for pointer
 *  detection (a `.md`/path is a literal chunk of the template regardless of interpolation). */
function literalText(raw: Node): string | undefined {
  const node = unwrap(raw);
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  if (Node.isTemplateExpression(node)) {
    return node.getText();
  }
  if (!Node.isBinaryExpression(node)) {
    return;
  }
  const combined = `${literalText(node.getLeft()) ?? ""}${literalText(node.getRight()) ?? ""}`;
  return combined.length > 0 ? combined : undefined;
}

/** Resolve a `message:` initializer to its diagnostic text: inline literal or a same-file `const`. */
function resolveMessageText(init: Node): string | undefined {
  const direct = literalText(init);
  if (direct !== undefined) {
    return direct;
  }
  if (!Node.isIdentifier(init)) {
    return;
  }
  const decl = init.getSymbol()?.getDeclarations()?.[0];
  if (decl === undefined || !Node.isVariableDeclaration(decl)) {
    return;
  }
  const declInit = decl.getInitializer();
  return declInit === undefined ? undefined : literalText(declInit);
}

/** Every `message:` object-property value (inline or const-resolved). */
function messagePropDiags(sf: SourceFile): Diag[] {
  const out: Diag[] = [];
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (pa.getName() !== "message") {
      continue;
    }
    const text = resolveMessageText(pa.getInitializerOrThrow());
    if (text !== undefined) {
      out.push({ line: pa.getStartLineNumber(), text });
    }
  }
  return out;
}

/** Every string value of a `const MSG`/`MESSAGES` object table (reached via a `message` param). */
function msgTableDiags(sf: SourceFile): Diag[] {
  const out: Diag[] = [];
  for (const vd of sf.getVariableDeclarations()) {
    const init = vd.getInitializer();
    if (!MSG_TABLE_NAME.test(vd.getName()) || init === undefined) {
      continue;
    }
    const obj = unwrap(init);
    if (!Node.isObjectLiteralExpression(obj)) {
      continue;
    }
    for (const prop of obj.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) {
        continue;
      }
      const text = literalText(prop.getInitializerOrThrow());
      if (text !== undefined) {
        out.push({ line: prop.getStartLineNumber(), text });
      }
    }
  }
  return out;
}

function collectGritDiags(raw: string): Diag[] {
  const out: Diag[] = [];
  for (const m of raw.matchAll(GRIT_MSG)) {
    const line = raw.slice(0, m.index).split("\n").length;
    out.push({ line, text: m.groups?.["msg"] ?? "" });
  }
  return out;
}

/** The shared verdict: a diagnostic passes iff its text carries a pointer OR it's terse-ok-marked. */
function flag(diags: readonly Diag[], lines: readonly string[], file: string): Violation[] {
  const out: Violation[] = [];
  for (const d of diags) {
    if (!(hasPointer(d.text) || terseOkNear(lines, d.line))) {
      out.push({ file, line: d.line, message: POINTER_HELP });
    }
  }
  return out;
}

function scanGatesDir(dir: string, prefix: string): Violation[] {
  if (!existsSync(dir)) {
    return [];
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const out: Violation[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".ts")) {
      continue;
    }
    const abs = join(dir, name);
    const lines = readFileSync(abs, "utf-8").split("\n");
    const sf = project.addSourceFileAtPath(abs);
    const diags = [...messagePropDiags(sf), ...msgTableDiags(sf)];
    out.push(...flag(diags, lines, `${prefix}${name}`));
  }
  return out;
}

function scanGritDir(dir: string, prefix: string): Violation[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: Violation[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".grit")) {
      continue;
    }
    const raw = readFileSync(join(dir, name), "utf-8");
    out.push(...flag(collectGritDiags(raw), raw.split("\n"), `${prefix}${name}`));
  }
  return out;
}

/** The reusable scanner over an explicit gates dir + grit dir — the self-test drives this against a
 *  temp fixture tree so it never touches the real gate corpus. */
export function scanDirs(gatesDir: string, gritDir: string): Violation[] {
  return [...scanGatesDir(gatesDir, ""), ...scanGritDir(gritDir, "")];
}

export const diagnosticLegibility: Check = {
  name: "diagnostic-legibility",
  run: ({ root }): Violation[] => [
    ...scanGatesDir(join(root, GATES_REL), `${GATES_REL}/`),
    ...scanGritDir(join(root, GRIT_REL), `${GRIT_REL}/`),
  ],
};
