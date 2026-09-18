import type { TrpcClient } from "@orb/client/data";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

test("the actual tRPC client accepts string tag ids and rejects non-string wire values", () => {
  // @orb-waive brand-in-name-position(tagId): the parameter is DELIBERATELY bare string — this test PROVES the wire accepts string, not TagId; ends when tRPC infers branded input natively
  const proveUpdateTag = async (client: TrpcClient, tagId: string): Promise<TagId> => {
    const tag = await client.tag.updateTag.mutate({ tagId, patch: { name: "name" } });

    // @ts-expect-error -- the runtime schema rejects numbers, so the client contract must reject them too.
    await client.tag.updateTag.mutate({ tagId: 42, patch: { name: "name" } });
    // @ts-expect-error -- object-shaped ids cannot cross the string wire boundary.
    await client.tag.updateTag.mutate({ tagId: { wrong: true }, patch: { name: "name" } });

    // @ts-expect-error -- updateTag returns the canonical TagId, never a different entity brand.
    const wrongBrand: CharacterId = tag.id;
    void wrongBrand;
    return tag.id;
  };

  expectTypeOf(proveUpdateTag).returns.resolves.toEqualTypeOf<TagId>();
});
