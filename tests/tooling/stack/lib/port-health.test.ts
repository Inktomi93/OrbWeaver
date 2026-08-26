import { probePortHealth } from "../../../../tooling/src/stack/lib/port-health.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("health probe distinguishes absent, healthy, and occupied-unproven ports", async () => {
  const refused = Object.assign(new Error("connect refused"), { cause: { code: "ECONNREFUSED" } });
  await expect(probePortHealth(1, async () => Promise.reject(refused))).resolves.toEqual({ kind: "absent" });
  await expect(probePortHealth(1, async () => new Response(null, { status: 200 }))).resolves.toEqual({ kind: "healthy" });
  await expect(probePortHealth(1, async () => Promise.reject(new Error("planted timeout")))).resolves.toEqual({ kind: "unproven", reason: "planted timeout" });
  await expect(probePortHealth(1, async () => new Response(null, { status: 503 }))).resolves.toEqual({ kind: "unproven", reason: "health endpoint answered 503" });
});
