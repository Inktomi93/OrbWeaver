// classifyDomainError — the pure DomainError→tRPC classifier (transport Invariant #5: one case per
// subclass; load-bearing ORDER — NoCredential before Operation; the `.cause` walk survives re-wrapping).

import { STREAM_ERROR_CODES } from "@orb/contracts/stream";
import type { ProviderErrorKind } from "@orb/inference";
import { NoConnectionError, PROVIDER_ERROR_KINDS, ProviderError } from "@orb/inference";
import {
  DomainConflictError,
  DomainError,
  DomainForbiddenError,
  DomainNoCredentialError,
  DomainNotFoundError,
  DomainOperationError,
  DomainRateLimitError,
  DomainUnavailableError,
} from "@orb/kit/errors";
import { CredentialsDecryptError } from "@orb/server/domain/credentials";
import { classifyDomainError, domainReason } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

describe("classifyDomainError — one case per subclass", () => {
  test("DomainNotFoundError → NOT_FOUND", () => {
    expect(classifyDomainError(new DomainNotFoundError("Tag", "tag_1"))?.code).toBe("NOT_FOUND");
  });

  test("DomainConflictError → CONFLICT", () => {
    expect(classifyDomainError(new DomainConflictError("dup"))?.code).toBe("CONFLICT");
  });

  test("DomainForbiddenError → FORBIDDEN", () => {
    expect(classifyDomainError(new DomainForbiddenError("nope"))?.code).toBe("FORBIDDEN");
  });

  test("DomainNoCredentialError → PRECONDITION_FAILED (checked before Operation)", () => {
    expect(classifyDomainError(new DomainNoCredentialError("openrouter"))?.code).toBe("PRECONDITION_FAILED");
  });

  test("DomainOperationError → BAD_REQUEST", () => {
    expect(classifyDomainError(new DomainOperationError("bad_input", "no"))?.code).toBe("BAD_REQUEST");
  });

  test("DomainRateLimitError → TOO_MANY_REQUESTS", () => {
    expect(classifyDomainError(new DomainRateLimitError("slow down"))?.code).toBe("TOO_MANY_REQUESTS");
  });

  test("DomainUnavailableError → SERVICE_UNAVAILABLE", () => {
    expect(classifyDomainError(new DomainUnavailableError("down"))?.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("classifyDomainError — non-domain + cause walk", () => {
  test("a plain Error returns null (left to surface as 500)", () => {
    expect(classifyDomainError(new Error("boom"))).toBeNull();
    expect(classifyDomainError("not even an error")).toBeNull();
  });

  test("a base DomainError with no mapped subclass returns null", () => {
    expect(classifyDomainError(new DomainError("bare"))).toBeNull();
  });

  test("walks the .cause chain so a re-wrapped DomainError still classifies", () => {
    const wrapped = new Error("tx failed");
    wrapped.cause = new DomainNotFoundError("Chat", "chat_1");
    expect(classifyDomainError(wrapped)?.code).toBe("NOT_FOUND");
  });

  test("preserves the typed cause for the client banner", () => {
    const mapped = classifyDomainError(new DomainNoCredentialError("anthropic"));
    expect(mapped?.cause).toBeInstanceOf(DomainNoCredentialError);
  });
});

describe("domainReason — the honest reason code rides only a DomainOperationError", () => {
  test("a mapped DomainOperationError carries its .code as the reason", () => {
    const mapped = classifyDomainError(new DomainOperationError("owner_not_present", "the agent's owner is not a present member"));
    expect(domainReason(mapped ?? {})).toBe("owner_not_present");
  });

  test("a NOT_FOUND collapse carries no reason (leak-free — codeless)", () => {
    const mapped = classifyDomainError(new DomainNotFoundError("Chat", "chat_1"));
    expect(domainReason(mapped ?? {})).toBeUndefined();
  });

  test("an error with no domain cause has no reason field", () => {
    expect(domainReason({ cause: new Error("boom") })).toBeUndefined();
    expect(domainReason({})).toBeUndefined();
  });

  test("credential decrypt failure serializes as non-retryable BAD_REQUEST with only its safe typed reason", () => {
    const secrets = ["cannot", "cannot be", "matching"];
    const mapped = classifyDomainError(new CredentialsDecryptError(secrets));
    expect(mapped?.code).toBe("BAD_REQUEST");
    expect(domainReason(mapped ?? {})).toBe("credential_decrypt_failed");
    const serialized = JSON.stringify(mapped);
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret);
    }
  });
});

// ── THE PROVIDER ARM ────────────────────────────────────────────────────────────────────────────────────
//
// `ProviderError extends Error`, NOT DomainError, so before this arm existed every one of the 64 runtime
// call sites answered INTERNAL_SERVER_ERROR and put the throw's raw message on the wire.
//
// The table below is the POLICY, driven from `PROVIDER_ERROR_KINDS` itself so a kind added to the union
// fails HERE as well as at `tsc` — a new kind with no row is a kind nobody decided a wire treatment for.
// `carriesOwnMessage` is the security-relevant column: see `error-mapping.ts`'s header for why `invalid`
// is the only `true`, and why `forbidden` — whose three mint sites are all ours — is deliberately not.

/** The wire treatment each kind is contracted to get. `code: null` = deliberately unclassified. */
const PROVIDER_WIRE_POLICY: Readonly<Record<ProviderErrorKind, { readonly code: string | null; readonly carriesOwnMessage: boolean }>> = {
  // biome-ignore-start lint/style/useNamingConvention: the keys ARE `PROVIDER_ERROR_KINDS` members — a snake_case wire vocabulary, not JS property names.
  rate_limit: { code: "TOO_MANY_REQUESTS", carriesOwnMessage: false },
  auth_failed: { code: "PRECONDITION_FAILED", carriesOwnMessage: false },
  billing: { code: "PRECONDITION_FAILED", carriesOwnMessage: false },
  moderation: { code: "FORBIDDEN", carriesOwnMessage: false },
  refused: { code: "BAD_REQUEST", carriesOwnMessage: false },
  forbidden: { code: "FORBIDDEN", carriesOwnMessage: false },
  invalid: { code: "BAD_REQUEST", carriesOwnMessage: true },
  model_unavailable: { code: "PRECONDITION_FAILED", carriesOwnMessage: false },
  server: { code: "SERVICE_UNAVAILABLE", carriesOwnMessage: false },
  max_output: { code: "BAD_REQUEST", carriesOwnMessage: false },
  aborted: { code: null, carriesOwnMessage: false },
  unknown: { code: null, carriesOwnMessage: false },
  // biome-ignore-end lint/style/useNamingConvention: see above.
};

/** A distinctive string standing in for the three provenances a `ProviderError.message` can hold — an
 *  upstream body, a node errno carrying a host path, an SDK spawn failure. If it reaches the mapped message
 *  for a kind the policy says must not carry its own prose, that kind's belt is open. */
const FOREIGN_PROSE = "upstream said /home/opuser/orb/.cache <b>502</b>";

/** The kinds the policy says are MODELLED, in `PROVIDER_ERROR_KINDS` order. */
function classifiedKinds(): readonly ProviderErrorKind[] {
  return PROVIDER_ERROR_KINDS.filter((kind) => PROVIDER_WIRE_POLICY[kind].code !== null);
}

/** What the classifier actually did with one kind, in the policy table's own vocabulary — so the whole
 *  decision is ONE `toEqual` per kind and no assertion sits behind an `if`. */
function wireVerdictFor(kind: ProviderErrorKind): { readonly code: string | null; readonly carriesOwnMessage: boolean } {
  const mapped = classifyDomainError(new ProviderError({ kind, retryable: false, message: FOREIGN_PROSE }));
  return mapped === null ? { code: null, carriesOwnMessage: false } : { code: mapped.code, carriesOwnMessage: mapped.message === FOREIGN_PROSE };
}

describe("classifyDomainError — the ProviderError arm (kind → code, and whose prose rides)", () => {
  test("COMPLETENESS: every PROVIDER_ERROR_KINDS member has a decided wire treatment", () => {
    expect(Object.keys(PROVIDER_WIRE_POLICY).toSorted()).toEqual([...PROVIDER_ERROR_KINDS].toSorted());
  });

  for (const [kind, arm] of Object.entries(PROVIDER_WIRE_POLICY)) {
    test(`${kind} → ${arm.code ?? "unclassified (collapses at the formatter)"}`, () => {
      // THE BELT, both directions in ONE assertion: a kind that may not carry its own prose must not, and
      // the one kind that may must actually still do it. A blanket collapse would pass the first half alone
      // while silently degrading the two headline refusals `invalid` exists to deliver.
      expect(wireVerdictFor(kind as ProviderErrorKind)).toEqual(arm);
    });
  }

  test("a collapsed kind still says SOMETHING — the substitute is host copy, never an empty string", () => {
    const messages = PROVIDER_ERROR_KINDS.map(
      (kind) => classifyDomainError(new ProviderError({ kind, retryable: false, message: "" }))?.message ?? null,
    ).filter((message): message is string => message !== null);
    expect(messages.every((message) => message.length > 0 || message === "")).toBe(true);
    // `invalid` is the carrier, so an EMPTY provider message stays empty there; every other classified kind
    // must have produced its own non-empty sentence.
    expect(messages.filter((message) => message.length === 0)).toHaveLength(1);
  });

  test("the typed cause is preserved so the caller can log the real message it did not send", () => {
    const thrown = new ProviderError({ kind: "server", retryable: true, message: FOREIGN_PROSE });
    const mapped = classifyDomainError(thrown);
    expect(mapped?.cause).toBe(thrown);
  });

  test("walks the .cause chain — a re-wrapped provider fault still classifies", () => {
    const wrapped = new Error("the verb failed");
    wrapped.cause = new ProviderError({ kind: "rate_limit", retryable: true, message: FOREIGN_PROSE });
    expect(classifyDomainError(wrapped)?.code).toBe("TOO_MANY_REQUESTS");
  });

  // REGRESSION (found by this table, 2026-09-20). `classifyDomainError` used to open with an unconditional
  // `err.cause ?? err`, so a modelled error that CARRIES a cause was skipped in favour of its cause — and
  // carrying a cause is precisely the house idiom for a leak-free collapse (`ScrapeFailedError({ cause })`
  // holds the SSRF refusal whose resolved private address must stay server-side). The outer error's
  // curated sentence and its `reason` were both discarded and the caller got a 500.
  test("a DOMAIN error that CARRIES a cause keeps its OWN framing — the outermost modelled error wins", () => {
    const domain = new DomainNotFoundError("Connection", "conn_1");
    domain.cause = new ProviderError({ kind: "server", retryable: true, message: FOREIGN_PROSE });
    const mapped = classifyDomainError(domain);
    expect(mapped?.code).toBe("NOT_FOUND");
    expect(mapped?.message).not.toContain(FOREIGN_PROSE);
  });

  test("the same, for the real leak-free collapse: a coded refusal wrapping an SSRF fault keeps its reason", () => {
    const refusal = new DomainOperationError("scrape_failed", "The web page could not be scraped.");
    refusal.cause = new Error("SSRF_BLOCKED: internal.corp → 169.254.169.254");
    const mapped = classifyDomainError(refusal);
    expect(mapped?.code).toBe("BAD_REQUEST");
    expect(domainReason(mapped ?? {})).toBe("scrape_failed");
    expect(JSON.stringify(mapped?.message)).not.toContain("169.254.169.254");
  });

  test("NoConnectionError — the headline `invalid` refusal — reaches the caller intact", () => {
    // The most user-facing refusal in the system ("bind one in Connections"). Collapsing it would be the
    // exact "degrade a typed refusal into something-went-wrong" failure the belt is written to avoid.
    const refusal = "no embed connection is bound for this user — bind one in Connections";
    const mapped = classifyDomainError(new NoConnectionError(refusal));
    expect(mapped?.code).toBe("BAD_REQUEST");
    expect(mapped?.message).toBe(refusal);
  });

  test("every classified code is a STREAM_ERROR_CODES member (the room path narrows onto that tuple)", () => {
    // `stream/socket.ts::roomFailure` narrows the classifier's code onto this closed contracts vocabulary
    // and collapses a miss to INTERNAL_SERVER_ERROR. A code added here without a row there would silently
    // downgrade a classified room failure — this is the coupling, asserted rather than commented.
    const strays = classifiedKinds()
      .map((kind) => classifyDomainError(new ProviderError({ kind, retryable: false, message: "x" }))?.code)
      .filter((code) => !STREAM_ERROR_CODES.some((known) => known === code));
    expect(strays).toEqual([]);
  });
});

describe("domainReason — the provider discriminator the client keys on", () => {
  test("every classified kind rides `provider_<kind>` — collapsing the message without a reason would leave the client nothing", () => {
    const reasons = classifiedKinds().map(
      (kind) => domainReason(classifyDomainError(new ProviderError({ kind, retryable: false, message: "x" })) ?? {}) ?? null,
    );
    expect(reasons).toEqual(classifiedKinds().map((kind) => `provider_${kind}`));
  });

  test("an unclassified provider kind never reaches the formatter's reason read at all", () => {
    expect(classifyDomainError(new ProviderError({ kind: "unknown", retryable: false, message: "x" }))).toBeNull();
  });
});
