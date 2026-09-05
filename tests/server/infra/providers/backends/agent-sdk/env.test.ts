// The CARRIED-FORWARD credential-firewall test (providers.md §7.1 / Esoteric §1). The load-bearing
// security guarantees: a mode-2 OR-skin spawn can NEVER see the Max-sub OAuth token, AND a preset's
// escape hatch can NEVER set/strip a reserved (auth/routing/isolation) key. If any of these flip, the sub
// token can leak to a paid endpoint — a ban-risk hole.

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { HOST_OWNED_CLAUDE_ENV_KEYS } from "@orb/contracts/preset";
import { buildClaudeAnthEnv, buildClaudeOpenRouterEnv, buildClaudeSdkEnv, RESERVED_CLAUDE_ENV_KEYS } from "@orb/server/infra/providers/backends/agent-sdk";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

const OR_KEY = "sk-or-test-key";
const FAKE_SUB_TOKEN = "oauth-sub-token-SECRET";
const OPENROUTER_BASE = "https://openrouter.ai/api";
const KEY_REQUIRED_RE = /OpenRouter API key is required/u;
const ANTH_KEY_REQUIRED_RE = /Anthropic API key is required/u;
const UNSAFE_RUNTIME_ENV_RE = /unsafe runtime environment key/u;
// The derived tier→slug map the caller (connection) now supplies — the firewall carries NO hardcoded map.
const TIER_MODELS = {
  opus: "anthropic/claude-opus-4.8",
  sonnet: "anthropic/claude-sonnet-5",
  haiku: "anthropic/claude-haiku-4.5",
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mode-2 (OpenRouter-Anthropic skin) firewall", () => {
  test("the sub OAuth token is structurally unreachable — every host credential source is nulled", () => {
    // Simulate an ambient host sub token + the app's own secret in the environment.
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", FAKE_SUB_TOKEN);
    vi.stubEnv("ANTHROPIC_IDENTITY_TOKEN", FAKE_SUB_TOKEN);
    vi.stubEnv("OPENROUTER_API_KEY", "host-or-secret");

    const env = buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS);

    // The token string appears NOWHERE in the spawn env.
    expect(Object.values(env)).not.toContain(FAKE_SUB_TOKEN);
    // Every host credential source is explicitly nulled.
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    expect(env["ANTHROPIC_IDENTITY_TOKEN"]).toBeUndefined();
    expect(env["ANTHROPIC_IDENTITY_TOKEN_FILE"]).toBeUndefined();
    expect(env["ANTHROPIC_SERVICE_ACCOUNT_ID"]).toBeUndefined();
    // The only auth in scope is the OpenRouter key, pointed at the paid skin.
    expect(env["ANTHROPIC_BASE_URL"]).toBe(OPENROUTER_BASE);
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBe(OR_KEY);
    // EMPTY string (not unset) so the runtime can't fall through to another credential source.
    expect(env["ANTHROPIC_API_KEY"]).toBe("");
    // The app's own secret is stripped from the host baseline.
    expect(env["OPENROUTER_API_KEY"]).toBeUndefined();
  });

  test("the tier envs are EXACTLY the passed tier map (no hardcoded model strings in the firewall)", () => {
    // The derived sonnet slug is the daemon-current `claude-sonnet-5`, not the old stale `4.6` pin — the
    // firewall echoes whatever the caller derived, so a family roll-forward is picked up automatically.
    const env = buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS);
    expect(env["ANTHROPIC_DEFAULT_OPUS_MODEL"]).toBe(TIER_MODELS.opus);
    expect(env["ANTHROPIC_DEFAULT_SONNET_MODEL"]).toBe(TIER_MODELS.sonnet);
    expect(env["ANTHROPIC_DEFAULT_HAIKU_MODEL"]).toBe(TIER_MODELS.haiku);
  });

  test("the ephemeral config dir is EMPTY — no .credentials.json is reachable", () => {
    const env = buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS);
    expect(env["CLAUDE_CONFIG_DIR"]).toBeDefined();
    expect(env["ANTHROPIC_CONFIG_DIR"]).toBe(env["CLAUDE_CONFIG_DIR"]);
    const dir = env["CLAUDE_CONFIG_DIR"] as string;
    expect(existsSync(join(dir, ".credentials.json"))).toBe(false);
  });

  test("a missing OpenRouter key fails loudly (the key-required invariant)", () => {
    expect(() => buildClaudeOpenRouterEnv("", TIER_MODELS)).toThrow(KEY_REQUIRED_RE);
  });
});

