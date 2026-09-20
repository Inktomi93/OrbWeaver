// substrate/space — the retrieval-side space read. The opposite arm of the embeddings sibling ON PURPOSE:
// there, a missing binding is a SKIP (`null`); here it must be a typed SearchError carrying SEARCH_NO_SPACE,
// because a retrieval with no space cannot be "skipped" — silently embedding the query in nobody's space
// would return confident nonsense. Both halves are pinned, so a later "unify these two" refactor has to
// notice they disagree deliberately.

import { SEARCH_NO_SPACE } from "../../../../../packages/server/src/domain/search/contract/errors.ts";
import { requireSpaceModel } from "../../../../../packages/server/src/domain/search/substrate/space.ts";
import { makeFakeRoleClients } from "../../../../support/factories/role-clients.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("answers the bound model for each vector task", async () => {
  const clients = makeFakeRoleClients();
  expect(await requireSpaceModel(clients, "embed")).toBe("test-embed-model");
  expect(await requireSpaceModel(clients, "imageEmbed")).toBe("test-image-embed-model");
});

test("no binding is a TYPED refusal, not a skip — a query is never embedded in nobody's space", async () => {
  const clients = makeFakeRoleClients({ unbound: ["embed"] });
  await expect(requireSpaceModel(clients, "embed")).rejects.toMatchObject({ code: SEARCH_NO_SPACE });
  // The positive control in the same wiring: the OTHER task still answers, so the refusal is the binding's
  // doing and not a broken fixture.
  expect(await requireSpaceModel(clients, "imageEmbed")).toBe("test-image-embed-model");
});

test("the refusal names the task the caller asked for, so the pane can say which slot to bind", async () => {
  const clients = makeFakeRoleClients({ unbound: ["imageEmbed"] });
  await expect(requireSpaceModel(clients, "imageEmbed")).rejects.toThrow(/imageEmbed/u);
});
