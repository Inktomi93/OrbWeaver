// Gate: css-family-direct-client-mechanism — the THREE bounded recipes in which client globals may skin a
// UI-only `data-slot` directly, each licensed by a reviewed grant rather than by a hardcoded count.
//
// FAMILY `css-hook-provenance`, identical to `css-family-ownership`'s and its `-health` sibling's. THE SPLIT
// IS AUTHORITY (guide §2): its ordinary twin reports a direct skin an AUTHOR fixes by moving the look into
// the primitive's `tv()` variant, and these three are sites a REVIEWER has ruled legitimate. One authority
// per policy, so the ruled subset is its own id under the shared family.
//
// WHAT IT REPLACES, and why the exemption had to move. `lib/css-family-census.ts` carried
// `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` — three hand-spelled COUNTS (`slot:dialog-popup: 1`,
// `slot:alert-dialog-popup: 1`, `slot:message-list-scroll: 3`) compared exactly inside
// `reportClosedSeamDrift`, which the §5b audit measured reached by ZERO proof rows (cut f07) and whose
// numbers moved without killing anything (cut f08). §12.5 bans a count ratchet outright, and
// `exception-authority-census.md:178` disposes only the DECLARATION counts, so these were a §12.5 residual
// the audit filed as ledger row 11. The EXEMPTION half is real and survives; the COUNT half is deleted.
//
// AND THE MIGRATION FORCED THE FINDING GRANULARITY, which is the behavioural delta to look for. A reviewed
// grant is strictly 1:1 (§12.5): a grant matching N candidates suppresses NOTHING and alarms `over-broad`.
// `slot:message-list-scroll` was counted THREE times because three selectors skin it, so a per-selector
// finding would make its row over-broad on arrival. The sweep therefore reports ONE finding per
// `(client globals, slot hook)` class — which is also what makes the retired count unnecessary: the grant
// IS the cardinality, and the central `stale-reviewed-grant` alarm is the staleness half the count owned.
//
// THE PARTITION IS THE SAME PREDICATE, READ FROM ONE HOME. `lib/css-family-policy.ts#isDirectClientUiMechanism`
// decides membership for BOTH policies — the ordinary twin skips exactly what this one reports — so a hook
// can never be judged twice or fall between them, and neither module owns an exemption table.
//
// A DECLARED HYBRID (§12.4). RESOURCE half: `product-css`. COMPILER half: `{ in: ["@client", "@ui"] }`, the
// hook-owner walk that proves a slot is UI-only. POPULATION PORT: as `css-family-ownership`'s, legacy sha
// `1692583d6`. MARKER CENSUS 0 = 0 = 0 (2026-09-12, N=7,725, control 1,196).
//
// WHERE A BROKEN RESOURCE REFUSES — not here (`mustRefuse[0]`).
import { CLIENT_GLOBALS, THEME } from "../contract/css-family.ts";
import { defineGate } from "../contract/policy.ts";
import { reportDirectClientMechanisms } from "../lib/css-family-policy.ts";
import { OWNERSHIP_FIXTURE, THEME_FAMILIES } from "../lib/css-family-proof-fixtures.ts";
import { cssHookProvenanceFact } from "../lib/css-family-source-provenance.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MESSAGE =
  "client globals skins a UI-only component slot directly; the three bounded recipes that may are reviewed grants, not a count (tooling/src/verify/gates/css-family-direct-client-mechanism.ts)";

const DIALOG = "packages/ui/src/primitives/dialog.tsx";
const LIST = "packages/ui/src/primitives/list-row.tsx";

