// @subject packages/contracts/src/inference/features.ts
// A row's key check path joins the base URL's origin, so the parse admits a plain path and refuses every shape that
// `new URL(path, base)` resolves to another host or out of the path the row names.
import { BUILTIN_PROVIDERS, endpointFeaturesSchema } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";

const TAB = String.fromCodePoint(0x09);
const NEWLINE = String.fromCodePoint(0x0a);
const NUL = String.fromCodePoint(0x00);

const REFUSED = [
  { shape: "a protocol-relative host", path: "//evil.example/collect" },
  { shape: "a backslash host", path: "/\\evil.example/collect" },
  { shape: "a tab the URL parser drops", path: `/${TAB}/evil.example/collect` },
  { shape: "a newline the URL parser drops", path: `/${NEWLINE}/evil.example/collect` },
  { shape: "a NUL", path: `/models${NUL}` },
  { shape: "userinfo", path: "/@evil.example/collect" },
  { shape: "a parent segment", path: "/../collect" },
  { shape: "a dot segment", path: "/v1/./models" },
  { shape: "a percent-encoded dot segment", path: "/%2e%2e/collect" },
  { shape: "a scheme", path: "https://evil.example/collect" },
  { shape: "no leading slash", path: "models" },
  { shape: "an empty segment", path: "/v1//models" },
  { shape: "a query", path: "/models?key=1" },
  { shape: "a space", path: "/my models" },
] as const;

test.for(REFUSED)("a key check path with $shape is refused at parse", ({ path }) => {
  const parsed = endpointFeaturesSchema.safeParse({ keyCheckPath: path });
  expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([["keyCheckPath"]]);
});

test("a plain path parses as written, and every built-in row's own path parses", () => {
  expect(endpointFeaturesSchema.parse({ keyCheckPath: "/api/personalized/v1/models" })).toEqual({ keyCheckPath: "/api/personalized/v1/models" });
  expect(endpointFeaturesSchema.parse({ keyCheckPath: "/v1/models/" })).toEqual({ keyCheckPath: "/v1/models/" });
  const declared = BUILTIN_PROVIDERS.flatMap((row) => (row.features?.keyCheckPath === undefined ? [] : [row.features.keyCheckPath]));
  expect(declared.length).toBeGreaterThan(0);
  expect(declared.filter((path) => !endpointFeaturesSchema.safeParse({ keyCheckPath: path }).success)).toEqual([]);
});
