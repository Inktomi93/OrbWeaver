// Shared test harness for the assets domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `AssetsContext` with injected determinism (frozen clock + seeded ids — composed
// from tests/support, never self-rolled) and the sanctioned "fake at the edges, inject at the root"
// doctrine (testing §3):
//   • `cas` / `variants` — the REAL infra adapters over fresh temp dirs (so dedup, per-user sharding, and
//     the variant cache are exercised for real, not stubbed). `cleanup()` rms the temp trees.
//   • `imageTransform` — a vi.fn FAKE (sharp is CPU/I/O; the variant assertion is identity, not pixels). It
//     RECORDS its calls so tests assert "transformed once, then cache-served."
//   • `emit` — a recording fake that pushes each `asset.created` into `emitted` (a real injected op, not an
//     internal-module mock).
// Seeds the `users` rows the FK needs directly — a test fixture may read/write `users` (the
// `no-direct-users-read` gate scopes only `packages/server/src/domain`).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DomainEvent } from "@orb/contracts/events";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { AssetId, ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCas, createVariantCache } from "@orb/server/infra/storage";
import type { Mock } from "vitest";
import { vi } from "vitest";
import type { AssetsContext } from "../../../../packages/server/src/domain/assets/contract/service.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = 1_750_000_000_000;

// The PNG magic bytes — every `pngBytes(...)` starts here so `sniffMime` returns image/png. The tail makes
// distinct images hash distinctly.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

// Deterministic fake webp bytes the mocked imageTransform returns (opaque — the variant cache stores bytes,
// never decodes; the assertion is identity).
const FAKE_WEBP = new Uint8Array([0x57, 0x45, 0x42, 0x50, 0xaa, 0xbb]);

export interface AssetsHarness {
  readonly ctx: AssetsContext;
  /** Every `asset.created` the verbs emitted, in order. */
  readonly emitted: DomainEvent[];
  /** The injected sharp fake — assert call count + args (e.g. the snapped width). */
  readonly imageTransform: Mock<AssetsContext["imageTransform"]>;
  /** rm the temp CAS + variant trees. Register via `onTestFinished`. */
  readonly cleanup: () => Promise<void>;
  /** Advance the injected frozen clock (ms). */
  readonly advance: (ms: number) => void;
}

/** Build an AssetsContext over a real db + real CAS/variant temp dirs with deterministic + recording fakes. */
export async function makeHarness(db: Db): Promise<AssetsHarness> {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const casDir = await mkdtemp(join(tmpdir(), "orb-assets-cas-"));
  const variantDir = await mkdtemp(join(tmpdir(), "orb-assets-var-"));
  const cas = createCas(casDir);
  const variants = createVariantCache(variantDir);
  const emitted: DomainEvent[] = [];
  const imageTransform: Mock<AssetsContext["imageTransform"]> = vi.fn<
    AssetsContext["imageTransform"]
  >(() => Promise.resolve(FAKE_WEBP));
  const ctx: AssetsContext = {
    db,
    cas,
    variants,
    imageTransform,
    emit: (event: DomainEvent): void => {
      emitted.push(event);
    },
    now: (): number => clock.now(),
    newAssetId: (): AssetId => castId<AssetId>(ids.next("asset")),
  };
  return {
    ctx,
    emitted,
    imageTransform,
    advance: (ms: number): void => clock.advance(ms),
    cleanup: async (): Promise<void> => {
      await rm(casDir, { recursive: true, force: true });
      await rm(variantDir, { recursive: true, force: true });
    },
  };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
  readonly role?: UserRole;
}

/** Insert a `users` row with deterministic defaults; returns its branded id (the FK target for assets). */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? "x"}`);
  await db.insert(users).values({
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    role: overrides.role ?? "user",
    enabled: true,
    passwordHash: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Build a Principal for a given user id + role (cookie-resolved by default). */
export function principal(
  userId: UserId,
  role: UserRole = "user",
  handle: string = userId,
): Principal {
  return {
    userId,
    role,
    handle: castId<Handle>(handle),
    externalId: null as ExternalId | null,
    via: "cookie",
  };
}

/** Fake but well-formed PNG bytes: the PNG signature + a distinguishing tail (distinct tails ⇒ distinct
 *  content hashes). `sniffMime` recognizes the signature; the CAS just hashes/stores the bytes opaquely. */
export function pngBytes(...tail: number[]): Uint8Array {
  return new Uint8Array([...PNG_SIGNATURE, ...tail]);
}
