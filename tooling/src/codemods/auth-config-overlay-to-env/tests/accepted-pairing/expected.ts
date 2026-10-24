test("a local root", async () => {
  await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
  const peered = await createServerHarness({ physicalPeer: () => "127.0.0.1", env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" }, startJobs: false });
});

const SINGLE_USER = {
  env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
  physicalPeer: () => "127.0.0.1",
} as const;
