test("two roots share one bound overlay", async () => {
  const authConfig = { mode: "local" } satisfies NonNullable<Parameters<typeof createServerHarness>[0]>["authConfig"];
  await using first = await createServerHarness({ authConfig });
  await using second = await createServerHarness({ authConfig, startJobs: false });
});

test("a bare bound overlay", async () => {
  const authConfig = { mode: "local", fallback: "deny" };
  await using root = await createServerHarness({ authConfig });
});

test("a bound overlay read for its fields is a judgment edit", async () => {
  const authConfig = { mode: "local", fallback: "deny" };
  await using root = await createServerHarness({ authConfig });
  expect(authConfig.mode).toBe("local");
});

test("a refused pairing stays", async () => {
  const authConfig = { mode: "single-user", fallback: "deny" };
  await using refused = await createServerHarness({ authConfig });
});

test("a bound oidc overlay stays", async () => {
  const authConfig = { mode: "oidc", fallback: "deny" };
  await using oidc = await createServerHarness({ authConfig, oidc: SETTINGS });
});

test("a use beside its own env stays", async () => {
  const authConfig = { mode: "local", fallback: "deny" };
  await using root = await createServerHarness({ authConfig, env: { ["IP_ALLOWLIST"]: RANGE } });
});
