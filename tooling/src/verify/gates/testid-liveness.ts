// Policy: testid-liveness (UI-Gates-and-Lessons.md §11.5) — the OTHER half of the typed-testid law: a
// `data-testid` a test SELECTS but nothing MINTS. A1 a `getByTestId("x")` / `[data-testid="x"]` consumer no
// producer can emit (the 2026-08-14 draft-cast ghosts: two CTs outlived the runtime deletion and slipped
// every scoped floor); A2 a `TEST_IDS` row no producer spends.
// DECLARED LIMIT: a producer whose value is a runtime expression is invisible — see PRODUCER EVIDENCE.
//
// PRODUCER EVIDENCE (three rules, measured against the whole corpus at mint — 313 consumed values, 0 false
// positives). A testid VALUE counts as produced when:
//   (1) a `data-testid` attribute/property carries it as a LITERAL (in packages/**/src OR tests/** — a CT
//       story is a legitimate producer; `draft-cast` was one until its story stopped rendering it);
//   (2) a `data-testid` TEMPLATE with >= 1 static part could generate it (`engine-launch-${key}`);
//   (3) its registry KEY is mentioned as a string in packages/**/src outside the registry itself — the
//       PROP-INDIRECTION rule. `<FormDialog testKey="adminCreateUserDialog">` stamps the id inside
//       form-dialog.tsx from a prop; the caller's key literal is the only static evidence there is.
// Rule 3 is why a raw dynamic producer (`data-testid={props.id}`) is IGNORED rather than treated as a
// wildcard: a wildcard would absolve every consumer on the tree, and the live indirection is already
// covered by the key it forwards.
//
// FAMILY `testid-liveness` — the shared reader is `lib/testid-registry.ts` (`testIdRegistryRow`,
// `TESTID_REGISTRY_HOME`, `TESTID_REGISTRY_CONST`). Arm A3 of the legacy descriptor — the blindness
// tripwire that reds when that reader yields ZERO rows — SPLIT OUT to `testid-liveness-health` (guide
// §12.6, #1950): it is a whole-tree HARD verdict about one file that must never carry a suppression door,
// while the two arms here are per-occurrence ORDINARY verdicts an author may waive. One authority per
// policy, one family over one reader.
//
// POPULATION PORT: byte-identical. The legacy `scanRoot` was
// `(p.includes("packages/") && p.includes("/src/")) || p.includes("tests/")`; the final population is the
// six `@packages` roots plus `@showcase` (also `packages/<x>/src`, and deliberately NOT a member of
// `@packages`) plus `@tests`. Measured admitted-set equality is recorded in the family test. `scripts/` is
// deliberately OUT — the gate corpus spells `data-testid` in its own examples.
//
// RE-DERIVED 2026-09-20 (lane cb-population-truth, #2488), and DELIBERATELY NOT WIDENED to `@product`.
// "byte-identical" above is an UNDATED claim that stopped being true when `packages/inference/src/` and
// `packages/default-content/src/` landed (the legacy `packages/` + `/src/` predicate matches both, the
// declaration admits neither). It is kept narrow on purpose, and the direction is the reason: this policy's
// population is not only its SUBJECT but its PRODUCER CENSUS — rules (1)–(3) above read producers out of the
// same admitted set — so widening it can only ever ADD producers, and adding producers can only ever make a
// consumer finding disappear. A liveness census gets blinder as it grows, which is the opposite of what a
// widening buys everywhere else. `packages/inference/src/` holds 112 `.ts` files and ZERO `.tsx`, mints no
// DOM and carries no `data-testid`, so the widening would trade a real weakening for no coverage.
// THE ORDINARY DOOR (§3, and the 9/9 base rate): every finding is anchored through `lib/caught-failure.ts`'s
// waiver-anchor contract (`firstAnchor`), which rejects a token carrying a paren, a newline or a solidus —
// exactly the shapes that make a position unwaivable. The reported position is therefore the SELECTED VALUE
// as authored: the quoted string literal for a `getByTestId("x")` or a `[data-testid="x"]` selector, the
// quoted key for `getByTestId(testId("k"))`, and the bare key for a dead registry row. The legacy positions
// were free-form discriminator labels (`{ token: value, offset }` computed by `indexOf`), which the legacy
// engine compared only against the finding's own token; under this contract a position is a SOURCE
// COORDINATE, so they are re-anchored. Marker census: ZERO live `@orb-gate-ignore testid-liveness` markers
// anywhere in the tree (positive control: 4 in `lib/gate-ignore.ts`), so the reconciliation closes 0 = 0 = 0.
//
// Legacy descriptor: `9e2eca320` (`tooling/src/verify/gates/testid-liveness.ts`).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `testid-liveness` descriptor at ccd404f6feb0cdb84adce3d978522f138baadaab, the parent of the conversion `aebf416fc`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `9e2eca320` cited above
// is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations resolve to this
// source. Over the SAME 7,461 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 6,297 and final `population` admits 6,297.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts`
// (virtual) admitted by both; outside `scripts/codemods/__cbbhr_out_rename-roster-participants.ts` (virtual) rejected
// by both.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GatePolicyNodeFindingDetails } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { readStringValue } from "../lib/ast-read.ts";
import { firstAnchor } from "../lib/caught-failure.ts";
import { TESTID_ATTR, TESTID_FN, TESTID_REGISTRY_CONST, TESTID_REGISTRY_HOME, testIdRegistryRow } from "../lib/testid-registry.ts";

