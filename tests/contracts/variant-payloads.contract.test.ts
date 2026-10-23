import { pluginCommandRegistrationMetaSchema, snippetResultSchema } from "@orb/contracts/plugin";
import { portableImportOutcomeSchema } from "@orb/contracts/portability";
import { endpointInspectionSchema } from "@orb/contracts/providers";
import { updateCheckSchema } from "@orb/kit/version-identity";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("portable imports separate failure reasons from successful accounting", () => {
  for (const value of [{ ok: true }, { ok: true, created: false, notes: ["overlay omitted"], memoryChatIds: [] }, { ok: false, error: "unreadable file" }]) {
    expect(portableImportOutcomeSchema.parse(value)).toEqual(value);
  }
  for (const value of [
    { ok: false },
    { ok: true, error: "failure" },
    { ok: false, error: "failure", created: true },
    { ok: false, error: "failure", notes: [] },
  ]) {
    expect(portableImportOutcomeSchema.safeParse(value).success).toBe(false);
  }
});

test("endpoint inspection requires a response only for a readable success", () => {
  const request = { url: "https://models.test/chat", headers: {}, body: "{}" };
  const response = { status: 200, statusText: "OK", bodyPreview: "reply" };
  for (const value of [
    { ok: true, request, response },
    { ok: false, request, response: null },
    { ok: false, request, response, error: "unreadable reply" },
    { ok: false, request, response: { ...response, status: 403 } },
  ]) {
    expect(endpointInspectionSchema.parse(value)).toEqual(value);
  }
  expect(endpointInspectionSchema.safeParse({ ok: true, request, response: null }).success).toBe(false);
  expect(endpointInspectionSchema.safeParse({ ok: true, request, response, error: "unreadable" }).success).toBe(false);
});

test("snippet classification requires an error while legacy unclassified errors remain valid", () => {
  for (const value of [
    { logLines: [] },
    { logLines: [], error: "legacy refusal" },
    { logLines: [], error: "syntax refusal", errorKind: "parse", errorLine: 2 },
    { logLines: ["started"], error: "runtime refusal", errorKind: "runtime" },
  ]) {
    expect(snippetResultSchema.parse(value)).toEqual(value);
  }
  expect(snippetResultSchema.safeParse({ logLines: [], errorKind: "parse" }).success).toBe(false);
  expect(snippetResultSchema.safeParse({ logLines: [], errorLine: 2 }).success).toBe(false);
});

test("command enum declarations retain their options and native default checks", () => {
  const registration = { name: "typed", describe: "Collect typed arguments" };
  for (const value of [
    { name: "mode", type: "enum", enumValues: ["add", "replace"], default: "add" },
    { name: "count", type: "number", default: 2 },
    { name: "label", type: "string", enumValues: undefined },
  ]) {
    expect(pluginCommandRegistrationMetaSchema.parse({ ...registration, args: [value] }).args).toEqual([value]);
  }
  for (const value of [
    { name: "mode", type: "enum" },
    { name: "mode", type: "enum", enumValues: [] },
    { name: "mode", type: "enum", enumValues: ["add"], default: "replace" },
    { name: "count", type: "number", enumValues: ["add"] },
    { name: "count", type: "number", default: "two" },
  ]) {
    expect(pluginCommandRegistrationMetaSchema.safeParse({ ...registration, args: [value] }).success).toBe(false);
  }
});

test("known update verdicts require upstream identity and unknown verdicts require their reason", () => {
  const remote = { channel: "main", commit: "upstream", short: "upstream", committedAt: null };
  for (const value of [
    { status: "behind", local: "local", remote, reason: null },
    { status: "up-to-date", local: "upstream", remote, reason: null },
    { status: "unknown", local: "unknown", remote, reason: "no local commit" },
    { status: "unknown", local: "local", remote: null, reason: "offline" },
  ]) {
    expect(updateCheckSchema.parse(value)).toEqual(value);
  }
  expect(updateCheckSchema.safeParse({ status: "behind", local: "local", remote: null, reason: null }).success).toBe(false);
  expect(updateCheckSchema.safeParse({ status: "unknown", local: "local", remote, reason: null }).success).toBe(false);
  expect(updateCheckSchema.safeParse({ status: "up-to-date", local: "local", remote, reason: "offline" }).success).toBe(false);
});
