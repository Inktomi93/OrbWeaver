// Each optional forward-header and JWT env key reaches the auth config under its own field when set and leaves its field
// out when unset, because the forward-header resolver reads a field's absence as "this claim has no source".
// @subject packages/server/src/infra/auth/config.ts
import type { EnvKey } from "@orb/server/foundation/env/record";
import { expect, test } from "@orb/testkit/node";
import { createTestEnv } from "@orb/testkit/node/helpers";
import { authConfigFromEnv } from "#server/infra/auth/index.ts";

type AuthConfig = ReturnType<typeof authConfigFromEnv>;
type OptionalAuthField = { [Field in keyof AuthConfig]-?: object extends Pick<AuthConfig, Field> ? Field : never }[keyof AuthConfig];

// A record over the optional fields, so a field added to the config fails tsc until it has its env key here.
const ENV_KEY_OF = {
  forwardUserHeader: "FORWARD_AUTH_USER_HEADER",
  forwardGroupsHeader: "FORWARD_AUTH_GROUPS_HEADER",
  forwardUidHeader: "FORWARD_AUTH_UID_HEADER",
  forwardEmailHeader: "FORWARD_AUTH_EMAIL_HEADER",
  jwtIssuer: "FORWARD_AUTH_JWT_ISSUER",
  jwtAudience: "FORWARD_AUTH_JWT_AUDIENCE",
} as const satisfies Record<OptionalAuthField, EnvKey>;

const ROWS = Object.entries(ENV_KEY_OF);

test.for(ROWS)("%s carries its own env key and no other optional field appears", ([field, envKey]) => {
  const value = `value-of-${envKey}`;
  const config = authConfigFromEnv(createTestEnv({ [envKey]: value }));
  expect(config).toHaveProperty([field], value);
  for (const [other] of ROWS.filter(([name]) => name !== field)) {
    expect(config).not.toHaveProperty([other]);
  }
});

test("a record that sets none of the optional keys yields a config with none of the optional fields", () => {
  const config = authConfigFromEnv(createTestEnv());
  expect(config).toHaveProperty("mode");
  for (const [field] of ROWS) {
    expect(config).not.toHaveProperty([field]);
  }
});
