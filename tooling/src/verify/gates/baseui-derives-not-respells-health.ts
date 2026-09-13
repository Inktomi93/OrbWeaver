// Policy: baseui-derives-not-respells-health — the UNWAIVABLE HANDLER half of the
// `baseui-derives-not-respells` split (family "baseui-read", shared verbatim). A member whose name is a
// FUNCTION-typed prop of a Base UI part the file renders must reference that part's props type. This is the
// eventDetails class, and it is the whole reason the family exists: Base UI change handlers are
// `(value, eventDetails) => void`, where `eventDetails` carries `cancel()` / `allowPropagation()`. A seal
// re-declaring `onValueChange?: (value: string) => void` strips the second argument out of the TYPE and out
// of the mapper, and no caller can ever get it back.
//
// MEASURED AT THE LEGACY LANDING: 3 live sites — `Textarea.onValueChange` and `ColorField.onValueChange`
// (both dropping `Field.Control`'s eventDetails, arity 2 → 1, while `textarea.tsx`'s own comment claimed the
// opposite) and `Meter.getAriaValueText` (same arity, still a hand copy that rots when the signature moves).
//
// WHY THE `-health` SUFFIX ON AN ARM THAT IS NOT A LIVENESS TRIPWIRE. It is the corpus convention for the
// hard half of an authority split (guide §2's capability table: "`-health` sibling — an arm that differs in
// authority or severity from the rest of the module, identical `family`"), and
// `contract-derives-not-respells-health` is the same shape one family over. The suffix names the SPLIT, not
// the subject; this policy audits no ratchet and no exemption table.
//
// AUTHORITY — `hard`, and this is the recorded ruling of the legacy module preserved through the
// conversion, not a new call. The legacy source enforced it by reporting through the explicit-`Finding`
// overload, because `hasGateIgnore` only read leading comments off a NODE, so a Finding-overload arm could
// not be marker-suppressed at all; it took nine lines of comment plus a `finding-overload-ok` marker to
// say so (spelled with an `@` prefix, deliberately not written literally here — this module is INSIDE the
// corpus `finding-overload-provenance` scans, so the literal opener in prose is a MALFORMED-marker finding
// against that live legacy gate; `finding-overload-provenance.ts:9-10` does the same thing to itself). Its stated reason stands: *"an `onValueChange` that silently drops Base UI's `eventDetails`
// deletes capability from every caller with no type error anywhere; there is no site-local reason that
// makes that correct, so there must be no site-local escape."* `authority: "hard"` is that guarantee in the
// field a reader looks at, and it also RESTORES a real node anchor — the legacy overload had to hand-build
// a `{ file, line, column: 0 }` finding, so the caret landed at column 0 rather than on the member.
// End condition, carried over from the legacy header: if the eventDetails class ever gains a legitimate
// per-site narrowing, this arm merges back into the ordinary sibling.
//
// FAMILY `baseui-read` — the shared readers are `lib/baseui-derives-not-respells.ts#fileContext` and
// `#respelledMembers` (which members re-spell which Base UI prop, and which arm owns each), plus
// `lib/baseui-read.ts#surfaceManifestFrom`. THE TWO SIBLINGS SHARE ONE CLASSIFIER BY DESIGN: `handler` and
// `rootOwner` on a `RespelledMember` are mutually exclusive, so the split is total and neither arm can
// silently license the other. `baseui-derives-not-respells`, `baseui-surface-manifest`,
// `baseui-anatomy-completeness`, `baseui-portal-container-seam` and `baseui-state-data-attributes` are the
// other members.
//
// POPULATION PORT: a CORRECTION, inherited — this policy was SPLIT OUT at conversion and has no legacy
// descriptor of its own, so the port is the parent `baseui-derives-not-respells`' one: legacy
// `scanRoot: (p) => p.includes("packages/ui/src/")` → `@ui`, byte-identical on repo-relative authored paths.
// LEGACY SHA: 1692583d6 — the commit this policy was split out of.
//
// THE UNWAIVABILITY ARM CANNOT BE A PROOF ROW HERE, AND THE ATTEMPT IS THE RECEIPT. The obvious pin — plant
// a correctly-spelled `@orb-waive baseui-derives-not-respells-health(onValueChange)` at the reported
// position and assert the finding survives — was authored and RAN, and it fails:
// `AUTHORITY ALARM [ordinary-waiver] ordinary waiver … targets non-ordinary policy
// baseui-derives-not-respells-health`. `proofFailure` runs `toolFailure` before the arm verdict and any
// alarm fails the row, so a hard policy structurally cannot pin its own marker refusal (guide §6.2: never
// copy a negative arm into a gate — the hard/reviewed refusal is one of the central engine's negatives and
// is owned once by `tests/tooling/verify/lib/ordinary-waiver.test.ts`). The alarm IS the enforcement: under
// this contract a marker aimed here does not quietly do nothing, it makes the run loud.
//
// COMMENT POSTURE: comment-SAFE — imports, type identifiers and interfaces are AST nodes. Note that `hard`
// makes the posture moot for suppression: there is no marker this policy reads in either grammar.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `baseui-derives-not-respells` descriptor at 89a0b751d78372c17b549ba2ac25931c768d7ccd, the parent of the conversion
// `17297f298`; this module did not exist there, so it is measured against the module it was carved from,
// `baseui-derives-not-respells` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`).
// The `1692583d6` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,560 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 366 and final `population` admits 366.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/ui/src/art/art-bleed/__cbbhr_in_art-bleed.tsx`
// (virtual) admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { fileContext, respelledMembers } from "../lib/baseui-derives-not-respells.ts";
import { surfaceManifestFrom } from "../lib/baseui-read.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { BASE_UI_SEAL_FIXTURES } from "./_proof/baseui-seal.ts";