describe("the preset escape hatch cannot breach the firewall (reserved-keys filter before the overlay)", () => {
  test("a preset can neither REPOINT auth/routing nor STRIP the firewall", () => {
    // Typed as a Record so the SCREAMING_CASE env keys are an index-signature (not literal property
    // names) — the same reason the firewall builders' own env objects don't trip useNamingConvention.
    // Built via tuples (string-literal keys, not identifier property names) so the SCREAMING_CASE
    // wire env-var names don't trip useNamingConvention.
    const hatch: Record<string, string | null> = Object.fromEntries([
      // Attempts to repoint the paid spawn / re-add the sub token / move the config dir:
      ["ANTHROPIC_BASE_URL", "https://evil.example"],
      ["ANTHROPIC_AUTH_TOKEN", "attacker-key"],
      ["CLAUDE_CODE_OAUTH_TOKEN", FAKE_SUB_TOKEN],
      ["CLAUDE_CONFIG_DIR", "/tmp/attacker"],
      ["ANTHROPIC_DEFAULT_OPUS_MODEL", "evil/model"],
      // An attempt to STRIP the firewall by unsetting it:
      ["ANTHROPIC_API_KEY", null],
      // A legitimate CLAUDE-namespace knob DOES pass through (the hatch's whole remaining job):
      ["CLAUDE_CODE_CUSTOM_KNOB", "ok"],
    ]);
    const env = buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS, { userEnv: hatch });

    // Runner-owned auth/routing wins over every escape-hatch attempt.
    expect(env["ANTHROPIC_BASE_URL"]).toBe(OPENROUTER_BASE);
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBe(OR_KEY);
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    // The tier default is the CALLER's derived value (still reserved — the hatch's "evil/model" was dropped).
    expect(env["ANTHROPIC_DEFAULT_OPUS_MODEL"]).toBe(TIER_MODELS.opus);
    expect(env["CLAUDE_CONFIG_DIR"]).not.toBe("/tmp/attacker");
    // The strip attempt is ignored — the firewall's empty-string API key stands.
    expect(env["ANTHROPIC_API_KEY"]).toBe("");
    expect(Object.values(env)).not.toContain(FAKE_SUB_TOKEN);
    // The in-namespace knob survives.
    expect(env["CLAUDE_CODE_CUSTOM_KNOB"]).toBe("ok");
  });

  test("RESERVED_CLAUDE_ENV_KEYS names every auth/isolation/routing key the hatch must not touch", () => {
    for (const key of [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "CLAUDE_CONFIG_DIR",
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
    ]) {
      expect(RESERVED_CLAUDE_ENV_KEYS.has(key)).toBe(true);
    }
  });
});

describe("host baseline strips the ambient Claude/Anthropic control surface (uncontrolled-behavior leak)", () => {
  test("ambient CLAUDE_*/ANTHROPIC_*/CLAUDECODE and unsupported variables are stripped; PATH survives", () => {
    // Simulate the operator's own Claude Code session / a deploy shell exporting control knobs.
    vi.stubEnv("CLAUDE_CODE_SOME_AMBIENT_KNOB", "ambient-value");
    vi.stubEnv("ANTHROPIC_MODEL", "some-ambient-model");
    vi.stubEnv("CLAUDECODE", "1");
    // An arbitrary variable is not a supported child dependency; PATH is.
    vi.stubEnv("SOME_UNRELATED_PATH_VAR", "/opt/keep-me");
    vi.stubEnv("PATH", "/usr/bin:/bin");

    const env = buildClaudeSdkEnv();

    // The entire ambient Claude/Anthropic namespace is stripped from the baseline.
    expect(env["CLAUDE_CODE_SOME_AMBIENT_KNOB"]).toBeUndefined();
    expect(env["ANTHROPIC_MODEL"]).toBeUndefined();
    expect(env["CLAUDECODE"]).toBeUndefined();
    expect(env["SOME_UNRELATED_PATH_VAR"]).toBeUndefined();
    expect(env["PATH"]).toBe("/usr/bin:/bin");
  });

  test("inherits only the supported host baseline — preload/search/runtime injection variables never reach the child", () => {
    for (const [key, value] of [
      ["NODE_OPTIONS", "--require=/tmp/owned.cjs"],
      ["NODE_PATH", "/tmp/attacker-modules"],
      ["LD_PRELOAD", "/tmp/owned.so"],
      ["LD_LIBRARY_PATH", "/tmp/attacker-libs"],
      ["DYLD_INSERT_LIBRARIES", "/tmp/owned.dylib"],
      ["BASH_ENV", "/tmp/owned.sh"],
      ["PYTHONPATH", "/tmp/attacker-python"],
    ] as const) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("PATH", "/usr/bin:/bin");
    vi.stubEnv("LANG", "C.UTF-8");

    const env = buildClaudeSdkEnv();

    expect(env["PATH"]).toBe("/usr/bin:/bin");
    expect(env["LANG"]).toBe("C.UTF-8");
    for (const key of ["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "BASH_ENV", "PYTHONPATH"]) {
      expect(env[key], `${key} must not survive the explicit host-env allowlist`).toBeUndefined();
    }
  });
});

describe("preset env validation rejects runtime preload/search injection", () => {
  test("every dangerous loader/search key is rejected instead of silently persisted", () => {
    for (const key of [
      "NODE_OPTIONS",
      "NODE_PATH",
      "LD_PRELOAD",
      "LD_LIBRARY_PATH",
      "DYLD_INSERT_LIBRARIES",
      "BASH_ENV",
      "ENV",
      "PYTHONPATH",
      "RUBYOPT",
      "PERL5OPT",
    ]) {
      expect(() => buildClaudeSdkEnv({ userEnv: { [key]: "attacker-controlled" } }), key).toThrow(UNSAFE_RUNTIME_ENV_RE);
    }
  });

  test("preset proxy and CA overrides cannot route a credential, while operator ambient values survive", () => {
    vi.stubEnv("HTTPS_PROXY", "https://operator-proxy.example");
    vi.stubEnv("ALL_PROXY", "socks5://operator-proxy.example");
    vi.stubEnv("NODE_EXTRA_CA_CERTS", "/etc/orbweaver/operator-ca.pem");
    const ambient = buildClaudeSdkEnv();
    expect(ambient["HTTPS_PROXY"]).toBe("https://operator-proxy.example");
    expect(ambient["ALL_PROXY"]).toBe("socks5://operator-proxy.example");
    expect(ambient["NODE_EXTRA_CA_CERTS"]).toBe("/etc/orbweaver/operator-ca.pem");
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS"]) {
      expect(() => buildClaudeAnthEnv(ANTH_KEY, { userEnv: { [key]: "attacker-controlled" } }), key).toThrow(UNSAFE_RUNTIME_ENV_RE);
    }
  });
});

