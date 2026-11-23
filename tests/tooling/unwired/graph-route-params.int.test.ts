// A Hono route's path segments pair with its handlers' `c.req.param` reads: a segment no handler reads is reported, and
// a handler that reads params whole or hands its context on reads every segment. A local `get` registers no route.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, hono, labelsIn } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/routes.ts`;

test("a route segment no handler reads is reported; a read by literal, by constant or whole reads it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...hono(),
    [FILE]: [
      'import { Hono } from "hono";',
      'import type { Context } from "hono";',
      'const ID = "id";',
      'const BASE = "/api/things";',
      "declare const take: (c: Context) => Response;",
      "export const app = new Hono();",
      'app.get("/a/:id/:spare", (c) => c.text(c.req.param("id")));',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is the planted file's own template literal
      "app.get(`${BASE}/:${ID}/:other`, (c) => c.text(c.req.param(ID)));",
      'app.post("/b/:all", (c) => c.json(c.req.param()));',
      'app.delete("/c/:handed", (c) => take(c));',
      'const read = (c: Context): Response => c.text(c.req.param("named"));',
      'app.put("/d/:named/:unnamed", read);',
      "const local = { get: (_path: string, _handler: (c: Context) => Response): void => undefined };",
      'local.get("/e/:ignored", (c) => c.text(c.req.param("other")));',
    ].join("\n"),
  });
  expect(labelsIn(scan, "route-param-unread", FILE).map((label) => label.split(" ").slice(1).join(" "))).toEqual([":spare", ":other", ":unnamed"]);
});
