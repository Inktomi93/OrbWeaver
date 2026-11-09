// Read shape: each non-suspending read call as a loading ladder, a gated read that wants skipToken, or a background read.
// Law: a read that shows loading or error is `useSuspenseQuery` inside `QueryBoundary`, never a bare state ladder.
// `useGatedQuery` and `useDecisionQuery` return a `UseQueryResult` (packages/client/src/data/use-gated-query.ts), so they never
// suspend and are classified like `useQuery`.
import ts from "typescript";
import type { Source } from "../eslint/index.ts";
import { lineOf, visit } from "../eslint/index.ts";
import type { Cohort, Member } from "../floor/verdict/cohort-compare.ts";
import { anyNode, enclosingFunction, hasProperty, resultBinding } from "./syntax.ts";

const STATE_FLAGS = new Set(["isPending", "isLoading", "isError", "isLoadingError", "status"]);
const COUNTED = ["useQuery", "useQueries", "useGatedQuery", "useDecisionQuery", "useSuspenseQuery"] as const;
type Counted = (typeof COUNTED)[number];
const CLASSIFIED: ReadonlySet<Counted> = new Set<Counted>(["useQuery", "useQueries", "useGatedQuery", "useDecisionQuery"]);
const QUERY_MODULE = "@tanstack/react-query";

export interface ReadScan {
  readonly counts: Readonly<Record<Counted, number>>;
  readonly files: number;
}

const isCounted = (name: string): name is Counted => (COUNTED as readonly string[]).includes(name);

/** The hook a callee names: a bare name, `useQ` imported as `useQuery as useQ`, or `rq.useQuery` on a namespace import of the query module. */
function calleeResolver(sf: ts.SourceFile): (callee: ts.Expression) => Counted | null {
  const aliases = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const statement of sf.statements) {
    const clause =
      ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === QUERY_MODULE
        ? statement.importClause
        : undefined;
    const bindings = clause?.namedBindings;
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    }
    for (const specifier of bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements : []) {
      aliases.set(specifier.name.text, (specifier.propertyName ?? specifier.name).text);
    }
  }
  const nameOf = (callee: ts.Expression): string | null => {
    if (ts.isIdentifier(callee)) {
      return aliases.get(callee.text) ?? callee.text;
    }
    return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text) ? callee.name.text : null;
  };
  return (callee) => {
    const name = nameOf(callee);
    return name !== null && isCounted(name) ? name : null;
  };
}

function functionName(fn: ts.Node, sf: ts.SourceFile): string {
  if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name !== undefined) {
    return fn.name.text;
  }
  return ts.isVariableDeclaration(fn.parent) ? fn.parent.name.getText(sf) : "?";
}

const isFlagRead = (node: ts.Node, names: ReadonlySet<string>): boolean =>
  ts.isPropertyAccessExpression(node) && STATE_FLAGS.has(node.name.text) && readsResult(node.expression, names);

/** The expression is a result: a bound name, `rows[0]`, or a parameter of a callback handed to a method of a bound name (`rows.some((row) => row.isPending)`). */
function readsResult(expression: ts.Expression, names: ReadonlySet<string>): boolean {
  if (ts.isElementAccessExpression(expression)) {
    return readsResult(expression.expression, names);
  }
  if (!ts.isIdentifier(expression)) {
    return false;
  }
  if (names.has(expression.text)) {
    return true;
  }
  return anyNode(enclosingFunction(expression), (node) => {
    const callback = ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === expression.text ? node.parent : undefined;
    const call = callback?.parent;
    return (
      call !== undefined &&
      ts.isCallExpression(call) &&
      ts.isPropertyAccessExpression(call.expression) &&
      ts.isIdentifier(call.expression.expression) &&
      names.has(call.expression.expression.text)
    );
  });
}

/** The names a `useQueries` result is held under: the whole array, each element of an array pattern, and the flags destructured from one. */
function queriesBinding(call: ts.CallExpression): { readonly names: ReadonlySet<string>; readonly destructured: readonly string[] } {
  const parent = call.parent;
  if (!ts.isVariableDeclaration(parent)) {
    return { names: new Set(), destructured: [] };
  }
  if (ts.isIdentifier(parent.name)) {
    return { names: new Set([parent.name.text]), destructured: [] };
  }
  const names = new Set<string>();
  const destructured: string[] = [];
  for (const element of ts.isArrayBindingPattern(parent.name) ? parent.name.elements : []) {
    if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
      names.add(element.name.text);
    } else if (ts.isBindingElement(element) && ts.isObjectBindingPattern(element.name)) {
      destructured.push(...element.name.elements.map((inner) => (inner.propertyName ?? inner.name).getText()));
    }
  }
  return { names, destructured };
}

