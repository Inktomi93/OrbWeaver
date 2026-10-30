// Sign a user in through the product's own login path for the root's auth mode, and run a case under every mode.
// The door never decides admission: every refusal it raises is the product's answer, read off the wire.

import { readFile } from "node:fs/promises";
import type { AuthMode, Principal, ViewerView } from "@orb/contracts/identity";
import { AUTH_MODES, viewerViewSchema } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { JWTPayload } from "jose";
import type { TestAPI, TestFunction } from "vitest";
import { z } from "zod";
import { readAccounts } from "./admin/accounts.ts";
import type { AuthModeCapability } from "./auth-mode-options.ts";
import { AUTH_MODE_CAPABILITIES, authModeHarnessOptions } from "./auth-mode-options.ts";
import { test } from "./fixtures.ts";
import { createNativeIssuer, NATIVE_OIDC_SETTINGS } from "./oidc-issuer.ts";
import type { ActorSpec, ServerHarnessOptions, ServerTestHarness } from "./server.ts";
import { createServerHarness } from "./server.ts";
import type { NativeIssuer } from "./sign-in.ts";
import { forwardHeaders, SignInRefusal, signInWithOidc, signInWithPassword } from "./sign-in.ts";

// The authorization kernel's role reads. Role data decodes only behind admin's door (role-data-private-decoder), so a
// suite reads a Principal's role through these, never a sideways import of admin.
export { can, isAdmin, isOwner } from "@orb/server/domain/admin";
export { AUTH_MODE_CAPABILITIES, authModeHarnessOptions } from "./auth-mode-options.ts";
export { beginOidcLogin, cookieHeader, finishOidcLogin, forwardHeaders, SignInRefusal, signInWithOidc, signInWithPassword } from "./sign-in.ts";

const VIEWER_ROUTE = "/api/trpc/sessions.me";
const SUBJECT_PREFIX = "subject";
/** The SSO subject the owner row binds on its first SSO sign-in. */
const OWNER_SUBJECT = castId<ExternalId>("auth-door-owner-subject");
// The local password every door-minted account carries.
const SIGN_IN_PASSWORD = "auth-door-member-password";

const viewerEnvelopeSchema = z.object({ result: z.object({ data: viewerViewSchema }) });

/** A claimed root composed in one auth mode, with the scripted issuer its SSO modes trust. */
export type AuthModeRoot = ServerTestHarness & {
  readonly mode: AuthMode;
  readonly capability: AuthModeCapability;
  readonly issuer: NativeIssuer;
};

/** Everything but the mode's own identity wiring; `physicalPeer` stays open so a case can move the caller off the box,
 *  and `env` adds keys beside the mode's posture without restating its mode. */
export type AuthModeRootOptions = Omit<ServerHarnessOptions, "authConfig" | "ownerId" | "oidc" | "networkExecution" | "env"> & {
  readonly env?: Omit<NonNullable<ServerHarnessOptions["env"]>, "AUTH_MODE">;
};

/** A claimed root in `mode`, wired to a fresh scripted issuer. */
export async function createAuthModeRoot(mode: AuthMode, options: AuthModeRootOptions = {}): Promise<AuthModeRoot> {
  const issuer = await createNativeIssuer();
  const wiring = authModeHarnessOptions(mode, issuer);
  const root = await createServerHarness({ ...wiring, ...options, env: { ...wiring.env, ...options.env } });
  return Object.assign(root, { mode, capability: AUTH_MODE_CAPABILITIES[mode], issuer });
}

interface AuthModeFixtures {
  readonly authMode: AuthMode;
  readonly root: AuthModeRoot;
  readonly capability: AuthModeCapability;
}

// `authMode` is each mode's value fixture, so `root` composes a fresh harness in that mode for every case.
function authModeTest(mode: AuthMode): TestAPI<AuthModeFixtures> {
  return test.extend<AuthModeFixtures>({
    authMode: mode,
    root: async ({ authMode }, use) => {
      await using root = await createAuthModeRoot(authMode);
      await use(root);
    },
    capability: async ({ root }, use) => {
      await use(root.capability);
    },
  });
}

const AUTH_MODE_TESTS: Record<AuthMode, TestAPI<AuthModeFixtures>> = {
  "single-user": authModeTest("single-user"),
  local: authModeTest("local"),
  oidc: authModeTest("oidc"),
  "forward-header": authModeTest("forward-header"),
};

/** One case per auth mode, each on a fresh root composed in that mode; ESLint treats it as a test block. */
export function forEachAuthMode(name: string, body: TestFunction<AuthModeFixtures>): void {
  for (const mode of AUTH_MODES) {
    AUTH_MODE_TESTS[mode](`${name} [${mode}]`, body);
  }
}

