import { responseCacheSchema } from "@orb/contracts/inference";
import { buildImageryCall, imageryCallImportHash, imageryRowImportHash, parseImageryCall } from "@orb/server/kit/serde/imagery";
import { describe } from "vitest";
import { makeImageryCall } from "../../../../support/factories/imagery-call.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const bytes = (value: object): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

describe("imagery portable execution serde", () => {
  test("partial modalities, nullable counts and applied rates survive a byte fixed point", () => {
    const original = buildImageryCall(makeImageryCall());
    const parsed = parseImageryCall(original);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.reason);
    }
    expect(parsed.value.execution.usage.tokenDetails?.input).toEqual([{ modality: "text", tokens: 100 }]);
    expect(parsed.value.execution.usage.tokensIn).toBe(150);
    expect(parsed.value.execution.usage.cacheWriteTokens).toBeNull();
    expect(parsed.value.execution.usage.costDetails?.pricing?.cacheReadPerMTok).toBe(0.25);
    expect(buildImageryCall(parsed.value)).toEqual(original);
  });

  test("malformed siblings, duplicate source rows, invalid counts and newer envelopes refuse whole", () => {
    const call = makeImageryCall();
    const valid = { schemaKind: "orb.imagery", schemaVersion: 1, ...call };
    expect(parseImageryCall(bytes({ ...valid, schemaVersion: 2 }))).toEqual({ ok: false, reason: "newer-version" });
    expect(parseImageryCall(bytes({ ...valid, images: [...call.images, {}] }))).toEqual({ ok: false, reason: "malformed" });
    expect(parseImageryCall(bytes({ ...valid, images: [call.images[0], call.images[0]] }))).toEqual({ ok: false, reason: "malformed" });
    expect(parseImageryCall(bytes({ ...valid, execution: { ...call.execution, usage: { ...call.execution.usage, tokensIn: -1 } } }))).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(parseImageryCall(bytes({ ...valid, execution: { ...call.execution, credential: "must-not-travel" } }))).toEqual({ ok: false, reason: "malformed" });
  });

  test("legacy null-call rows remain ungrouped with unknown source and counts", () => {
    const call = makeImageryCall();
    const legacy = {
      ...call,
      execution: {
        ...call.execution,
        sourceCallId: null,
        usage: {
          servedModel: null,
          tokensIn: null,
          tokensOut: null,
          cacheReadTokens: null,
          cacheWriteTokens: null,
          reasoningTokens: null,
          tokenDetails: null,
          costDetails: null,
          costProvenance: null,
        },
      },
      images: call.images.slice(0, 1),
    };
    const parsed = parseImageryCall(buildImageryCall(legacy));
    expect(parsed).toEqual({ ok: true, value: legacy });
    expect(parseImageryCall(bytes({ schemaKind: "orb.imagery", schemaVersion: 1, ...legacy, images: call.images }))).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  test("identity ignores sibling order/cohort and distinguishes duplicate bytes and genuine calls", () => {
    const call = makeImageryCall();
    const first = call.images[0];
    const second = call.images[1];
    if (first === undefined || second === undefined) {
      throw new Error("fixture outputs missing");
    }
    expect(imageryCallImportHash(call)).toBe(imageryCallImportHash({ ...call, images: [first] }));
    expect(imageryCallImportHash(call)).toBe(imageryCallImportHash({ ...call, images: call.images.toReversed() }));
    expect(imageryRowImportHash(call, first)).not.toBe(imageryRowImportHash(call, { ...second, assetId: first.assetId }));
    expect(imageryCallImportHash(call)).not.toBe(
      imageryCallImportHash({ ...call, execution: { ...call.execution, sourceCallId: makeImageryCall().execution.sourceCallId } }),
    );
  });

  test("response-cache facts survive bytes and participate in immutable execution identity; absence stays absent", () => {
    const call = makeImageryCall();
    const absentHash = imageryCallImportHash(call);
    expect(imageryCallImportHash({ ...call, execution: { ...call.execution, usage: { ...call.execution.usage, responseCache: undefined } } })).toBe(absentHash);
    const sourceGenerationId = call.images[0]?.sourceGenerationId;
    if (sourceGenerationId === undefined) {
      throw new Error("fixture source generation missing");
    }
    call.execution.usage.responseCache = responseCacheSchema.parse({ status: "hit", ageSeconds: 15, ttlSeconds: 300, sourceGenerationId });
    const original = buildImageryCall(call);
    const parsed = parseImageryCall(original);
    expect(parsed).toEqual({ ok: true, value: call });
    if (!parsed.ok) {
      throw new Error(parsed.reason);
    }
    expect(buildImageryCall(parsed.value)).toEqual(original);
    expect(imageryCallImportHash(call)).not.toBe(absentHash);
    expect(
      imageryCallImportHash({
        ...call,
        execution: {
          ...call.execution,
          usage: { ...call.execution.usage, responseCache: { status: "miss", ageSeconds: null, ttlSeconds: null, sourceGenerationId: null } },
        },
      }),
    ).not.toBe(imageryCallImportHash(call));
  });
});