// #1472 — THE HATCH IS AN ALLOWLIST, NOT A DENY SET. A preset is user-writable
// (`userIntentSchema.advanced.claudeEnv`), and its values land in the environment of a CHILD PROCESS that
// runs tools as the host. A deny list over process-critical variables loses to the first name nobody
// enumerated: HOME/PATH/SHELL/TMPDIR were all missing from it, and so were LD_AUDIT, GIT_SSH_COMMAND and
// JAVA_TOOL_OPTIONS. PATH redirects which BINARY the child executes; HOME redirects where it reads config
// and credentials. Only the Claude runtime's own knob namespace may be set from a preset.
const REJECTED_HATCH_KEYS = [
  // Process execution + filesystem resolution — the escalation this pin exists for.
  "HOME",
  "PATH",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "USER",
  "LOGNAME",
  // Names a deny list did not carry (the reason the polarity flipped).
  "LD_AUDIT",
  "GIT_SSH_COMMAND",
  "JAVA_TOOL_OPTIONS",
  "PYTHONSTARTUP",
  "PAGER",
  // Case games: env keys are case-sensitive, so a lowercased spelling is a DIFFERENT key, never an allowed one.
  "path",
  "claude_code_custom_knob",
  // Auth/routing is RUNNER-owned: the whole ANTHROPIC namespace is outside the hatch, reserved or not.
  "ANTHROPIC_MODEL",
] as const;

describe("the escape hatch is allowlisted to the Claude runtime knob namespace", () => {
  test("mode-1 refuses every out-of-namespace key instead of overlaying it on the child env", () => {
    for (const key of REJECTED_HATCH_KEYS) {
      expect(() => buildClaudeSdkEnv({ userEnv: { [key]: "attacker-controlled" } }), key).toThrow(UNSAFE_RUNTIME_ENV_RE);
    }
  });

  test("mode-2 and mode-4 refuse them too (one predicate, every builder)", () => {
    for (const key of REJECTED_HATCH_KEYS) {
      expect(() => buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS, { userEnv: { [key]: "attacker-controlled" } }), key).toThrow(UNSAFE_RUNTIME_ENV_RE);
      expect(() => buildClaudeAnthEnv(ANTH_KEY, { userEnv: { [key]: "attacker-controlled" } }), key).toThrow(UNSAFE_RUNTIME_ENV_RE);
    }
  });

  test("the host baseline still supplies PATH/HOME — the hatch cannot move them, the operator's values stand", () => {
    vi.stubEnv("PATH", "/usr/bin:/bin");
    vi.stubEnv("HOME", "/home/orbweaver");
    const env = buildClaudeSdkEnv();
    expect(env["PATH"]).toBe("/usr/bin:/bin");
    expect(env["HOME"]).toBe("/home/orbweaver");
  });

  // POSITIVE CONTROL — an allowlist that admitted nothing would pass every rejection pin above.
  test("an ALLOWED key still reaches the child (the two non-prefixed runtime knobs included)", () => {
    const env = buildClaudeSdkEnv({
      userEnv: Object.fromEntries([
        ["CLAUDE_CODE_CUSTOM_KNOB", "ok"],
        ["MAX_THINKING_TOKENS", "4096"],
        ["DISABLE_AUTO_COMPACT", "1"],
      ]),
    });
    expect(env["CLAUDE_CODE_CUSTOM_KNOB"]).toBe("ok");
    expect(env["MAX_THINKING_TOKENS"]).toBe("4096");
    expect(env["DISABLE_AUTO_COMPACT"]).toBe("1");
  });
});

// #1541 — THE PAIR THE RUNTIME REFUSES. `CLAUDE_CODE_MAX_CONTEXT_TOKENS` together with
// `DISABLE_AUTO_COMPACT` is a hard SDK `is_error` (live-verified both ways, 2026-07-24): with auto-compaction
// off the runtime has no mechanism left to honour a context cap, so it fails the turn instead. `translate.ts`
// already refuses to MINT the pair from the typed knobs (it drops the cap under managed compaction) — but the
// preset hatch writes into the SAME env AFTER those knobs, so either half could still arrive from
// `advanced.claudeEnv` and produce a turn that always errors. The repo refuses at the boundary rather than
// documenting a footgun, and the boundary is the BUILDER: it is the only place that sees the merged result of
// the compaction mode AND the hatch (the write schema sees the hatch alone, so it cannot tell).
const COMPACTION_PAIR_RE = /DISABLE_AUTO_COMPACT/u;

