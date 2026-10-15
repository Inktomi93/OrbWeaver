import { effectivePresetSchema, presetDetailSchema, presetSummarySchema, presetUsageViewSchema, promptConfigConfig } from "@orb/contracts/preset";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { ID_PREFIX } from "@orb/kit/ids";
import { testModelId } from "@orb/testkit/iso/inference-identities.ts";
import { makePresetDetail, makePresetSummary } from "@orb/testkit/node/factories/preset-view.ts";
import { makeCachePolicy } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("preset output parsers retain normalized configuration and unreadable disclosure without admitting private config fields", () => {
  const detail = makePresetDetail({ schemaVersion: promptConfigConfig.currentVersion });
  expect(presetDetailSchema.parse(detail)).toEqual(detail);
  expect(presetDetailSchema.safeParse({ ...detail, config: { ...detail.config, params: { ...detail.config.params, privateKnob: true } } }).success).toBe(false);
  for (const configUnreadable of [null, ...Object.values(VERSIONED_PARSE_FAILURES)]) {
    const summary = makePresetSummary({ configUnreadable });
    expect(presetSummarySchema.parse(summary)).toEqual(summary);
    expect(presetDetailSchema.parse({ ...detail, configUnreadable }).configUnreadable).toBe(configUnreadable);
  }
  expect(presetSummarySchema.safeParse({ ...makePresetSummary(), ownerId: "private-owner" }).success).toBe(false);
});

test("effective output keeps partial knobs and nullable mapping while refusing undeclared nested readings", ({ ids }) => {
  const reading = { value: 0.7, provenance: "explicit" };
  const effective = {
    cache: makeCachePolicy(),
    cacheWarnings: [],
    presetId: ids.next(ID_PREFIX.preset),
    model: testModelId("chat-model"),
    knobs: { temperature: reading },
    stale: [],
    qualityMapping: { quality: "deep", entries: [{ knob: "temperature", value: 0.8 }] },
  };
  expect(effectivePresetSchema.parse(effective)).toEqual(effective);
  expect(effectivePresetSchema.parse({ ...effective, knobs: {}, qualityMapping: null }).knobs).toEqual({});
  expect(effectivePresetSchema.safeParse({ ...effective, knobs: { temperature: { ...reading, privateKnob: true } } }).success).toBe(false);
  expect(effectivePresetSchema.safeParse({ ...effective, knobs: { privateKnob: reading } }).success).toBe(false);
  expect(
    effectivePresetSchema.safeParse({
      ...effective,
      qualityMapping: { ...effective.qualityMapping, entries: [{ knob: "temperature", value: 0.8, privateDial: true }] },
    }).success,
  ).toBe(false);
  const usage = { isUserDefault: false, gmRooms: [] };
  expect(presetUsageViewSchema.parse(usage)).toEqual(usage);
  expect(presetUsageViewSchema.safeParse({ ...usage, privateRooms: ["hidden"] }).success).toBe(false);
});
