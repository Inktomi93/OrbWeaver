// Stateful hidden-span scrubbers belong at the producer; a per-reader cold start can expose a hidden tag tail.
// Native declaration identity follows aliases and barrels; unreadable declared doors remain violations.
// The producer construction permission is centrally reviewed (D118).

import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReferenceWithName } from "../../floor/code-facts/reference-fact.ts";
import type { OriginReferenceServices } from "../contract/origin-verdict.ts";
import { defineGate } from "../contract/policy.ts";
import { SCRUBBER_HOME, SCRUBBER_SYMBOL } from "../lib/scrubber-home.ts";
import { possibleSealedReference, prepareSealedReference, readSealedOrigin, sealedOriginReports, sealedReferenceServices } from "../lib/sealed-origin.ts";

const OPERATION = "hidden-span-scrubber-construction";

const MESSAGE =
  "the hidden-span stream scrubber is reached outside its producer home — per-subscription scrub state " +
  "cannot survive replay→live handoffs (a cold scrubber mid-`<lie>` forwards the secret's tail; 808ba09cc6), " +
  "and the producer stamp domain/chat/substrate/member-visibility.ts is the ONE construction home.";
const FIX =
  "read the already-stamped `memberText` (createMemberDeltaStamper, domain/chat/substrate/member-visibility.ts) — a read seam is a STATELESS field read; never build a scrubber of your own.";

/** THE CANDIDATE PREFILTER: the import specifier (whose `getName()` is the exported name even under an
 *  alias), a member read spelled with the exported name, and a call whose callee is either. */
function candidate(node: MorphNode, services: OriginReferenceServices): MorphNode | undefined {
  if (Node.isImportSpecifier(node)) {
    return node.getName() === SCRUBBER_SYMBOL ? node : undefined;
  }
  if (Node.isIdentifier(node)) {
    return node.getText() === SCRUBBER_SYMBOL ? node : undefined;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return;
  }
  const member = readMemberReferenceWithName(node, services.readComputedName);
  return member.kind === "resolved" && member.value.name === SCRUBBER_SYMBOL ? node : undefined;
}