describe("the compaction pair is refused at the env boundary (#1541)", () => {
  test("mode-1: a hatch-supplied context cap under managed compaction is REFUSED, typed and readable", () => {
    let thrown: unknown;
    try {
      buildClaudeSdkEnv({ disableAutoCompact: true, userEnv: Object.fromEntries([["CLAUDE_CODE_MAX_CONTEXT_TOKENS", "100000"]]) });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({ name: "ProviderError", kind: "invalid", retryable: false });
    // The message names BOTH halves and says which way out exists — a refusal nobody can act on is a wall.
    expect((thrown as Error).message).toMatch(COMPACTION_PAIR_RE);
    expect((thrown as Error).message).toMatch(/CLAUDE_CODE_MAX_CONTEXT_TOKENS/u);
  });

  test("the other direction: a hatch-supplied DISABLE_AUTO_COMPACT under a typed context cap is REFUSED", () => {
    expect(() => buildClaudeSdkEnv({ maxContextTokens: 100_000, userEnv: Object.fromEntries([["DISABLE_AUTO_COMPACT", "1"]]) })).toThrow(COMPACTION_PAIR_RE);
  });

  test("both halves from the hatch alone are REFUSED too (the typed knobs are not the only door)", () => {
    expect(() =>
      buildClaudeSdkEnv({
        userEnv: Object.fromEntries([
          ["DISABLE_AUTO_COMPACT", "1"],
          ["CLAUDE_CODE_MAX_CONTEXT_TOKENS", "100000"],
        ]),
      }),
    ).toThrow(COMPACTION_PAIR_RE);
  });

  test("every builder refuses — the firewall has three doors and the SDK is the same behind all of them", () => {
    const pair = { disableAutoCompact: true, userEnv: Object.fromEntries([["CLAUDE_CODE_MAX_CONTEXT_TOKENS", "100000"]]) };
    expect(() => buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS, pair)).toThrow(COMPACTION_PAIR_RE);
    expect(() => buildClaudeAnthEnv(ANTH_KEY, pair)).toThrow(COMPACTION_PAIR_RE);
  });

  // POSITIVE CONTROLS — the refusal is the PAIR, not either knob. A blanket ban would pass every pin above.
  test("either half ALONE still reaches the child", () => {
    expect(buildClaudeSdkEnv({ disableAutoCompact: true })["DISABLE_AUTO_COMPACT"]).toBe("1");
    const capped = buildClaudeSdkEnv({ maxContextTokens: 100_000 });
    expect(capped["CLAUDE_CODE_MAX_CONTEXT_TOKENS"]).toBe("100000");
    expect(capped["DISABLE_AUTO_COMPACT"]).toBeUndefined();
  });

  test("a hatch that UNSETS one half cures the pair — the guard reads the merged env, not the intent", () => {
    const env = buildClaudeSdkEnv({
      disableAutoCompact: true,
      userEnv: Object.fromEntries([
        ["DISABLE_AUTO_COMPACT", null],
        ["CLAUDE_CODE_MAX_CONTEXT_TOKENS", "100000"],
      ]),
    });
    expect(env["DISABLE_AUTO_COMPACT"]).toBeUndefined();
    expect(env["CLAUDE_CODE_MAX_CONTEXT_TOKENS"]).toBe("100000");
  });
});

// #1536 — THE ALLOWLIST'S RESIDUE. Flipping the hatch to the `CLAUDE_*` namespace (#1472) admitted the
// namespace the APP'S OWN deploy pins live in: `ISOLATION_PINS` + the CLAUDE.md suppression are all
// `CLAUDE_CODE_*`, and `RESERVED_CLAUDE_ENV_KEYS` covered only auth/routing/config-dir — so a preset could
// re-enable auto-memory, background tasks, cron, the full system prompt, CLAUDE.md injection and the
// cache-churning attribution header inside the (potentially adversarial) RP subprocess, or UNSET any of
// them with `null`. These are HOST/deploy decisions, not generation knobs: the value is compared against
// the un-hatched baseline rather than re-spelled, so the pin holds whatever the deploy chose.
const POISON = "0";

describe("host-owned isolation pins survive the escape hatch (#1536)", () => {
  test("mode-1: neither a value nor a null can move a single host-owned pin", () => {
    const baseline = buildClaudeSdkEnv();
    const poisoned = buildClaudeSdkEnv({ userEnv: Object.fromEntries(HOST_OWNED_CLAUDE_ENV_KEYS.map((k) => [k, POISON])) });
    const nulled = buildClaudeSdkEnv({ userEnv: Object.fromEntries(HOST_OWNED_CLAUDE_ENV_KEYS.map((k) => [k, null])) });
    for (const key of HOST_OWNED_CLAUDE_ENV_KEYS) {
      expect(baseline[key], `${key} must be pinned in the baseline at all`).toBeDefined();
      expect(poisoned[key], `${key} must keep the deploy's value against a preset override`).toBe(baseline[key]);
      expect(nulled[key], `${key} must survive a preset UNSET`).toBe(baseline[key]);
    }
  });

  test("mode-2 and mode-4 hold the same pins (the hatch reaches every builder)", () => {
    const poison = Object.fromEntries(HOST_OWNED_CLAUDE_ENV_KEYS.map((k) => [k, POISON]));
    const or = { base: buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS), hatched: buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS, { userEnv: poison }) };
    const anth = { base: buildClaudeAnthEnv(ANTH_KEY), hatched: buildClaudeAnthEnv(ANTH_KEY, { userEnv: poison }) };
    for (const key of HOST_OWNED_CLAUDE_ENV_KEYS) {
      expect(or.hatched[key], `mode-2 ${key}`).toBe(or.base[key]);
      expect(anth.hatched[key], `mode-4 ${key}`).toBe(anth.base[key]);
    }
  });

  test("RESERVED_CLAUDE_ENV_KEYS names every host-owned pin (the builder's own belt, not just the schema)", () => {
    for (const key of HOST_OWNED_CLAUDE_ENV_KEYS) {
      expect(RESERVED_CLAUDE_ENV_KEYS.has(key), `${key} must be reserved at the builder`).toBe(true);
    }
  });

  // POSITIVE CONTROL — narrowing the namespace must not close the hatch it exists to keep open.
  test("a non-pin CLAUDE knob still passes through beside the pins", () => {
    const env = buildClaudeSdkEnv({
      userEnv: Object.fromEntries([...HOST_OWNED_CLAUDE_ENV_KEYS.map((k) => [k, POISON]), ["CLAUDE_CODE_CUSTOM_KNOB", "ok"]]),
    });
    expect(env["CLAUDE_CODE_CUSTOM_KNOB"]).toBe("ok");
  });
});

