import { defineGate } from "../contract/policy.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { liveHomeFiles, readUiTierFacts, UI_TIER_HOMES, uiTierPermissionFact, Z_TOKEN_NAMES } from "../lib/ui-tier-permissions.ts";

function isJsonObject(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export const gate = defineGate({
  id: "z-index-tier-health",
  family: "ui-z-index-tier",
  authority: "hard",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "resource",
  execution: "entire-population",
  facts: [uiTierPermissionFact],
  resources: [{ kind: "json", id: "tokens" }],
  message: "the reviewed z-index home set or governed token vocabulary is unhealthy. (tooling/src/verify/gates/GATE-AUTHORING.md)",
  create: (ctx) => ({
    evaluate: () => {
      const facts = readUiTierFacts(ctx);
      const anchor = facts.files[0];
      if (anchor === undefined) {
        return;
      }
      for (const { path } of UI_TIER_HOMES["z-index"]) {
        if (liveHomeFiles(facts, path).length === 0) {
          ctx.report.node(anchor, { message: `missing reviewed z-index home: ${path} — UI-Architecture-and-Layout.md` });
        }
      }
      const value = readyResourceValue(ctx.resources.json("tokens")).value;
      const z = isJsonObject(value) ? value["z"] : undefined;
      const live = isJsonObject(z) ? Object.keys(z).toSorted() : [];
      const expected = [...Z_TOKEN_NAMES].toSorted();
      if (live.join("\n") !== expected.join("\n")) {
        ctx.report.node(anchor, {
          message: `z-index vocabulary drift: expected [${expected.join(", ")}], found [${live.join(", ")}] — UI-Architecture-and-Layout.md`,
        });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/x.ts": "export const x = 1;",
        "packages/ui/src/layout/x.ts": "export const l = 1;",
        "packages/ui/src/tokens/tokens.json": `{"z":{${Z_TOKEN_NAMES.map((name) => `"${name}":{}`).join(",")}}}`,
      },
      expect: { count: 1, messageIncludes: "packages/ui/src/markdown/" },
      why: "LEGACY mustFlag[5], hard home-health arm: the markdown reviewed home is missing",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/layout/x.ts": "export const l = 1;",
        "packages/ui/src/markdown/x.ts": "export const m = 1;",
        "packages/ui/src/tokens/tokens.json": '{"z":{"base":{},"raised":{},"overlay":{},"modal":{},"popover":{},"toast":{}}}',
      },
      expect: { count: 1, messageIncludes: "z-index vocabulary drift" },
      why: "LEGACY mustFlag[4], hard vocabulary arm: deleting one governed token fails set equality",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/layout/x.ts": "export const l = 1;",
        "packages/ui/src/markdown/x.ts": "export const m = 1;",
        "packages/ui/src/tokens/tokens.json": `{"z":{${Z_TOKEN_NAMES.map((name) => `"${name}":{}`).join(",")}}}`,
      },
      why: "LEGACY mustPass[4], hard half: both homes and the governed vocabulary are healthy",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/layout/x.ts": "export const l = 1;",
        "packages/ui/src/markdown/x.ts": "export const m = 1;",
      },
      expect: { messageIncludes: "json:tokens is missing" },
      why: "THE SUPPLY REFUSAL (law §6.3): mustPass[0] minus the token vault. The `tokens` JSON resource is missing, so the dispatcher withholds this owner at the population phase and the vocabulary arm never compares an absent token set against Z_TOKEN_NAMES — neither as drift nor as clean",
    },
  ],
});