const MESSAGE =
  "a @orb/ui seal hand-writes an EVENT HANDLER the Base UI component it wraps already declares. Base UI's " +
  "`(value, eventDetails) => void` becomes `(value) => void` and `eventDetails.cancel()` / " +
  "`.allowPropagation()` stop existing for every caller — with no type error anywhere, because the seal " +
  "only ever passes the value onward. This arm takes no exemption.";

const FIX =
  'derive it from the part\'s own props type: `onValueChange?: SelectRootProps<Value>["onValueChange"]`, or ' +
  '`type Details = Parameters<NonNullable<BaseRootProps["onValueChange"]>>[1]` when the seal must synthesize ' +
  "a change with no originating event (packages/ui/src/primitives/combobox/combobox.tsx is the in-tree " +
  "form). There is no marker for this arm: a handler that drops eventDetails has no site-local reason that " +
  "makes it correct.";

const HANDLER_MESSAGE = (prop: string, owner: string, baseArity: number, ourArity: number): string =>
  `\`${prop}\` re-declares \`${owner}\`'s handler by hand${ourArity < baseArity ? ` and DROPS ${baseArity - ourArity} of its ${baseArity} arguments — Base UI passes \`eventDetails\` there (cancel/allowPropagation), and this signature deletes it` : " (same arity today, but a hand copy rots the moment the signature moves)"}. Derive it: \`${prop}?: <BasePropsType>["${prop}"]\`. This arm takes no exemption.`;

