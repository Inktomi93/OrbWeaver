import { createServer } from "node:http";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { runModelAb } from "@orb/tooling/model-ab";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("probe-only preserves failed probe evidence but aggregates to nonzero", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end('{"error":{"message":"planted failure"}}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("model-ab test server did not bind TCP");
  }
  try {
    expect(await runModelAb(["--base-url", `http://127.0.0.1:${address.port}`])).toBe(EXIT.violations);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});

test("an empty named selection is misuse, never an empty successful comparison", async () => {
  expect(await runModelAb(["--variants", "definitely-not-a-variant"])).toBe(EXIT.misuse);
});
