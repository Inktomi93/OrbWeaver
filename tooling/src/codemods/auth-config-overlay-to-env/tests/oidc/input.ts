// The parse requires the OIDC client keys under `oidc`, which the root's `oidc` option lays into the record.
await using configured = await createServerHarness({ authConfig: { mode: "oidc", fallback: "deny" }, oidc: NATIVE_OIDC_SETTINGS });
await using bare = await createServerHarness({ authConfig: { mode: "oidc", fallback: "deny" } });
