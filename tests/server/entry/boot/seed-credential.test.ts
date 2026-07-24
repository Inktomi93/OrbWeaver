// entry/boot/seed-credential — the env→DB OpenRouter seed. Pins the boot step's branching (the list-then-add
// idempotency guard) with the credentials verbs stubbed (the row/seal mechanics are tested in
// domain/credentials — this isolates the boot wiring, the seam-test precedent). Covers: no-op when the key
// is unset; adds when no openrouter row exists; idempotent (no second add when one already exists).

import type { CredentialProvider } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { Handle, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CredentialView } from "@orb/server/domain/credentials";
import { seedCredentialFromEnv } from "@orb/server/entry/boot";
import { expect, test } from "../../../support/fixtures";

const OWNER: Principal = {
  userId: castId<UserId>("u_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};

const KEY = "sk-or-test-key";

function view(provider: CredentialProvider, id: string): CredentialView {
  return {
    id: castId<UserCredentialId>(id),
    provider,
    label: "default",
    active: true,
    hasMetadata: false,
    revokedAt: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

interface Double {
  readonly credentials: {
    readonly list: (params: { principal: Principal }) => Promise<CredentialView[]>;
    readonly add: (params: { principal: Principal; provider: CredentialProvider; key: string }) => Promise<CredentialView>;
  };
  /** The mutable backing store — tests assert on its length / contents (no separate call counter). */
  readonly store: CredentialView[];
}

/** An in-memory credentials double: `list` returns the store; `add` appends a minimal view. */
function credentialsDouble(seed: readonly CredentialProvider[]): Double {
  const store: CredentialView[] = seed.map((provider, i) => view(provider, `cred_${i}`));
  return {
    store,
    credentials: {
      list: (): Promise<CredentialView[]> => Promise.resolve([...store]),
      add: (params): Promise<CredentialView> => {
        const v = view(params.provider, `cred_added_${store.length}`);
        store.push(v);
        return Promise.resolve(v);
      },
    },
  };
}

test("no-op when the env key is unset (nothing written)", async () => {
  const d = credentialsDouble([]);
  const wrote = await seedCredentialFromEnv({
    credentials: d.credentials,
    owner: OWNER,
    openrouterApiKey: undefined,
  });
  expect(wrote).toBe(false);
  expect(d.store).toHaveLength(0);
});

test("adds the openrouter credential when none exists", async () => {
  const d = credentialsDouble([]);
  const wrote = await seedCredentialFromEnv({
    credentials: d.credentials,
    owner: OWNER,
    openrouterApiKey: KEY,
  });
  expect(wrote).toBe(true);
  expect(d.store).toHaveLength(1);
  expect(d.store.some((c) => c.provider === "openrouter")).toBe(true);
});

test("idempotent — does not add a second openrouter credential", async () => {
  const d = credentialsDouble(["openrouter"]);
  const wrote = await seedCredentialFromEnv({
    credentials: d.credentials,
    owner: OWNER,
    openrouterApiKey: KEY,
  });
  expect(wrote).toBe(false);
  expect(d.store).toHaveLength(1);
});
