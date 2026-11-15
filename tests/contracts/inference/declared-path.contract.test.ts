// @subject packages/contracts/src/inference/features.ts
// Every path a row declares rides its key and is joined to or resolved against the base URL, so the parse admits a
// plain path and refuses every shape that names another host or leaves the path the row names.
import type { EndpointFeatures } from "@orb/contracts/inference";
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
  { shape: "a host suffix a joined base URL would extend", path: ".evil.example/collect" },
  { shape: "an empty segment", path: "/v1//models" },
  { shape: "a query", path: "/models?key=1" },
  { shape: "a space", path: "/my models" },
] as const;

const PLAIN = "/rerank";

// Each declared path field, as the features block that sets it to `path` and the issue path a refusal names.
const FIELDS = [
  { field: "keyCheckPath", features: (path: string): EndpointFeatures => ({ keyCheckPath: path }), issue: ["keyCheckPath"] },
  { field: "rerankPath", features: (path: string): EndpointFeatures => ({ rerankPath: path }), issue: ["rerankPath"] },
  {
    field: "sleep.isSleepingPath",
    features: (path: string): EndpointFeatures => ({ sleep: { isSleepingPath: path, wakePath: PLAIN } }),
    issue: ["sleep", "isSleepingPath"],
  },
  {
    field: "sleep.wakePath",
    features: (path: string): EndpointFeatures => ({ sleep: { isSleepingPath: PLAIN, wakePath: path } }),
    issue: ["sleep", "wakePath"],
  },
] as const;

const REFUSALS = FIELDS.flatMap(({ field, features, issue }) => REFUSED.map(({ shape, path }) => ({ field, shape, features: features(path), issue })));

test.for(REFUSALS)("a $field with $shape is refused at parse", ({ features, issue }) => {
  const parsed = endpointFeaturesSchema.safeParse(features);
  expect(parsed.error?.issues.map((entry) => entry.path)).toEqual([issue]);
});

test.for(FIELDS)("a plain $field parses as written", ({ features }) => {
  expect(endpointFeaturesSchema.parse(features("/api/personalized/v1/models"))).toEqual(features("/api/personalized/v1/models"));
  expect(endpointFeaturesSchema.parse(features("/v1/models/"))).toEqual(features("/v1/models/"));
});

test("every built-in row's own declared paths parse", () => {
  const declared = BUILTIN_PROVIDERS.flatMap((row) => {
    const { keyCheckPath, rerankPath, sleep } = row.features ?? {};
    return [keyCheckPath, rerankPath, sleep?.isSleepingPath, sleep?.wakePath].filter((path) => path !== undefined);
  });
  expect(declared.length).toBeGreaterThan(0);
  expect(declared.filter((path) => !endpointFeaturesSchema.safeParse({ rerankPath: path }).success)).toEqual([]);
  expect(BUILTIN_PROVIDERS.filter((row) => row.features !== undefined && !endpointFeaturesSchema.safeParse(row.features).success).map((row) => row.id)).toEqual(
    [],
  );
});
