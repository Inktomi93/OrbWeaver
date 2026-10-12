import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { effectiveHttpPort, parseTcpPort } from "#kit/http-endpoint/index.ts";

test("effective HTTP ports keep client admission and server dialing equal", () => {
  expect(effectiveHttpPort("http:", "")).toBe(80);
  expect(effectiveHttpPort("https:", "")).toBe(443);
  expect(effectiveHttpPort("http:", "8000")).toBe(8000);
  expect(effectiveHttpPort("ftp:", "8000")).toBeNull();
  for (const text of ["", "0", "65536", " 80", "+80", "8e1"]) {
    expect(parseTcpPort(text)).toBeNull();
  }
});
