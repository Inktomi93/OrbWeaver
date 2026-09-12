// The ONE reader behind the `testid-liveness` family (#1584 split of the legacy mixed-hook descriptor): the
// typed test-id registry — which KEY promises which DOM value, read off the registry's own AST.
//
// Two consumers, one reader: `testid-liveness` (the ordinary dead-consumer/dead-row policy) judges liveness
// against these rows, and `testid-liveness-health` (the hard tripwire) proves the read itself still yields
// rows. A tripwire that derived the registry its own way could report healthy about a shape the liveness
// policy cannot read, which is the exact no-op both arms exist to make impossible.
//
// The registry is keyed BY PATH and its const BY NAME, which is why the tripwire exists at all; both
// coordinates live here so the two policies cannot drift on either.
import type { Node, PropertyAssignment } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { readStringValue } from "./ast-read.ts";

/** The registry's home, repo-relative. Also `testid-liveness-health`'s entire population. */
export const TESTID_REGISTRY_HOME = "packages/client/src/lib/test-ids.ts";
/** The exported const the rows live in — matched BY NAME, which is half of what the tripwire guards. */
export const TESTID_REGISTRY_CONST = "TEST_IDS";
/** The DOM attribute both halves of the law spell. */
export const TESTID_ATTR = "data-testid";
/** The typed accessor: `testId("key")` is both a producer and a consumer spelling. */
export const TESTID_FN = "testId";

/** One row of the typed registry: the key a component/test names, and the DOM value it promises. */
export interface TestIdRegistryRow {
  readonly key: string;
  readonly value: string;
  /** The property assignment itself — the A2 finding's carrier. */
  readonly assignment: PropertyAssignment;
  /** Its name node — the A2 finding's anchor, so the caret lands on the key. */
  readonly name: Node;
}

/** Read one delivered node as a registry row, or `undefined` when it is not one.
 *
 *  NODE-LEVEL by construction: both consumers subscribe `PropertyAssignment` through the shared kind-indexed
 *  walk, so neither needs a descendant walk of its own. The owner is checked by ANCESTOR (a `TEST_IDS`
 *  variable declaration), never by a descendant scan of the file. */
export function testIdRegistryRow(node: Node): TestIdRegistryRow | undefined {
  const assignment = node.asKind(SyntaxKind.PropertyAssignment);
  if (assignment === undefined) {
    return;
  }
  const owner = assignment.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (owner?.getName() !== TESTID_REGISTRY_CONST) {
    return;
  }
  const initializer = assignment.getInitializer();
  const value = initializer === undefined ? undefined : readStringValue(initializer);
  if (value === undefined) {
    return;
  }
  // `getName()` returns the authored text including quotes for a string-literal key, so the stored key is
  // normalized the way `testId("k")` spells it while the ANCHOR stays the authored name node.
  return { key: assignment.getName().replace(/^["']|["']$/gu, ""), value, assignment, name: assignment.getNameNode() };
}
