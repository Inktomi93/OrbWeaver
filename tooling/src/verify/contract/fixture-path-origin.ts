import type { CallExpression, Identifier, Node } from "ts-morph";

/** The one unreadable verdict every fixture-path reader produces, and the finite authored-string fact the
 *  record reader answers with. They live HERE rather than beside the reader that mints them because they
 *  cross `lib/fixture-path-authored-record.ts` → `lib/fixture-path-origin.ts`, and an exported shape has one
 *  home by who needs it (`no-inline-types`; Spine-TypeScript-and-Patterns.md §7.4). */
export interface FixtureAuthoredValueUnreadable {
  readonly kind: "unreadable";
  readonly carrier: Node;
  readonly detail: string;
}
export type FixtureAuthoredStringFact = { readonly kind: "values"; readonly values: readonly string[] } | FixtureAuthoredValueUnreadable;

/** A path-bearing filesystem operand's statically proven root. */
export type FixturePathOrigin =
  | { readonly kind: "scratch"; readonly carrier: Node }
  | { readonly kind: "checkout"; readonly carrier: Node }
  | { readonly kind: "unreadable"; readonly carrier: Node; readonly detail: string };

/** Invocation-local collector/reader. Calls and identifiers are delivered by the shared policy walk. */
export interface FixturePathOriginReader {
  readonly visitCall: (call: CallExpression) => void;
  readonly visitIdentifier: (identifier: Identifier) => void;
  /** Only a statically proven read-only flag set returns true; an unreadable flag stays mutation-capable. */
  readonly isReadOnlyOpen: (call: CallExpression) => boolean;
  readonly read: (node: Node) => FixturePathOrigin;
  /** Judge the prefix as mkdtemp's created-directory SIBLING rather than as an ordinary destination path. */
  readonly readMkdtempPrefix: (node: Node) => FixturePathOrigin;
}
