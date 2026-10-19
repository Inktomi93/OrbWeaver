// The browser world independently checks the same public wire roots and failure controls.
import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { ChatBusEvent, MessageView, TOKEN_PROVENANCES, TokenProvenance } from "@orb/contracts/chat";
import type { AssetCreatedEvent, CharacterUpdatedEvent, DomainEvent } from "@orb/contracts/events";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { MaintenanceResult, WorkloadEvent } from "@orb/contracts/workloads";
import type { WiBusEvent } from "@orb/contracts/world-info";
import type { ChatId, UserCredentialId } from "@orb/kit/ids";
import type { BusPayloadFailure, EconomicsField } from "@orb/testkit/iso/bus-payload-policy.ts";
import { expectTypeOf, test } from "vitest";
import { z } from "zod";

type UnsafeAny = z.output<z.ZodAny>;

test("actual canonical bus roots and approved property types remain closed", () => {
  expectTypeOf<BusPayloadFailure<ChatBusEvent, "chat">>().toBeNever();
  expectTypeOf<BusPayloadFailure<UserBusEvent, "user">>().toBeNever();
  expectTypeOf<BusPayloadFailure<WiBusEvent, "wi">>().toBeNever();
  expectTypeOf<BusPayloadFailure<DomainEvent, "domain">>().toBeNever();
  expectTypeOf<BusPayloadFailure<CharacterUpdatedEvent, "character">>().toBeNever();
  expectTypeOf<BusPayloadFailure<AssetCreatedEvent, "asset">>().toBeNever();
  expectTypeOf<BusPayloadFailure<RpgBusEvent, "rpg">>().toBeNever();
  expectTypeOf<BusPayloadFailure<AutomationBusEvent, "automation">>().toBeNever();
  expectTypeOf<BusPayloadFailure<WorkloadEvent, "workload">>().toBeNever();
  expectTypeOf<BusPayloadFailure<NotificationEvent, "notification">>().toBeNever();
  expectTypeOf<MessageView["tokensIn"]>().toEqualTypeOf<number | null>();
  expectTypeOf<MessageView["tokensOut"]>().toEqualTypeOf<number | null>();
  expectTypeOf<MessageView["cacheReadTokens"]>().toEqualTypeOf<number | null>();
  expectTypeOf<MessageView["cacheWriteTokens"]>().toEqualTypeOf<number | null>();
  expectTypeOf<MessageView["tokenProvenance"]>().toEqualTypeOf<TokenProvenance>();
  expectTypeOf<TokenProvenance>().toEqualTypeOf<(typeof TOKEN_PROVENANCES)[number]>();
  expectTypeOf<string>().not.toExtend<TokenProvenance>();
  expectTypeOf<TokenProvenance>().not.toBeAny();
  expectTypeOf<MaintenanceResult["mergedKeys"]>().toEqualTypeOf<readonly string[] | undefined>();
  expectTypeOf<Extract<UserBusEvent, { type: "credentialsChanged" }>["credentialId"]>().toEqualTypeOf<UserCredentialId | undefined>();
});

test("finite optional mapped tuple and conditional values remain admissible", () => {
  // Finite keys, optional members, tuples and resolved finite mapped/remapped/conditional arms.
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: { required: string; optional?: number } }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: readonly [first: { id: ChatId }, second?: { count: number }] }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: { readonly [K in "a" | "b"]: number } }>>().toBeNever();
  type FiniteArms = { [K in "a" | "b"]: { readonly type: K; readonly count: number } }["a" | "b"];
  expectTypeOf<BusPayloadFailure<FiniteArms>>().toBeNever();
  type FiniteRemap = { [K in "a" | "b" as `item-${K}`]: number };
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: FiniteRemap }>>().toBeNever();
  type FiniteConditional<T> = T extends true ? { readonly count: number } : { readonly text: string };
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: FiniteConditional<true | false> }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; value: ChatId; maybe?: null | boolean; money: bigint; tag: symbol; nothing: void }>>().toBeNever();
});

