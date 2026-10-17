// @subject packages/server/src/domain/admin/contract/views.ts
// @subject packages/server/src/entry/auth/seam.ts
import type { AdminService } from "@orb/server/domain/admin";
import type { SessionsService } from "@orb/server/domain/sessions";
import type { createHostPrincipalResolver } from "@orb/server/entry/auth";
import type { createCaller } from "@orb/server/transport/trpc";
import { expectTypeOf, test } from "vitest";

type RootPrincipal = Awaited<ReturnType<ReturnType<typeof createHostPrincipalResolver>>>;
type AdminTarget = Awaited<ReturnType<AdminService["listUsers"]>>[number];
type Validated = NonNullable<Awaited<ReturnType<SessionsService["validate"]>>>;
type HostFields = NonNullable<Awaited<ReturnType<SessionsService["loadUserById"]>>>;
type Caller = ReturnType<typeof createCaller>;

declare const principal: RootPrincipal;
declare const target: AdminTarget;
declare const session: Validated;
declare const host: HostFields;

test("native comparisons reject aliases, computed reads and reversed global-role checks on real producers", () => {
  // @ts-expect-error A resolved role is not a string, irrespective of operand order.
  expectTypeOf(principal.role === "owner").toBeBoolean();
  const adminCode = "admin";
  // @ts-expect-error Delegated privilege must ask can(), not inspect the global role.
  expectTypeOf(adminCode === principal.role).toBeBoolean();
  // @ts-expect-error A computed key cannot expose the stored global-role code.
  expectTypeOf(target["role"] !== "owner").toBeBoolean();
  const Owner = "owner";
  // @ts-expect-error Aliasing the literal cannot bypass the representation boundary.
  expectTypeOf(session.role === Owner).toBeBoolean();
  const { role: renamed } = host;
  // @ts-expect-error Destructuring and renaming cannot turn captured data into privilege evidence.
  expectTypeOf(renamed === "owner").toBeBoolean();
  // @ts-expect-error The lattice's includes form cannot consume opaque data either.
  ["owner", "admin"].includes(principal.role);
  // @ts-expect-error Global and participant states have distinct identities.
  expectTypeOf(principal.role).toEqualTypeOf<import("@orb/contracts/identity").ParticipantRoleState>();
});

test("storage inputs and unrelated closed role axes remain raw data", () => {
  expectTypeOf<Parameters<AdminService["setRole"]>[0]["role"]>().toEqualTypeOf<import("@orb/contracts/identity").UserRole>();
  expectTypeOf<Awaited<ReturnType<Caller["sessions"]["me"]>>["globalRole"]>().toEqualTypeOf<import("@orb/contracts/identity").UserRole>();
  expectTypeOf<Awaited<ReturnType<Caller["admin"]["listUsers"]>>[number]["role"]>().toEqualTypeOf<import("@orb/contracts/identity").UserRole>();
  const foreign: { role: "owner" | "guest" } = { role: "owner" };
  const message: { role: "system" | "user" | "assistant" } = { role: "user" };
  expectTypeOf(foreign.role === "owner").toBeBoolean();
  expectTypeOf(message.role === "user").toBeBoolean();
});

test("actual Principal, session and admin target role data cannot be compared as strings", () => {
  expectTypeOf<RootPrincipal["role"]>().not.toExtend<string>();
  expectTypeOf<AdminTarget["role"]>().not.toExtend<string>();
  expectTypeOf<Validated["role"]>().not.toExtend<string>();
  expectTypeOf<HostFields["role"]>().not.toExtend<string>();
});
