// An overlay without a fallback ran on the default record's resolved `owner`; the rewrite states it.
await using harness = await createServerHarness({ env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" } });
const options = { ownerId, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" }, bindHost: "0.0.0.0" };
