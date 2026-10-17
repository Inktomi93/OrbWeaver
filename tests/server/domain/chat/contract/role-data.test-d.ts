// @subject packages/server/src/domain/chat/persistence/participants-read.ts
// @subject packages/server/src/domain/chat/contract/service.ts
import type { ChatService, loadPresentRole } from "@orb/server/domain/chat";
import type { createCaller } from "@orb/server/transport/trpc";
import { expectTypeOf, test } from "vitest";

type MembershipRole = NonNullable<Awaited<ReturnType<typeof loadPresentRole>>>;
type RosterSeat = Awaited<ReturnType<ChatService["listParticipants"]>>[number];
type Caller = ReturnType<typeof createCaller>;
declare const seat: RosterSeat;
declare const member: { readonly role: MembershipRole };
declare const optionalMember: typeof member | undefined;
declare const load: () => typeof member;
declare const seats: readonly RosterSeat[];

test("native checks reject role authority through real membership and roster read forms", () => {
  expectTypeOf(() => {
    // @ts-expect-error The actual membership carrier cannot be compared to a raw role code.
    if (member.role !== "host") {
      throw new Error("not host");
    }
  }).toBeFunction();
  expectTypeOf(() => {
    const hostCode = "host";
    // @ts-expect-error The inverse throw shape has the same representation boundary.
    if (hostCode === member.role) {
      throw new Error("not member");
    }
  }).toBeFunction();
  const Host = "host";
  expectTypeOf(() => {
    // @ts-expect-error Literal aliases do not expose the role code.
    if (seat["role"] !== Host) {
      throw new Error("not host");
    }
  }).toBeFunction();
  expectTypeOf(() => {
    // @ts-expect-error Boolean plumbing cannot turn a role comparison into authority.
    if (member.role !== "host" && seat.userId !== null) {
      throw new Error("not host");
    }
  }).toBeFunction();
  const { role: local } = member;
  // @ts-expect-error Local aliases retain the opaque representation.
  const canWrite = local === "host";
  // @ts-expect-error An object ceiling field cannot derive authority from raw role spelling.
  const ceiling = { isInstallerHost: load().role === Host };
  const field = "canWrite";
  // @ts-expect-error A computed authority field cannot expose the captured role code.
  const computed = { [field]: member["role"] === Host };
  const assigned = { canWrite: false };
  // @ts-expect-error Assignment is the same ceiling as an initializer.
  assigned["canWrite"] = local === Host;
  const callback = {
    isInstallerHost: () => {
      // @ts-expect-error Block-bodied callbacks retain the same loaded role data.
      return local === Host;
    },
  };
  expectTypeOf(() => {
    // @ts-expect-error Negation does not reveal the private code.
    if (!(local === Host)) {
      throw new Error("not host");
    }
  }).toBeFunction();
  expectTypeOf(() => {
    // @ts-expect-error Both vocabulary members are data, not an operation authority shortcut.
    if (local === "member") {
      throw new Error("member");
    }
  }).toBeFunction();
  // @ts-expect-error Callback-return ceilings cannot derive authority from roster role spelling.
  seats.map((row) => ({ canWrite: row.role === "host" }));
  // @ts-expect-error Conditional and optional read forms retain the same captured data.
  const conditional = optionalMember?.["role"] === "host";
  expectTypeOf(canWrite).toBeBoolean();
  expectTypeOf(ceiling.isInstallerHost).toBeBoolean();
  expectTypeOf(conditional).toBeBoolean();
  expectTypeOf(computed.canWrite).toBeBoolean();
  expectTypeOf(assigned.canWrite).toBeBoolean();
  expectTypeOf(callback.isInstallerHost()).toBeBoolean();
});

test("foreign participant axes retain their own semantics", () => {
  expectTypeOf<Awaited<ReturnType<Caller["chat"]["getChat"]>>["participants"][number]["role"]>().toEqualTypeOf<
    import("@orb/contracts/identity").ParticipantRole
  >();
  expectTypeOf<Awaited<ReturnType<Caller["chat"]["listChats"]>>["items"][number]["viewerRole"]>().toEqualTypeOf<
    import("@orb/contracts/identity").ParticipantRole
  >();
  expectTypeOf(async (caller: Caller, chatId: import("@orb/kit/ids").ChatId) => {
    const chat = await caller.chat.getChat({ chatId });
    const canWrite = chat.participants.some((participant) => participant.role === "host");
    return canWrite;
  }).returns.resolves.toBeBoolean();
  expectTypeOf(async (caller: Caller) => {
    const page = await caller.chat.listChats({});
    return page.items.some((chat) => chat.viewerRole === "host");
  }).returns.resolves.toBeBoolean();
  const foreignMember: { role: "host" | "guest" } = { role: "host" };
  const message: { role: "system" | "user" | "assistant" } = { role: "user" };
  expectTypeOf(foreignMember.role === "host").toBeBoolean();
  expectTypeOf(message["role"] === "user").toBeBoolean();
});

test("actual membership and roster role data cannot be compared as strings", () => {
  expectTypeOf<MembershipRole>().not.toExtend<string>();
  expectTypeOf<RosterSeat["role"]>().not.toExtend<string>();
});
