// Auth capabilities and external issuer wiring are runner-neutral; Vitest and native browser consumers share this owner.
import type { AuthMode } from "@orb/contracts/identity";
import { AUTH_MODE_DEFAULT_FALLBACK } from "@orb/server/foundation/env/record";
import { z } from "zod";
import { CLIENT_ID, ISSUER, NATIVE_OIDC_SETTINGS } from "./oidc-issuer.ts";
import type { AuthModeEnv, ServerHarnessOptions } from "./server.ts";
import type { NativeIssuer } from "./sign-in.ts";

export const authModeCapabilitySchema = z.object({ members: z.boolean(), ownerFallback: z.boolean() });
export type AuthModeCapability = z.output<typeof authModeCapabilitySchema>;

function ownerFallbackOf(mode: AuthMode): boolean {
  return AUTH_MODE_DEFAULT_FALLBACK[mode] === "owner";
}

/** Product mode capabilities; multiplayer surfaces additionally ask the root's multiHumanCapable operation. */
export const AUTH_MODE_CAPABILITIES = {
  "single-user": { members: false, ownerFallback: ownerFallbackOf("single-user") },
  local: { members: true, ownerFallback: ownerFallbackOf("local") },
  oidc: { members: true, ownerFallback: ownerFallbackOf("oidc") },
  "forward-header": { members: true, ownerFallback: ownerFallbackOf("forward-header") },
} as const satisfies Record<AuthMode, AuthModeCapability>;

type PhysicalPeer = NonNullable<ServerHarnessOptions["physicalPeer"]>;
type ModeHarnessOptions<Mode extends AuthMode> = Required<Pick<ServerHarnessOptions, "physicalPeer">> &
  Pick<ServerHarnessOptions, "oidc" | "networkExecution"> & { readonly env: AuthModeEnv<Mode> };

const LOOPBACK_PEER = "127.0.0.1";
const PUBLIC_PEER = "93.184.215.14";
const ISSUER_HOST = new URL(ISSUER).hostname;

function atPeer(address: string): PhysicalPeer {
  return () => address;
}

function issuerNetwork(issuer: NativeIssuer): NonNullable<ServerHarnessOptions["networkExecution"]> {
  return {
    resolver: (hostname) =>
      hostname === ISSUER_HOST ? Promise.resolve([PUBLIC_PEER]) : Promise.reject(new Error(`unscripted address resolution: ${hostname}`)),
    fetch: (input, init) => issuer.fetch(input, init),
  };
}

function postureOf<Mode extends AuthMode>(mode: Mode): AuthModeEnv<Mode> {
  return { ["AUTH_MODE"]: mode, ["AUTH_FALLBACK"]: AUTH_MODE_DEFAULT_FALLBACK[mode] };
}

const MODE_HARNESS: { readonly [Mode in AuthMode]: (issuer: NativeIssuer) => ModeHarnessOptions<Mode> } = {
  "single-user": () => ({ env: postureOf("single-user"), physicalPeer: atPeer(LOOPBACK_PEER) }),
  local: () => ({ env: postureOf("local"), physicalPeer: atPeer(PUBLIC_PEER) }),
  oidc: (issuer) => ({ env: postureOf("oidc"), physicalPeer: atPeer(PUBLIC_PEER), oidc: NATIVE_OIDC_SETTINGS, networkExecution: issuerNetwork(issuer) }),
  "forward-header": (issuer) => ({
    env: {
      ...postureOf("forward-header"),
      ["FORWARD_AUTH_VERIFY_JWT"]: "true",
      ["FORWARD_AUTH_JWKS_ALLOWLIST"]: ISSUER_HOST,
      ["FORWARD_AUTH_JWT_ISSUER"]: ISSUER,
      ["FORWARD_AUTH_JWT_AUDIENCE"]: CLIENT_ID,
    },
    physicalPeer: atPeer(PUBLIC_PEER),
    networkExecution: issuerNetwork(issuer),
  }),
};

/** Existing per-mode production wiring over the scripted issuer's actual protocol edge. */
export function authModeHarnessOptions<Mode extends AuthMode>(mode: Mode, issuer: NativeIssuer): ModeHarnessOptions<Mode> {
  return MODE_HARNESS[mode](issuer);
}
