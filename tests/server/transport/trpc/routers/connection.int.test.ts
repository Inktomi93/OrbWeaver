// connection router, COMPOSED-REAL. The row reads parse through a strict output schema whose `label` is non-empty,
// so a write that stores an empty label would make every later list and get of that row fail, and the pane could
// not show the row to repair it. The label patch is refused at the write instead.

import "../../../../support/composed-real.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("a whitespace-only label patch answers BAD_REQUEST and the owner's list still resolves", async ({ ownerCaller }) => {
  const created = await ownerCaller.connection.create({
    label: "Named row",
    providerId: "openrouter",
    credentialId: null,
    baseUrl: null,
    model: "vendor/model",
  });

  await expect(ownerCaller.connection.update({ connectionId: created.id, patch: { label: "   " } })).rejects.toMatchObject({ code: "BAD_REQUEST" });

  const listed = await ownerCaller.connection.list();
  expect(listed.find((row) => row.id === created.id)?.label).toBe("Named row");
  await expect(ownerCaller.connection.get({ connectionId: created.id })).resolves.toMatchObject({ label: "Named row" });
});

test("control: a real label patch is trimmed and stored", async ({ ownerCaller }) => {
  const created = await ownerCaller.connection.create({ providerId: "openrouter", credentialId: null, baseUrl: null, model: "vendor/model" });

  await ownerCaller.connection.update({ connectionId: created.id, patch: { label: "  Renamed  " } });

  await expect(ownerCaller.connection.get({ connectionId: created.id })).resolves.toMatchObject({ label: "Renamed" });
});
