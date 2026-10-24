// An overlay without a fallback ran on the default record's resolved `owner`; the rewrite states it.
await using harness = await createServerHarness({ authConfig: { mode: "local" } });
const options = { ownerId, authConfig: { mode: "local" as const }, bindHost: "0.0.0.0" };