test("unsafe own inherited merged referenced and open values are refused", () => {
  // Negative classifications are positive exact assertions, never suppressed diagnostics.
  expectTypeOf<BusPayloadFailure<{ type: "bad"; apiKey: string }>>().toEqualTypeOf<"apiKey:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; xApiKey: string } & Record<"PASSWORD", string>>>().toEqualTypeOf<
    "xApiKey:credential-field" | "PASSWORD:credential-field"
  >();
  interface UnsafeNamed {
    readonly apiKey: string;
  }
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: UnsafeNamed }>>().toEqualTypeOf<"payload.apiKey:credential-field">();
  interface UnsafeBase {
    readonly apiKey: string;
  }
  interface UnsafeInherited extends UnsafeBase {
    readonly type: "bad";
  }
  expectTypeOf<BusPayloadFailure<UnsafeInherited>>().toEqualTypeOf<"apiKey:credential-field">();
  interface UnsafeMerged {
    readonly type: "bad";
  }
  interface UnsafeMerged {
    readonly password: string;
  }
  expectTypeOf<BusPayloadFailure<UnsafeMerged>>().toEqualTypeOf<"password:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: Pick<MessageView, "tokensIn"> }>>().toEqualTypeOf<"payload.tokensIn:credential-field">();
  expectTypeOf<BusPayloadFailure<NotificationEvent & { apiKey: string }>>().toEqualTypeOf<"apiKey:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: unknown }>>().toEqualTypeOf<"payload:open-value">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: UnsafeAny }>>().toEqualTypeOf<"payload:open-value">();
  type NamedOpen = Record<string, string>;
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: NamedOpen }>>().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: Record<number, number> }>>().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: Record<symbol, number> }>>().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: { [key: `prefix${string}`]: string } }>>().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: { [key: `${number}`]: string } }>>().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<
    BusPayloadFailure<{ type: "bad"; payload: { [key: `prefix${number}` | `other${string}`]: string } }>
  >().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: { known: string; [key: `prefix${string}`]: string } }>>().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: { known?: number; [key: `prefix${string}`]: string } }>>().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: Partial<Record<`prefix${string}`, number>> }>>().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: Record<never, never> }>>().toEqualTypeOf<"payload:keyless-object">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: object }>>().toEqualTypeOf<"payload:keyless-object">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: (value: string) => number }>>().toEqualTypeOf<"payload:callable">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: abstract new (value: string) => object }>>().toEqualTypeOf<"payload:constructable">();
  expectTypeOf<BusPayloadFailure<never>>().toEqualTypeOf<":empty-root">();
  expectTypeOf<BusPayloadFailure<unknown>>().toEqualTypeOf<":open-root">();
  expectTypeOf<BusPayloadFailure<UnsafeAny>>().toEqualTypeOf<":open-root">();
  expectTypeOf<BusPayloadFailure<Record<never, never>>>().toEqualTypeOf<":missing-discriminator">();
  expectTypeOf<BusPayloadFailure<{ type: string }>>().toEqualTypeOf<":open-discriminator">();
  expectTypeOf<BusPayloadFailure<{ type: `prefix${string}` }>>().toEqualTypeOf<":open-discriminator">();
});

test("native schema outputs retain their actual closed and open meanings", () => {
  // Native Zod inference, including inherited, open and nested schema output.
  const safeSchema = z.object({ type: z.literal("fixture"), count: z.number() });
  const inheritedUnsafeSchema = safeSchema.extend({ secret: z.string() });
  const openSchema = safeSchema.loose();
  const catchallSchema = safeSchema.catchall(z.string());
  const unknownSchema = safeSchema.extend({ payload: z.unknown() });
  const nestedSchema = safeSchema.extend({ payload: z.array(z.object({ apiKey: z.string() })) });
  expectTypeOf<BusPayloadFailure<z.output<typeof safeSchema>>>().toBeNever();
  expectTypeOf<BusPayloadFailure<z.output<typeof inheritedUnsafeSchema>>>().toEqualTypeOf<"secret:credential-field">();
  expectTypeOf<BusPayloadFailure<z.output<typeof openSchema>>>().toEqualTypeOf<":open-key-space">();
  expectTypeOf<BusPayloadFailure<z.output<typeof catchallSchema>>>().toEqualTypeOf<":open-key-space">();
  expectTypeOf<BusPayloadFailure<z.output<typeof unknownSchema>>>().toEqualTypeOf<"payload:open-value">();
  expectTypeOf<BusPayloadFailure<z.output<typeof nestedSchema>>>().toEqualTypeOf<"payload[].apiKey:credential-field">();
});