export const gate = defineGate({
  id: "scrubber-home",
  family: "scrubber-home",
  authority: "reviewed-grant",
  severity: "error",
  population: "@product",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const reachers = new Map<string, MorphNode>();
    const pending: MorphNode[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node) => {
            if (
              !(
                possibleSealedReference(node, SCRUBBER_HOME.exportedNames) ||
                (Node.isCallExpression(node) && Node.isIdentifier(node.getExpression()) && node.getExpression().getText() === SCRUBBER_SYMBOL)
              )
            ) {
              return;
            }
            const reference = Node.isCallExpression(node) ? node.getExpression() : node;
            pending.push(reference);
            prepareSealedReference(ctx, reference);
          },
        },
      ],
      evaluate: () => {
        for (const node of pending) {
          const services = sealedReferenceServices(ctx, node);
          const anchor = candidate(node, services);
          if (anchor === undefined || !sealedOriginReports(readSealedOrigin(anchor, SCRUBBER_HOME, services.moduleOrigin), anchor, services.declarations)) {
            continue;
          }
          const subject = ctx.relativePath(node.getSourceFile());
          // ONE finding per carrier: the producer stamp imports the factory AND calls it twice, and a
          // reviewed grant licenses one `(subject, operation)` — three findings would make its row
          // OVER-BROAD and license none of them.
          if (!reachers.has(subject)) {
            reachers.set(subject, anchor);
          }
        }
        for (const [subject, anchor] of [...reachers].toSorted(([left], [right]) => left.localeCompare(right))) {
          ctx.report.node(anchor, { subject, operation: OPERATION, message: `${MESSAGE} Reacher: ${subject}.`, fix: FIX });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "packages/server/src/transport/trpc/leak.ts", operation: "hidden-span-scrubber-construction" },
      files: {
        "packages/kit/src/content/index.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
        "packages/server/src/transport/trpc/leak.ts":
          'import { createHiddenSpanStreamScrubber } from "../../../../kit/src/content/index.ts";\nexport const s = createHiddenSpanStreamScrubber();\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/transport/trpc/leak.ts" },
      why: "the founding shape — a per-subscription scrubber in transport, the exact cold-scrubber reconnect leak 808ba09cc6 closed; import and call are ONE finding at the grant's granularity",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
        "packages/server/src/domain/chat/verbs/aliased.ts":
          'import { createHiddenSpanStreamScrubber as build } from "../../../../../kit/src/content/index.ts";\nexport const s = build();\n',
      },
      expect: { count: 1 },
      why: "THE LEGACY MODULE'S OWN DECLARED BLIND SPOT, closed: an ALIASED import hid the call arm from a name match. The identity is the declaration, so the alias is the same factory",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
        "packages/server/src/domain/chat/verbs/ns.ts":
          'import * as content from "../../../../../kit/src/content/index.ts";\nexport const s = content.createHiddenSpanStreamScrubber();\n',
      },
      expect: { count: 1 },
      why: "A NAMESPACE MEMBER reaches the same factory and produces no import specifier at all",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
        "packages/kit/src/index.ts": 'export { createHiddenSpanStreamScrubber } from "./content/index.ts";\n',
        "packages/server/src/domain/chat/verbs/barrel.ts":
          'import { createHiddenSpanStreamScrubber } from "../../../../../kit/src/index.ts";\nexport const s = createHiddenSpanStreamScrubber();\n',
      },
      expect: { count: 1 },
      why: "A RE-EXPORT through the kit barrel is the same factory — the canonical declaration is still the content module, so the barrel is not a laundry",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/unreadable.ts":
          'import { createHiddenSpanStreamScrubber } from "./missing-barrel.ts";\nexport const s = createHiddenSpanStreamScrubber();\n',
      },
      expect: { count: 1 },
      why: "FAIL-CLOSED at the DECLARED DOOR — a factory import that resolves to nothing is reported; a trust boundary an unreadable barrel can walk through is not one",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\nexport function stripHiddenSpans(text: string): string {\n  return text;\n}\n",
        "packages/server/src/domain/chat/verbs/strip.ts":
          'import { stripHiddenSpans } from "../../../../../kit/src/content/index.ts";\nexport const s = stripHiddenSpans("x");\n',
      },
      why: "the STATELESS at-commit strip from the SAME kit module — a different export, so the seal is about one factory rather than about the module",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
        "packages/server/src/domain/chat/verbs/consume.ts":
          "export function read(stamp: { readonly memberText: string }): string {\n  return stamp.memberText;\n}\n",
      },
      why: "consuming the producer home's already-stamped field is the sanctioned path — only REACHING for the factory is the breach. The kit home in the same fixture declares the factory and neither imports nor calls it, which is why its legacy row licensed nothing",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
        "packages/server/src/domain/chat/lib/local.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\nexport const s = createHiddenSpanStreamScrubber();\n",
      },
      why: "A LOCAL function of exactly the same name — the shape the legacy call arm matched by NAME and red. It is acquitted by the shared refusal classifier (a proven non-module declaration) BEFORE the home comparison is reached, so this row proves the classifier and not the home; the row below proves the home",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
        "packages/server/src/domain/chat/lib/own-factory.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
        "packages/server/src/domain/chat/verbs/foreign.ts":
          'import { createHiddenSpanStreamScrubber } from "../lib/own-factory.ts";\nexport const s = createHiddenSpanStreamScrubber();\n',
      },
      why: "THE HOME COUNTERFACTUAL, and the row that actually exercises the comparison: a GENUINE import specifier and call of a same-named factory that resolves cleanly to a declaration OUTSIDE `kit/src/content/`. Replacing the home comparison with a name comparison turns this row RED",
    },
  ],
});