/** Reads the call's result through a state flag: `const { isPending } = useQuery()`, `q.isError` on `const q = useQuery()`, or a flag on a `useQueries` element or its `combine`. */
function readsState(call: ts.CallExpression, hook: Counted): boolean {
  if (hook === "useQueries") {
    const { names, destructured } = queriesBinding(call);
    const combined = call.arguments.some((argument) => anyNode(argument, (node) => ts.isPropertyAccessExpression(node) && STATE_FLAGS.has(node.name.text)));
    return combined || destructured.some((name) => STATE_FLAGS.has(name)) || anyNode(enclosingFunction(call), (node) => isFlagRead(node, names));
  }
  const binding = resultBinding(call);
  const bound = binding.name;
  return (
    binding.destructured.some((name) => STATE_FLAGS.has(name)) ||
    (bound !== null &&
      anyNode(
        enclosingFunction(call),
        (node) => ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === bound && STATE_FLAGS.has(node.name.text),
      ))
  );
}

function mentionsSkipToken(call: ts.CallExpression): boolean {
  return call.arguments.some((argument) => anyNode(argument, (node) => ts.isIdentifier(node) && node.text === "skipToken"));
}

function shapeOf(call: ts.CallExpression, hook: Counted): string {
  const enabled = hasProperty(call.arguments[0], "enabled");
  if (readsState(call, hook)) {
    return enabled ? "ladder+enabled" : "ladder";
  }
  if (enabled) {
    return "enabled-gate";
  }
  return mentionsSkipToken(call) ? "skipToken" : "background";
}

const VOID_INPUT_GATE =
  "a boolean gate on a void-input read stays `enabled`: `useGatedQuery` gates on a null id, and a stand-in id is the sentinel it kills (UI-Primitives-and-Reuse.md §13.1)";
const WARM_KEY_GATE = "its gated-off arm reads the warm cache on the real key, which `enabled: false` keeps and skipToken drops";
const NON_SUSPENSE_PROBE = "a non-suspense probe that must never block its shell (client-architecture-state-and-gates.md §10, the sanctioned exception class)";
const UNAVAILABLE_FIRST_READ = "a non-suspending pane's first read settles through `QueryUnavailableState` (packages/client/src/data/query-error-state.tsx)";

