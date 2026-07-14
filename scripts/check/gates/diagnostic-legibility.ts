// Gate: diagnostic-legibility (Documentation-Law.md — machine-first: an error message IS the amnesiac
// agent's documentation at the moment of blocking). Every custom-gate + grit diagnostic STRING must
// carry a resolvable pointer — a `*.md` doc path, a code-home path/file/`@orb/<pkg>` specifier, or an
// explicit `// terse-ok: <reason>` marker on the diagnostic's line or the line above — so a blocked
// cold agent gets a navigable next step, never a dead-end "no". Reads gate `message:` and grit `register_diagnostic` strings — never incidental strings.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

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

// Reads the gate files from the shared project via `scanRoot: p => p.startsWith("scripts/check/gates/")`.
// The whole-project scanners (commented-code, no-caller-user-id, no-inline-union-redecl,
// pd-citation-integrity) each pin their own `scanRoot` to packages+tests so they don't also see this
// gate's example strings. The GRIT arm stays fs (grit files aren't in the ts project), so this
// descriptor is fsBacked.
const GATE_SCAN_ROOT = `${GATES_REL}/`;

/** Every message-diagnostic Violation in ONE gate SourceFile (read from the shared project's AST). */
function gateFileDiags(sf: SourceFile, root: string): Violation[] {
  const abs = sf.getFilePath();
  const rel = abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
  const lines = sf.getFullText().split("\n");
  const diags = [...messagePropDiags(sf), ...msgTableDiags(sf)];
  return flag(diags, lines, rel);
}

export const gate: GateDescriptor = {
  name: "diagnostic-legibility",
  docRow: "core/Documentation-Law.md",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: POINTER_HELP,
  fix: "end the message with a `<Doc>.md §N` doc path or a code-home (packages/…, an @orb/… specifier, or a concrete file.ts), or mark it `// terse-ok: <reason>` if the fix is fully self-contained (Documentation-Law.md).",
  // The fold-in's opt-IN: THIS gate reads the gate corpus from the shared project. The four whole-project
  // scanners pin their scanRoot to EXCLUDE it (see their gate files) — this one includes it.
  scanRoot: (p) => p.startsWith(GATE_SCAN_ROOT),
  run: (ctx) => {
    // Gate-file message diagnostics — read from the SHARED project (the fold-in), scanRoot-pinned above.
    for (const sf of ctx.project.getSourceFiles()) {
      const abs = sf.getFilePath();
      if (!(abs.includes(`/${GATES_REL}/`) && abs.endsWith(".ts"))) {
        continue;
      }
      for (const v of gateFileDiags(sf, ctx.root)) {
        ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
      }
    }
    // Grit diagnostics — grit files are not in the ts project, so this arm stays fs (fsBacked).
    for (const v of scanGritDir(join(ctx.root, GRIT_REL), `${GRIT_REL}/`)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "scripts/check/gates/x.ts":
          'export const gate = { message: "a bare diagnostic with no home" };\n',
      },
      expect: { messageIncludes: "must carry a pointer" },
      why: "a gate `message:` with no doc/code-home pointer — the amnesiac agent gets a dead-end 'no'",
    },
    {
      // a message resolved ONE level through a same-file const — the pointerless const still fires.
      files: {
        "scripts/check/gates/x.ts":
          'const MESSAGE = "no home for this rule";\nexport const gate = { message: MESSAGE };\n',
      },
      expect: { messageIncludes: "must carry a pointer" },
      why: "a `message:` resolved through a same-file const is checked — a pointerless const fires",
    },
    {
      // a `const MSG` object-table string value (the shorthand-`{ message }` idiom).
      files: {
        "scripts/check/gates/x.ts":
          'const MSG = { verb: "bare table diagnostic" } as const;\nexport const use = MSG.verb;\n',
      },
      expect: { messageIncludes: "must carry a pointer" },
      why: "a pointerless value in a `const MSG` object table fires (the shorthand-`{ message }` idiom)",
    },
    {
      // grit register_diagnostic message with no pointer — the grit arm (fs-scanned).
      files: { "tools/grit/bad.grit": 'message="bare grit diagnostic"\n' },
      expect: { messageIncludes: "must carry a pointer" },
      why: "a grit `register_diagnostic` message with no pointer fires (the grit arm)",
    },
  ],
  mustPass: [
    {
      files: {
        "scripts/check/gates/x.ts":
          'export const gate = { message: "the fix lives in packages/ui/src/x.ts" };\n',
      },
      why: "a gate message carrying a concrete code-home pointer (packages/…/x.ts) — a navigable next step, passes",
    },
    {
      // a `// terse-ok:` marker on the line above the message escapes the gate.
      files: {
        "scripts/check/gates/terse.ts":
          'export const gate = {\n  // terse-ok: fix is fully self-contained, no doc covers it\n  message: "just do the obvious thing",\n};\n',
      },
      why: "a `// terse-ok:` marker on the line above the message is the sanctioned escape — passes",
    },
    {
      // a grit message carrying a *.md pointer is clean.
      files: { "tools/grit/good.grit": 'message="fix it. See Foo.md §1."\n' },
      why: "a grit message carrying a *.md pointer is a navigable next step — passes",
    },
  ],
};