test("economics folded-name and credential identity exceptions remain exact", () => {
  // Exact approved view/name-list/ID licenses; wrong paths, types and kinds remain blocked.
  expectTypeOf<BusPayloadFailure<{ type: "messageCommitted"; view: Pick<MessageView, EconomicsField | "tokenProvenance"> }, "chat">>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "messageCommitted"; view: { tokensIn: string } }, "chat">>().toEqualTypeOf<"view.tokensIn:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "messageCommitted"; tokensIn: number | null }, "chat">>().toEqualTypeOf<"tokensIn:credential-field">();
  expectTypeOf<
    BusPayloadFailure<{ type: "messageCommitted"; other: { tokensIn: number | null } }, "chat">
  >().toEqualTypeOf<"other.tokensIn:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "unapproved"; view: { tokensIn: number | null } }, "chat">>().toEqualTypeOf<"view.tokensIn:credential-field">();
  expectTypeOf<
    BusPayloadFailure<{ type: "messageCommitted"; view: { tokenProvenance: string } }, "chat">
  >().toEqualTypeOf<"view.tokenProvenance:credential-field">();
  expectTypeOf<
    BusPayloadFailure<{ type: "messageCommitted"; view: { tokensIn: number | null; apiKey: string } }, "chat">
  >().toEqualTypeOf<"view.apiKey:credential-field">();
  expectTypeOf<
    BusPayloadFailure<{ type: "succeeded"; kind: "assets-backfill" | "assets-gc" | "import-st"; result: { mergedKeys?: readonly string[] } }, "workload">
  >().toBeNever();
  expectTypeOf<
    BusPayloadFailure<{ type: "succeeded"; kind: "new-kind"; result: { mergedKeys?: readonly string[] } }, "workload">
  >().toEqualTypeOf<"result.mergedKeys:credential-field">();
  expectTypeOf<
    BusPayloadFailure<{ type: "failed"; kind: "import-st"; result: { mergedKeys?: readonly string[] } }, "workload">
  >().toEqualTypeOf<"result.mergedKeys:credential-field">();
  expectTypeOf<
    BusPayloadFailure<{ type: "succeeded"; kind: "import-st"; mergedKeys?: readonly string[] }, "workload">
  >().toEqualTypeOf<"mergedKeys:credential-field">();
  expectTypeOf<
    BusPayloadFailure<{ type: "succeeded"; kind: "import-st"; result: { mergedKeys?: string } }, "workload">
  >().toEqualTypeOf<"result.mergedKeys:credential-field">();
  expectTypeOf<
    BusPayloadFailure<{ type: "succeeded"; kind: "import-st"; result: { mergedKeys?: readonly string[]; secret: string } }, "workload">
  >().toEqualTypeOf<"result.secret:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "credentialsChanged"; credentialId?: UserCredentialId }, "user">>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "credentialsChanged"; credentialId?: string }, "user">>().toEqualTypeOf<"credentialId:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "credentialsChanged"; credentialId?: ChatId }, "user">>().toEqualTypeOf<"credentialId:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "credentialsChanged"; credentialId?: UnsafeAny }, "user">>().toEqualTypeOf<
    "credentialId:credential-field" | "credentialId:open-value"
  >();
  expectTypeOf<BusPayloadFailure<{ type: "credentialsChanged"; credentialId?: unknown }, "user">>().toEqualTypeOf<
    "credentialId:credential-field" | "credentialId:open-value"
  >();
  expectTypeOf<BusPayloadFailure<{ type: "other"; credentialId?: UserCredentialId }, "user">>().toEqualTypeOf<"credentialId:credential-field">();
});

test("arrays retain named intersection and interface fields without rejecting their native container surface", () => {
  expectTypeOf<
    BusPayloadFailure<{ type: "bad"; payload: readonly string[] & Record<"0x10", { readonly apiKey: string }> }>
  >().toEqualTypeOf<"payload.0x10.apiKey:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: string[] }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: readonly string[] }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: readonly [string, number?] }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: readonly [first?: string, second?: number] }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: string[] & { readonly count?: number } }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: readonly string[] & { readonly audience: string } }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: readonly [string, number?] & { readonly count?: number } }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: string[] & { readonly apiKey: string } }>>().toEqualTypeOf<"payload.apiKey:credential-field">();
  expectTypeOf<
    BusPayloadFailure<{ type: "bad"; payload: readonly string[] & { readonly secret: string } }>
  >().toEqualTypeOf<"payload.secret:credential-field">();
  expectTypeOf<
    BusPayloadFailure<{ type: "bad"; payload: readonly [string, number?] & { readonly password: string } }>
  >().toEqualTypeOf<"payload.password:credential-field">();
  interface UnsafeMutable extends Array<string> {
    readonly apiKey: string;
  }
  interface UnsafeReadonly extends ReadonlyArray<string> {
    readonly credential: string;
  }
  interface SafeReadonly extends ReadonlyArray<string> {
    readonly count?: number;
  }
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: UnsafeMutable }>>().toEqualTypeOf<"payload.apiKey:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: UnsafeReadonly }>>().toEqualTypeOf<"payload.credential:credential-field">();
  expectTypeOf<BusPayloadFailure<{ type: "ok"; payload: SafeReadonly }>>().toBeNever();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: readonly string[] & Record<string, unknown> }>>().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<
    BusPayloadFailure<{ type: "bad"; payload: readonly string[] & Partial<Record<`extra${string}`, number>> }>
  >().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<BusPayloadFailure<{ type: "bad"; payload: readonly string[] & Record<`${number}`, string> }>>().toEqualTypeOf<"payload:open-key-space">();
  expectTypeOf<
    BusPayloadFailure<{ type: "bad"; payload: readonly string[] & { readonly audience: unknown } }>
  >().toEqualTypeOf<"payload.audience:open-value">();
  expectTypeOf<
    BusPayloadFailure<{ type: "bad"; payload: readonly string[] & { readonly audience: UnsafeAny } }>
  >().toEqualTypeOf<"payload.audience:open-value">();
});
