// Gate: no-direct-reports-write — a `.screenshot({ path })` call in tests/** whose `path` carries a
// literal (string/template STATIC text) containing "reports/" is RED: that literal can name a PUBLISHED
// `latest` pointer (`reports/snaps/…`), and an ordinary file write FOLLOWS the symlink into whichever run
// currently owns it, rewriting a finished run's evidence invisibly (#1201, live collision at
// tracker-blocks.ct.tsx:833). The sanctioned door is `tests/support/node/snap-out.ts` `ctSnapPath(name)`,
// which resolves at RUNTIME (never a literal at the call site) — see docs/design/1208-instrument-substrate.md §3.7.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { readStringValue, unwrapExpression } from "../lib/ast-read.ts";

const NEEDLE = "reports/";

/** The STATIC text a template literal carries with `${…}` interpolations blanked — reading through the
 *  head/span literals so a needle inside an INTERPOLATED expression (a variable/call) never counts. Plain
 *  string / no-substitution templates go through `readStringValue` (LITERAL-SHAPE BLINDNESS, GATE-AUTHORING §5). */
function literalTextOf(node: Node): string | undefined {
  const plain = readStringValue(node);
  if (plain !== undefined) {
    return plain;
  }
  const n = unwrapExpression(node);
  if (!Node.isTemplateExpression(n)) {
    return;
  }
  const parts = [n.getHead().getLiteralText()];
  for (const span of n.getTemplateSpans()) {
    parts.push(span.getLiteral().getLiteralText());
  }
  return parts.join("");
}

// comment posture: comment-SAFE — this gate subscribes to CallExpression nodes and reads the `path`
// property's value through `ast-read.ts` readers; it never scans raw/full file text, so a comment
// mentioning "reports/" cannot change the verdict.
export const gate: GateDescriptor = {
  name: "no-direct-reports-write",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3, #1201/#1291)",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    `A .screenshot({ path }) call in tests/** hands a "${NEEDLE}"-carrying literal as the path — the write ` +
    "follows whichever run currently owns that published pointer and rewrites its evidence invisibly. " +
    "docs/design/1208-instrument-substrate.md §3.7",
  fix: 'Resolve the path through tests/support/node/snap-out.ts ctSnapPath("name") instead of a hand-spelled "reports/…" literal or template.',
  scanRoot: (p) => p.startsWith("tests/"),
  kinds: [SyntaxKind.CallExpression],

  visit: (node, _sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const callee = node.getExpression();
    if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "screenshot") {
      return;
    }
    const [arg] = node.getArguments();
    if (arg === undefined || !Node.isObjectLiteralExpression(unwrapExpression(arg))) {
      return;
    }
    const obj = unwrapExpression(arg);
    if (!Node.isObjectLiteralExpression(obj)) {
      return;
    }
    for (const prop of obj.getProperties()) {
      if (!Node.isPropertyAssignment(prop) || prop.getName() !== "path") {
        continue;
      }
      const text = literalTextOf(prop.getInitializer() ?? prop);
      if (text !== undefined && text.includes(NEEDLE)) {
        ctx.report(prop, { token: text, offset: 0 });
      }
    }
  },

  mustFlag: [
    {
      files:
        'export async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: "reports/snaps/x.png" });\n}\n',
      at: "tests/__g_reportswrite/plain.ct.tsx",
      expect: { count: 1 },
      why: 'the founding shape — a hand-spelled "reports/snaps/…" literal that followed a published symlink and rewrote a finished run (#1201)',
    },
    {
      files:
        "export async function x(page: { screenshot: (o: unknown) => Promise<unknown> }, name: string): Promise<void> {\n  await page.screenshot({ path: `reports/ct-shots/${name}.png` });\n}\n",
      at: "tests/__g_reportswrite/template.ct.tsx",
      expect: { count: 1 },
      why: "the same defect spelled as a template literal — the STATIC quasis still carry the reports/ text even with a dynamic name segment",
    },
  ],
  mustPass: [
    {
      files:
        'declare function ctSnapPath(name: string): string;\nexport async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: ctSnapPath("x") });\n}\n',
      at: "tests/__g_reportswrite/via-helper.ct.tsx",
      why: "ctSnapPath(name) resolves the path at RUNTIME (a CallExpression, not a literal) — the sanctioned door",
    },
    {
      files:
        "export async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } });\n}\n",
      at: "tests/__g_reportswrite/clip-only.ct.tsx",
      why: "an in-memory clip screenshot with no `path` key at all never writes to disk — nothing to follow",
    },
    {
      files:
        "declare const someVar: string;\nexport async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: someVar });\n}\n",
      at: "tests/__g_reportswrite/via-variable.ct.tsx",
      why: 'DECLARED LIMIT: a bare identifier/expression carrying a "reports/…" value one hop away (an imported constant, a variable) has no literal at the call site to read — this gate catches the literal shape only, not dataflow',
    },
  ],
};