// Each read the census flags that a ruling keeps, by the file that holds it.
const READ_SHAPE_KEPT_SITES: Readonly<Record<string, string>> = {
  "packages/client/src/data/use-gated-query.ts": "the one home of the skipToken gate (client-architecture-state-and-gates.md §10, `use-gated-query.ts`)",
  "packages/client/src/components/use-embedder-rebuild.ts": `${VOID_INPUT_GATE}; the per-kind reads are one useQueries call`,
  "packages/client/src/data/use-plugin-macro-planes.ts": `${VOID_INPUT_GATE}; a macro surface completes before the read lands (use-plugin-macro-planes.ts header)`,
  "packages/client/src/features/config/hooks/use-modified-sections.ts": `${VOID_INPUT_GATE}; the admin read is a role-gated ${NON_SUSPENSE_PROBE}`,
  "packages/client/src/components/tag-picker-dialog.tsx": `${VOID_INPUT_GATE}; the QueryBoundary beside the field owns loading and failure (tag-picker-dialog.tsx header)`,
  "packages/client/src/features/chat/components/chat-import-dialog.tsx": `${VOID_INPUT_GATE}; it warms the Memory switch while open (chat-import-dialog.tsx \`ChatImportDialog\` ruling)`,
  "packages/client/src/components/editable-tag-chip.tsx": `${WARM_KEY_GATE}: a closed chip names its tag from the warm library (editable-tag-chip.tsx header)`,
  "packages/client/src/features/chat/components/member-card-viewer.tsx": `${WARM_KEY_GATE}: the dialog shell keeps the card's name through its close; the QueryBoundary below owns loading and failure (member-card-viewer.tsx \`MemberCardViewer\` ruling)`,
  "packages/client/src/features/chat/surfaces/message-list-surface.tsx": `${WARM_KEY_GATE}: the context-fit divider holds its last fit while a live turn pauses the read, and never blocks the transcript (message-list-surface.tsx \`ChatThread\` previewFit ruling)`,
  "packages/client/src/features/user-admin/components/about-section.tsx":
    "the update check is manual: `enabled: false` plus `refetch()`, which a skipped query cannot run (about-section.tsx header; use-gated-query.ts header)",
  "packages/client/src/features/character/hooks/use-library-scope.ts": `${WARM_KEY_GATE}; its settled read is the referential authority for persisted tag ids (client-architecture-state-and-gates.md §10a, rule 2)`,
  "packages/client/src/data/use-session-recovery.ts": `the identity read runs the durable-local bind before the workspace mounts, so it is ${NON_SUSPENSE_PROBE} (use-session-recovery.ts header)`,
  "packages/client/src/features/app-shell/hooks/use-selected-theme.ts": `both theme reads hold boot readiness until they settle and degrade to the default palette: ${NON_SUSPENSE_PROBE} (use-selected-theme.ts header)`,
  "packages/client/src/features/chat/hooks/use-credit-connections.ts": `its failure feeds the composer's refusal line, which states it (composer-next-turn-line.tsx header): ${NON_SUSPENSE_PROBE}`,
  "packages/client/src/features/chat/components/composer-next-turn-line.tsx": `the line itself says the check failed, under a composer that never suspends (composer-next-turn-line.tsx header): ${NON_SUSPENSE_PROBE}`,
  "packages/client/src/features/chat/lib/home-starter-region.ts":
    "the room list only places a home tile, and a failed or paused list ends the hold in the hearth (home-starter-region.ts `useStarterRegion` remarks)",
  "packages/client/src/features/plugin/hooks/use-extensions-empty.ts": `the switcher must not blank the painted page, so both reads stay non-suspense; ${UNAVAILABLE_FIRST_READ} (use-extensions-empty.ts header)`,
  "packages/client/src/features/databank/surfaces/databank-detail-surface.tsx": `the welcome renders nothing until the census settles, so a section swap holds the outgoing view; ${UNAVAILABLE_FIRST_READ} (databank-detail-surface.tsx \`DatabankWelcome\` ruling)`,
  "packages/client/src/features/preset/components/preset-library-welcome.tsx":
    "the pane must not suspend on a fact that only changes its wording; the flag sets `data-ready` only (preset-library-welcome.tsx `PresetLibraryWelcome` ruling)",
  "packages/client/src/features/roster-preset/hooks/use-saved-rosters.ts":
    "the capture status disables and explains one affordance, with its retry, inside a mounted picker (use-saved-rosters.ts `RosterRuleCapture`; .claude/rules/ui-and-client.md, Empty, disabled and degraded states)",
  "packages/client/src/features/chat/components/chat-documents-section.tsx":
    "an unreadable slot settles as `unknown`, which withholds the warning without claiming its opposite (chat-documents-section.tsx `useSlotState` ruling)",
  "packages/client/src/features/chat/components/chat-list-character-filter.tsx":
    "the strip stays one instance across its read and reserves its row while pending; the QueryBoundary beside it owns the failure (chat-list-character-filter.tsx `ChatListFacesStrip` ruling)",
  "packages/client/src/features/chat/components/message-cost-readout.tsx":
    "the cost is a paid call a click reveals, and its label states in flight and failure inline (message-cost-readout.tsx header)",
  "packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx":
    "the keyword read is below the fold, so it must not hold the CONTENT boundary; the rail states it pending (corpus-home-surface.tsx `CorpusHomeBody` ruling)",
  "packages/client/src/features/preset/components/logit-bias-editor.tsx":
    "a word lookup is a note beside each row, never a block on the editor (logit-bias-editor.tsx header)",
};

export function buildReadCohort(sources: readonly Source[]): { readonly cohort: Cohort; readonly scan: ReadScan } {
  const members: Member[] = [];
  const counts: Record<Counted, number> = { useQuery: 0, useQueries: 0, useGatedQuery: 0, useDecisionQuery: 0, useSuspenseQuery: 0 };
  let files = 0;
  for (const source of sources) {
    const sf = source.sf;
    if (sf === null || source.layer !== "client") {
      continue;
    }
    files += 1;
    const hookOf = calleeResolver(sf);
    visit(sf, (node) => {
      const hook = ts.isCallExpression(node) ? hookOf(node.expression) : null;
      if (hook === null || !ts.isCallExpression(node)) {
        return;
      }
      counts[hook] += 1;
      if (CLASSIFIED.has(hook)) {
        const label = functionName(enclosingFunction(node), sf);
        members.push({ path: source.path, section: source.section, label, cells: { shape: { value: shapeOf(node, hook), line: lineOf(sf, node) } } });
      }
    });
  }
  return {
    scan: { counts, files },
    cohort: {
      name: "read-shape",
      what: "useQuery, useQueries, useGatedQuery and useDecisionQuery calls: ladder (reads isPending, isLoading or isError), enabled (wants useGatedQuery and skipToken), skipToken, background",
      columns: ["shape"],
      defects: { shape: ["ladder", "ladder+enabled", "enabled-gate"] },
      keptSites: { shape: READ_SHAPE_KEPT_SITES },
      basis: { shape: "heuristic" },
      members,
    },
  };
}
