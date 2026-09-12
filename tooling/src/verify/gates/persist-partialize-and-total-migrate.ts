// Gate: persist-partialize-and-total-migrate (UI-Gates-and-Lessons.md §11.5, UI-Primitives-and-Reuse.md
// §13.1/§13.3). Zustand `persist()` is partly IRREVERSIBLE — once a stale blob is in localStorage you
// can't migrate from a version line never shipped, so every persist must route through one of the two
// minting factories that bake `partialize` + `version` + a TOTAL crash-proof `migrate`.
//
// ARM A RETIRED AS A DUPLICATE (2026-09-11, converting for #1584). The legacy module's ARM A — a bare
// `persist(` call outside the two factories is RED — is the EXACT rule `no-raw-zustand-persist.ts`
// already enforces under its `persistMint` operation (authority reviewed-grant), with a STRONGER
// identity reader: the legacy check here was `Node.isIdentifier(callee) && callee.getText() === "persist"`,
// which an aliased import (`import { persist as durable } from "zustand/middleware"`) walks straight past;
// `no-raw-zustand-persist` resolves the callee's package-export origin instead and catches the alias.
// Converting ARM A again would ship a second, weaker gate over the identical subject. Its successor proof
// lives in tests/tooling/verify/gates/simple-visitors-wave-4.test.ts (replays every legacy ARM A
// mustFlag/mustPass example through no-raw-zustand-persist and asserts it still holds).
//
// This policy now covers ONLY the genuinely distinct arm: inside each factory, the persist() options
// object must carry `version`/`partialize`/`migrate` — nothing else on the tree checks factory-option
// completeness. Population is narrowed to exactly the two factory files (no `scanRoot` predicate, no
// FACTORY_FILES set lookup at runtime): the two paths are declared data the population algebra resolves
// once, and a rename tripwire is unnecessary here because a moved factory simply drops out of `ctx.files`
// and its `persist()` requirement goes unjudged — the SAME shape `no-raw-zustand-persist`'s reviewed-grant
// staleness sweep already polices for arm A's identity, so a moved factory is caught there, not duplicated
// here.
//
// SINGLETON FAMILY: this policy reads an object-literal's own property shape directly
// (`ObjectLiteralExpression.getProperty`), never the shared package-export-origin reader
// `no-raw-zustand-persist` uses — no shared computation, so it is its own family, not a theme-sharing
// member of "persist-*".
//
// ONE FINDING PER CALL SITE, NOT PER MISSING KEY (#1954, 2026-09-11). The conversion's first shape emitted
// one finding per absent key, all anchored on the same `persist` callee with the same position token, which
// made this ORDINARY policy PERMANENTLY UNWAIVABLE: `lib/ordinary-waiver.ts` narrows a marker's candidates by
// carrier containment and then by `finding.token === marker.position`, so byte-identical findings always
// resolve `over-broad` and suppress NOTHING — a second marker made it worse, not better. The legacy
// descriptor dodged this with SYNTHETIC per-key tokens (`persist opts missing <key>`), which the final
// runtime forbids: `locateFinding` requires the position token to be an exact slice of the authored source
// at the reported line/column, and an ABSENT key has no authored text to anchor on. So the offense is the
// CALL SITE, the missing keys are named in the per-finding message, and one `@orb-waive
// persist-partialize-and-total-migrate(persist): <reason>` above the statement reaches it.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const FACTORY_PERSISTED_STORE = "packages/client/src/state/create-persisted-store.ts";
const FACTORY_ENTITY_DRAFT_STORE = "packages/client/src/state/create-entity-draft-store.ts";
const REQUIRED_KEYS = ["version", "partialize", "migrate"] as const;

const MESSAGE =
  "the mint factory's own persist() options object is missing a required irreversibility guard — " +
  "version/partialize/migrate must all be present so a stale localStorage blob can always migrate " +
  "forward instead of crashing (UI-Gates-and-Lessons.md §11.5, UI-Primitives-and-Reuse.md §13.1/§13.3).";

/** The per-finding message: the CALL SITE is the offense, so the absent keys are enumerated in the text
 *  rather than split across identical findings the ordinary waiver could never address individually. */
function missingKeysMessage(missing: readonly string[]): string {
  return (
    `the mint factory's own persist() options object is missing ${missing.join(", ")} — ` +
    "version/partialize/migrate must all be present so a stale localStorage blob can always migrate " +
    "forward instead of crashing (UI-Gates-and-Lessons.md §11.5, UI-Primitives-and-Reuse.md §13.1/§13.3)."
  );
}

function isPersistCall(node: Node): node is CallExpression {
  if (!TsNode.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  return TsNode.isIdentifier(callee) && callee.getText() === "persist";
}

export const gate = defineGate({
  id: "persist-partialize-and-total-migrate",
  family: "persist-partialize-and-total-migrate",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], under: [FACTORY_PERSISTED_STORE, FACTORY_ENTITY_DRAFT_STORE] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "add the missing key(s) to the factory's persist() options object. A deliberate site is waived with " +
    "`@orb-waive persist-partialize-and-total-migrate(<position>): <reason>` on the line above, where " +
    "<position> is the `persist(...)` call's own callee text.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node) => {
          if (!isPersistCall(node)) {
            return;
          }
          const opts = node.getArguments()[1];
          if (opts === undefined || !TsNode.isObjectLiteralExpression(opts)) {
            return;
          }
          const missing = REQUIRED_KEYS.filter((key) => opts.getProperty(key) === undefined);
          if (missing.length === 0) {
            return;
          }
          const callee = node.getExpression();
          ctx.report.node(callee, { token: callee.getText(), offset: 0, message: missingKeysMessage(missing) });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { [FACTORY_PERSISTED_STORE]: "export const s = persist(() => ({}), { version: 1 });\n" },
      expect: { count: 1, token: "persist", messageIncludes: "missing partialize, migrate" },
      why: "the factory's persist options object is missing partialize/migrate (only version present) — the founding shape, now ONE call-site finding naming both absent keys",
    },
    {
      mode: "source",
      files: { [FACTORY_ENTITY_DRAFT_STORE]: "export const s = persist(() => ({}), {});\n" },
      expect: { count: 1, token: "persist", messageIncludes: "missing version, partialize, migrate" },
      why: "the OTHER factory, all three required keys absent — still ONE finding, so a single waiver can address it",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [FACTORY_PERSISTED_STORE]: "export const s = persist(() => ({}), { version: 1, partialize: (state) => state, migrate: (state) => state });\n",
      },
      why: "all three required keys present — the compliant factory shape",
    },
    {
      mode: "source",
      files: {
        [FACTORY_PERSISTED_STORE]:
          "// @orb-waive persist-partialize-and-total-migrate(persist): probe — the ordinary door must be reachable.\nexport const s = persist(() => ({}), { version: 1 });\n",
      },
      why: "THE #1954 DOOR: the correct marker at the reported position (`persist`) suppresses the finding — self-checking, because a dead position, an over-broad match or a stale marker each raise an authority alarm that fails this arm",
    },
    {
      mode: "source",
      files: {
        [FACTORY_ENTITY_DRAFT_STORE]:
          "// @orb-waive persist-partialize-and-total-migrate(persist): probe — one marker reaches an all-keys-absent call site.\nexport const s = persist(() => ({}), {});\n",
      },
      why: "the same door on the all-three-absent shape — the case that was UNWAIVABLE at any marker count before the collapse to one finding per call site",
    },
  ],
});
