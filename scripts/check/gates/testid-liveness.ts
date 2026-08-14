// Gate: testid-liveness (UI-Gates-and-Lessons.md §11.5) — the OTHER half of the typed-testid law: a
// `data-testid` a test SELECTS but nothing MINTS. A1 a `getByTestId("x")` / `[data-testid="x"]` consumer no
// producer can emit (the 2026-08-14 draft-cast ghosts: two CTs outlived the runtime deletion and slipped
// every scoped floor); A2 a `TEST_IDS` row no producer spends; A3 the registry reader learned nothing.
// DECLARED LIMIT: a producer whose value is a runtime expression is invisible — see PRODUCER EVIDENCE.
//
// PRODUCER EVIDENCE (three rules, measured against the whole corpus at mint — 313 consumed values, 0 false
// positives). A testid VALUE counts as produced when:
//   (1) a `data-testid` attribute/property carries it as a LITERAL (in packages/**/src OR tests/** — a CT
//       story is a legitimate producer; `draft-cast` was one until its story stopped rendering it);
//   (2) a `data-testid` TEMPLATE with ≥1 static part could generate it (`engine-launch-${key}`);
//   (3) its registry KEY is mentioned as a string in packages/**/src outside the registry itself — the
//       PROP-INDIRECTION rule. `<FormDialog testKey="adminCreateUserDialog">` stamps the id inside
//       form-dialog.tsx from a prop; the caller's key literal is the only static evidence there is.
// Rule 3 is why a raw dynamic producer (`data-testid={props.id}`) is IGNORED rather than treated as a
// wildcard: a wildcard would absolve every consumer on the tree, and the live indirection is already
// covered by the key it forwards.
import { Node, SyntaxKind } from "ts-morph";
import { readStringValue } from "../ast-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const REGISTRY_REL = "packages/client/src/lib/test-ids.ts";
const REGISTRY_CONST = "TEST_IDS";
const TESTID_ATTR = "data-testid";
const TESTID_FN = "testId";
const GETTER = "getByTestId";
/** Real-tree anchor (GATE-AUTHORING.md §4.5) for the A3 blindness tripwire — a file every real run loads
 *  and no example below builds, so "the registry is missing" is only ever claimed against the workspace. */
