// Work on a room host's account takes a `ConsentingHostId`, which only the consent read mints. A raw `UserId` fails
// at a connection resolve, a picture spend and a memory embed-space resolve, and no other id spelling stands in for
// the brand.
import type { ResolveMemoryEmbedSpaceOp } from "@orb/contracts/embeddings";
import type { GeneratePictureParams } from "@orb/contracts/imagery";
import type { ChatId, ConsentingHostId, UserId, VerifiedUserId } from "@orb/kit/ids";
import { brandedId, createIdSource } from "@orb/kit/ids";
import type { ChatServiceDeps, createLoadConsentingHostUserId } from "@orb/server/domain/chat";
import { expectTypeOf, test } from "vitest";

type ResolveArgs = Parameters<ChatServiceDeps["resolveConnection"]>[0];
type RunAs = GeneratePictureParams["runAsUserId"];
type EmbedSpaceOwner = Parameters<ResolveMemoryEmbedSpaceOp>[0];

test("the consent read is the source of the brand and the doors take only it", () => {
  type Consented = Awaited<ReturnType<ReturnType<typeof createLoadConsentingHostUserId>>>;
  expectTypeOf<Consented>().toEqualTypeOf<ConsentingHostId | null>();
  expectTypeOf<ResolveArgs["funderUserId"]>().toEqualTypeOf<ConsentingHostId>();
  expectTypeOf<NonNullable<RunAs>>().toEqualTypeOf<ConsentingHostId>();
  expectTypeOf<EmbedSpaceOwner>().toEqualTypeOf<ConsentingHostId>();
  // The proof widens to the plain id every read takes, never the reverse.
  expectTypeOf<ConsentingHostId>().toExtend<UserId>();
  expectTypeOf<UserId>().not.toExtend<ConsentingHostId>();
});

test("a raw user id cannot fund a room host's connection, picture or memory embed space", () => {
  const spend = (userId: UserId, chatId: ChatId): readonly [ResolveArgs, RunAs, EmbedSpaceOwner] => [
    // @ts-expect-error a connection resolve on a room host's account needs the consent proof
    { funderUserId: userId, chatId },
    // @ts-expect-error a picture runs as a room host only with the consent proof
    userId,
    // @ts-expect-error a memory embed-space resolve can probe the host's encoder, so it needs the consent proof
    userId,
  ];
  expectTypeOf(spend).toBeFunction();
});

test("no other id source builds the brand", () => {
  const forge = (verified: VerifiedUserId, spelled: UserId & { readonly hostConsented: true }): readonly ConsentingHostId[] => [
    // @ts-expect-error a session-verified id is not host consent
    verified,
    // @ts-expect-error the brand's phantom key is private to the id module, so a spelled intersection is another type
    spelled,
    // @ts-expect-error a fresh user id carries no consent
    createIdSource().userId(),
    // @ts-expect-error the request-boundary parser brands a user id, never consent
    brandedId("UserId").parse("user"),
  ];
  expectTypeOf(forge).toBeFunction();
});
