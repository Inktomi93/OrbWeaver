import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";

export const EXTERNAL = castId<ExternalId>("authentik|abc-123");

/** The owner-claim proof for every case that is not about the claim (D258): the loopback or claim-code login. */
export const PROVEN = { ownerClaimProven: true } as const;

export function identity(over: Partial<ResolvedIdentity> = {}): ResolvedIdentity {
  return {
    externalId: EXTERNAL,
    handle: castId<Handle>("alice"),
    groups: [],
    email: null,
    ...over,
  };
}

type ProvisionOut = Awaited<ReturnType<SessionsService["provisionIdentity"]>>;
type Provisioned = Extract<ProvisionOut, { outcome: "provisioned" }>;

/** Narrow a provision result to the `provisioned` arm (fails the test loudly on `denied`). */
export function asProvisioned(result: ProvisionOut): Provisioned {
  if (result.outcome !== "provisioned") {
    throw new Error(`expected provisioned, got ${result.outcome}`);
  }
  return result;
}

/** `rowCount` against an explicit handle — the race tests below drive their own held db. */
export async function rowCountOn(on: Db): Promise<number> {
  return (await on.select().from(users)).length;
}
