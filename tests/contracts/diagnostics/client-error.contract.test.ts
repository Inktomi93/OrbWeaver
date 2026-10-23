// @subject packages/contracts/src/diagnostics/client-error.ts
import { clientErrorReportSchema } from "@orb/contracts/diagnostics";
import { expect, test } from "@orb/testkit/node";

test.for([
  { field: "message", maximum: 20_000 },
  { field: "stack", maximum: 20_000 },
  { field: "ownerStack", maximum: 20_000 },
  { field: "url", maximum: 4000 },
  { field: "requestId", maximum: 200 },
])("client error $field keeps its existing inclusive $maximum wire ceiling", ({ field, maximum }) => {
  const accepted = { message: "", url: "", [field]: "x".repeat(maximum) };
  expect(clientErrorReportSchema.parse(accepted)).toEqual(accepted);
  expect(clientErrorReportSchema.safeParse({ ...accepted, [field]: "x".repeat(maximum + 1) }).success).toBe(false);
});

test("client error fields retain omission, explicit undefined and diagnostic text without URL or id normalization", () => {
  const minimal = { message: "", url: "" };
  expect(clientErrorReportSchema.parse(minimal)).toEqual(minimal);
  const optional = { ...minimal, stack: undefined, ownerStack: undefined, requestId: undefined };
  expect(clientErrorReportSchema.parse(optional)).toEqual(optional);
  const diagnostic = {
    message: "unclassified text\nwith arbitrary context",
    url: "relative malformed path?code=diagnostic#fragment",
    stack: "not a grammar-constrained error class",
    ownerStack: "at <Component>",
    requestId: "not an id\nwith spaces",
  };
  expect(clientErrorReportSchema.parse(diagnostic)).toEqual(diagnostic);
  expect(clientErrorReportSchema.parse({ ...diagnostic, ignored: "not retained" })).toEqual(diagnostic);
});

test("client error required and optional fields reject missing required values and non-string wire values", () => {
  for (const invalid of [
    {},
    { message: "boom" },
    { url: "/" },
    { message: null, url: "/" },
    { message: "boom", url: null },
    { message: "boom", url: "/", stack: null },
    { message: "boom", url: "/", ownerStack: 1 },
    { message: "boom", url: "/", requestId: false },
  ]) {
    expect(clientErrorReportSchema.safeParse(invalid).success).toBe(false);
  }
});
