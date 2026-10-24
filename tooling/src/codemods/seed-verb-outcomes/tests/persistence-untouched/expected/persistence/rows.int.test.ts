test("a persistence suite keeps the twin row shapes", async () => {
  const installed = await seedInstalledPlugin(root, { caller, bundle, grant: [] });
  expect(installed.plugin.id).toBeDefined();
  const { row: card } = await seedCharacter(root, { principal, input });
  expect(card.id).toBeDefined();
});
