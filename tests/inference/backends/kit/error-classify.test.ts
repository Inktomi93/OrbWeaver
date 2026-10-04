// withSchemaRejection — a vendor's own schema refusal maps onto the plan's violation vocabulary, so a caller reads one
// failure shape whether the planner refused before the call or the provider refused after it. Fixtures are the
// recorded Anthropic bodies; an unmatched schema-shaped 400 is logged with its body, never guessed at.

import { withSchemaRejection } from "../../../../packages/inference/src/backends/kit/error-classify.ts";
import type { ProviderLogger } from "../../../../packages/inference/src/backends/kit/provider-log.ts";
import { NO_PROVIDER_SECRETS } from "../../../../packages/inference/src/backends/kit/sanitize.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { ANTHROPIC_STATE_ROUND_400S } from "../../../server/entry/compose/_structured-state-round-recordings.ts";
import { expect, test } from "../../../support/fixtures.ts";

interface Emitted {
  readonly event: string;
  readonly fields: Readonly<Record<string, unknown>> | undefined;
}

function recordingLogger(lines: Emitted[]): ProviderLogger {
  const unused = (): void => undefined;
  const emit: ProviderLogger["emit"] = (_level, event, fields) => {
    lines.push({ event, fields });
  };
  return {
    emit,
    cache: unused,
    capability: unused,
    sampling: unused,
    summarizeItem: unused,
  };
}

const INVALID = new ProviderError({ kind: "invalid", retryable: false, message: "anthropic chat: Bad Request", apiErrorStatus: 400 });

/** An SDK-shaped HTTP failure carrying the upstream body. */
function httpError(body: string): Error & { readonly statusCode: number; readonly responseBody: string } {
  return Object.assign(new Error("Bad Request"), { statusCode: 400, responseBody: body });
}

test("each recorded Anthropic refusal maps to its ceiling violation, with one provider.schema_rejected line", () => {
  const cases = [
    { body: ANTHROPIC_STATE_ROUND_400S.asProjected.body, mode: "anthropic-format" as const, kind: "optional-props", count: 41, limit: 24 },
    { body: ANTHROPIC_STATE_ROUND_400S.strictCompatible.body, mode: "strict-compatible" as const, kind: "union-props", count: 41, limit: 16 },
  ];
  for (const { body, mode, kind, count, limit } of cases) {
    const lines: Emitted[] = [];
    const mapped = withSchemaRejection(INVALID, httpError(body), {
      log: recordingLogger(lines),
      model: "claude-sonnet-5-5",
      mode,
      secrets: NO_PROVIDER_SECRETS,
    });
    expect(mapped).toMatchObject({
      kind: "invalid",
      retryable: false,
      detail: "schema_rejected",
      apiErrorStatus: 400,
      violations: [{ kind, mode, count, limit }],
    });
    expect(lines.map((line) => line.event)).toEqual(["provider.schema_rejected"]);
  }
});

test("a vendor refusal that names no count is a vendor-refused violation under the row's name", () => {
  const lines: Emitted[] = [];
  const body = '{"type":"error","error":{"type":"invalid_request_error","message":"Schema is too complex for compilation."}}';
  const mapped = withSchemaRejection(INVALID, httpError(body), {
    log: recordingLogger(lines),
    model: "m",
    mode: "anthropic-format",
    secrets: NO_PROVIDER_SECRETS,
  });
  expect(mapped.violations).toEqual([{ kind: "vendor-refused", mode: "anthropic-format", rule: "anthropic-too-complex" }]);
  const xgrammar = withSchemaRejection(INVALID, httpError('{"error":{"message":"The provided JSON schema contains features not supported by xgrammar."}}'), {
    log: recordingLogger([]),
    model: "m",
    mode: "guided-decoding",
    secrets: NO_PROVIDER_SECRETS,
  });
  expect(xgrammar.violations).toEqual([{ kind: "vendor-refused", mode: "guided-decoding", rule: "xgrammar-unsupported" }]);
});

test("a schema-shaped 400 no row matches stays `invalid`, untouched, and logs its trimmed body as unmapped", () => {
  const lines: Emitted[] = [];
  const body = '{"error":{"message":"response_format.json_schema: something new went wrong"}}';
  const mapped = withSchemaRejection(INVALID, httpError(body), {
    log: recordingLogger(lines),
    model: "m",
    mode: "hosted-common",
    secrets: NO_PROVIDER_SECRETS,
  });
  expect(mapped).toBe(INVALID);
  expect(lines).toEqual([
    {
      event: "provider.schema_rejection_unmapped",
      fields: expect.objectContaining({ model: "m", mode: "hosted-common", body: expect.stringContaining("something new went wrong") }),
    },
  ]);
  // PLANTED CONTROL: a 400 about something else logs nothing and passes through.
  const quiet: Emitted[] = [];
  expect(
    withSchemaRejection(INVALID, httpError('{"error":{"message":"max_tokens too large"}}'), {
      log: recordingLogger(quiet),
      model: "m",
      mode: "hosted-common",
      secrets: NO_PROVIDER_SECRETS,
    }),
  ).toBe(INVALID);
  expect(quiet).toEqual([]);
});

test("a failure that is not `invalid` is never re-read as a schema refusal", () => {
  const rateLimited = new ProviderError({ kind: "rate_limit", retryable: true, message: "slow down" });
  expect(
    withSchemaRejection(rateLimited, httpError(ANTHROPIC_STATE_ROUND_400S.asProjected.body), {
      log: recordingLogger([]),
      model: "m",
      mode: "anthropic-format",
      secrets: NO_PROVIDER_SECRETS,
    }),
  ).toBe(rateLimited);
});
