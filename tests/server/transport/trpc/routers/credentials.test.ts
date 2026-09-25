// credentials.list / add / replace — the output boundary of the procedures that return a
// `CredentialView`. The view is the credential row minus every secret column, projected by
// `toCredentialView`. The tRPC output parser is the second guard: a producer that starts returning an extra
// key (a spread row carrying `ciphertext`, a verb echoing the submitted `key`) must fail the call loudly
// instead of shipping the key to the browser or silently stripping it. Each leak test plants the extra field
// in the service result and drives the real ladder through `createCaller`.

import type { CredentialView } from "@orb/contracts/credentials";
import type { ProviderId } from "@orb/contracts/inference";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { CredentialsService } from "@orb/server/domain/credentials";
import { logger } from "@orb/server/foundation/observability";
import type { Context } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const OWNER = castId<UserId>("user_owner");
const SEALED_SECRET = "sealed-ciphertext-bytes-9f2c";
const PLAINTEXT_KEY = "sk-live-plaintext-key-4d1e";

const VIEW: CredentialView = {
  id: mintTypeId(ID_PREFIX.userCredential),
  provider: castId<ProviderId>("openrouter"),
  label: "default",
  revokedAt: null,
  revokedReason: null,
  createdAt: 1_750_000_000_000,
  updatedAt: 1_750_000_000_000,
};

function ctxWith(credentials: Partial<CredentialsService>): Context {
  return makeContext({ auth: principal("user", { userId: OWNER }), services: { credentials } });
}

const ADD_INPUT = { provider: "openrouter", key: PLAINTEXT_KEY } as const;

describe("credentials — CredentialView output boundary", () => {
  test("a well-formed view passes through unchanged on list, add and replace", async () => {
    const list = vi.fn<CredentialsService["list"]>(async () => [VIEW]);
    const add = vi.fn<CredentialsService["add"]>(async () => VIEW);
    const replace = vi.fn<CredentialsService["replace"]>(async () => VIEW);
    const api = caller(ctxWith({ list, add, replace }));

    await expect(api.credentials.list()).resolves.toEqual([VIEW]);
    await expect(api.credentials.add(ADD_INPUT)).resolves.toEqual(VIEW);
    await expect(api.credentials.replace({ credentialId: VIEW.id, key: PLAINTEXT_KEY })).resolves.toEqual(VIEW);
  });

  test("replace refuses a view echoing the plaintext key", async () => {
    const replace = vi.fn<CredentialsService["replace"]>(async () => ({ ...VIEW, key: PLAINTEXT_KEY }));

    await expect(caller(ctxWith({ replace })).credentials.replace({ credentialId: VIEW.id, key: PLAINTEXT_KEY })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("list refuses a view carrying a sealed-secret column", async () => {
    const leaked = { ...VIEW, ciphertext: SEALED_SECRET };
    const list = vi.fn<CredentialsService["list"]>(async () => [leaked]);

    await expect(caller(ctxWith({ list })).credentials.list()).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("add refuses a view echoing the plaintext key", async () => {
    const leaked = { ...VIEW, key: PLAINTEXT_KEY };
    const add = vi.fn<CredentialsService["add"]>(async () => leaked);

    await expect(caller(ctxWith({ add })).credentials.add(ADD_INPUT)).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("a known field with the wrong shape is refused too", async () => {
    // The brand satisfies the compiler; the runtime value is not a registry id (the provider-id grammar).
    const reshaped = { ...VIEW, provider: castId<ProviderId>(PLAINTEXT_KEY.toUpperCase()) };
    const list = vi.fn<CredentialsService["list"]>(async () => [reshaped]);

    await expect(caller(ctxWith({ list })).credentials.list()).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("the refusal is logged server-side with the offending key NAME and never the secret VALUE", async () => {
    const log = vi.spyOn(logger, "error");
    const leaked = { ...VIEW, ciphertext: SEALED_SECRET };
    const list = vi.fn<CredentialsService["list"]>(async () => [leaked]);

    const failure = await caller(ctxWith({ list }))
      .credentials.list()
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(failure).toBeInstanceOf(Error);
    // The thrown error is what the formatter reads; neither it nor its cause may carry the value.
    expect(String(failure)).not.toContain(SEALED_SECRET);
    expect(log).toHaveBeenCalledOnce();
    const [bindings] = log.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(bindings).toMatchObject({ event: "trpc.unhandled", path: "credentials.list" });
    const cause = bindings["err"];
    expect(cause).toBeInstanceOf(Error);
    const logged = `${(cause as Error).message} ${JSON.stringify(cause)}`;
    expect(logged).toContain("ciphertext");
    expect(logged).not.toContain(SEALED_SECRET);
  });

  test("a secret mapped into the id field is refused without the log echoing it", async () => {
    const log = vi.spyOn(logger, "error");
    // Shaped to reach typeid-js's prefix-mismatch path, whose own message echoes everything before the last `_`.
    const secretId = `sk_live_${SEALED_SECRET.replaceAll("-", "_")}_01jz0000000000000000000000`;
    const misMapped = { ...VIEW, id: castId<UserCredentialId>(secretId) };
    const list = vi.fn<CredentialsService["list"]>(async () => [misMapped]);

    await expect(caller(ctxWith({ list })).credentials.list()).toThrowTRPCError("INTERNAL_SERVER_ERROR");
    const [bindings] = log.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    const cause = bindings["err"] as Error;
    expect(`${cause.message} ${JSON.stringify(cause)}`).not.toContain("sealed_ciphertext");
  });
});
