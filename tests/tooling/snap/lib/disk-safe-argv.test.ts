// What a run file may hold of an argv: the shape of the call, never the text an operator handed it.
import { expect, test } from "@orb/testkit/tooling";
import { diskSafeArgv, diskSafeOp } from "../../../../tooling/src/snap/lib/disk-safe-argv.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";

test("a private flag keeps its selector or key and loses its value", () => {
  expect(diskSafeArgv(["/x", "--fill", "input=hunter2", "--debug-token", "tok", "--local-storage", "orb:k=v=w"])).toEqual([
    "/x",
    "--fill",
    "input=<private>",
    "--debug-token",
    "<private>",
    "--local-storage",
    "orb:k=<private>",
  ]);
});

test("the selector half follows the parser's split, so an attribute selector survives whole", () => {
  expect(diskSafeArgv(["--fill", "[data-testid=name]=a = b"])).toEqual(["--fill", "[data-testid=name]=<private>"]);
  expect(diskSafeArgv(["--fill", 'role=textbox[name="Content"]=hello'])).toEqual(["--fill", 'role=textbox[name="Content"]=<private>']);
});

test("a page-targeted fill masks like a plain one", () => {
  expect(diskSafeArgv(["--fill@2", "input=hunter2"])).toEqual(["--fill@2", "input=<private>"]);
});

test("a fill with no separator is wholly private: the operator may have typed the value alone", () => {
  expect(diskSafeArgv(["--fill", "hunter2"])).toEqual(["--fill", "<private>"]);
});

test("an inline spelling the parser refuses is masked too, since a refused run still writes its index", () => {
  expect(diskSafeArgv(["--debug-token=tok", "--fill=input=hunter2"])).toEqual(["--debug-token=<private>", "--fill=<private>"]);
});

test("every other argument reaches the file unchanged, a --fill-env name included", () => {
  const ordinary = ["/route", "--out", "shots", "--eval", "1 + 1", "--goto", "settings", "--viewport", "1280x800", "--fill-env", "input=PRIVATE_NAME"];
  expect(diskSafeArgv(ordinary)).toEqual(ordinary);
});

test("a private flag with its value missing masks nothing past the end", () => {
  expect(diskSafeArgv(["/x", "--debug-token"])).toEqual(["/x", "--debug-token"]);
});

test("the projection is idempotent, so a stored argv reads back as it was written", () => {
  const once = diskSafeArgv(["--fill", "input=hunter2", "--debug-token", "tok", "/x"]);
  expect(diskSafeArgv(once)).toEqual(once);
});

test("an op names a request by its masked arguments, or its kind when it carries none", () => {
  expect(diskSafeOp(["--fill", "input=hunter2", "--eval", "1"], "call")).toBe("--fill input=<private> --eval 1");
  expect(diskSafeOp([], "export")).toBe("export");
});

test("a refused spelling never echoes the value back into a log", () => {
  expect(parseSnapArgs(["/x", "--debug-token=hunter2"]).errors.join(" ")).not.toContain("hunter2");
  expect(parseSnapArgs(["/x", "--fill", "hunter2"]).errors.join(" ")).not.toContain("hunter2");
  expect(parseSnapArgs(["/x", "--local-storage", "hunter2"]).errors.join(" ")).not.toContain("hunter2");
});
