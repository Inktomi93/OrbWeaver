import { posix, win32 } from "node:path";
import { isStrictDescendant, isWithinRoot } from "@orb/kit/path-containment";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";

// The check takes the path flavour's separator, so both flavours are driven from one platform with
// `path.posix` / `path.win32`. Production callers bind it to the host's own `node:path`.
describe("isStrictDescendant — a proper descendant, never the root itself", () => {
  test("posix: a descendant is contained, case-sensitively", () => {
    expect(isStrictDescendant("/staging", "/staging/x", posix)).toBe(true);
    expect(isStrictDescendant("/staging", "/Staging/x", posix)).toBe(false);
  });

  test("posix: the root itself and anything outside it are not contained", () => {
    expect(isStrictDescendant("/staging", "/staging", posix)).toBe(false);
    expect(isStrictDescendant("/staging", "/other", posix)).toBe(false);
    expect(isStrictDescendant("/staging", "/staging-sibling", posix)).toBe(false);
  });

  test("a trailing separator on the target names the same directory, so it is not a descendant of itself", () => {
    expect(isStrictDescendant("/staging", "/staging/", posix)).toBe(false);
    expect(isStrictDescendant("/staging/", "/staging/x", posix)).toBe(true);
  });

  test("the filesystem root contains everything below it and not itself", () => {
    expect(isStrictDescendant("/", "/staging", posix)).toBe(true);
    expect(isStrictDescendant("/", "/", posix)).toBe(false);
  });

  test("win32: a drive-letter/case mismatch is still contained (Windows filesystems are case-insensitive)", () => {
    expect(isStrictDescendant("c:\\staging", "C:\\Staging\\x", win32)).toBe(true);
    expect(isStrictDescendant("C:\\Staging", "c:\\staging\\x", win32)).toBe(true);
  });

  test("win32: the root itself, a sibling, and a resolved parent escape are not contained", () => {
    expect(isStrictDescendant("C:\\Staging", "C:\\Staging", win32)).toBe(false);
    expect(isStrictDescendant("C:\\Staging", "c:\\STAGING", win32)).toBe(false);
    expect(isStrictDescendant("C:\\Staging", "C:\\Other", win32)).toBe(false);
    // `resolve(root, "..")` off `C:\Staging` is `C:\`, which is not a descendant of `C:\Staging`.
    expect(isStrictDescendant("C:\\Staging", "C:\\", win32)).toBe(false);
  });

  test("win32: a UNC root contains its own descendant, case-insensitively", () => {
    expect(isStrictDescendant("\\\\server\\share\\staging", "\\\\SERVER\\SHARE\\Staging\\x", win32)).toBe(true);
  });
});

describe("isWithinRoot — the root itself or a descendant", () => {
  test("the root itself counts, as does a descendant at any depth", () => {
    expect(isWithinRoot("/repo", "/repo", posix)).toBe(true);
    expect(isWithinRoot("/repo", "/repo/", posix)).toBe(true);
    expect(isWithinRoot("/repo", "/repo/a/b", posix)).toBe(true);
  });

  test("a sibling sharing the root's name as a prefix, a parent and an unrelated path do not count", () => {
    expect(isWithinRoot("/repo", "/repo-other", posix)).toBe(false);
    expect(isWithinRoot("/repo", "/", posix)).toBe(false);
    expect(isWithinRoot("/repo", "/etc", posix)).toBe(false);
  });

  test("win32: the root itself counts regardless of case", () => {
    expect(isWithinRoot("C:\\Repo", "c:\\repo", win32)).toBe(true);
    expect(isWithinRoot("C:\\Repo", "C:\\Repo\\src", win32)).toBe(true);
    expect(isWithinRoot("C:\\Repo", "C:\\Repo2", win32)).toBe(false);
  });
});
