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

const LEVEL = { error: 2, warn: 1, off: 0 } as const;
type Level = keyof typeof LEVEL;

const SESSIONS = "packages/server/src/domain/sessions";
const USERS = `${SESSIONS}/persistence/users.ts`;
const PROVISION = `${SESSIONS}/verbs/provision-identity.ts`;
const LINK = `${SESSIONS}/verbs/link-external-id.ts`;
const PENDING = `${SESSIONS}/verbs/pending-signup.ts`;
const NETWORK = "packages/server/src/infra/network";
const SUBSTRATE = "packages/server/src/domain/chat/substrate";
const DEBUG = "packages/server/src/foundation/observability/debug";

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
  // The entry tier cannot import the users table either, so a second users upsert has no home there (invariant 10).
  ["orb/no-direct-users-read", "packages/server/src/entry/auth/probe.ts", "error"],
  ["orb/vector-scope-derived", "packages/server/src/domain/embeddings/probe.ts", "off"],
  ["orb/vector-scope-derived", "packages/server/src/domain/chat/probe.ts", "error"],
  ["orb/notifications-inbox-owner", "packages/server/src/domain/notifications/persistence/probe.ts", "off"],
  ["orb/notifications-inbox-owner", "packages/server/src/domain/notifications/verbs/probe.ts", "error"],
  // The DB probes hold a read role in the users, inbox and vector rows; the rest of debug/ does not, and a probe still
  // may not write a vector table.
  ["orb/no-direct-users-read", `${DEBUG}/inspect/probe.ts`, "off"],
  ["orb/no-direct-users-read", `${DEBUG}/probe.ts`, "error"],
  ["orb/notifications-inbox-owner", `${DEBUG}/inspect/probe.ts`, "off"],
  ["orb/notifications-inbox-owner", `${DEBUG}/probe.ts`, "error"],
  ["orb/vector-scope-derived", `${DEBUG}/inspect/probe.ts`, "off"],
  ["orb/vector-scope-derived", `${DEBUG}/probe.ts`, "error"],
  ["orb/vector-scope-derived-write", `${DEBUG}/inspect/probe.ts`, "error"],
  ["orb/settings-kv-owner", "packages/server/src/domain/settings/persistence/probe.ts", "off"],
  ["orb/settings-kv-owner", "packages/server/src/domain/settings/verbs/probe.ts", "error"],
  // The re-export rows hold in every server file, the owning persistence included: a home names its table, never re-exports it.
  ["orb/notifications-inbox-owner-reexport", "packages/server/src/domain/notifications/persistence/probe.ts", "error"],
  ["orb/notifications-inbox-owner-reexport", "packages/client/src/features/probe/probe.ts", "off"],
  ["orb/settings-kv-owner-reexport", "packages/server/src/domain/settings/persistence/kv.ts", "error"],
  ["orb/settings-kv-owner-reexport", "tests/server/domain/settings/probe.int.test.ts", "off"],
  ["orb/prefer-to-sorted", "packages/kit/src/probe/probe.ts", "error"],
  ["orb/prefer-to-sorted", "packages/client/src/features/probe/probe.tsx", "error"],
  ["orb/prefer-to-sorted", "tooling/src/probe/probe.ts", "error"],
  ["orb/prefer-to-sorted", "tests/server/probe.test.ts", "error"],
  ["orb/prefer-to-sorted", "tests/client/probe.dom.test.tsx", "error"],
  ["orb/prefer-to-sorted", "scripts/probe.ts", "error"],
  ["orb/prefer-to-sorted", "packages/client/vite.config.ts", "error"],
  ["orb/prefer-to-sorted", "packages/showcase-plugins/bundles/probe/main.ts", "error"],
  ["orb/prefer-to-sorted", "packages/plugin-sdk/main.d.ts", "off"],
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
  ["@typescript-eslint/no-unsafe-type-assertion", "tests/support/node/route-trpc.ts", "off"],
  ["@typescript-eslint/no-unsafe-type-assertion", "tests/support/node/probe.ts", "error"],
  ["@typescript-eslint/consistent-type-assertions", "tests/support/iso/forged.ts", "off"],
  ["@typescript-eslint/consistent-type-assertions", "tests/support/iso/probe.ts", "error"],
  ["react-hooks/incompatible-library", "packages/ui/src/primitives/virtual-list/virtual-list.tsx", "off"],
  ["react-hooks/incompatible-library", "packages/ui/src/primitives/virtual-list/probe.tsx", "warn"],
  ["orb/no-raw-zustand-persist", "packages/client/src/state/persisted-store-implementation.ts", "off"],
  ["orb/no-raw-zustand-persist", "packages/client/src/state/probe.ts", "error"],
  ["orb/no-direct-useform", "packages/client/src/forms/editor/use-app-form.ts", "off"],
  ["orb/no-direct-useform", "packages/client/src/forms/editor/probe.ts", "error"],
  ["orb/firehose-import-allowlist", "packages/server/src/transport/trpc/index.ts", "off"],
  ["orb/firehose-import-allowlist", "packages/server/src/transport/trpc/probe.ts", "error"],
  ["orb/bus-channel-primitive", "packages/server/src/transport/trpc/bus-channel.ts", "off"],
  ["orb/bus-channel-primitive", "packages/server/src/transport/trpc/probe.ts", "error"],
  ["orb/no-raw-matchmedia", "packages/ui/src/lib/use-prefers-light-color-scheme.ts", "off"],
  ["orb/no-raw-matchmedia", "packages/ui/src/lib/probe.ts", "error"],
  ["orb/no-inline-invalidate-outside-seam", "packages/client/src/data/invalidation.ts", "off"],
  ["orb/no-inline-invalidate-outside-seam", "packages/client/src/data/probe.ts", "error"],
  ["orb/mutation-only-in-factory", "packages/client/src/data/create-entity-mutation.ts", "off"],
  ["orb/mutation-only-in-factory", "packages/client/src/data/probe.ts", "error"],
  ["orb/required-dialog-home", "packages/client/src/features/persona/anchors/first-run-persona-dialog.tsx", "off"],
  ["orb/required-dialog-home", "packages/client/src/features/persona/anchors/probe.tsx", "error"],
  ["orb/no-raw-interactive-intrinsics", "packages/client/src/features/app-shell/surfaces/app-shell.tsx", "off"],
  ["orb/no-raw-interactive-intrinsics", "packages/client/src/features/app-shell/surfaces/probe.tsx", "error"],
  ["orb/no-legacy-react-api", "packages/ui/src/markdown/dialogue-paragraph.tsx", "off"],
  ["orb/no-legacy-react-api", "packages/ui/src/markdown/probe.tsx", "error"],
  ["orb/bound-field-via-hook", "packages/client/src/forms/editor/bound-fields/use-bound-field.ts", "off"],
  ["orb/bound-field-via-hook", "packages/client/src/forms/editor/bound-fields/probe.tsx", "error"],
  ["orb/chat-stream-writes-in-bus-only", "packages/client/src/data/bus/chat-bus-writes.ts", "off"],
  ["orb/chat-stream-writes-in-bus-only", "packages/client/src/data/bus/probe.ts", "error"],
  ["orb/selection-store-via-factory", "packages/client/src/state/message-selection-store.ts", "off"],
  ["orb/selection-store-via-factory", "packages/client/src/state/probe-selection-store.ts", "error"],
  ["orb/state-files", "packages/client/src/state/index.ts", "off"],
  ["orb/state-files", "packages/client/src/state/probe.ts", "error"],
  ["orb/serde-core-definition-uniqueness", "packages/server/src/primitives/serde/card/index.ts", "off"],
  ["orb/serde-core-definition-uniqueness", "packages/server/src/primitives/serde/card/probe.ts", "error"],
  ["orb/no-spread-corpus-capture", "tests/support/node/corpus-read-responder.int.test.ts", "off"],
  ["orb/no-spread-corpus-capture", "tests/support/node/probe.int.test.ts", "error"],
] as const satisfies readonly (readonly [string, string, Level])[])("%s at %s is %s", async ([rule, path, level]) => {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  expect(levelOf(config.rules[rule]) ?? LEVEL.off).toBe(LEVEL[level]);
});

// [rule, path, option, carried]: an exemption that changes a rule's options rather than its level, beside its neighbour.
test.for([
  ["@typescript-eslint/triple-slash-reference", "packages/plugin-sdk/main.d.ts", '"path":"always"', true],
  ["@typescript-eslint/triple-slash-reference", "packages/plugin-sdk/probe.ts", '"path":"always"', false],
  ["no-restricted-imports", "packages/client/src/components/character-picker.tsx", "A paged suspending read", false],
  ["no-restricted-imports", "packages/client/src/components/probe.tsx", "A paged suspending read", true],
  ["orb/no-hand-copied-label", "tests/contracts/inference/warnings.contract.test.ts", '"scope":"all"', false],
  ["orb/no-hand-copied-label", "tests/contracts/inference/probe.contract.test.ts", '"scope":"all"', true],
] as const)("%s at %s carries %s: %s", async ([rule, path, option, carried]) => {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  expect(JSON.stringify(config.rules[rule] ?? null).includes(option)).toBe(carried);
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
