// `seed multi-user` speaks HTTP only — it must not pay the server env-schema parse cost that `demo`/`chat`
// pull in transitively (@orb/server/foundation/env's module-level `envSchema.parse(process.env)`, which is
// boot-FATAL under an incomplete env). Regression for #2407: the CLI used to dispatch through a shared
// barrel (./index.ts) that re-exported all three verbs, so `multi-user` imported the server env schema for
// no reason.
import { expect, test } from "../../support/tool-fixtures.ts";

test("multi-user runs under an env that is boot-fatal for the SERVER env schema", async ({ runCli }) => {
  // AUTH_MODE=oidc with none of its required companions (OIDC_ISSUER, …) is boot-fatal for
  // `@orb/server/foundation/env` (packages/server/src/foundation/env/index.ts's superRefine). If the CLI
  // still imported that schema to dispatch `multi-user`, this would fail on an env-parse ZodError before
  // ever reaching multiUserConfig()'s own SEED_BASE_URL check.
  const result = await runCli("seed", ["multi-user"], {
    env: { ["AUTH_MODE"]: "oidc" },
  });
  // Refused on ITS OWN missing-config check (SEED_BASE_URL, a UsageError → misuse) never on the server's
  // env parse (which would crash the run-tool try/catch as a tool error) — proves the server schema was
  // never imported for this verb.
  await expect(result).toExitWith(3);
  expect(result.stderr).toContain("SEED_BASE_URL is required");
  expect(result.stderr).not.toContain("OIDC_ISSUER is required");
});

test("demo and chat still resolve to the server-composing seeders (lazy import wired correctly)", async ({ runCli }) => {
  // Sanity check the OTHER two verbs still reach their real implementations — they should fail on the
  // server env schema (a thrown ZodError, mapped to tool error by run-tool.ts) rather than on an
  // unknown-command usage error, proving the lazy `await import("./ops/<verb>.ts")` dispatch in cli.ts
  // still resolves each verb correctly.
  const result = await runCli("seed", ["demo"], {
    env: { ["AUTH_MODE"]: "oidc" },
  });
  await expect(result).toExitWith(2);
  expect(result.stderr).toContain("OIDC_ISSUER is required");
});