describe("mode-1 (Max sub) firewall", () => {
  test("the OR-skin trio is nulled so a stale ambient export can't repoint the free sub at a paid endpoint", () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://stale-paid.example");
    const env = buildClaudeSdkEnv();
    expect(env["ANTHROPIC_BASE_URL"]).toBeUndefined();
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBeUndefined();
    // CLAUDE.md injection + the isolation pins are on.
    expect(env["CLAUDE_CODE_DISABLE_CLAUDE_MDS"]).toBe("true");
    expect(env["CLAUDE_CODE_DISABLE_1M_CONTEXT"]).toBe("1");
  });
});

// mode-1 isolation FAIL-CLOSED (#751 escalation). The mode-1 spawn runs against an ephemeral
// CLAUDE_CONFIG_DIR that symlinks in ONLY the host `.credentials.json` — the host `~/.claude` also holds
// skills/memory/settings that would leak into the (potentially adversarial) RP subprocess. Two distinct
// no-symlink outcomes must NOT be conflated:
//   • PATH 1 (host creds ABSENT): nothing to isolate → degrade to the un-isolated default (still firewalled).
//   • PATH 2 (host creds PRESENT but the symlink FAILED): isolation could not be established → REFUSE the
//     spawn. Silently degrading here would run the RP subprocess against the REAL ~/.claude — the leak.
// The module memoizes its isolation decision, so these tests reset the module registry and re-import the
// backend per case, mocking only the two fs calls the isolation path branches on: existsSync (scoped to the
// credentials path) and symlinkSync (forced to fail). mkdtempSync/rmSync stay REAL, so the temp dir is
// genuinely created and cleaned up — nothing to hand-shape or fabricate. The refusal surfaces as a
// `ProviderError { kind: "forbidden", retryable: false }`, which `disciplineOptions` (mode-1 chat) and
// `fetchAgentSdkModels` (model discovery) both propagate as a turn/discovery error rather than an un-isolated spawn.
const CREDS_SUFFIX = ".credentials.json";
const ISO_REFUSAL_RE = /mode-1 isolation could not be established/u;
const AGENT_SDK_BARREL = "@orb/server/infra/providers/backends/agent-sdk";

describe("mode-1 isolation FAIL-CLOSED (host creds present, symlink fails → refuse, never un-isolate)", () => {
  afterEach(() => {
    vi.doUnmock("node:fs");
    vi.resetModules();
  });

  test("symlink FAILS with host creds present → REFUSES (throws forbidden), never returns an un-isolated env", async () => {
    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs")>();
      return {
        ...actual,
        // Host creds "present": only the credentials probe is forced true; every other existsSync is real.
        existsSync: (p: Parameters<typeof actual.existsSync>[0]) => (typeof p === "string" && p.endsWith(CREDS_SUFFIX) ? true : actual.existsSync(p)),
        // Isolation can't be established: the symlink into the (real) temp dir fails. mkdtempSync + rmSync stay
        // real, so the temp dir is created and cleaned up for real — no fabricated fs return to hand-shape.
        symlinkSync: (target: string, path: string) => {
          throw new Error(`EPERM: operation not permitted, symlink '${target}' -> '${path}'`);
        },
      };
    });
    vi.resetModules();
    const mod = await import(AGENT_SDK_BARREL);

    let thrown: unknown;
    try {
      mod.buildClaudeSdkEnv();
    } catch (err) {
      thrown = err;
    }
    // FAIL-CLOSED: the build must REFUSE, not return. On the pre-fix source this catch stayed empty (the
    // builder returned an env with NO CLAUDE_CONFIG_DIR override — the subprocess would inherit real ~/.claude).
    expect(thrown, "mode-1 with a failed isolation symlink must throw, not silently run un-isolated").toBeDefined();
    expect((thrown as Error).message).toMatch(ISO_REFUSAL_RE);
    // Firewall semantics: a fail-closed denial, non-retryable (an auto-retry can't fix a broken isolation FS).
    expect((thrown as { kind?: string }).kind).toBe("forbidden");
    expect((thrown as { retryable?: boolean }).retryable).toBe(false);
  });

  // #1406 — THE ABSENT PATH MUST NOT LATCH. The memo starts `undefined`, and the credentials probe runs
  // only under `=== undefined`; storing `null` for "absent" made every later build short-circuit, so a
  // credentials file mounted or created after the FIRST mode-1 build (a container secret landing late, an
  // operator running `claude login` on a live box) was never observed — and an un-isolated spawn is exactly
  // the #751 leak: the real `~/.claude` carries skills/memory/settings into the RP subprocess.
  test("credentials appearing AFTER the first build are observed — the absent path is re-probed, never latched", async () => {
    let credsPresent = false;
    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs")>();
      return {
        ...actual,
        // The ONLY faked answer: whether the host credentials file is there right now. mkdtempSync,
        // symlinkSync and rmSync stay real, so the isolated dir and its link are genuinely created.
        existsSync: (p: Parameters<typeof actual.existsSync>[0]) => (typeof p === "string" && p.endsWith(CREDS_SUFFIX) ? credsPresent : actual.existsSync(p)),
      };
    });
    vi.resetModules();
    const mod = await import(AGENT_SDK_BARREL);

    const before = mod.buildClaudeSdkEnv();
    expect(before["CLAUDE_CONFIG_DIR"], "no creds yet ⇒ the documented degrade").toBeUndefined();

    credsPresent = true;
    const after = mod.buildClaudeSdkEnv();
    const dir = after["CLAUDE_CONFIG_DIR"] as string | undefined;
    expect(dir, "creds that appeared after the first build MUST be picked up, or the spawn reads host ~/.claude").toBeDefined();
    expect(after["ANTHROPIC_CONFIG_DIR"]).toBe(dir);
    // …and the isolation is real, not just an env var: the dir holds a LINK to the credentials and nothing else.
    expect(lstatSync(join(dir as string, CREDS_SUFFIX)).isSymbolicLink()).toBe(true);
    // Once established it is stable — the re-probe is only for the absent state.
    expect(mod.buildClaudeSdkEnv()["CLAUDE_CONFIG_DIR"]).toBe(dir);
  });

  // CONTROL — the re-probe must not turn into a fresh temp dir (and a fresh symlink) per turn.
  test("a present-from-the-start credentials file is memoized ONCE across builds (one mkdtemp, one dir)", async () => {
    let mkdtempCalls = 0;
    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs")>();
      return {
        ...actual,
        existsSync: (p: Parameters<typeof actual.existsSync>[0]) => (typeof p === "string" && p.endsWith(CREDS_SUFFIX) ? true : actual.existsSync(p)),
        mkdtempSync: (prefix: string) => {
          mkdtempCalls += 1;
          return actual.mkdtempSync(prefix);
        },
      };
    });
    vi.resetModules();
    const mod = await import(AGENT_SDK_BARREL);

    const first = mod.buildClaudeSdkEnv()["CLAUDE_CONFIG_DIR"];
    const second = mod.buildClaudeSdkEnv()["CLAUDE_CONFIG_DIR"];
    const third = mod.buildClaudeSdkEnv({ maxOutputTokens: 512 })["CLAUDE_CONFIG_DIR"];
    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(mkdtempCalls, "three builds must share ONE isolated config dir").toBe(1);
  });

  test("PATH 1 — host creds ABSENT still degrades to the un-isolated default (no throw, no CLAUDE_CONFIG_DIR)", async () => {
    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs")>();
      return {
        ...actual,
        existsSync: (p: Parameters<typeof actual.existsSync>[0]) => (typeof p === "string" && p.endsWith(CREDS_SUFFIX) ? false : actual.existsSync(p)),
      };
    });
    vi.resetModules();
    const mod = await import(AGENT_SDK_BARREL);

    const env = mod.buildClaudeSdkEnv();
    // No creds to isolate: the documented degrade. It does NOT override the config dir (so the runtime uses
    // its own default) and it does NOT throw — distinct from PATH 2 above.
    expect(env["CLAUDE_CONFIG_DIR"]).toBeUndefined();
    expect(env["ANTHROPIC_CONFIG_DIR"]).toBeUndefined();
  });
});

