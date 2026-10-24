// The parse refuses single-user with deny, so the overlay is the only door for it.
await using refused = await createServerHarness({ authConfig: { mode: "single-user", fallback: "deny" } });
// Computed and shorthand values are judgment edits.
await using computed = await createServerHarness({ authConfig: { mode: credential === "cookie" ? "local" : "single-user", fallback: "deny" } });
await using shorthand = await createServerHarness({ authConfig: { mode, fallback: "deny" } });
await using spread = await createServerHarness({ authConfig: { ...options.authConfig, mode: "local", fallback: "deny" } });
// The default handle is a role-policy key as well as an auth field.
await using handled = await createServerHarness({ authConfig: { mode: "local", fallback: "deny", defaultHandle } });
await using passed = await createServerHarness({ authConfig: options.authConfig });
// A sibling env that is no literal, or that already states the posture, stays as written.
await using based = await createServerHarness({ env: base, authConfig: { mode: "local", fallback: "deny" } });
await using stated = await createServerHarness({ env: { ["AUTH_MODE"]: "local" }, authConfig: { mode: "local", fallback: "deny" } });
const schema = z.object({ authConfig: authConfigSchema });
