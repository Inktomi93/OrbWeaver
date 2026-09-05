// The A/B matrix's probe verdicts: a 200 whose body is not a chat completion is a FAILED probe, for every
// row — including the rows that used to carry no verifier at all — and no probe may report `ok` about a
// response nobody read. (No `@instrument-proof` markers: `model-ab` is not an INSTRUMENT_TOOLS member, and
// the `tooling-instrument-proof` gate reds a marker in an unregistered tool's tree.)
//
// #1507: `Probe.verify` was optional and `runProbe` read it as `probe.verify ? probe.verify(json) : null`
// over a body already defaulted to `{}` by `res.json().catch(() => ({}))`. Five of the matrix's rows
// (rp-think-off, the four think-<effort> rows, injection-midsystem, no-user-narration, diffable-t0) had no
// verifier, so ANY 200 — an HTML error page from a proxy, a truncated stream, an empty envelope — printed
// as a passing probe. The A/B matrix's whole job is to say which variant BEHAVES; a row that cannot fail
// is a column of decoration.
//
// The fake endpoint is a real local http server (the same shape as run.int.test.ts): no vLLM, no GPU.
import { createServer } from "node:http";
import { PROBES, runProbe } from "@orb/tooling/model-ab";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** One local endpoint that answers every `/v1/chat/completions` with `body`, at HTTP 200. */
async function chatEndpoint(body: string): Promise<{ readonly url: string; readonly close: () => Promise<void> }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("#1507 fixture: the fake chat endpoint did not bind TCP");
  }
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    close: async (): Promise<void> => await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error)))),
  };
}

/** A one-choice completion body. The message fields are built from ENTRIES because they are wire keys in
 *  the provider's own snake_case vocabulary (`reasoning_content`) — spelling them as object properties is
 *  what the naming-convention lint objects to, and a suppression here would be noise. */
function completionBody(fields: readonly (readonly [string, unknown])[]): string {
  return JSON.stringify({ choices: [{ message: Object.fromEntries(fields) }] });
}

function probeNamed(name: string): (typeof PROBES)[number] {
  const probe = PROBES.find((row) => row.name === name);
  if (probe === undefined) {
    throw new Error(`#1507 pin: the matrix no longer carries a probe named ${name}`);
  }
  return probe;
}

test("a 200 that is NOT a chat completion fails every probe in the matrix (#1507 red-first)", async () => {
  // Unparseable at the JSON boundary — exactly what `res.json().catch(() => ({}))` turns into an empty
  // object before the verifier ever sees it.
  const endpoint = await chatEndpoint("<html>502 from a proxy</html>");
  try {
    for (const probe of PROBES) {
      const result = await runProbe(endpoint.url, "fake-model", probe);
      expect(result.ok, `probe ${probe.name} reported ok for a body that is not a chat completion`).toBe(false);
      expect(result.error ?? "", `probe ${probe.name} must SAY what was wrong`).not.toBe("");
    }
  } finally {
    await endpoint.close();
  }
});

test("an EMPTY completion is a defect, not a pass — the rows that had no verifier (#1507)", async () => {
  const endpoint = await chatEndpoint(completionBody([["content", ""]]));
  try {
    for (const name of ["rp-think-off", "injection-midsystem", "no-user-narration", "diffable-t0"]) {
      const result = await runProbe(endpoint.url, "fake-model", probeNamed(name));
      expect(result.ok, `${name} accepted an empty completion`).toBe(false);
    }
  } finally {
    await endpoint.close();
  }
});

test("a REASONING-only completion still passes the thinking rows (#1507 positive control)", async () => {
  // The matrix measures this case in its columns — it must not be relabelled a defect by the new floor.
  const endpoint = await chatEndpoint(
    completionBody([
      ["content", ""],
      ["reasoning_content", "…thought for the whole budget…"],
    ]),
  );
  try {
    const thinking = PROBES.filter((probe) => probe.name.startsWith("think-"));
    expect(thinking.length, "the thinking rows are the control's subject").toBeGreaterThan(0);
    for (const probe of thinking) {
      const result = await runProbe(endpoint.url, "fake-model", probe);
      expect(result.ok, `${probe.name} must accept a reasoning-only completion — that is a finding, not a break`).toBe(true);
    }
    // …and the same response is still a defect where CONTENT is the thing being measured.
    expect((await runProbe(endpoint.url, "fake-model", probeNamed("rp-think-off"))).ok).toBe(false);
  } finally {
    await endpoint.close();
  }
});

test("a well-formed prose completion passes the instruct rows (#1507 positive control)", async () => {
  const endpoint = await chatEndpoint(completionBody([["content", "The lamp turns, and the fog takes the light."]]));
  try {
    for (const name of ["rp-think-off", "injection-midsystem", "no-user-narration", "diffable-t0"]) {
      const result = await runProbe(endpoint.url, "fake-model", probeNamed(name));
      expect(result.ok, `${name} rejected a perfectly good completion`).toBe(true);
    }
  } finally {
    await endpoint.close();
  }
});
