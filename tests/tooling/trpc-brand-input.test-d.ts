import type { TrpcClient } from "@orb/client/data";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

test("the actual tRPC client takes the tag brand and refuses any other id", () => {
  const proveUpdateTag = async (client: TrpcClient, tagId: TagId, characterId: CharacterId, raw: string): Promise<TagId> => {
    const tag = await client.tag.updateTag.mutate({ tagId, patch: { name: "name" } });

    // @ts-expect-error -- another family's id is the mistake the brand exists to catch.
    await client.tag.updateTag.mutate({ tagId: characterId, patch: { name: "name" } });
    // @ts-expect-error -- an unparsed string has proved nothing about its family.
    await client.tag.updateTag.mutate({ tagId: raw, patch: { name: "name" } });
    // @ts-expect-error -- the runtime schema rejects numbers, so the client contract must reject them too.
    await client.tag.updateTag.mutate({ tagId: 42, patch: { name: "name" } });
    // @ts-expect-error -- object-shaped ids cannot cross the string wire boundary.
    await client.tag.updateTag.mutate({ tagId: { wrong: true }, patch: { name: "name" } });

    // updateTag returns the canonical TagId, never a different entity brand.
    expectTypeOf(tag.id).not.toExtend<CharacterId>();
    return tag.id;
  };

  expectTypeOf(proveUpdateTag).returns.resolves.toEqualTypeOf<TagId>();
});
