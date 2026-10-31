// The shell's served-procedure lists each name a procedure once, and the mount list adds to the section list rather than
// repeating it. The mount and room lists may share a name: an open room sends the same read the mount does.
import { describe, expect, test } from "vitest";
import { ROOM_PROCEDURES, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES } from "./ct-shell-procedures.ts";

const repeats = (names: readonly string[]): readonly string[] => names.filter((name, index) => names.indexOf(name) !== index);

describe("the shell's served procedure lists", () => {
  test.each([
    ["section", SECTION_PROCEDURES],
    ["mount", SHELL_MOUNT_PROCEDURES],
    ["room", ROOM_PROCEDURES],
  ] as const)("the %s list names no procedure twice", (_name, list) => {
    expect(list.length).toBeGreaterThan(0);
    expect(repeats(list)).toEqual([]);
  });

  test("the mount list repeats nothing the section list serves", () => {
    expect(SHELL_MOUNT_PROCEDURES.filter((name) => (SECTION_PROCEDURES as readonly string[]).includes(name))).toEqual([]);
  });
});