// mode-3 (local vLLM loopback agent) was RETIRED 2026-07-27 (owner ruling): `buildClaudeVllmEnv` is deleted
// — local vLLM chat runs on the chat-completions surface only. There is no agent-sdk×vllm env to firewall.

const ANTH_KEY = "sk-ant-first-party-SECRET";

describe("mode-4 (first-party Anthropic direct) firewall — the native x-api-key agent path (W11)", () => {
  test("the real key rides ANTHROPIC_API_KEY; base URL is UNSET (native api.anthropic.com); no OAuth/ambient resolution", () => {
    // Poison the ambient env the owner's box may carry — a stale sub OAuth + an ambient base URL.
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", FAKE_SUB_TOKEN);
    vi.stubEnv("ANTHROPIC_IDENTITY_TOKEN", FAKE_SUB_TOKEN);
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://stale-ambient.example");

    const env = buildClaudeAnthEnv(ANTH_KEY);

    // The real first-party key is the ONLY auth; it rides the native x-api-key var.
    expect(env["ANTHROPIC_API_KEY"]).toBe(ANTH_KEY);
    // Base URL is UNSET — the runtime uses its native api.anthropic.com default, NOT the poisoned ambient one.
    expect(env["ANTHROPIC_BASE_URL"]).toBeUndefined();
    // No Bearer/OAuth path — every ambient credential source is nulled so no config/OAuth minting can fire.
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBeUndefined();
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    expect(env["ANTHROPIC_IDENTITY_TOKEN"]).toBeUndefined();
    expect(env["ANTHROPIC_IDENTITY_TOKEN_FILE"]).toBeUndefined();
    expect(env["ANTHROPIC_SERVICE_ACCOUNT_ID"]).toBeUndefined();
    // The poisoned sub token appears NOWHERE in the spawn env.
    expect(Object.values(env)).not.toContain(FAKE_SUB_TOKEN);
  });

  test("the ephemeral config dir is EMPTY — the host ~/.claude sub credentials are unreachable", () => {
    const env = buildClaudeAnthEnv(ANTH_KEY);
    expect(env["CLAUDE_CONFIG_DIR"]).toBeDefined();
    expect(env["ANTHROPIC_CONFIG_DIR"]).toBe(env["CLAUDE_CONFIG_DIR"]);
    const dir = env["CLAUDE_CONFIG_DIR"] as string;
    expect(existsSync(join(dir, ".credentials.json"))).toBe(false);
  });

  test("a preset escape hatch can neither repoint the base nor re-add an OAuth token", () => {
    const hatch: Record<string, string | null> = Object.fromEntries([
      ["ANTHROPIC_BASE_URL", "https://evil.example"],
      ["ANTHROPIC_API_KEY", "attacker-key"],
      ["CLAUDE_CODE_OAUTH_TOKEN", FAKE_SUB_TOKEN],
      ["CLAUDE_CODE_CUSTOM_KNOB", "ok"],
    ]);
    const env = buildClaudeAnthEnv(ANTH_KEY, { userEnv: hatch });
    // Reserved keys are stripped BEFORE the overlay — the runner-owned key + unset base stand.
    expect(env["ANTHROPIC_API_KEY"]).toBe(ANTH_KEY);
    expect(env["ANTHROPIC_BASE_URL"]).toBeUndefined();
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    expect(Object.values(env)).not.toContain(FAKE_SUB_TOKEN);
    expect(env["CLAUDE_CODE_CUSTOM_KNOB"]).toBe("ok");
  });

  test("a missing Anthropic key fails loudly (the key-required invariant)", () => {
    expect(() => buildClaudeAnthEnv("")).toThrow(ANTH_KEY_REQUIRED_RE);
  });
});

