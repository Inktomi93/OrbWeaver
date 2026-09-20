// substrate/task-model — the space-tag read for one owner. Its contract is the NULL arm: an owner with no
// binding for the task answers `null` so a store/sweep SKIPS that owner and says so. A throw here would
// escape into a BUS HANDLER (the indexer's), where it is not catchable per-owner and takes the whole sweep
// down with it, so "null, never throw" is the property under test — together with the task being passed
// through verbatim (asking `resolved("embed")` when the caller said `imageEmbed` silently tags the wrong space).

import type { RoleClientTask } from "@orb/contracts/role-clients";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireTaskModel } from "../../../../../packages/server/src/domain/embeddings/substrate/task-model.ts";
import { makeFakeRoleClients } from "../../../../support/factories/role-clients.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNER = castId<UserId>("user_a");

test("answers the model the owner's binding resolves to, per task", async () => {
  const ctx = { roleClientsFor: () => Promise.resolve(makeFakeRoleClients()) };
  expect(await requireTaskModel(ctx, OWNER, "embed")).toBe("test-embed-model");
  expect(await requireTaskModel(ctx, OWNER, "imageEmbed")).toBe("test-image-embed-model");
});

test("an owner with NO binding for the task answers `null` — a sweep skips them, never throws into the bus", async () => {
  const ctx = { roleClientsFor: () => Promise.resolve(makeFakeRoleClients({ unbound: ["embed"] })) };
  expect(await requireTaskModel(ctx, OWNER, "embed")).toBeNull();
  expect(await requireTaskModel(ctx, OWNER, "imageEmbed"), "only the unbound task is null").toBe("test-image-embed-model");
});

test("the bundle is resolved for the OWNER asked about, and the task rides through verbatim", async () => {
  const owners: UserId[] = [];
  const tasks: RoleClientTask[] = [];
  const clients = makeFakeRoleClients();
  const ctx = {
    roleClientsFor: (ownerId: UserId): Promise<typeof clients> => {
      owners.push(ownerId);
      return Promise.resolve({
        ...clients,
        resolved: (task: RoleClientTask): ReturnType<typeof clients.resolved> => {
          tasks.push(task);
          return clients.resolved(task);
        },
      });
    },
  };
  await requireTaskModel(ctx, OWNER, "imageEmbed");
  expect(owners).toEqual([OWNER]);
  expect(tasks).toEqual(["imageEmbed"]);
});
