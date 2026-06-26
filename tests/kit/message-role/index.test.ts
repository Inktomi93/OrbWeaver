import { MESSAGE_ROLES, messageRoleFromSt, messageRoleToSt } from "@orb/kit/message-role";
import { expect, test } from "vitest";

test("MESSAGE_ROLES carries the canonical members in order", () => {
  expect(MESSAGE_ROLES).toEqual(["system", "user", "assistant"]);
});

test("messageRoleToSt encodes the canonical 0/1/2 mapping", () => {
  expect(messageRoleToSt("system")).toBe(0);
  expect(messageRoleToSt("user")).toBe(1);
  expect(messageRoleToSt("assistant")).toBe(2);
});

test("messageRoleFromSt decodes the numeric encoding", () => {
  expect(messageRoleFromSt(0)).toBe("system");
  expect(messageRoleFromSt(1)).toBe("user");
  expect(messageRoleFromSt(2)).toBe("assistant");
});

test("messageRoleFromSt passes a literal role string through", () => {
  expect(messageRoleFromSt("system")).toBe("system");
  expect(messageRoleFromSt("user")).toBe("user");
  expect(messageRoleFromSt("assistant")).toBe("assistant");
});

test("messageRoleFromSt returns null for anything unrecognized", () => {
  expect(messageRoleFromSt(3)).toBeNull();
  expect(messageRoleFromSt("narrator")).toBeNull();
  expect(messageRoleFromSt(null)).toBeNull();
  expect(messageRoleFromSt(undefined)).toBeNull();
  expect(messageRoleFromSt({})).toBeNull();
});

test("the bimap round-trips both directions for every role", () => {
  for (const role of MESSAGE_ROLES) {
    expect(messageRoleFromSt(messageRoleToSt(role))).toBe(role);
  }
  for (const [code, role] of [
    [0, "system"],
    [1, "user"],
    [2, "assistant"],
  ] as const) {
    expect(messageRoleFromSt(code)).toBe(role);
    expect(messageRoleToSt(role)).toBe(code);
  }
});
