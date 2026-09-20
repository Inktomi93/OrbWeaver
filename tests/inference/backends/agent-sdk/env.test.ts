// backends/agent-sdk/env — the per-user subscription spawn env (§8.4): the token arm is the ONLY arm (an
// empty token is `auth_failed`, never a host-file fallback), the per-user config dir is pinned on both
// `CLAUDE_CONFIG_DIR` and `ANTHROPIC_CONFIG_DIR`, every API-key/base-URL pin is UNSET so a host value can
// never leak into the child, host env is allowlisted (no `PATH`-adjacent secrets ride), and a preset's
// escape hatch can never touch a reserved key.

import { buildClaudeSdkEnv, CLAUDE_OAUTH_TOKEN_ENV, RESERVED_CLAUDE_ENV_KEYS } from "../../../../packages/inference/src/backends/agent-sdk/env.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { expect, test } from "../../../support/fixtures.ts";

const HOST = { PATH: "/usr/bin", HOME: "/home/box", ANTHROPIC_API_KEY: "sk-host-leak", AWS_SECRET_ACCESS_KEY: "aws-leak", CLAUDE_CONFIG_DIR: "/root/.claude" };

test("the token arm: token pinned last, config dir per user, every host auth pin unset", () => {
  const env = buildClaudeSdkEnv({ hostEnv: HOST, token: "sk-ant-oat01-user", configDir: "/data/users/u1/claude" });
  expect(env[CLAUDE_OAUTH_TOKEN_ENV]).toBe("sk-ant-oat01-user");
  expect(env["CLAUDE_CONFIG_DIR"]).toBe("/data/users/u1/claude");
  expect(env["ANTHROPIC_CONFIG_DIR"]).toBe("/data/users/u1/claude");
  expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
  expect(env["ANTHROPIC_BASE_URL"]).toBeUndefined();
  expect(env["ANTHROPIC_AUTH_TOKEN"]).toBeUndefined();
  expect("ANTHROPIC_API_KEY" in env).toBe(true); // explicitly unset, not merely absent — it overrides a spawn's inherited value
  expect(env["AWS_SECRET_ACCESS_KEY"]).toBeUndefined();
  expect(env["CLAUDE_CODE_DISABLE_CLAUDE_MDS"]).toBe("true");
});

function caught(fn: () => unknown): unknown {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  return thrown;
}

test("an empty token is auth_failed — there is no host-file arm to fall back to", () => {
  const err = caught(() => buildClaudeSdkEnv({ hostEnv: HOST, token: "", configDir: "/data/users/u1/claude" }));
  expect(err).toBeInstanceOf(ProviderError);
  expect(err).toMatchObject({ kind: "auth_failed" });
});

test("two users' spawns never share a config dir", () => {
  const a = buildClaudeSdkEnv({ hostEnv: HOST, token: "tok-a", configDir: "/data/users/a/claude" });
  const b = buildClaudeSdkEnv({ hostEnv: HOST, token: "tok-b", configDir: "/data/users/b/claude" });
  expect(a["CLAUDE_CONFIG_DIR"]).not.toBe(b["CLAUDE_CONFIG_DIR"]);
  expect(a[CLAUDE_OAUTH_TOKEN_ENV]).not.toBe(b[CLAUDE_OAUTH_TOKEN_ENV]);
});

test("the preset escape hatch cannot set or unset a reserved key", () => {
  const env = buildClaudeSdkEnv({
    hostEnv: HOST,
    token: "tok",
    configDir: "/data/users/u1/claude",
    overrides: {
      userEnv: { CLAUDE_CONFIG_DIR: "/etc/evil", ANTHROPIC_API_KEY: "sk-evil", ANTHROPIC_BASE_URL: "https://evil", CLAUDE_CODE_MAX_THINKING_TOKENS: "4096" },
    },
  });
  expect(env["CLAUDE_CONFIG_DIR"]).toBe("/data/users/u1/claude");
  expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
  expect(env["ANTHROPIC_BASE_URL"]).toBeUndefined();
  for (const key of ["ANTHROPIC_API_KEY", "CLAUDE_CONFIG_DIR", CLAUDE_OAUTH_TOKEN_ENV, "ANTHROPIC_DEFAULT_OPUS_MODEL"]) {
    expect(RESERVED_CLAUDE_ENV_KEYS.has(key), key).toBe(true);
  }
});
