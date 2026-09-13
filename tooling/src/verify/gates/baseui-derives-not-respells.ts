// Policy: baseui-derives-not-respells — a @orb/ui seal's exported props interface DERIVES the DATA props it
// shares with the Base UI component it wraps; it never hand-writes a second spelling of one. A re-spelling
// is not a stylistic duplicate: it is a NARROWER type that silently deletes capability from every caller,
// and tsc cannot tell you, because the seal only ever passes the value onward.
//
// THIS IS THE ORDINARY HALF OF A SPLIT. The legacy descriptor at 1692583d6 carried TWO arms that differ in
// AUTHORITY, and the contract allows one authority per policy (guide §12.1), so it splits:
//   · ARM B — DATA PROPS, waivable. THIS policy. A non-function member of a `*Props` interface whose name is
//     a prop of the wrapped component's ROOT — the part a seal spreads its rest props onto — must derive
//     too, unless the narrowing is DELIBERATE and says so.
//   · ARM A — HANDLERS, unwaivable. `baseui-derives-not-respells-health`, same `family`, `authority: "hard"`.
// The split is what the CONTRACT forces, but it is also the honest shape: the legacy module enforced ARM A's
// unwaivability by calling the explicit-`Finding` report overload, because `hasGateIgnore` only read leading
// comments off a NODE — a mechanism that is invisible at the declaration and that its own source had to
// explain in nine lines of comment plus a `@finding-overload-ok` marker. `authority: "hard"` is the same
// guarantee stated in the field the reader looks at, and the overload and its marker are gone.
//
// WHY ROOT-ONLY, measured rather than assumed: widening this arm to every rendered part took the population
// from 19 to 30+ and every one of the additions was a coincidence — `SelectOption.label` colliding with
// `Select.Item`'s `label`, `container: PortalContainer` colliding with `Portal`'s `container`. A policy that
// needs 11 apology rows to be green is an allowlist that lies about what it exempts.
//
// DECLARED LIMITS (each with a `mustPass` row): "derives" is a SYNTACTIC reference test — the member's type
// text must name a Base UI props type the file imports, or a local alias whose body does (one hop).
// Identifier identity is exact: a lookalike local name containing the imported type's spelling is not a
// derive. This arm judges only `*Props` interfaces: a plain data shape is not the seal.
//
// FAMILY `baseui-read` — the shared readers are `lib/baseui-derives-not-respells.ts#fileContext` and
// `#respelledMembers` (which members re-spell which Base UI prop, and which arm owns each), plus
// `lib/baseui-read.ts#surfaceManifestFrom` (the committed ledger's shape, narrowed from the strict-JSON
// resource fact). `baseui-derives-not-respells-health`, `baseui-surface-manifest`,
// `baseui-anatomy-completeness`, `baseui-portal-container-seam` and `baseui-state-data-attributes` are the
// other members.
//
// POPULATION PORT: `@ui` (= `packages/ui/src/`), whole, both extensions. LEGACY at 1692583d6:
// `scanRoot: (p) => p.includes(UI_SRC)` with `UI_SRC = "packages/ui/src/"`, plus an in-`run` re-test of the
// same predicate through `repoRelative`. On repo-relative authored paths the two admit the identical set, so
// the port is byte-identical and both spellings of the fence are gone. Pinned by `mustPass[5]`.
//
// THE ORDINARY DOOR WORKS, AND THAT IS A MEASUREMENT RATHER THAN AN ASSUMPTION (guide §3: at a 9/9 base rate
// a working legacy door is the claim that owes evidence). The legacy position was the PROP NAME and the
// legacy offset was `member.getText().indexOf(name)` — an authored token at its own offset inside the
// member, which is exactly what `locateFinding` requires under this contract. So the seven live markers
// translate as a pure grammar swap with the position UNCHANGED, and no anchor moves.
//
// MARKER CENSUS (the §8.6 per-file reconciliation, legacy → current, all three files `current == legacy`):
//   packages/ui/src/primitives/combobox/combobox.tsx        3 → 3  (items, value, defaultValue)
//   packages/ui/src/primitives/autocomplete/autocomplete.tsx 3 → 3  (items, value, defaultValue)
//   packages/ui/src/primitives/select/select.tsx            1 → 1  (items)
// 7 real legacy markers = 7 real waives = 7 sites, zero dead and zero unbound; every one was already on the
// line ABOVE its member, so no trailing-position site moved. All seven are ARM B and therefore all stay with
// THIS sibling: the hard sibling has no door and needs none.
//
// WHERE THE REFUSAL LIVES — THE RUNTIME. Legacy did `const manifest = readManifest(ctx.root); if (manifest
// === undefined) return;` — a SILENT PASS whenever the committed ledger was absent or unparseable. The
// ledger is now a DECLARED `json:baseui-manifest` resource, so `resolveResourceDeclarations` throws at the
// POPULATION phase and this policy is WITHHELD — exit 2, never a green zero. A ready-but-degenerate ledger
// is `baseui-surface-manifest`'s finding, not this one. Pins: `tests/tooling/verify/gates/baseui-family.test.ts`.
//
// TWO LEGACY ROWS DID NOT SURVIVE, AND NOT CARRYING THEM IS THE RULE RATHER THAN A LOSS (guide §4.2:
// "never copy a negative arm into a gate"). Legacy `mustFlag[3]` planted a marker naming a NON-violating
// position and `mustFlag[4]` planted a MALFORMED one (no `: <reason>`), each asserting the finding survived.
// Under this contract both are CENTRAL-ENGINE negatives: the waiver engine raises an authority ALARM for a
// dead position and for a malformed marker, `proofFailure` runs `toolFailure` before the arm verdict, and
// an alarm fails the row outright — measured here, both rows were authored and both failed with
// `AUTHORITY ALARM [ordinary-waiver] … names a dead position`. Their successors are the ONE positive
// identity arm (`mustPass[1]`), which the same engine makes self-checking, plus
// `tests/tooling/verify/lib/ordinary-waiver.test.ts`, which owns the negatives once for the whole corpus.
//
// COMMENT POSTURE: comment-SAFE — imports, type identifiers, interfaces and JSX forwarding are AST nodes;
// the central waiver engine alone reads comments.
// LEGACY SHA: 1692583d6.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { fileContext, respelledMembers } from "../lib/baseui-derives-not-respells.ts";
import { surfaceManifestFrom } from "../lib/baseui-read.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { BASE_UI_SEAL_FIXTURES } from "./_proof/baseui-seal.ts";

