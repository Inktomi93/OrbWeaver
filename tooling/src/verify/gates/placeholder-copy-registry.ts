// Policy: placeholder-copy-registry (client-architecture-lockdown.md §6a / §16 G13) — a SectionDefinition's
// `placeholder: { title, description }` gives every rail section its own honest "not built yet" copy. The
// comparison is CROSS-FILE: every section's pair must be non-empty and DISTINCT (the "all sections look
// identical" root cause).
//
// The subject is the shared `registryDefinitionFacts.section` provider, so BOTH sanctioned authoring shapes —
// the annotated const and the `make<X>Section(): SectionDefinition` factory — are one population, and the
// copy is read through the shared authored-value reader. That reader follows a stable alias, so a pair
// written `title: CHARACTERS_SECTION_LABEL` is COMPARED rather than counted as an unreadable skip; the two
// live sections in that shape were outside the legacy comparison entirely.
//
// A placeholder the reader cannot resolve now FAILS CLOSED: an unjudgeable pair is a section whose copy is
// invisible to the distinctness comparison, which is exactly what a re-home behind a builder produces.
import type { ObjectLiteralExpression } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { definitionAnchor, definitionName } from "../lib/registry-definition-anchor.ts";
import { definitionField, definitionObjectField, definitionStringField } from "../lib/registry-definition-field.ts";
import { registryDefinitionFacts } from "../lib/registry-fact.ts";

/** U+241F (SYMBOL FOR UNIT SEPARATOR) cannot appear in copy — an unambiguous (title, description) key. */
const PAIR_SEPARATOR = "␟";

const MESSAGE =
  "a SectionDefinition's placeholder is unreadable, empty, or duplicates another section's — every section's " +
  "placeholder must be a DISTINCT, non-empty (title, description) pair, and a pair this policy cannot resolve is a " +
  "section whose copy is invisible to the comparison entirely (client-architecture-lockdown.md §6a).";
const FIX =
  "write the definition as an authored object literal (or a `make<X>Section(): SectionDefinition` factory returning one) and give the section its own honest, non-empty (title, description) placeholder copy — no two sections share a pair.";

interface Claim {
  readonly name: string;
}

type CopyRead =
  | { readonly kind: "absent" }
  | { readonly kind: "refused"; readonly detail: string }
  | { readonly kind: "pair"; readonly title: string; readonly description: string };

/** One section's declared placeholder copy: absent, refused with its reason, or the resolved pair. */
function readCopy(object: ObjectLiteralExpression): CopyRead {
  const placeholder = definitionObjectField(object, "placeholder");
  if (placeholder === undefined) {
    return { kind: "absent" };
  }
  if (placeholder.kind === "unresolved") {
    return { kind: "refused", detail: `\`placeholder\` — ${placeholder.reason}: ${placeholder.detail}` };
  }
  const parts: string[] = [];
  for (const field of ["title", "description"] as const) {
    const read = definitionStringField(placeholder.value, field);
    if (read === undefined) {
      return definitionField(placeholder.value, field) === undefined
        ? { kind: "refused", detail: `\`placeholder.${field}\` is absent` }
        : { kind: "refused", detail: `\`placeholder.${field}\` is not an authored data property` };
    }
    if (read.kind === "unresolved") {
      return { kind: "refused", detail: `\`placeholder.${field}\` — ${read.reason}: ${read.detail}` };
    }
    parts.push(read.value);
  }
  const [title, description] = parts;
  return title === undefined || description === undefined
    ? { kind: "refused", detail: "placeholder copy did not resolve" }
    : { kind: "pair", title, description };
}

