// Policy: scrubber-home (security — the §3.6 member-strip trust boundary; ed2aafc5 "the cold-scrubber
// leak"). The hidden-span stream scrubber (`@orb/kit/content::createHiddenSpanStreamScrubber`) is STATEFUL
// over a slot's whole stream: a scrubber constructed anywhere but the producer stamp cold-starts mid-stream,
// and a reader that begins — or resumes — while a `<lie …/>` open is in flight sees no `<` in the tail and
// forwards the secret's bytes (worse, the withheld-open stall is an ORACLE telling a member exactly when to
// reconnect). Per-subscription scrub state cannot survive replay→live handoffs; the producer stamp is the
// ONE home, and REACHING for the factory — importing it or calling it — outside that home is the breach.
//
// IDENTITY, NOT SPELLING: the legacy call arm matched the callee's TEXT against the symbol name, which the
// module's own header called out as a declared blind spot (an aliased import hid the call arm) and which
// false-reds any same-named local. Both arms now resolve through the shared sealed-origin reader, so an
// alias, a namespace member, a computed-literal member and a barrel re-export are the same factory, while a
// same-named export of another module provably is not.
//
// AUTHORITY IS reviewed-grant: the producer stamp is a recurring repository PERMISSION, one exact
// `(subject, operation)` row in the central table, and its liveness is that row's own STALE alarm — the day
// the stamp moves or stops constructing a scrubber, the row is consumed zero times and says so. That is the
// legacy MODE A arm for the producer home, owned centrally.
//
// THE LEGACY `packages/kit/src/content/` ROW IS DELETED, NOT TRANSLATED. Under identity resolution the kit
// module DECLARES the factory and neither imports nor calls it, so it produces no finding and the row would
// license nothing — the legacy call arm only bit there because it matched a NAME. What that row was really
// protecting is the DEFINITION home's liveness, which is a completeness claim rather than a permission and
// is therefore a hard sibling policy of its own: `scrubber-factory-home`, same family.
//
// FAMILY `scrubber-home` — the shared computation is this file's `SCRUBBER_SYMBOL` + `SCRUBBER_HOME`
// declaration home, which `scrubber-factory-home` re-states as its own `HOME_INFIX` because the two halves
// of one trust boundary must name the SAME directory or the completeness sibling stops covering the
// reference policy. The split is by AUTHORITY (reviewed-grant permission vs hard completeness), which the
// contract requires to be two policy ids under one `family` string. The sealed-origin reader underneath
// (`lib/sealed-origin.ts`) is a corpus-wide primitive, not what makes these two a family.
// POPULATION PORT: intentional correction, stated. The legacy descriptor filtered `PACKAGES_SRC.test('/' + p)`
// where `PACKAGES_SRC = /\/packages\/[^/]+\/src\//` (`9808b93c0^:101`) — ANY workspace package's `src`. The
// final population is `@packages`, the explicit SIX-root list, which does not admit
// `packages/showcase-plugins/src/` (the `@showcase` root added 2026-09-11). One directory narrower, and it
// is the standing `@packages`-vs-`@authored` boundary question (contract/population.ts, #1980), not a
// decision taken here. The kit DEFINITION home stays IN the population on both sides — the legacy row that
// excused it is deleted, and judging that directory is `scrubber-factory-home`'s whole job.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `scrubber-home` descriptor at 123b36f453318217b33a76d6e7ffb0ff15288f06, the parent of the conversion `9808b93c0`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,219 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 3,372
// and final `population` admits 3,371. legacy − final = {`packages/showcase-plugins/src/index.ts`} — the one source
// of an authored package outside the declared composite roots (`@showcase` is not in `@authored`/`@packages`, #1980,
// `contract/population.ts`); a one-file NARROWING. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `scripts/codemods/__cbbhr_out_rename-roster-participants.ts` (virtual) rejected by both.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { readSealedOrigin, sealedOriginReports } from "../lib/sealed-origin.ts";

const SCRUBBER_SYMBOL = "createHiddenSpanStreamScrubber";
const OPERATION = "hidden-span-scrubber-construction";

/** The factory's declaration home — the kit content module, keyed as the DIRECTORY so an internal split
 *  cannot silently retire the arm. */
const SCRUBBER_HOME: SealedHome = { pathInfix: "/packages/kit/src/content/", exportedNames: new Set([SCRUBBER_SYMBOL]) };

const MESSAGE =
  "the hidden-span stream scrubber is reached outside its producer home — per-subscription scrub state " +
  "cannot survive replay→live handoffs (a cold scrubber mid-`<lie>` forwards the secret's tail; ed2aafc5), " +
  "and the producer stamp domain/chat/substrate/member-visibility.ts is the ONE construction home.";
const FIX =
  "read the already-stamped `memberText` (createMemberDeltaStamper, domain/chat/substrate/member-visibility.ts) — a read seam is a STATELESS field read; never build a scrubber of your own.";

/** THE CANDIDATE PREFILTER: the import specifier (whose `getName()` is the exported name even under an
 *  alias), a member read spelled with the exported name, and a call whose callee is either. */
function candidate(node: MorphNode): MorphNode | undefined {
  if (Node.isImportSpecifier(node)) {
    return node.getName() === SCRUBBER_SYMBOL ? node : undefined;
  }
  if (Node.isCallExpression(node)) {
    const callee = node.getExpression();
    return Node.isIdentifier(callee) && callee.getText() === SCRUBBER_SYMBOL ? callee : undefined;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return;
  }
  const member = readMemberReference(node);
  return member.kind === "resolved" && member.value.name === SCRUBBER_SYMBOL ? node : undefined;
}

export const gate = defineGate({
  id: "scrubber-home",
  family: "scrubber-home",
  authority: "reviewed-grant",
  severity: "error",
  population: "@packages",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const reachers = new Map<string, MorphNode>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node, sourceFile: SourceFile) => {
            const anchor = candidate(node);
            if (anchor === undefined || !sealedOriginReports(readSealedOrigin(anchor, SCRUBBER_HOME), anchor)) {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            // ONE finding per carrier: the producer stamp imports the factory AND calls it twice, and a
            // reviewed grant licenses one `(subject, operation)` — three findings would make its row
            // OVER-BROAD and license none of them.
            if (!reachers.has(subject)) {
              reachers.set(subject, anchor);
            }
          },
        },
      ],
      evaluate: () => {
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
      why: "the founding shape — a per-subscription scrubber in transport, the exact cold-scrubber reconnect leak ed2aafc5 closed; import and call are ONE finding at the grant's granularity",
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
