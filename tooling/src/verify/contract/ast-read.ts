// The shapes lib/ast-read.ts's readers RETURN. Homed here (not beside the reader) because the five-slot
// template puts every exported shape in contract/ (docs/architecture/core/Core-Tooling-Law.md §2.5) and
// `no-inline-types` enforces it; lib/ast-read.ts is the machine, this is its vocabulary.
import type { ObjectLiteralExpression } from "ts-morph";

/** The result of asking "what OBJECT LITERAL does this authored definition denote?" — the SHAPE question
 *  behind every co-located-definition gate (#944). It answers the shape only; whether a shape is a
 *  SANCTIONED authoring form is each gate's own law, decided at the call site.
 *
 *  `unresolved` exists so that "I could not read this" is a VALUE a gate must handle, never a `continue`.
 *  Silently returning from discovery is how a definition moves behind an import while the gate's
 *  duplicate-id, reachability and honesty arms stop seeing it — and the file still sits at its sanctioned
 *  path, so every co-location check stays green
 *  (docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md). */
export type ObjectLiteralRead = { readonly kind: "object"; readonly object: ObjectLiteralExpression } | { readonly kind: "unresolved"; readonly shape: string };