const MESSAGE =
  "a @orb/ui seal hand-writes a data prop the Base UI component it wraps already declares. The seal's copy " +
  "is a SECOND spelling of one shape: it drifts silently the day Base UI widens the prop, because two " +
  "structurally different types are still assignable through the seal's own pass-through, and no caller " +
  "ever learns that the seal's version is the narrower one.";

const FIX =
  'derive it from the part\'s own props type: `items?: SelectRootProps<Value>["items"]`, ' +
  '`side?: SelectPositionerProps["side"]`, or `extends Omit<SelectRootProps, …>` for the whole surface ' +
  "(packages/ui/src/primitives/select/select.tsx and combobox/combobox.tsx are the in-tree forms). If the " +
  "prop is DELIBERATELY narrower than Base UI's, keep the hand declaration and say so on the line above: " +
  "`// @orb-waive baseui-derives-not-respells(<propName>): <why, and what would end it>`, where <propName> " +
  "is the member name exactly as declared.";

export const gate = defineGate({
  id: "baseui-derives-not-respells",
  family: "baseui-read",
  authority: "ordinary",
  severity: "error",
  population: "@ui",
  analysis: "resource",
  // Per-FILE verdicts: a seal file plus the committed ledger is everything the answer needs, so a scoped
  // run over the changed seals is correct for those seals.
  execution: "selected-files",
  facts: [],
  resources: [{ kind: "json", id: "baseui-manifest" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const read = surfaceManifestFrom(readyResourceValue(ctx.resources.json("baseui-manifest")).value);
    // A ledger that is valid JSON and is not a ledger is `baseui-surface-manifest`'s finding — one defect,
    // one red — and an ORDINARY policy structurally cannot own it (a file-anchored ordinary finding has no
    // waiver position; the measurement is in `baseui-state-data-attributes.ts`).
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
              if (respelled.rootOwner !== undefined) {
                ctx.report.node(respelled.member, { token: respelled.name, offset: respelled.offset });
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
      files: BASE_UI_SEAL_FIXTURES.seal("  items?: readonly string[];\n"),
      expect: { count: 1, token: "items" },
      why: "THE FOUNDING SHAPE: a DATA prop of the Root re-spelled by hand with no marker — the narrowing may well be right, but it has to be stated. The token is the PROP NAME, which is the §4.2 waiver position and the position all seven live markers already name",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.file(
        `${BASE_UI_SEAL_FIXTURES.imports}type NotSelectRootProps = { items?: readonly string[] };\nexport interface SealProps {\n  items?: NotSelectRootProps["items"];\n}\n${BASE_UI_SEAL_FIXTURES.render}`,
      ),
      expect: { count: 1, token: "items" },
      why: "IDENTIFIER IDENTITY IS EXACT: `NotSelectRootProps` merely CONTAINS the imported type's spelling, so indexing into it is not a derive and the re-spelling still has to be stated. Migrated here from `tests/tooling/ui-gate-structural-regressions.int.test.ts`, which drove it through the legacy `GateDescriptor` shape this conversion retires; it is also the row that dies if `referencesIdentifier` is relaxed to a substring test",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.seal('  items?: SelectRootProps["items"];\n'),
      why: "the remedy: an indexed access into the part's own props type — one shape, one home, and a Base UI widening arrives for free",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.seal(
        "  // @orb-waive baseui-derives-not-respells(items): the seal narrows Base UI's `readonly any[]` to the option union it renders. Ends if Select.Item stops taking objects.\n  items?: readonly string[];\n",
      ),
      why: "§4.2 POSITIONAL IDENTITY, and the SANCTIONED narrowing in one row: the marker carries the reason AND the end condition at the violating position, and this arm is about stating the decision rather than forbidding it. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume. This is the shape all seven live markers were translated into",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.sealRenderingValue("  placeholder?: string;\n"),
      why: "a DECLARED LIMIT: `placeholder` is a prop of `Select.Value`, not of Root. Widening past the Root took the population from 19 to 30+, every addition a coincidence — the scope is measured, not assumed. Cut the `isRoot` fence in `foldPart` and this is the row that dies, and it is the ONLY row that does — which is why the fixture has to RENDER `<BaseSelect.Value />`: a part the file does not render is never folded at all, so the plain seal fixture cannot reach the fence and the cut came back clean against it",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.file(
        `${BASE_UI_SEAL_FIXTURES.imports}export interface SelectOption {\n  items?: readonly string[];\n}\n${BASE_UI_SEAL_FIXTURES.render}export interface SealProps { x?: number }\n`,
      ),
      why: "a DECLARED LIMIT: a plain DATA shape in a seal file is not the seal's prop surface — this arm judges `*Props` interfaces only, or `SelectOption.value`/`SelectOptionGroup.items` would need apology rows for a collision that means nothing. Cut `isPropsInterface` and this is the row that dies",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.elsewhere("packages/ui/src/primitives/x/x.tsx", "export interface SealProps {\n  items?: readonly string[];\n}\n"),
      why: "a file with no Base UI binding at all has no base surface to re-spell — the policy must not fire on the word `items` alone",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.outsidePopulation("  items?: readonly string[];\n"),
      why: "THE POPULATION FENCE, pinned with an in-population ANCHOR beside it (a falsifier admitting nothing tool-errors instead of passing): the identical founding shape under `@client` is not this policy's finding, because features compose SEALED primitives and never wrap Base UI directly. Widen past `@ui` and this is the only row that dies",
    },
    {
      mode: "resource",
      files: BASE_UI_SEAL_FIXTURES.seal("  onValueChange?: (value: string) => void;\n"),
      why: "THE SPLIT BOUNDARY, and the row that dies if this sibling starts judging handlers: a re-spelled HANDLER is `baseui-derives-not-respells-health`'s finding, because that arm takes no exemption and this one does. Two policies, two authorities, one defect each",
    },
  ],
});
