// verb: storageStatus — the READ half of CREDENTIAL-STORAGE-SILENT-FAIL.
//
// Without a `CREDENTIALS_KEY` the SecretBox is disabled, boot only WARNs, and the app comes up healthy — so
// the "Add a provider key" form looked entirely operational and the only way to learn otherwise was to type a
// live secret into it and watch `add` refuse. This verb reports the same fact BEFORE the typing, so the UI
// refuses the INPUT instead of collecting a key it cannot keep.
//
// Pure over the injected box (no db, no principal), so this is a unit test: the two arms, and the invariant
// that binds it to the write refusal — `storageStatus().enabled === false` iff `add` throws `disabled`.

import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SecretBox } from "@orb/server/infra/crypto";
import { budget } from "@orb/tooling/_shared/load-budget";
import { describe, vi } from "vitest";
import type { CredentialContext } from "../../../../../packages/server/src/domain/credentials/context.ts";
import { CREDENTIALS_OP_CODES } from "../../../../../packages/server/src/domain/credentials/contract/errors.ts";
import { createStorageStatus } from "../../../../../packages/server/src/domain/credentials/verbs/storage-status.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";

// The last test dynamic-`import()`s `verbs/add.ts` — a cold pull of its own graph (crypto, errors) that
// measured sitting at ~10.6s against the project's ~9.7s scaled default under load (#1810), a near-miss with
// no headroom. `budget()` (not a fixed number) so the ceiling stays load-scaled rather than fighting it.
vi.setConfig({ testTimeout: budget(20_000) });

/** The verb reads exactly one field off the ctx; everything else would be a lie about what it touches. */
function ctxWithBox(enabled: boolean): CredentialContext {
  const box: SecretBox = {
    enabled,
    encrypt: (): never => {
      throw new Error("storageStatus must not encrypt");
    },
    decrypt: (): never => {
      throw new Error("storageStatus must not decrypt");
    },
  };
  return { box } as unknown as CredentialContext; // FABRICATION-OK: the verb's whole surface IS `ctx.box.enabled`.
}

describe("credentials/storageStatus", () => {
  test("a keyed deployment reports storage ENABLED", async () => {
    await expect(createStorageStatus(ctxWithBox(true))()).resolves.toEqual({ enabled: true });
  });

  test("a keyless deployment reports storage DISABLED — the fact the UI needs before it collects a secret", async () => {
    await expect(createStorageStatus(ctxWithBox(false))()).resolves.toEqual({ enabled: false });
  });

  test("it never touches the box's crypto — a capability read must not be able to leak or seal anything", async () => {
    // Both crypto arms throw; a green result is the proof neither was called.
    await expect(createStorageStatus(ctxWithBox(true))()).resolves.toEqual({ enabled: true });
  });

  test("the answer MATCHES the write refusal — a `false` here is exactly when `add` throws `credentials_disabled`", async () => {
    // The pairing is the point: if these two ever disagree, the UI refuses input on a deployment that would
    // have saved fine, or collects a key on one that cannot. `add`'s guard is the same `ctx.box.enabled`.
    const ctx = ctxWithBox(false);
    expect(await createStorageStatus(ctx)()).toEqual({ enabled: false });
    const { createAdd } = await import("../../../../../packages/server/src/domain/credentials/verbs/add.ts");
    const attempt = (): Promise<unknown> => createAdd(ctx)({ principal: makePrincipal(castId<UserId>("user_probe")), provider: "openrouter", key: "sk-probe" });
    await expect(attempt()).rejects.toBeInstanceOf(DomainOperationError);
    await expect(attempt()).rejects.toMatchObject({ code: CREDENTIALS_OP_CODES.disabled });
  });
});