export const gate = defineGate({
  id: "baseui-derives-not-respells-health",
  family: "baseui-read",
  authority: "hard",
  severity: "error",
  population: "@ui",
  analysis: "resource",
  // Per-FILE verdicts compose: one seal file plus the complete declared manifest is everything this
  // answer needs. A source-only request visits that selected subset; touching the manifest reselects all
  // declared @ui sources so a changed shared surface is checked against every seal.
  execution: "selected-files",
  facts: [],
  resources: [{ kind: "json", id: "baseui-manifest" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const read = surfaceManifestFrom(readyResourceValue(ctx.resources.json("baseui-manifest")).value);
    const manifest = read.ok ? read.manifest : undefined;
    const contexts = new Map<string, ReturnType<typeof fileContext>>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.InterfaceDeclaration],
          visit: (node): void => {
            if (manifest === undefined || !node.isKind(SyntaxKind.InterfaceDeclaration) || !node.isExported()) {
              return;
            }
            const sf = node.getSourceFile();
            const key = sf.getFilePath();
            if (!contexts.has(key)) {
              contexts.set(key, fileContext(sf, manifest));
            }
            const file = contexts.get(key);
            if (file === undefined) {
              return;
            }
            for (const respelled of respelledMembers(node, file)) {
              const handler = respelled.handler;
              if (handler !== undefined && respelled.ourArity !== undefined) {
                ctx.report.node(respelled.member, {
                  token: respelled.name,
                  offset: respelled.offset,
                  message: HANDLER_MESSAGE(respelled.name, handler.owner, handler.arity, respelled.ourArity),
                });
              }
            }
          },
        },
      ],
    };
  },

  mustFlag: [
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.seal("  onValueChange?: (value: string) => void;\n"),
      expect: { count: 1, token: "onValueChange", messageIncludes: "DROPS 1 of its 2 arguments" },
      why: "THE FOUNDING DEFECT (crunch item 6): the seal re-declares Base UI's change handler one argument short, deleting `eventDetails.cancel()` from every caller — still live in Textarea and ColorField at the legacy landing. This fixture is BYTE-IDENTICAL to the ordinary sibling's `mustPass[6]`, which is what asserts the split boundary rather than assuming it",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.seal("  onValueChange?: (value: string, details: unknown) => void;\n"),
      expect: { count: 1, token: "onValueChange", messageIncludes: "a hand copy rots" },
      why: "the second flavour, and the row that dies if the arity comparison replaces the derive test: the arity MATCHES, so an arity-only rule passes it — but `details: unknown` is a hand copy that stops agreeing with Base UI the day the details type grows a member. The two messages are disjoint, so each row's `messageIncludes` discriminates the branch it names",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.seal('  onValueChange?: SelectRootProps["onValueChange"];\n'),
      why: "the remedy: an indexed access into the part's own props type — one shape, one home, and a Base UI widening arrives for free",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.file(
        `${BASE_UI_SEAL_FIXTURES.imports}type Details = Parameters<NonNullable<SelectRootProps["onValueChange"]>>[1];\nexport interface SealProps {\n  onValueChange?: (value: string, details?: Details) => void;\n}\n${BASE_UI_SEAL_FIXTURES.render}`,
      ),
      why: "the ONE-HOP ALIAS derive — the live `combobox.tsx` shape: the handler is hand-written so the seal can synthesize a change with no originating event, but its DETAILS type is pinned to Base UI's, so eventDetails survives. Cut `derivedAliases` from the shared reader and this is the row that dies",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.file(
        `${BASE_UI_SEAL_FIXTURES.imports}export interface SealProps {\n  onValueChange?: (value: string) => void;\n}\nexport const Seal = (p: SealProps) => {\n  const commit = (v: string) => p.onValueChange?.(v);\n  return <BaseSelect.Root items={[]} render={<button type="button" onClick={() => commit("x")} />} />;\n};\n`,
      ),
      why: "THE FORWARDING TEST, and the reason this family needs no apology row: a seal's OWN callback that merely SHARES a name with a base handler is never handed to Base UI, so there is no eventDetails to preserve. `ColorField.onValueChange` is the live case — it fires only for a value that passed the D44 colour clamp. Judging by name alone reds it. Cut the `forwarded` fence and this is the row that dies",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.seal("  items?: readonly string[];\n"),
      why: "THE SPLIT BOUNDARY from this side: a re-spelled DATA prop is the ordinary sibling's finding, waivable, and none of this policy's business. Byte-identical to that sibling's `mustFlag[0]`",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.outsidePopulation("  onValueChange?: (value: string) => void;\n"),
      why: "THE POPULATION FENCE, with an in-population anchor beside it: the identical defect under `@client` is not this policy's finding — features compose SEALED primitives and never wrap Base UI directly. Widen past `@ui` and this is the only row that dies",
    },
  ],
});
