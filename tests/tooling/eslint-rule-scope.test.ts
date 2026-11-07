// Each rule's extent in the production flat config: the level it resolves to on both sides of every exemption, and the
// generated families the config never lints. A widened `ignores` or `files` entry turns one of these rows red.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint } from "eslint";
import { beforeAll } from "vitest";
import { levelOf, resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a row's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, "packages/server/src/index.ts"));
}, 120_000);

const LEVEL = { error: 2, off: 0 } as const;
type Level = keyof typeof LEVEL;

const SESSIONS = "packages/server/src/domain/sessions";
const USERS = `${SESSIONS}/persistence/users.ts`;
const PROVISION = `${SESSIONS}/verbs/provision-identity.ts`;
const LINK = `${SESSIONS}/verbs/link-external-id.ts`;
const PENDING = `${SESSIONS}/verbs/pending-signup.ts`;
const NETWORK = "packages/server/src/infra/network";
const SUBSTRATE = "packages/server/src/domain/chat/substrate";

// [rule, path, level]: each exempt home sits beside a neighbour in its own folder that the rule still reaches.
test.for([
  ["orb/scrubber-home", `${SUBSTRATE}/member-visibility.ts`, "off"],
  ["orb/scrubber-home", `${SUBSTRATE}/member-card.ts`, "error"],
  ["orb/scrubber-home", "packages/kit/src/content/probe.ts", "error"],
  ["orb/external-id-subject-binds", USERS, "off"],
  ["orb/external-id-subject-binds", PROVISION, "off"],
  ["orb/external-id-subject-binds", LINK, "error"],
  ["orb/external-id-subject-binds", PENDING, "error"],
  ["orb/external-id-opaque-users-writes", PROVISION, "off"],
  ["orb/external-id-opaque-users-writes", LINK, "error"],
  ["orb/external-id-claim-writer-callers", LINK, "off"],
  ["orb/external-id-claim-writer-callers", PROVISION, "off"],
  ["orb/external-id-claim-writer-callers", PENDING, "error"],
  ["orb/external-id-pending-join-writer-callers", PENDING, "off"],
  ["orb/external-id-pending-join-writer-callers", LINK, "error"],
  ["orb/external-id-raw-users-writes", USERS, "off"],
  ["orb/external-id-raw-users-writes", PROVISION, "error"],
  ["orb/external-id-writer-home", USERS, "error"],
  ["orb/external-id-writer-home", PROVISION, "off"],
  ["orb/no-raw-egress", `${NETWORK}/egress.ts`, "off"],
  ["orb/no-raw-egress", `${NETWORK}/tls-terminator.ts`, "error"],
  ["orb/no-raw-http-client", `${NETWORK}/tls-terminator.ts`, "off"],
  ["orb/no-raw-http-client", `${NETWORK}/egress.ts`, "error"],
  ["orb/no-raw-egress", "packages/inference/src/backends/probe.ts", "error"],
  ["orb/sole-env-reader", "packages/server/src/foundation/env/index.ts", "off"],
  ["orb/sole-env-reader", "packages/server/src/foundation/env/probe.ts", "error"],
  ["orb/no-module-state", "packages/server/src/infra/plugin-host/module.ts", "off"],
  ["orb/no-module-state", "packages/server/src/infra/plugin-host/membrane.ts", "error"],
  ["orb/plugin-dump-guard", "packages/server/src/infra/plugin-host/membrane.ts", "error"],
  ["orb/plugin-dump-guard", "packages/server/src/infra/plugin-host/module.ts", "off"],
  ["orb/member-card-clamped-clamp", `${SUBSTRATE}/auth/probe.ts`, "off"],
  ["orb/member-card-clamped-clamp", `${SUBSTRATE}/probe.ts`, "error"],
  ["orb/no-direct-users-read", `${SESSIONS}/verbs/probe.ts`, "off"],
  ["orb/no-direct-users-read", "packages/server/src/domain/chat/verbs/probe.ts", "error"],
  ["orb/vector-scope-derived", "packages/server/src/domain/embeddings/probe.ts", "off"],
  ["orb/vector-scope-derived", "packages/server/src/domain/chat/probe.ts", "error"],
  ["orb/persistence-boundary", "packages/client/src/state/durable-local.ts", "off"],
  ["orb/persistence-boundary", "packages/client/src/state/probe.ts", "error"],
  ["orb/session-channel-boundary", "packages/client/src/lib/session-channel.ts", "off"],
  ["orb/session-channel-boundary", "packages/client/src/lib/probe.ts", "error"],
  ["orb/client-cache-surgery-only-in-data", "packages/client/src/data/probe.ts", "off"],
  ["orb/client-cache-surgery-only-in-data", "packages/client/src/state/probe.ts", "error"],
  ["orb/destructive-needs-confirm", "packages/client/src/features/persona/components/persona-room-block.tsx", "off"],
  ["orb/destructive-needs-confirm", "packages/client/src/features/persona/components/probe.tsx", "error"],
  ["orb/no-portal-float-token", "packages/ui/src/primitives/popover/variants.ts", "off"],
  ["orb/no-portal-float-token", "packages/ui/src/primitives/popover/popover.tsx", "error"],
  ["orb/no-unruled-flip-inversion", "packages/ui/src/primitives/tabs/tabs.tsx", "off"],
  ["orb/no-unruled-flip-inversion", "packages/ui/src/primitives/tabs/probe.tsx", "error"],
  // Both halves of the feature class rules: the client JSX they govern and the @orb/ui source that owns classes.
  ["orb/feature-classname-layout-only", "packages/client/src/features/chat/components/probe.tsx", "error"],
  ["orb/no-built-class-string", "packages/client/src/features/chat/components/probe.tsx", "error"],
  ["orb/feature-classname-layout-only", "packages/ui/src/primitives/tabs/probe.tsx", "off"],
  ["orb/no-built-class-string", "packages/ui/src/primitives/tabs/probe.tsx", "off"],
  // A generated module carries no native rule; its authored neighbour carries every one.
  ["@typescript-eslint/no-floating-promises", "packages/server/src/domain/chat/probe.gen.ts", "off"],
  ["@typescript-eslint/no-floating-promises", "packages/server/src/domain/chat/probe.ts", "error"],
] as const satisfies readonly (readonly [string, string, Level])[])("%s at %s is %s", async ([rule, path, level]) => {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  expect(levelOf(config.rules[rule]) ?? LEVEL.off).toBe(LEVEL[level]);
});

// One row per family the config never lints, and the authored neighbour each family sits beside.
test.for([
  ["packages/server/node_modules/probe/index.ts", true],
  ["packages/client/dist/assets/probe.ts", true],
  [".cache/probe.mjs", true],
  [".claude/worktrees/probe/packages/server/src/index.ts", true],
  [".stryker-tmp/sandbox/packages/server/src/index.ts", true],
  ["reports/probe.ts", true],
  ["coverage/probe.ts", true],
  ["playwright-report/probe.ts", true],
  ["test-results/probe.ts", true],
  ["packages/ui/src/tokens/index.ts", true],
  ["tooling/src/snap/lib/devtools-frontend/probe.ts", true],
  ["tooling/src/codemods/probe/tests/probe.ts", true],
  ["packages/ui/src/tokens/probe.ts", false],
  ["tooling/src/codemods/probe/scripts/codemod.ts", false],
  [".claude/hooks/probe.mjs", false],
  ["packages/server/src/index.ts", false],
] as const)("%s is ignored: %s", async ([path, ignored]) => {
  expect(await eslint.isPathIgnored(join(ROOT, path))).toBe(ignored);
});
