import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach } from "vitest";
import { provisionRatedStageThemes } from "../../../tooling/src/_shared/rated-theme-fixture.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

interface StoredTheme {
  readonly id: string;
  readonly name: string;
  readonly override: { readonly background: string };
  readonly css: string | null;
  readonly isSeed: false;
}

let server: Server;
let baseUrl = "";
let nextId = 1;
let mutations = 0;
let ignoreRemovals = false;
const themes = new Map<string, StoredTheme>();

function envelope(data: unknown): string {
  return JSON.stringify({ result: { data } });
}

beforeEach(async () => {
  nextId = 1;
  mutations = 0;
  ignoreRemovals = false;
  themes.clear();
  server = createServer((request, response) => {
    const procedure = request.url?.split("/").at(-1) ?? "";
    if (request.method === "GET" && procedure === "settings.listThemes") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(envelope([...themes.values()]));
      return;
    }
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      const input = JSON.parse(body) as { id?: string; name?: string; override?: { background?: string }; css?: string };
      mutations += 1;
      if (procedure === "settings.createTheme") {
        const id = `theme_fixture_${String(nextId).padStart(2, "0")}`;
        nextId += 1;
        const theme: StoredTheme = {
          id,
          name: input.name ?? "",
          override: { background: input.override?.background ?? "" },
          css: input.css ?? null,
          isSeed: false,
        };
        themes.set(id, theme);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(envelope(theme));
        return;
      }
      if (procedure === "settings.removeTheme") {
        if (!ignoreRemovals && input.id !== undefined) {
          themes.delete(input.id);
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(envelope(null));
        return;
      }
      response.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("shared-base mode never mutates an account", async () => {
  await expect(provisionRatedStageThemes(baseUrl, false)).resolves.toBeNull();
  expect(mutations).toBe(0);
});

test("an isolated stage provisions both rated custom polarities and removes the exact ids", async () => {
  const fixture = await provisionRatedStageThemes(baseUrl, true);
  expect(fixture).not.toBeNull();
  expect(fixture?.entries.map((entry) => [entry.polarity, entry.hasCustomCss])).toEqual([
    ["light", true],
    ["dark", true],
  ]);
  expect(themes.size).toBe(2);

  await fixture?.cleanup();
  expect(themes.size).toBe(0);
  expect(mutations).toBe(4);
});

test("cleanup fails loud when the server claims removal without deleting the rows", async () => {
  const fixture = await provisionRatedStageThemes(baseUrl, true);
  ignoreRemovals = true;
  await expect(fixture?.cleanup()).rejects.toThrow("INSTRUMENT ERROR: rated theme cleanup left");
  expect(themes.size).toBe(2);
});