const ANCHOR_REL = "packages/db/src/schema/index.ts";
/** A `[data-testid="x"]` fragment anywhere inside a selector string (the `locator()` consumer shape). */
const SELECTOR_RE = /\[data-testid=["']?(?<value>[\w-]+)["']?\]/gu;
/** What a registry KEY looks like, so rule 3 can gather candidate mentions before the registry is read
 *  (walk order is file order — the registry may be visited last). Intersected with the real keys in `run`. */
const KEY_SHAPE_RE = /^[a-z][A-Za-z0-9]{2,39}$/u;

const MESSAGE =
  "dead test-id (UI-Gates-and-Lessons.md §11.5) — A1: a test selects a `data-testid` NOTHING on the tree " +
  "mints, so the assertion cannot pass on the element it names (it fails late, or a `.or()`/negative " +
  "assertion passes falsely); A2: a `TEST_IDS` row no component spends, a typed promise of a selector that " +
  "does not exist; A3: this gate's registry reader learned nothing (see the finding).";
const FIX =
  'stamp the id on the element the test means (`data-testid={testId("key")}`), or retire the assertion ' +
  "with the surface it outlived — and delete the registry row when its last producer goes.";

interface ValueSite {
  readonly value: string;
  readonly node: Node;
}
interface KeySite {
  readonly key: string;
  readonly node: Node;
}
interface RegistryRow {
  readonly value: string;
  readonly node: Node;
}

/** Producer patterns are DERIVED from template producers: static parts anchored, `${…}` holes widened.
 *  A template with no static part of its own would match everything, so it is dropped rather than trusted. */
function templatePattern(node: Node): RegExp | undefined {
  if (!Node.isTemplateExpression(node)) {
    return;
  }
  const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const head = node.getHead().getLiteralText();
  const parts: string[] = [literal(head)];
  let staticChars = head.length;
  for (const span of node.getTemplateSpans()) {
    const tail = span.getLiteral().getLiteralText();
    staticChars += tail.length;
    parts.push(".+", literal(tail));
  }
  return staticChars >= 2 ? new RegExp(`^${parts.join("")}$`, "u") : undefined;
}

/** The literal key of a `testId("key")` call — the typed producer/consumer shape. */
function testIdCallKey(node: Node): string | undefined {
  if (!Node.isCallExpression(node) || node.getExpression().getText() !== TESTID_FN) {
    return;
  }
  const first = node.getArguments()[0];
  return first === undefined ? undefined : readStringValue(first);
}

// ── accumulated over the ONE walk; resolved in `run` (the registry may be the last file visited) ────
const exactProducers = new Set<string>();
const patternProducers: RegExp[] = [];
const producerKeys = new Set<string>();
/** Rule-3 candidates: every key-SHAPED string literal authored in packages/**\/src outside the registry. */
const mentionCandidates = new Set<string>();
const consumerValues: ValueSite[] = [];
const consumerKeys: KeySite[] = [];
/** The live registry, read off its own AST: key → { value, the property node to anchor A2 on }. */
const registry = new Map<string, RegistryRow>();

function recordProducerValue(expr: Node | undefined): void {
  if (expr === undefined) {
    return;
  }
  const literal = readStringValue(expr);
  if (literal !== undefined) {
    exactProducers.add(literal);
    return;
  }
  const key = testIdCallKey(expr);
  if (key !== undefined) {
    producerKeys.add(key);
    return;
  }
  if (Node.isTemplateExpression(expr)) {
    const pattern = templatePattern(expr);
    if (pattern !== undefined) {
      patternProducers.push(pattern);
    }
  }
}

/** The value expression of a `data-testid` JSX attribute — the bare string, or what the braces hold. */
function attributeValue(node: Node): Node | undefined {
  if (!Node.isJsxAttribute(node) || node.getNameNode().getText() !== TESTID_ATTR) {
    return;
  }
  const init = node.getInitializer();
  return init !== undefined && Node.isJsxExpression(init) ? init.getExpression() : init;
}

function visitJsxAttribute(node: Node): void {
  recordProducerValue(attributeValue(node));
}

function visitPropertyAssignment(node: Node, rel: string): void {
  if (!Node.isPropertyAssignment(node)) {
    return;
  }
  const name = node.getName().replace(/^["']|["']$/gu, "");
  if (name === TESTID_ATTR) {
    recordProducerValue(node.getInitializer());
    return;
  }
  if (rel !== REGISTRY_REL) {
    return;
  }
  const owner = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const init = node.getInitializer();
  const value = init === undefined ? undefined : readStringValue(init);
  if (owner?.getName() === REGISTRY_CONST && value !== undefined) {
    registry.set(name, { value, node });
  }
}

function visitCallExpression(node: Node): void {
  if (!Node.isCallExpression(node)) {
    return;
  }
  const callee = node.getExpression().getText();
  if (!(callee === GETTER || callee.endsWith(`.${GETTER}`))) {
    return;
  }
  const first = node.getArguments()[0];
  if (first === undefined) {
    return;
  }
  const literal = readStringValue(first);
  if (literal !== undefined) {
    consumerValues.push({ value: literal, node });
    return;
  }
  const key = testIdCallKey(first);
  if (key !== undefined) {
    consumerKeys.push({ key, node });
  }
}

function visitStringLike(node: Node, rel: string): void {
  const text = readStringValue(node);
  if (text === undefined) {
    return;
  }
  for (const match of text.matchAll(SELECTOR_RE)) {
    const value = match.groups?.["value"];
    if (value !== undefined) {
      consumerValues.push({ value, node });
    }
  }
  // Rule 3 gathers only from packages/**/src: a key literal in a TEST is the test's own business (a
  // consumer must never absolve itself), and the registry's own rows are declarations, not evidence.
  if (rel !== REGISTRY_REL && rel.includes("packages/") && rel.includes("/src/") && KEY_SHAPE_RE.test(text)) {
    mentionCandidates.add(text);
  }
}

function visitPropertyAccess(node: Node): void {
  if (Node.isPropertyAccessExpression(node) && node.getExpression().getText() === REGISTRY_CONST) {
    mentionCandidates.add(node.getName());
  }
}

function repoRel(path: string): string {
  const marks = ["/packages/", "/tests/", "/scripts/"];
  for (const mark of marks) {
    const index = path.indexOf(mark);
    if (index !== -1) {
      return path.slice(index + 1);
    }
  }
  return path;
}

/** The offset of `value` inside the reported node's own text, so the caret lands on the id and not the
 *  call. §4.3a: two `getByTestId` chains CAN share a line, so every finding names its position. */
function tokenAt(node: Node, value: string): { readonly token: string; readonly offset: number } {
  const at = node.getText().indexOf(value);
  return { token: value, offset: at === -1 ? 0 : at };
}

/** Fold the two KEYED producer rules (a `testId("k")` stamp, a rule-3 key mention) into the exact set,
 *  once the whole walk has read the registry — walk order is file order, so this cannot happen earlier. */
function resolveKeyedProducers(): void {
  for (const key of [...producerKeys, ...mentionCandidates]) {
    const row = registry.get(key);
    if (row !== undefined) {
      exactProducers.add(row.value);
    }
  }
}

function isProduced(value: string): boolean {
  return exactProducers.has(value) || patternProducers.some((re) => re.test(value));
}

/** A1 — every consumer whose value nothing on the tree can mint, in both spellings. */
function reportDeadConsumers(ctx: GateRunCtx): void {
  for (const { value, node } of consumerValues) {
    if (!isProduced(value)) {
      ctx.report(node, tokenAt(node, value));
    }
  }
  for (const { key, node } of consumerKeys) {
    const row = registry.get(key);
    // An unknown KEY is tsc's job (`TestIdKey` is a closed union) — this arm only judges liveness.
    if (row !== undefined && !isProduced(row.value)) {
      ctx.report(node, tokenAt(node, key));
    }
  }
}

/** A2 — a typed row promising a selector no component stamps. */
function reportDeadRegistryRows(ctx: GateRunCtx): void {
  for (const [key, row] of registry) {
    if (!isProduced(row.value)) {
      ctx.report(row.node, { token: key, offset: 0 });
    }
  }
}

/** A3 — the §4.6 blindness tripwire: this gate keys on ONE file BY PATH and ONE const BY NAME, so a
 *  rename would turn both liveness arms into a no-op that reports ✓ forever. */
function reportBlindness(ctx: GateRunCtx): void {
  if (!(fileLoaded(ctx, ANCHOR_REL) && registry.size === 0)) {
    return;
  }
  // A genuinely FILE-level finding (line/column 0, no node position): the sanctioned Finding-overload
  // use, so it needs no provenance marker — and must never grow one, since it is non-suppressible by
  // construction (a marker here would restore exactly the no-op this arm exists to catch).
  ctx.report({
    file: REGISTRY_REL,
    line: 0,
    column: 0,
    message: `A3 — testid-liveness read ZERO rows out of \`${REGISTRY_CONST}\` in ${REGISTRY_REL} on a real tree: the registry moved, was renamed, or stopped being an object literal, and both liveness arms are now silently green (GATE-AUTHORING.md §4 rule 6). Re-point the gate at the registry's new home.`,
  });
}

export const gate: GateDescriptor = {
  name: "testid-liveness",
  docRow: "UI-Gates-and-Lessons.md §11.5",
  status: "active",
  // Cross-file by construction: the producer of a testid is almost never in the file that selects it.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  // No leading-slash assumption (§3, the silent-green format trap). Producers live in package sources AND
  // in CT stories; consumers live in tests/. `scripts/` is deliberately OUT — the gate corpus spells
  // `data-testid` in its own examples.
  scanRoot: (p) => (p.includes("packages/") && p.includes("/src/")) || p.includes("tests/"),
  kinds: [
    SyntaxKind.JsxAttribute,
    SyntaxKind.PropertyAssignment,
    SyntaxKind.CallExpression,
    SyntaxKind.StringLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.PropertyAccessExpression,
  ],
  begin: () => {
    exactProducers.clear();
    patternProducers.length = 0;
    producerKeys.clear();
    mentionCandidates.clear();
    consumerValues.length = 0;
    consumerKeys.length = 0;
    registry.clear();
  },
  visit: (node, sf) => {
    const rel = repoRel(sf.getFilePath());
    const kind = node.getKind();
    if (kind === SyntaxKind.JsxAttribute) {
      visitJsxAttribute(node);
      return;
    }
    if (kind === SyntaxKind.PropertyAssignment) {
      visitPropertyAssignment(node, rel);
      return;
    }
    if (kind === SyntaxKind.CallExpression) {
      visitCallExpression(node);
      return;
    }
    if (kind === SyntaxKind.PropertyAccessExpression) {
      visitPropertyAccess(node);
      return;
    }
    visitStringLike(node, rel);
  },
  // Every verdict here needs the WHOLE walk (a producer is in another file), and `run` precedes every
  // gate's `finalize` — which is where node-anchored reporting has to happen (GATE-AUTHORING §1: a
  // finalize-phase suppression is judged stale before it is counted).
  run: (ctx: GateRunCtx) => {
    resolveKeyedProducers();
    reportDeadConsumers(ctx);
    reportDeadRegistryRows(ctx);
    reportBlindness(ctx);
  },

  mustFlag: [
    {
      files: {
        // A1 — THE FOUNDING SHAPE, replayed: the story stopped rendering `draft-cast` (the R1 draft-runtime
        // deletion, efc4cc2b2) and the two CT assertions on it survived, green under every scoped floor.
        "tests/client/features/character/_ct-stories.tsx": 'export const S = () => <p data-testid="cast-count">2</p>;\n',
        "tests/client/features/character/components/list-pane.ct.tsx":
          'test("cast", async () => {\n  await expect(component.getByTestId("draft-cast")).toHaveText("Azarael");\n});\n',
      },
      expect: { count: 1, token: "draft-cast" },
      why: "the founding defect — a CT selecting a testid whose producer was deleted out from under it; the sibling live id in the same story proves the arm is per-VALUE, not per-file",
    },
    {
      files: {
        // A1 through the SELECTOR spelling — same defect, written as a locator string.
        "tests/client/features/chat/header.ct.tsx": "const row = page.locator('[data-testid=\"ghost-row\"]');\n",
      },
      expect: { count: 1, token: "ghost-row" },
      why: 'the `[data-testid="x"]` locator spelling of a consumer — a getByTestId-only reader would call this file clean',
    },
    {
      files: {
        // A2 — a registry row nothing stamps. Its KEY is mentioned only in a TEST, which must not absolve
        // it (rule 3 gathers evidence from packages/**/src only: a consumer cannot license itself).
        [REGISTRY_REL]: 'export const TEST_IDS = {\n  ghostRow: "ghost-row",\n} as const;\n',
        "tests/client/x.ct.tsx": 'const row = page.getByTestId(testId("ghostRow"));\n',
      },
      // Two findings: the dead row AND the CT that selects through it.
      expect: { count: 2, token: "ghostRow" },
      why: 'A2 — a typed row promising a selector no component mints, plus the typed CONSUMER of that row: `testId("k")` is tsc-valid and still selects nothing',
    },
    {
      files: {
        // A3 — the registry file is present but the const it keys on is gone (a rename), on a tree carrying
        // the real-tree anchor. Without this arm that rename makes both liveness arms silently green.
        [ANCHOR_REL]: "export const schema = {};\n",
        [REGISTRY_REL]: 'export const IDS = {\n  appShell: "app-shell",\n} as const;\n',
      },
      expect: { messageIncludes: "read ZERO rows" },
      why: "the §4.6 blindness tripwire: the gate looks the registry up BY NAME, so a rename must be RED and not a silent no-op",
    },
  ],
  mustPass: [
    {
      files: {
        // The normal shape: the CT selects what the story stamps.
        "tests/client/features/character/_ct-stories.tsx": 'export const S = () => <p data-testid="draft-cast">Azarael</p>;\n',
        "tests/client/features/character/components/list-pane.ct.tsx":
          'test("cast", async () => {\n  await expect(component.getByTestId("draft-cast")).toHaveText("Azarael");\n});\n',
      },
      why: "a live producer/consumer pair, the producer being a CT STORY — stories mint ids for their own harness and are first-class producers",
    },
    {
      files: {
        // Rule 3 — the PROP-INDIRECTION that carries most of the real registry: the id is stamped inside a
        // shared component from a prop, and the caller's key literal is the only static evidence.
        [REGISTRY_REL]: 'export const TEST_IDS = {\n  adminCreateUserDialog: "admin-create-user-dialog",\n} as const;\n',
        "packages/client/src/components/form-dialog.tsx":
          "export const FormDialog = ({ testKey }: { testKey: string }) => <div data-testid={testId(testKey)} />;\n",
        "packages/client/src/features/user-admin/components/create-user.tsx": 'export const C = () => <FormDialog testKey="adminCreateUserDialog" />;\n',
        "tests/client/features/user-admin/create-user.ct.tsx": 'const d = page.getByTestId("admin-create-user-dialog");\n',
      },
      why: "DECLARED LIMIT made a written baseline: `data-testid={testId(testKey)}` is a dynamic producer this reader cannot evaluate — the caller's key mention is what keeps it honest instead of false-positive",
    },
    {
      files: {
        // Rule 2 — a TEMPLATE producer covers the family it generates.
        "packages/client/src/features/user-admin/components/engine-launch-config.tsx":
          "export const C = ({ k }: { k: string }) => <div data-testid={`engine-launch-${k}`} />;\n",
        "tests/client/features/user-admin/engine.ct.tsx": 'const f = page.getByTestId("engine-launch-genModel");\n',
      },
      why: "a template producer with a static prefix generates a whole family — treating it as unresolvable would false-positive every consumer of the family",
    },
    {
      files: {
        // A dynamic CONSUMER (a parameterized helper) is not a value claim at all — nothing to judge.
        "tests/ui/primitives/badge/badge.ct.tsx": "const read = (page: Page, testid: string) => page.getByTestId(testid);\n",
      },
      why: "a consumer whose value is a variable makes no claim this gate can check — it must be silent, not guess",
    },
    {
      files: {
        // The prose false positive the SELECTOR reader must not take: a doc-comment mentioning the shape.
        "packages/client/src/lib/notes.ts": 'export const note = "select the row with [data-testid=list-row] once the pane mints it";\n',
        "packages/ui/src/primitives/list-row/list-row.tsx": 'export const ListRow = () => <div data-testid="list-row" />;\n',
      },
      why: "the unquoted selector spelling IS read as a consumer (it is the same claim), so the value must be live — this row pins that a real producer answers it rather than the reader being narrowed to quotes",
    },
  ],
};
