// The can() GUARD SEAM — the unit matrix (no db; pure on the Principal). Proves owner ⊇ admin lives HERE:
// `requireAdmin` passes owner ∪ admin, `requireOwner` is owner-only, `user` is denied everything; every
// deny throws DomainForbiddenError; the wrappers return the gated userId (chainable). This is the contract
// the W1 leaf domains inject — if this matrix is wrong, every gated surface is wrong.

import type { AgentActor, UserRole } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { can, canAgent, requireAdmin, requireOwner } from "@orb/server/domain/admin";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";
import { principal } from "./_support.ts";

/** A Principal carrying the given role, with a deterministic per-role userId. */
function pr(role: UserRole): ReturnType<typeof principal> {
  return principal(castId<UserId>(`user_${role}`), role);
}

describe("can(global)", () => {
  test("action 'admin' passes owner and admin, denies user", () => {
    expect(() => can(pr("owner"), "admin", { kind: "global" })).not.toThrow();
    expect(() => can(pr("admin"), "admin", { kind: "global" })).not.toThrow();
    expect(() => can(pr("user"), "admin", { kind: "global" })).toThrow(DomainForbiddenError);
  });

  test("action 'owner' passes ONLY owner — admin and user denied", () => {
    expect(() => can(pr("owner"), "owner", { kind: "global" })).not.toThrow();
    expect(() => can(pr("admin"), "owner", { kind: "global" })).toThrow(DomainForbiddenError);
    expect(() => can(pr("user"), "owner", { kind: "global" })).toThrow(DomainForbiddenError);
  });
});

describe("requireAdmin (owner ∪ admin)", () => {
  test("returns the gated userId for owner and admin", () => {
    const owner = pr("owner");
    const admin = pr("admin");
    expect(requireAdmin(owner)).toBe(owner.userId);
    expect(requireAdmin(admin)).toBe(admin.userId);
  });

  test("denies a plain user", () => {
    expect(() => requireAdmin(pr("user"))).toThrow(DomainForbiddenError);
  });
});

describe("requireOwner (owner-only)", () => {
  test("returns the gated userId for the owner", () => {
    const owner = pr("owner");
    expect(requireOwner(owner)).toBe(owner.userId);
  });

  test("denies a delegated admin and a plain user", () => {
    expect(() => requireOwner(pr("admin"))).toThrow(DomainForbiddenError);
    expect(() => requireOwner(pr("user"))).toThrow(DomainForbiddenError);
  });
});

// The CHAT resource arm (PD-1) — a PURE verdict over the roster chat feeds in (admin reads no chat db). The
// global role is irrelevant to the chat resource axis; the authority signal is the roster's `host|member`.
describe("can({kind:'chat', roster}) — the resource-role arm", () => {
  const member = pr("user");

  test("'read' allows any present member (the seam floor; presence is chat's pre-check)", () => {
    expect(() => can(member, "read", { kind: "chat", roster: { role: "member" } })).not.toThrow();
    expect(() => can(member, "read", { kind: "chat", roster: { role: "host" } })).not.toThrow();
  });

  test("'host' passes the room host, denies a plain member", () => {
    expect(() => can(member, "host", { kind: "chat", roster: { role: "host" } })).not.toThrow();
    expect(() => can(member, "host", { kind: "chat", roster: { role: "member" } })).toThrow(
      DomainForbiddenError,
    );
  });

  test("the global role does NOT grant chat-host authority (resource axis is orthogonal)", () => {
    // An owner who is only a plain MEMBER of the room is not the host — owner⊇admin is the GLOBAL axis only.
    expect(() => can(pr("owner"), "host", { kind: "chat", roster: { role: "member" } })).toThrow(
      DomainForbiddenError,
    );
  });
});

// The D60 agent ceiling (wall two). canAgent is the ONE agent runtime gate — the kill switch (`enabled`) +
// the closed AGENT_ACTIONS allow-union. Pure (no db), the same seam as can().
const ROOM = { role: "member" } as const;
function agentActor(enabled: boolean): AgentActor {
  return {
    kind: "agent",
    userId: castId<UserId>("user_agent"),
    ownerUserId: castId<UserId>("user_owner"),
    enabled,
  };
}

describe("canAgent (the agent capability ceiling)", () => {
  test("an ENABLED agent may 'speak' and 'tool-propose'", () => {
    expect(() => canAgent(agentActor(true), "speak", ROOM)).not.toThrow();
    expect(() => canAgent(agentActor(true), "tool-propose", ROOM)).not.toThrow();
  });

  test("a DISABLED agent is refused every action — the kill switch (one-flip containment)", () => {
    expect(() => canAgent(agentActor(false), "speak", ROOM)).toThrow(DomainForbiddenError);
    expect(() => canAgent(agentActor(false), "tool-propose", ROOM)).toThrow(DomainForbiddenError);
  });
});
