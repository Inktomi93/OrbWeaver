import type { AuthConfig } from "@orb/contracts/auth-config";
import { authConfigSchema } from "@orb/contracts/auth-config";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const WIRE: AuthConfig = {
  mode: "local",
  localEnabled: true,
  oidcEnabled: false,
  oidcProviderName: "Test IdP",
  localFirstRun: false,
  discreetLogin: true,
  defaultHandle: null,
  multiHumanCapable: true,
  forbidExternalMedia: true,
  trustHtml: false,
  allowInteractiveCards: false,
  uploads: DEFAULT_UPLOAD_CAPS,
  transport: "https",
  clientScope: "public",
  share: { state: "up", url: null },
};

test("an anonymous bootstrap retains explicit null privacy projections and the upload catalog", () => {
  expect(authConfigSchema.parse(WIRE)).toEqual(WIRE);
});

test.each([
  ["unknown mode", { ...WIRE, mode: "saml" }],
  ["unknown transport", { ...WIRE, transport: "ftp" }],
  ["unknown client scope", { ...WIRE, clientScope: "trusted" }],
  ["unknown relay state", { ...WIRE, share: { state: "ready", url: null } }],
  ["string flag", { ...WIRE, localEnabled: "true" }],
  ["string first-run flag", { ...WIRE, localFirstRun: "true" }],
  ["string upload cap", { ...WIRE, uploads: { ...WIRE.uploads, image: "unlimited" } }],
  ["null upload catalog", { ...WIRE, uploads: null }],
  ["missing share link", { ...WIRE, share: { state: "up" } }],
  ["extra identity field", { ...WIRE, externalId: "must-not-reach-the-browser" }],
  ["extra relay field", { ...WIRE, share: { ...WIRE.share, relay: "quick" } }],
  ["extra upload field", { ...WIRE, uploads: { ...WIRE.uploads, decompressed: 1 } }],
])("the bootstrap wire refuses %s", (_label, wire) => {
  expect(authConfigSchema.safeParse(wire).success).toBe(false);
});

test("every bootstrap field is required instead of defaulting on an incomplete response", () => {
  for (const field of Object.keys(WIRE)) {
    const wire = Object.fromEntries(Object.entries(WIRE).filter(([key]) => key !== field));
    expect(authConfigSchema.safeParse(wire).success, field).toBe(false);
  }
});

test("every upload cap is required instead of silently restoring deployment defaults", () => {
  for (const field of Object.keys(WIRE.uploads)) {
    const uploads = Object.fromEntries(Object.entries(WIRE.uploads).filter(([key]) => key !== field));
    expect(authConfigSchema.safeParse({ ...WIRE, uploads }).success, field).toBe(false);
  }
});