describe("byte-stability — cache-buster tripwires (a nondeterministic env busts the prompt cache)", () => {
  test("mode-1 env is deep-equal across calls with the same overrides", () => {
    const overrides = { maxOutputTokens: 2048, disableThinking: false };
    expect(buildClaudeSdkEnv(overrides)).toStrictEqual(buildClaudeSdkEnv(overrides));
  });

  test("mode-2 env is deep-equal across calls with the same key + overrides", () => {
    expect(buildClaudeOpenRouterEnv("sk-or-x", TIER_MODELS, { maxContextTokens: 100_000 })).toStrictEqual(
      buildClaudeOpenRouterEnv("sk-or-x", TIER_MODELS, { maxContextTokens: 100_000 }),
    );
  });

  // mode-3 (local vLLM loopback) retired 2026-07-27 — no builder to byte-check.

  test("mode-4 env is deep-equal across calls with the same key + overrides", () => {
    expect(buildClaudeAnthEnv("sk-ant-x", { maxContextTokens: 100_000 })).toStrictEqual(buildClaudeAnthEnv("sk-ant-x", { maxContextTokens: 100_000 }));
  });
});

// SDK-UPGRADE TRIPWIRE (#9 VERIFY): the env var NAMES the builder emits are read by the BUNDLED claude runtime the
// SDK spawns — a JS-wrapper type never validates them, and a silent rename on an SDK bump would make the knob a
// no-op (e.g. `DISABLE_AUTO_COMPACT` no longer disabling auto-compact, so SDK-native compaction fires UNDERNEATH
// our managed layer). This pins each emitted name against the bundled runtime source (`bridge.mjs` — the
// extract-from-bunfs bridge the SDK loads); a bump that renames one fails HERE, loudly. EVIDENCE (2026-07-24,
// bundle 2.1.216): all five are PRESENT — neo's `DISABLE_AUTO_COMPACT` + `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (which
// break the CLAUDE_CODE_* prefix its siblings use) are REAL runtime keys, not silent no-ops.

// The bundled runtime source the SDK spawns. `bridge.mjs` is not an exports subpath, so resolve the package's MAIN
// entry (a package export) and take its sibling bundle file — never a hand-typed node_modules path.
const bridgeSource = readFileSync(join(dirname(createRequire(import.meta.url).resolve("@anthropic-ai/claude-agent-sdk")), "bridge.mjs"), "utf8");

// The compaction/context/output knob names the builder can emit — the SET this guards. `CLAUDE_EFFORT` is emitted
// as `undefined` (a clear, never a set) so it isn't a runtime-read key we depend on.
const GUARDED_ENV_NAMES = [
  "DISABLE_AUTO_COMPACT",
  "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE",
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
  "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
  "CLAUDE_CODE_DISABLE_THINKING",
] as const;

/** The prefix-cache-hygiene pin's bundled-runtime name (hoisted — top-level-regex lint). */
const ATTRIBUTION_HEADER_RE = /\bCLAUDE_CODE_ATTRIBUTION_HEADER\b/;

describe("agent-sdk env — bundled-runtime name parity (SDK-upgrade tripwire)", () => {
  test("every guarded env name is a real key in the bundled claude runtime", () => {
    for (const name of GUARDED_ENV_NAMES) {
      // A whole-word match — the name must appear as a literal token in the runtime bundle, not a substring.
      expect(bridgeSource, `env name ${name} vanished from the bundled runtime — an SDK bump renamed it (this knob is now a no-op)`).toMatch(
        new RegExp(`\\b${name}\\b`),
      );
    }
  });

  test("the attribution header is pinned OFF on both live skins (prefix-cache hygiene tripwire)", () => {
    // Claude Code can inject a per-request git-attribution hash into the system prompt, churning it every
    // request and defeating Anthropic/OR prefix caching (vLLM Claude-Code-integration doc). We pin it OFF so
    // a future SDK bump can't re-enable a churning default and quietly tax every turn on the sub + OR skins.
    // (a) both LIVE builders emit `CLAUDE_CODE_ATTRIBUTION_HEADER="0"`.
    expect(buildClaudeSdkEnv({})["CLAUDE_CODE_ATTRIBUTION_HEADER"]).toBe("0");
    expect(buildClaudeOpenRouterEnv("sk-or-x", TIER_MODELS, {})["CLAUDE_CODE_ATTRIBUTION_HEADER"]).toBe("0");
    // (b) the name is a REAL key in the bundled runtime (a rename would make the pin a silent no-op).
    expect(bridgeSource, "CLAUDE_CODE_ATTRIBUTION_HEADER vanished from the bundled runtime — an SDK bump renamed it (the pin is now a no-op)").toMatch(
      ATTRIBUTION_HEADER_RE,
    );
  });

  test("the builder actually emits the compaction-disable + pct-override keys when asked", () => {
    // Managed/off mode disables auto-compact; auto mode sets the pct override — the two names the compaction path
    // depends on. This asserts our builder emits them (the parity test above asserts the runtime reads them).
    const disabled = buildClaudeSdkEnv({ disableAutoCompact: true, autoCompactPct: 90 });
    expect(disabled["DISABLE_AUTO_COMPACT"]).toBe("1");
    expect(disabled["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"]).toBe("90");
    // Every guarded name the builder emits must be in the guarded set (so a NEW emitted name can't silently escape
    // the parity pin) — the builder's compaction/context keys are a subset of GUARDED_ENV_NAMES. TWO calls, not
    // one: the cap and the compaction-disable may not ride the same env (#1541 — the runtime refuses the pair),
    // so the name census is their UNION rather than a build nothing may produce.
    const emitted = new Set([
      ...Object.keys(buildClaudeSdkEnv({ disableAutoCompact: true, autoCompactPct: 90, maxOutputTokens: 500 })),
      ...Object.keys(buildClaudeSdkEnv({ maxContextTokens: 1000, maxOutputTokens: 500 })),
    ]);
    for (const name of ["DISABLE_AUTO_COMPACT", "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE", "CLAUDE_CODE_MAX_CONTEXT_TOKENS", "CLAUDE_CODE_MAX_OUTPUT_TOKENS"]) {
      expect(emitted.has(name)).toBe(true);
    }
  });
});