export const gate = defineGate({
  id: "placeholder-copy-registry",
  family: "registry-definitions",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [registryDefinitionFacts.section],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const claimedPairs = new Map<string, Claim>();
    const report = (definition: RegistryDefinitionFact, detail: string): void =>
      ctx.report.node(definition.declaration, { ...definitionAnchor(definition.declaration), message: `${MESSAGE} ${detail}`, fix: FIX });

    const judgePair = (definition: RegistryDefinitionFact, name: string, title: string, description: string): void => {
      if (title.length === 0 || description.length === 0) {
        report(definition, `Empty copy: section "${name}" declares an empty placeholder title or description.`);
        return;
      }
      const key = `${title}${PAIR_SEPARATOR}${description}`;
      const owner = claimedPairs.get(key);
      if (owner === undefined) {
        claimedPairs.set(key, { name });
        return;
      }
      report(definition, `Duplicate copy: section "${name}" has the SAME (title, description) placeholder as "${owner.name}".`);
    };

    const judge = (definition: RegistryDefinitionFact): void => {
      const name = definitionName(definition.declaration);
      if (definition.object.kind === "unresolved") {
        report(definition, `Unreadable definition: section "${name}" — ${definition.object.reason}: ${definition.object.detail}.`);
        return;
      }
      const copy = readCopy(definition.object.value);
      if (copy.kind === "absent") {
        return;
      }
      if (copy.kind === "refused") {
        report(definition, `Unreadable copy: section "${name}" ${copy.detail}.`);
        return;
      }
      judgePair(definition, name, copy.title, copy.description);
    };

    return {
      evaluate: () => {
        const view = ctx.fact(registryDefinitionFacts.section);
        ctx.receipt({ kind: "population", source: view.source, members: view.definitions.length, unresolved: 0 });
        for (const definition of view.definitions) {
          judge(definition);
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: "T", description: "D" } };\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T", description: "D" } };\n',
      },
      expect: { count: 1, token: "bSection", messageIncludes: "Duplicate copy" },
      why: "two sections with the SAME (title, description) — the identical-sparkle duplicate",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: "" as string, description: "D" } };\n',
      },
      expect: { count: 1, token: "aSection", messageIncludes: "Empty copy" },
      why: 'an empty title written `"" as string` — the wrapped-literal shape a plain StringLiteral reader treats as out of reach and silently passes',
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/builder.ts": 'export const buildSection = (): { readonly id: string } => ({ id: "a" });\n',
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport { buildSection } from "./builder.ts";\nexport const aSection: SectionDefinition = buildSection();\n',
      },
      expect: { count: 1, token: "aSection", messageIncludes: "Unreadable definition" },
      why: "a BUILDER definition fails closed — its copy is invisible to the distinctness comparison, which is the escape a silent skip leaves open",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: computeTitle(), description: "D" } };\ndeclare function computeTitle(): string;\n',
      },
      expect: { count: 1, token: "aSection", messageIncludes: "Unreadable copy" },
      why: "a computed title fails closed — a pair the comparison cannot see is not a pair that passed it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport function makeASection(): SectionDefinition {\n  return { id: "a", placeholder: { title: "T", description: "D" } };\n}\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T", description: "D" } };\n',
      },
      expect: { count: 1, messageIncludes: "Duplicate copy" },
      why: "THE FACTORY CONTROL (§6b/M3): a `make<X>Section(): SectionDefinition` factory duplicating a const section's copy — four of the ten live sections are authored this way",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/labels.ts": 'export const SHARED_TITLE = "T";\n',
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport { SHARED_TITLE } from "./labels.ts";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: SHARED_TITLE, description: "D" } };\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T", description: "D" } };\n',
      },
      expect: { count: 1, messageIncludes: "Duplicate copy" },
      why: "THE ALIASED-COPY RED: a title reached through an imported label constant is the SAME copy. The legacy literal-only reader counted this pair as an unreadable skip and compared nine sections while reporting ten",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: "T1", description: "D1" } };\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T2", description: "D2" } };\n',
      },
      why: "each section's pair is distinct and non-empty — the sanctioned honest copy",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/copy.ts": 'export const A_PLACEHOLDER = { title: "T1", description: "D1" };\n',
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport { A_PLACEHOLDER } from "./copy.ts";\nexport const aSection: SectionDefinition = { id: "a", placeholder: A_PLACEHOLDER };\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T2", description: "D2" } };\n',
      },
      why: "a WHOLE placeholder object reached through an imported constant resolves and compares as distinct — the live extensions section is authored this way and was silently outside the comparison before",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a" };\n',
      },
      why: "a section that declares NO placeholder at all is tsc's business, not this policy's — the absent arm stays silent",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nconst aDef = { id: "a", placeholder: { title: "T1", description: "D1" } };\nexport const aSection: SectionDefinition = aDef;\n',
      },
      why: "SAME-FILE indirection resolves and is judged normally",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport function makeASection(): SectionDefinition {\n  return { id: "a", placeholder: { title: "T1", description: "D1" } };\n}\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T2", description: "D2" } };\n',
      },
      why: "the factory arm's FALSE branch — a factory section with its own distinct copy passes, so widening the subject is not a blanket accusation",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: "T", description: "D" } };\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'interface SectionDefinition {\n  readonly id: string;\n}\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T", description: "D" } };\n',
      },
      why: "THE COUNTERFACTUAL: `bSection` is annotated with a LOCAL type that merely shares the name, so it is not a section and cannot duplicate a section's copy. Identity is the canonical declaration the shared fact resolved, never the word at the annotation site",
    },
  ],
});
