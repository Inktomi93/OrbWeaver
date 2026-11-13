// What a run file may hold of an argv: the shape of the call, never the text an operator handed it.
import { expect, test } from "@orb/testkit/tooling";
import { diskSafeArgv, diskSafeOp, diskSafeUrl, URL_VALUE_FLAGS } from "../../../../tooling/src/snap/lib/disk-safe-argv.ts";
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

test("a base URL loses its userinfo and its sensitive query values, and keeps the operator's spelling of the rest", () => {
  expect(diskSafeArgv(["--base", "http://u:hunter2@127.0.0.1:5273?token=t0k&lang=en", "--fixture-base", "https://u%40x:p%3Aw@h.test/a?api_key=k#f"])).toEqual([
    "--base",
    "http://<private>@127.0.0.1:5273?token=<private>&lang=en",
    "--fixture-base",
    "https://<private>@h.test/a?api_key=<private>#f",
  ]);
  const plain = ["--base", "http://127.0.0.1:5273", "--fixture-base", "http://localhost:5175/"];
  expect(diskSafeArgv(plain)).toEqual(plain);
});

test("a fragment token and a URL behind leading whitespace are masked as the parser reads them", () => {
  expect(diskSafeUrl("http://h.test/#access_token=t0k&state=s")).toBe("http://h.test/#access_token=<private>&state=s");
  expect(diskSafeUrl(" \thttp://u:pw@h.test/?token=t")).toBe(" \thttp://<private>@h.test/?token=<private>");
  expect(diskSafeArgv(["--fixture-server", "http://u:pw@127.0.0.1:8790"])).toEqual(["--fixture-server", "http://<private>@127.0.0.1:8790"]);
});

test("key and code are private as exact URL pair names, and a longer name ending in them is not", () => {
  expect(diskSafeUrl("http://h.test/cb?code=c0de&key=k3y&sortKey=s&langCode=en#key=f")).toBe(
    "http://h.test/cb?code=<private>&key=<private>&sortKey=s&langCode=en#key=<private>",
  );
});

test("a URL flag with userinfo is refused at parse without quoting it, and a credentials variable must be user:password", () => {
  for (const flag of URL_VALUE_FLAGS) {
    const errors = parseSnapArgs([flag, " http://u:hunter2@127.0.0.1:1/", "/"]).errors.join(" ");
    expect(errors).toContain(`${flag} carries user:password credentials`);
    expect(errors).not.toContain("hunter2");
  }
  // The positive control: the same URL without userinfo parses clean.
  expect(parseSnapArgs(["--base", "http://127.0.0.1:1/?token=t", "/"]).errors).toEqual([]);
  expect(parseSnapArgs(["--base-credentials-env", "L4_UNSET_CREDENTIALS", "/"]).errors.join(" ")).toContain("does not set");
});

// A special scheme needs no `//`: the parser reads a backslash as a slash, drops tabs and newlines anywhere, and takes
// `http:h` as `http://h/`. Each spelling below navigates with the token, so each is masked as the parser reads it.
test.for([
  ["a backslash for the slashes", "http:\\h.test?token=t0k", "http:\\h.test?token=<private>"],
  ["no slashes at all", "http:h.test/?token=t0k", "http:h.test/?token=<private>"],
  ["a tab inside the scheme", "ht\ttp://h.test/?token=t0k", "ht\ttp://h.test/?token=<private>"],
  ["a tab inside the pair name", "http://h.test/?to\tken=t0k", "http://h.test/?to\tken=<private>"],
  ["userinfo after mixed slashes", "http:/\\u:hunter2@h.test/?a=1", "http:/\\<private>@h.test/?a=1"],
] as const)("a URL spelled with %s is masked as the parser reads it", ([_name, raw, masked]) => {
  expect(diskSafeUrl(raw)).toBe(masked);
  expect(diskSafeUrl(masked)).toBe(masked);
});

test("a spelling the parser reads only against a base still loses its token, and an @ outside an authority stays", () => {
  expect(diskSafeUrl("http\\:/h.test/?token=t0k")).toBe("http\\:/h.test/?token=<private>");
  expect(diskSafeUrl("/a@b/x?api_key=k")).toBe("/a@b/x?api_key=<private>");
  expect(diskSafeUrl("mailto:a@b.test?subject=s")).toBe("mailto:a@b.test?subject=s");
});

test("a binding URL keeps a file path whole, an @ in a package directory included", () => {
  expect(diskSafeUrl("/repo/node_modules/.pnpm/@scope+pkg/x.html")).toBe("/repo/node_modules/.pnpm/@scope+pkg/x.html");
  const masked = diskSafeUrl("http://u:hunter2@h.test/?session=s3");
  expect(diskSafeUrl(masked)).toBe(masked);
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