/** An account and the credentials each mode's login path presents for it. */
export interface AuthSubject {
  readonly userId: UserId;
  readonly handle: Handle;
  readonly password: string;
  readonly subject: ExternalId;
}

/** Mint a member through the harness verbs, carrying both a local password and a bound SSO subject. */
export async function mintMember(root: AuthModeRoot, spec: Omit<ActorSpec, "password" | "externalId"> = {}): Promise<AuthSubject> {
  const subject = castId<ExternalId>(root.ids.next(SUBJECT_PREFIX));
  const row = await root.actor({ ...spec, password: SIGN_IN_PASSWORD, externalId: subject });
  return { userId: row.id, handle: row.handle, password: SIGN_IN_PASSWORD, subject };
}

// An account's bound SSO subject, as the owner's admin list shows it.
async function accountSubject(root: AuthModeRoot, userId: UserId): Promise<ExternalId | null> {
  return (await readAccounts(root)).find(({ id }) => id === userId)?.externalId ?? null;
}

/** The harness owner as a sign-in subject; its local password is set through the owner's own reset verb. */
export async function ownerSubject(root: AuthModeRoot): Promise<AuthSubject> {
  const owner = await root.principalFor(root.ownerId);
  await root.services.admin.resetPassword({ principal: owner, userId: owner.userId, password: SIGN_IN_PASSWORD });
  return { userId: owner.userId, handle: owner.handle, password: SIGN_IN_PASSWORD, subject: (await accountSubject(root, owner.userId)) ?? OWNER_SUBJECT };
}

/** A signed-in request identity: send `headers` with every `root.http.request`. `viewer` is what the wire admitted;
 *  `principal` is the row-derived Principal for direct verb calls, not the request's own. */
export interface SignedIn {
  readonly headers: Readonly<Record<string, string>>;
  readonly userId: UserId;
  readonly principal: Principal;
  readonly viewer: ViewerView;
}

function ssoClaims(who: AuthSubject): JWTPayload {
  return { sub: who.subject, [NATIVE_OIDC_SETTINGS.OIDC_USERNAME_CLAIM]: who.handle };
}

// D258: an unbound owner row is claimed over OIDC only with proof, and a public peer has only the boot claim code.
async function ownerClaimQuery(root: AuthModeRoot, who: AuthSubject): Promise<string> {
  if (who.userId !== root.ownerId || root.ownerClaimFile === undefined) {
    return "";
  }
  if ((await accountSubject(root, who.userId)) !== null) {
    return "";
  }
  return new URL((await readFile(root.ownerClaimFile, "utf8")).trim()).search;
}

const SIGN_IN: Record<AuthMode, (root: AuthModeRoot, who: AuthSubject) => Promise<Record<string, string>>> = {
  // The owner rides the peer-gated fallback with no credential; a member has no door here but the password route.
  "single-user": async (root, who) => (who.userId === root.ownerId ? {} : { cookie: await signInWithPassword(root, who.handle, who.password) }),
  local: async (root, who) => ({ cookie: await signInWithPassword(root, who.handle, who.password) }),
  oidc: async (root, who) => ({ cookie: await signInWithOidc(root, root.issuer, ssoClaims(who), await ownerClaimQuery(root, who)) }),
  "forward-header": async (root, who) => await forwardHeaders(root.issuer, ssoClaims(who)),
};

/** {@link signIn}, with the product's refusal returned instead of thrown, so a case can compare it to a capability. */
export async function trySignIn(root: AuthModeRoot, who: AuthSubject): Promise<SignedIn | SignInRefusal> {
  try {
    return await signIn(root, who);
  } catch (error) {
    if (error instanceof SignInRefusal) {
      return error;
    }
    throw error;
  }
}

/** Sign `who` in through `root`'s login path; `sessions.me` must then answer as `who`, or the product's refusal throws. */
export async function signIn(root: AuthModeRoot, who: AuthSubject): Promise<SignedIn> {
  const headers = await SIGN_IN[root.mode](root, who);
  const response = await root.http.request(VIEWER_ROUTE, { headers });
  if (response.status !== 200) {
    await response.arrayBuffer();
    throw new SignInRefusal(VIEWER_ROUTE, response);
  }
  const viewer = viewerEnvelopeSchema.parse(await response.json()).result.data;
  if (viewer.userId !== who.userId) {
    throw new SignInRefusal(VIEWER_ROUTE, response, `the product admitted ${viewer.handle}, not ${who.handle}`);
  }
  return { headers, userId: viewer.userId, principal: await root.principalFor(viewer.userId), viewer };
}