// ── COUPLED SITE: the container's *_FILE secret shim ↔ HOST_SECRET_ENV_KEYS ─────────────────────────────
// docker/entrypoint.sh reads each listed secret out of a mounted file and EXPORTS it into the server's
// process.env. Every key it exports therefore becomes reachable by `processEnvSnapshot()` — which is the
// baseline every agent-sdk child env spreads. The firewall's HOST_SECRET_ENV_KEYS is what deletes them
// again, and the agent-sdk child runs tools AS HOST. So a key added to the shim but not to the firewall
// hands a fresh app secret to a tool-executing subprocess, and nothing else in the tree would notice:
// the shim is a shell script no TypeScript instrument reads.
// Found by the containerize security review (docs/history/reviews/security/2026-08-08-containerize-surface-review.md,
// item 3b). Both sides carry a pointer comment; this is the assertion.
// tests/server/infra/providers/backends/agent-sdk → repo root is six levels up.
const REPO_ROOT = resolve(import.meta.dirname, "../../../../../..");
const SHIM_PATH = join(REPO_ROOT, "docker/entrypoint.sh");
const FIREWALL_SRC_PATH = join(REPO_ROOT, "packages/server/src/infra/providers/backends/agent-sdk/env.ts");
// `for name in A B C; do` — the shim's one explicit allowlist. Both patterns are /g so the extraction can
// use matchAll (a total function: no null arm to branch on, and the match COUNT is the blindness tripwire).
const SHIM_LOOP_RE = /^for name in ([^;]+); do$/gmu;
const FIREWALL_LIST_RE = /const HOST_SECRET_ENV_KEYS = \[([^\]]+)\]/gu;
const KEY_SEPARATOR_RE = /[\s,"']+/u;
const MIN_EXPECTED_KEYS = 5;

/** Parse a whitespace/quote/comma-separated key list out of a source file, refusing to return an empty
 *  set — a pattern that stopped matching must RED here, not silently pass an empty loop. */
function parseKeyList(path: string, re: RegExp, what: string): ReadonlySet<string> {
  expect(existsSync(path), `${what}: ${path} is missing — this conformance test cannot see its subject`).toBe(true);
  const captured = [...readFileSync(path, "utf8").matchAll(re)].map((m) => m[1] ?? "");
  expect(
    captured,
    `${what}: the key-list pattern no longer matches exactly once in ${path} — the list moved or was reshaped, so this test is blind`,
  ).toHaveLength(1);
  const keys = captured
    .join("")
    .split(KEY_SEPARATOR_RE)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  expect(keys.length, `${what}: parsed ${keys.length} keys from ${path} — too few to be the real list`).toBeGreaterThanOrEqual(MIN_EXPECTED_KEYS);
  return new Set(keys);
}

describe("the *_FILE secret shim and the credential firewall move together", () => {
  test("every secret docker/entrypoint.sh exports is STRIPPED from the agent-sdk child env (the property)", () => {
    const shimKeys = parseKeyList(SHIM_PATH, SHIM_LOOP_RE, "entrypoint shim");
    for (const key of shimKeys) {
      vi.stubEnv(key, `SHIM-PROBE-${key}`);
    }
    const childEnv = buildClaudeSdkEnv();
    const values = Object.values(childEnv);
    for (const key of shimKeys) {
      expect(childEnv[key], `${key} is file-mountable by the container shim but reaches the agent-sdk child`).toBeUndefined();
      // Scrub-by-VALUE too: a key deleted but echoed into some other var would still leak the secret.
      expect(values, `the value of ${key} leaked into the agent-sdk child env under another name`).not.toContain(`SHIM-PROBE-${key}`);
    }
  });

  test("the two allowlists are SET-IDENTICAL (either side drifting is the coupled-site failure)", () => {
    const shimKeys = parseKeyList(SHIM_PATH, SHIM_LOOP_RE, "entrypoint shim");
    const firewallKeys = parseKeyList(FIREWALL_SRC_PATH, FIREWALL_LIST_RE, "HOST_SECRET_ENV_KEYS");
    // Sorted arrays, not set math, so a failure PRINTS both lists and names the drift.
    expect(
      [...shimKeys].sort(),
      "docker/entrypoint.sh and HOST_SECRET_ENV_KEYS disagree — a secret is file-mountable but not firewalled, or firewalled but not file-mountable. Decide which list is wrong; do not just re-sync this test.",
    ).toEqual([...firewallKeys].sort());
  });
});
