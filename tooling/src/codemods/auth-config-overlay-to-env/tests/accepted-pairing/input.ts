test("a local root", async () => {
  await using root = await createServerHarness({ authConfig: { mode: "local", fallback: "deny" } });
  const peered = await createServerHarness({ physicalPeer: () => "127.0.0.1", authConfig: { mode: "local", fallback: "owner" }, startJobs: false });
});

const SINGLE_USER = {
  authConfig: { mode: "single-user", fallback: "owner" },
  physicalPeer: () => "127.0.0.1",
} as const;