export const gate = defineGate({
  id: "css-family-direct-client-mechanism",
  family: "css-hook-provenance",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@client", "@ui"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [cssHookProvenanceFact],
  resources: [{ kind: "product-css" }],
  message: MESSAGE,
  create: (ctx) => ({
    evaluate: () => {
      const { owners } = ctx.fact(cssHookProvenanceFact);
      const inventory = readyResourceValue(ctx.resources.cssInventory("product"));
      const candidates = reportDirectClientMechanisms({
        inventory,
        owners,
        report: (file, details) => {
          ctx.report.file(file, details);
        },
      });
      // THE RECEIPT DENOMINATOR CANNOT BE THIS POLICY'S OWN CENSUS. `receiptFailures` reds on
      // `members === 0`, so receipting the census would turn a corpus this family exists to REPORT on
      // (a five-home identity that resolved no hook, no declaration, no candidate) into a withheld TOOL
      // ERROR — the finding never reported at all. The denominator is the SHEET COUNT, which is ≥ 1
      // past the resource guard by construction; the census rides the receipt SOURCE string
      // (§12.3's "-health consumers receipt a CONSTANT", one layer out; refuted-and-repaired on the
      // sibling CSS train by `v-css-train-3-2026-09-13.md`).
      ctx.receipt({
        kind: "population",
        source: `css-family-direct-client-mechanism [candidates=${String(candidates)}]`,
        members: inventory.files.length,
      });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      grant: { subject: "packages/client/src/styles/globals.css", operation: "direct-client-mechanism:slot:dialog-popup" },
      files: {
        ...OWNERSHIP_FIXTURE,
        [CLIENT_GLOBALS]: 'html [data-slot="dialog-popup"] { border-radius: 1rem; }\n',
        [DIALOG]: 'export const dialog = <div data-slot="dialog-popup" />;\n',
      },
      expect: { count: 1, token: '[data-slot="dialog-popup"]', messageIncludes: "REVIEWED recipe" },
      why: "THE FIRST RULED RECIPE: an `html `-rooted client appearance carrier reaching a UI-only dialog popup. It is a FINDING that a grant licenses, never a silent skip — which is the whole difference between a reviewed grant and the count it replaced",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [CLIENT_GLOBALS]:
          '[data-slot="message-list-scroll"] { overflow: auto; }\n' +
          '[data-slot="message-list-scroll"][data-pinned] { scroll-behavior: smooth; }\n' +
          '.probe [data-slot="message-list-scroll"] { contain: paint; }\n',
        [LIST]: 'export const list = <div data-slot="message-list-scroll" />;\n',
      },
      expect: { count: 1, token: '[data-slot="message-list-scroll"]' },
      why: "THE AGGREGATION, and it is the row the migration turns on: THREE selectors skin this one slot — the exact cardinality the retired `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` counted as `3` — and the policy reports ONE finding for the class. Per-selector findings would make the grant row match three candidates, license NONE of them and alarm `over-broad` on arrival",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [CLIENT_GLOBALS]: 'html [data-slot="alert-dialog-popup"] { border-radius: 1rem; }\nhtml [data-slot="dialog-popup"] { border-radius: 1rem; }\n',
        [DIALOG]: 'export const dialog = <div data-slot="dialog-popup" />;\nexport const alert = <div data-slot="alert-dialog-popup" />;\n',
      },
      expect: { count: 2, messageIncludes: "REVIEWED recipe" },
      why: "two DIFFERENT ruled recipes are two identities and two findings — the grant key is the (carrier, hook) pair, so one row can never license the other",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [CLIENT_GLOBALS]: '[data-slot="dialog-popup"] { border-radius: 1rem; }\n',
        [DIALOG]: 'export const dialog = <div data-slot="dialog-popup" />;\n',
      },
      why: "THE `html ` FENCE, and the row that dies without it: the dialog recipe is ruled only for a DOCUMENT-rooted carrier. The same slot skinned bare is not this policy's finding at all — its ordinary twin reports it, which is what the partition means",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [CLIENT_GLOBALS]: 'html[data-blur-modals] [data-slot="dialog-popup"] { backdrop-filter: blur(1rem); }\n',
        [DIALOG]: 'export const dialog = <div data-slot="dialog-popup" />;\n',
      },
      why: "a selector carrying a client MECHANISM (`html[data-…]`) is a capability carrier rather than a direct skin, so `hasClientMechanismCarrier` acquits it before either policy asks — the fence that keeps the reviewed set to three",
    },
    {
      mode: "resource",
      files: {
        ...OWNERSHIP_FIXTURE,
        [CLIENT_GLOBALS]: 'html [data-slot="dialog-popup"] { border-radius: 1rem; }\n',
        [DIALOG]: 'export const dialog = <div data-slot="dialog-popup" />;\n',
        "packages/client/src/features/dialog-probe.tsx": 'export const probe = <div data-slot="dialog-popup" />;\n',
      },
      why: "a slot ALSO written from client source is not UI-only, so no direct-skin question arises — the ownership fence is the hook's producer set, never the selector's shape",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { [THEME]: THEME_FAMILIES, "packages/client/src/features/probe.tsx": "export const probe = null;\n" },
      expect: { messageIncludes: "product-css" },
      why: "an incomplete product CSS identity REFUSES at the population phase; a reviewed-grant policy that reported zero candidates on an unreadable corpus would stale every one of its rows",
    },
  ],
});