const GETTER = "getByTestId";
/** A `[data-testid="x"]` fragment anywhere inside a selector string (the `locator()` consumer shape). */
const SELECTOR_RE = /\[data-testid=["']?(?<value>[\w-]+)["']?\]/gu;
/** What a registry KEY looks like, so rule 3 can gather candidate mentions before the registry is read
 *  (walk order is file order — the registry may be visited last). Intersected with the real keys in `evaluate`. */
const KEY_SHAPE_RE = /^[a-z][A-Za-z0-9]{2,39}$/u;
/** Rule 3 gathers key mentions from PACKAGE SOURCES only: a key literal in a TEST is the test's own business
 *  (a consumer must never absolve itself), and the registry's own rows are declarations, not evidence. */
const PACKAGE_SRC_RE = /^packages\/[^/]+\/src\//u;
/** A template producer needs this many authored characters of its own, or its pattern matches everything. */
const MIN_TEMPLATE_STATIC_CHARS = 2;

const MESSAGE =
  "dead test-id (UI-Gates-and-Lessons.md §11.5) — A1: a test selects a `data-testid` NOTHING on the tree " +
  "mints, so the assertion cannot pass on the element it names (it fails late, or a `.or()`/negative " +
  "assertion passes falsely); A2: a `TEST_IDS` row no component spends, a typed promise of a selector that " +
  "does not exist.";
const FIX =
  'stamp the id on the element the test means (`data-testid={testId("key")}`), or retire the assertion ' +
  "with the surface it outlived — and delete the registry row when its last producer goes. For a deliberate " +
  "exception, write an adjacent `@orb-waive testid-liveness(<position>): <reason + end condition>` — the " +
  'position is the SELECTED VALUE exactly as authored, quotes included (`"draft-cast"`, `"ghostRow"`, ' +
  "`'[data-testid=\"ghost-row\"]'`), and for a dead registry row it is the bare KEY (`ghostRow`).";

interface ValueSite {
  readonly value: string;
  readonly node: Node;
  readonly anchor: Node;
}
interface KeySite {
  readonly key: string;
  readonly node: Node;
  readonly anchor: Node;
}
interface RegistryRow {
  readonly value: string;
  readonly node: Node;
  readonly anchor: Node;
}

/** Producer patterns are DERIVED from template producers: static parts anchored, `${…}` holes widened.
 *  A template with no static part of its own would match everything, so it is dropped rather than trusted. */
function templatePattern(node: Node): RegExp | undefined {
  const template = node.asKind(SyntaxKind.TemplateExpression);
  if (template === undefined) {
    return;
  }
  const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const head = template.getHead().getLiteralText();
  const parts: string[] = [literal(head)];
  let staticChars = head.length;
  for (const span of template.getTemplateSpans()) {
    const tail = span.getLiteral().getLiteralText();
    staticChars += tail.length;
    parts.push(".+", literal(tail));
  }
  return staticChars >= MIN_TEMPLATE_STATIC_CHARS ? new RegExp(`^${parts.join("")}$`, "u") : undefined;
}

/** The literal key ARGUMENT of a `testId("key")` call — the typed producer/consumer shape. */
function testIdCallArgument(node: Node): Node | undefined {
  const call = node.asKind(SyntaxKind.CallExpression);
  if (call === undefined || call.getExpression().getText() !== TESTID_FN) {
    return;
  }
  const first = call.getArguments()[0];
  return first === undefined || readStringValue(first) === undefined ? undefined : first;
}

/** The value expression of a `data-testid` JSX attribute — the bare string, or what the braces hold. */
function attributeValue(node: Node): Node | undefined {
  const attribute = node.asKind(SyntaxKind.JsxAttribute);
  if (attribute === undefined || attribute.getNameNode().getText() !== TESTID_ATTR) {
    return;
  }
  const init = attribute.getInitializer();
  return init !== undefined && init.isKind(SyntaxKind.JsxExpression) ? init.getExpression() : init;
}

/** The waiver position, through the repo's ONE anchor contract. `undefined` lets the runtime derive one
 *  rather than THROW (`report.node` validates a supplied token against the node text at its offset). */
function anchorDetails(reported: Node, anchor: Node, message: string): GatePolicyNodeFindingDetails {
  const position = firstAnchor(reported, [anchor]);
  return position === undefined ? { message, fix: FIX } : { ...position, message, fix: FIX };
}

export const gate = defineGate({
  id: "testid-liveness",
  family: "testid-liveness",
  authority: "ordinary",
  severity: "error",
  // Cross-file by construction: the producer of a testid is almost never in the file that selects it.
  population: ["@packages", "@showcase", "@tests"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const exactProducers = new Set<string>();
    const patternProducers: RegExp[] = [];
    const producerKeys = new Set<string>();
    /** Rule-3 candidates: every key-SHAPED string literal authored in packages/**\/src outside the registry. */
    const mentionCandidates = new Set<string>();
    const consumerValues: ValueSite[] = [];
    const consumerKeys: KeySite[] = [];
    /** The live registry, read off its own AST through the family reader: key → value + the A2 anchor. */
    const registry = new Map<string, RegistryRow>();

    const recordProducerValue = (expr: Node | undefined): void => {
      if (expr === undefined) {
        return;
      }
      const literal = readStringValue(expr);
      if (literal !== undefined) {
        exactProducers.add(literal);
        return;
      }
      const keyArgument = testIdCallArgument(expr);
      if (keyArgument !== undefined) {
        producerKeys.add(readStringValue(keyArgument) as string);
        return;
      }
      const pattern = templatePattern(expr);
      if (pattern !== undefined) {
        patternProducers.push(pattern);
      }
    };

    const visitPropertyAssignment = (node: Node, rel: string): void => {
      const assignment = node.asKind(SyntaxKind.PropertyAssignment);
      if (assignment === undefined) {
        return;
      }
      if (assignment.getName().replace(/^["']|["']$/gu, "") === TESTID_ATTR) {
        recordProducerValue(assignment.getInitializer());
        return;
      }
      if (rel !== TESTID_REGISTRY_HOME) {
        return;
      }
      const row = testIdRegistryRow(node);
      if (row !== undefined) {
        registry.set(row.key, { value: row.value, node: row.assignment, anchor: row.name });
      }
    };

    const visitCallExpression = (node: Node): void => {
      const call = node.asKind(SyntaxKind.CallExpression);
      if (call === undefined) {
        return;
      }
      const callee = call.getExpression().getText();
      if (!(callee === GETTER || callee.endsWith(`.${GETTER}`))) {
        return;
      }
      const first = call.getArguments()[0];
      if (first === undefined) {
        return;
      }
      const literal = readStringValue(first);
      if (literal !== undefined) {
        consumerValues.push({ value: literal, node: call, anchor: first });
        return;
      }
      const keyArgument = testIdCallArgument(first);
      if (keyArgument !== undefined) {
        consumerKeys.push({ key: readStringValue(keyArgument) as string, node: call, anchor: keyArgument });
      }
    };

    const visitStringLike = (node: Node, rel: string): void => {
      const text = readStringValue(node);
      if (text === undefined) {
        return;
      }
      for (const match of text.matchAll(SELECTOR_RE)) {
        const value = match.groups?.["value"];
        if (value !== undefined) {
          consumerValues.push({ value, node, anchor: node });
        }
      }
      if (rel !== TESTID_REGISTRY_HOME && PACKAGE_SRC_RE.test(rel) && KEY_SHAPE_RE.test(text)) {
        mentionCandidates.add(text);
      }
    };

    /** Fold the two KEYED producer rules (a `testId("k")` stamp, a rule-3 key mention) into the exact set,
     *  once the whole walk has read the registry — walk order is file order, so this cannot happen earlier. */
    const resolveKeyedProducers = (): void => {
      for (const key of [...producerKeys, ...mentionCandidates]) {
        const row = registry.get(key);
        if (row !== undefined) {
          exactProducers.add(row.value);
        }
      }
    };

    const isProduced = (value: string): boolean => exactProducers.has(value) || patternProducers.some((re) => re.test(value));

    /** A1 — every consumer whose value nothing on the tree can mint, in all three spellings. */
    const reportDeadConsumers = (): void => {
      for (const { value, node, anchor } of consumerValues) {
        if (!isProduced(value)) {
          ctx.report.node(node, anchorDetails(node, anchor, `${MESSAGE} A1: nothing on the tree mints the test-id "${value}" this selector names.`));
        }
      }
      for (const { key, node, anchor } of consumerKeys) {
        const row = registry.get(key);
        // An unknown KEY is tsc's job (`TestIdKey` is a closed union) — this arm only judges liveness.
        if (row !== undefined && !isProduced(row.value)) {
          ctx.report.node(
            node,
            anchorDetails(node, anchor, `${MESSAGE} A1: the registry row "${key}" promises "${row.value}", which nothing on the tree mints.`),
          );
        }
      }
    };

    /** A2 — a typed row promising a selector no component stamps. */
    const reportDeadRegistryRows = (): void => {
      for (const [key, row] of registry) {
        if (!isProduced(row.value)) {
          ctx.report.node(
            row.node,
            anchorDetails(row.node, row.anchor, `${MESSAGE} A2: the registry row "${key}" promises "${row.value}", which no component stamps.`),
          );
        }
      }
    };

    return {
      visitors: [
        {
          kinds: [
            SyntaxKind.JsxAttribute,
            SyntaxKind.PropertyAssignment,
            SyntaxKind.CallExpression,
            SyntaxKind.StringLiteral,
            SyntaxKind.NoSubstitutionTemplateLiteral,
            SyntaxKind.PropertyAccessExpression,
          ],
          visit: (node, sourceFile) => {
            const rel = ctx.relativePath(sourceFile);
            const kind = node.getKind();
            if (kind === SyntaxKind.JsxAttribute) {
              recordProducerValue(attributeValue(node));
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
              const access = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
              if (access.getExpression().getText() === TESTID_REGISTRY_CONST) {
                mentionCandidates.add(access.getName());
              }
              return;
            }
            visitStringLike(node, rel);
          },
        },
      ],
      evaluate: () => {
        // The MEASURED denominator, never the census (§12.3): the authored files this policy actually walked.
        ctx.receipt({ kind: "population", source: "testid-liveness-corpus", members: ctx.files.length, unresolved: 0 });
        resolveKeyedProducers();
        reportDeadConsumers();
        reportDeadRegistryRows();
      },
    };
  },

  mustFlag: [
    {
      mode: "source",
      files: {
        // A1 — THE FOUNDING SHAPE, replayed: the story stopped rendering `draft-cast` (the R1 draft-runtime
        // deletion, efc4cc2b2) and the two CT assertions on it survived, green under every scoped floor.
        "tests/client/features/character/_ct-stories.tsx": 'export const S = () => <p data-testid="cast-count">2</p>;\n',
        "tests/client/features/character/components/list-pane.ct.tsx":
          'test("cast", async () => {\n  await expect(component.getByTestId("draft-cast")).toHaveText("Azarael");\n});\n',
      },
      expect: { count: 1, token: '"draft-cast"', messageIncludes: "A1: nothing on the tree mints" },
      why: "the founding defect — a CT selecting a testid whose producer was deleted out from under it; the sibling live id in the same story proves the arm is per-VALUE, not per-file. The position is the QUOTED literal (the §3 house convention), which is also the §4.2 identity arm's marker text",
    },
    {
      mode: "source",
      files: {
        // A1 through the SELECTOR spelling — same defect, written as a locator string.
        "tests/client/features/chat/header.ct.tsx": "const row = page.locator('[data-testid=\"ghost-row\"]');\n",
      },
      expect: { count: 1, token: "'[data-testid=\"ghost-row\"]'", messageIncludes: "A1: nothing on the tree mints" },
      why: 'the `[data-testid="x"]` locator spelling of a consumer — a getByTestId-only reader would call this file clean. The anchor is the whole selector literal, because the VALUE inside it is not separately addressable by the marker grammar',
    },
    {
      mode: "source",
      files: {
        // A2 — a registry row nothing stamps. Its KEY is mentioned only in a TEST, which must not absolve
        // it (rule 3 gathers evidence from packages/**/src only: a consumer cannot license itself).
        [TESTID_REGISTRY_HOME]: 'export const TEST_IDS = {\n  ghostRow: "ghost-row",\n} as const;\n',
        "tests/client/x.ct.tsx": 'const row = page.getByTestId(testId("ghostRow"));\n',
      },
      // Two findings: the dead row AND the CT that selects through it.
      expect: { count: 2 },
      why: 'A2 — a typed row promising a selector no component mints, plus the typed CONSUMER of that row: `testId("k")` is tsc-valid and still selects nothing. The two findings carry DIFFERENT positions (`"ghostRow"` quoted at the consumer, bare `ghostRow` at the row) so each is separately waivable',
    },
    {
      mode: "source",
      files: {
        [TESTID_REGISTRY_HOME]: 'export const TEST_IDS = {\n  ghostRow: "ghost-row",\n} as const;\n',
      },
      expect: { count: 1, token: "ghostRow", messageIncludes: "A2: the registry row" },
      why: "A2 ALONE, with no consumer in the fileset: the dead ROW is a finding on its own, anchored on the bare key. This row is what dies if the A2 loop is deleted, and it pins the position the waiver spelling in `fix` promises",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        // The normal shape: the CT selects what the story stamps.
        "tests/client/features/character/_ct-stories.tsx": 'export const S = () => <p data-testid="draft-cast">Azarael</p>;\n',
        "tests/client/features/character/components/list-pane.ct.tsx":
          'test("cast", async () => {\n  await expect(component.getByTestId("draft-cast")).toHaveText("Azarael");\n});\n',
      },
      why: "a live producer/consumer pair, the producer being a CT STORY — stories mint ids for their own harness and are first-class producers. Cutting the `tests/` root out of the population turns this row RED",
    },
    {
      mode: "source",
      files: {
        // Rule 3 — the PROP-INDIRECTION that carries most of the real registry: the id is stamped inside a
        // shared component from a prop, and the caller's key literal is the only static evidence.
        [TESTID_REGISTRY_HOME]: 'export const TEST_IDS = {\n  adminCreateUserDialog: "admin-create-user-dialog",\n} as const;\n',
        "packages/client/src/components/form-dialog.tsx":
          "export const FormDialog = ({ testKey }: { testKey: string }) => <div data-testid={testId(testKey)} />;\n",
        "packages/client/src/features/user-admin/components/create-user.tsx": 'export const C = () => <FormDialog testKey="adminCreateUserDialog" />;\n',
        "tests/client/features/user-admin/create-user.ct.tsx": 'const d = page.getByTestId("admin-create-user-dialog");\n',
      },
      why: "DECLARED LIMIT made a written baseline: `data-testid={testId(testKey)}` is a dynamic producer this reader cannot evaluate — the caller's key mention is what keeps it honest instead of false-positive. Opening the rule-3 PACKAGE_SRC fence changes nothing here; NARROWING it (dropping rule 3) reds this row twice",
    },
    {
      mode: "source",
      files: {
        // Rule 2 — a TEMPLATE producer covers the family it generates.
        "packages/client/src/features/user-admin/components/engine-launch-config.tsx":
          "export const C = ({ k }: { k: string }) => <div data-testid={`engine-launch-${k}`} />;\n",
        "tests/client/features/user-admin/engine.ct.tsx": 'const f = page.getByTestId("engine-launch-genModel");\n',
      },
      why: "a template producer with a static prefix generates a whole family — treating it as unresolvable would false-positive every consumer of the family. Dropping the template rule reds this row",
    },
    {
      mode: "source",
      files: {
        // A dynamic CONSUMER (a parameterized helper) is not a value claim at all — nothing to judge.
        "tests/ui/primitives/badge/badge.ct.tsx": "const read = (page: Page, testid: string) => page.getByTestId(testid);\n",
      },
      why: "a consumer whose value is a variable makes no claim this gate can check — it must be silent, not guess",
    },
    {
      mode: "source",
      files: {
        // The prose false positive the SELECTOR reader must not take: a doc-comment mentioning the shape.
        "packages/client/src/lib/notes.ts": 'export const note = "select the row with [data-testid=list-row] once the pane mints it";\n',
        "packages/ui/src/primitives/list-row/list-row.tsx": 'export const ListRow = () => <div data-testid="list-row" />;\n',
      },
      why: "the unquoted selector spelling IS read as a consumer (it is the same claim), so the value must be live — this row pins that a real producer answers it rather than the reader being narrowed to quotes. It also proves the `@ui` root is in the population: drop it and the producer disappears",
    },
    {
      mode: "source",
      files: {
        // The rule-3 SELF-ABSOLUTION fence, from the other side: a key mention inside a PACKAGE source is
        // evidence, and this row is what dies if that fence is opened to `tests/`.
        [TESTID_REGISTRY_HOME]: 'export const TEST_IDS = {\n  ghostRow: "ghost-row",\n} as const;\n',
        "packages/client/src/features/a/components/a.tsx": 'export const A = () => <FormDialog testKey="ghostRow" />;\n',
      },
      why: "rule 3 in the ADMITTING direction: a key literal in packages/**/src licenses the row, so no finding. Together with mustFlag[2] (the same key mentioned only from a test, which still flags) this pair is what enforces the PACKAGE_SRC fence in BOTH directions",
    },
  ],
});
