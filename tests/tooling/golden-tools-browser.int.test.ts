// The actual serialized callback loads browser-served module URLs and validates before changing foreign state.

import { createRequire } from "node:module";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { chromium } from "@playwright/test";

// Native loading preserves browser import expressions that Vitest's SSR transform would close over Vite.
const { prepareGoldenTools }: typeof import("../../scripts/probes/st-goldens/browser-tools.ts") = createRequire(import.meta.url)(
  "../../scripts/probes/st-goldens/browser-tools.ts",
);

const ORIGIN = "http://goldens.test/";
const MODEL = "golden-model";
const TOOL = { name: "witness", description: "Record a witness", parameters: { type: "object" } } as const;
const MODEL_SOURCE = `export const model_list=[{id:${JSON.stringify(MODEL)},kept:true}];globalThis.goldenModels=model_list;`;
const SETTINGS_SOURCE = "export const extension_settings={tool_calling:{kept:true}};globalThis.goldenSettings=extension_settings;";
const MANAGER_SOURCE = `export const registrations=[];globalThis.goldenRegistrations=registrations;export const ToolManager={marker:"owned",registerFunctionTool(input){if(this.marker!=="owned")throw Error("lost receiver");registrations.push({...input,action:input.action(),shouldRegister:input.shouldRegister()});}};`;
const CLASS_MANAGER_SOURCE = `export const registrations=[];globalThis.goldenRegistrations=registrations;export class ToolManager{static registerFunctionTool(input){if(this!==ToolManager)throw Error("lost static receiver");registrations.push({...input,action:input.action(),shouldRegister:input.shouldRegister()});}}`;

test.for([
  { name: "existing model", model: MODEL, manager: MANAGER_SOURCE, settings: SETTINGS_SOURCE, keptSettings: true },
  { name: "new model", model: "new-model", manager: MANAGER_SOURCE, settings: SETTINGS_SOURCE, keptSettings: true },
  { name: "class receiver", model: MODEL, manager: CLASS_MANAGER_SOURCE, settings: SETTINGS_SOURCE, keptSettings: true },
  {
    name: "absent tool settings",
    model: MODEL,
    manager: MANAGER_SOURCE,
    settings: "export const extension_settings={};globalThis.goldenSettings=extension_settings;",
    keptSettings: false,
  },
])("the real browser callback prepares $name and preserves the registration receiver", async (row) => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const requested: string[] = [];
    await page.route(`${ORIGIN}**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      requested.push(pathname);
      const sources = new Map([
        ["/", "<!doctype html><title>Golden</title>"],
        ["/scripts/openai.js", MODEL_SOURCE],
        ["/scripts/extensions.js", row.settings],
        ["/scripts/tool-calling.js", row.manager],
      ]);
      const source = sources.get(pathname);
      if (source === undefined) {
        throw new Error(`Unexpected browser module request: ${pathname}`);
      }
      await route.fulfill({
        contentType: pathname === "/" ? "text/html" : "text/javascript",
        body: source,
      });
    });
    await page.goto(ORIGIN);
    await page.evaluate(prepareGoldenTools, { origin: ORIGIN, model: row.model, tools: [TOOL] });
    const observed = await page.evaluate(() => ({
      models: Reflect.get(globalThis, "goldenModels"),
      settings: Reflect.get(globalThis, "goldenSettings"),
      registrations: Reflect.get(globalThis, "goldenRegistrations"),
    }));
    expect(requested).toEqual(["/", "/scripts/openai.js", "/scripts/extensions.js", "/scripts/tool-calling.js"]);
    expect(observed.models).toContainEqual({
      id: row.model,
      ...(row.model === MODEL ? { kept: true } : {}),
      tools: true,
      // biome-ignore lint/style/useNamingConvention: the browser module's external wire field.
      supports_tools: true,
      // biome-ignore lint/style/useNamingConvention: the browser module's external wire field.
      max_context_length: 200_000,
    });
    // biome-ignore lint/style/useNamingConvention: these are the module's actual external settings fields.
    expect(observed.settings).toEqual({ tool_calling: { ...(row.keptSettings ? { kept: true } : {}), function_calling: true } });
    expect(observed.registrations).toEqual([{ ...TOOL, displayName: TOOL.name, action: "mock_tool_result", shouldRegister: true }]);
  } finally {
    await browser.close();
  }
});

test.for([
  { name: "name", tool: { ...TOOL, name: 1 } },
  { name: "description", tool: { ...TOOL, description: false } },
  { name: "parameters", tool: { ...TOOL, parameters: null } },
])("the browser callback refuses malformed registration $name before loading modules", async (row) => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const requested: string[] = [];
    await page.route(`${ORIGIN}**`, async (route) => {
      requested.push(new URL(route.request().url()).pathname);
      await route.fulfill({ contentType: "text/html", body: "<!doctype html>" });
    });
    await page.goto(ORIGIN);
    await expect(page.evaluate(prepareGoldenTools, { origin: ORIGIN, model: MODEL, tools: [row.tool] })).rejects.toThrow("Invalid golden tool input");
    expect(requested).toEqual(["/"]);
  } finally {
    await browser.close();
  }
});

test.for([
  {
    name: "model list",
    model: "export const model_list={};globalThis.goldenModels=model_list;",
    unchanged: {},
    settings: SETTINGS_SOURCE,
    manager: MANAGER_SOURCE,
    message: "Invalid golden model list",
  },
  {
    name: "model identity",
    model: "export const model_list=[{id:1}];globalThis.goldenModels=model_list;",
    unchanged: [{ id: 1 }],
    settings: SETTINGS_SOURCE,
    manager: MANAGER_SOURCE,
    message: "Invalid golden model list",
  },
  {
    name: "settings",
    model: MODEL_SOURCE,
    settings: "export const extension_settings=null;",
    unchanged: [{ id: MODEL, kept: true }],
    manager: MANAGER_SOURCE,
    message: "Invalid golden extension settings",
  },
  {
    name: "present tool settings",
    model: MODEL_SOURCE,
    settings: "export const extension_settings={tool_calling:1};",
    unchanged: [{ id: MODEL, kept: true }],
    manager: MANAGER_SOURCE,
    message: "Invalid golden tool settings",
  },
  {
    name: "registration method",
    model: MODEL_SOURCE,
    settings: SETTINGS_SOURCE,
    manager: "export const ToolManager={registerFunctionTool:1};",
    unchanged: [{ id: MODEL, kept: true }],
    message: "Invalid golden tool manager",
  },
])("the browser callback refuses malformed $name before changing any model", async (row) => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route(`${ORIGIN}**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      const sources = new Map([
        ["/", "<!doctype html>"],
        ["/scripts/openai.js", row.model],
        ["/scripts/extensions.js", row.settings],
        ["/scripts/tool-calling.js", row.manager],
      ]);
      const body = sources.get(path);
      if (body === undefined) {
        throw new Error(`Unexpected browser module request: ${path}`);
      }
      await route.fulfill({
        contentType: path === "/" ? "text/html" : "text/javascript",
        body,
      });
    });
    await page.goto(ORIGIN);
    await expect(page.evaluate(prepareGoldenTools, { origin: ORIGIN, model: MODEL, tools: [TOOL] })).rejects.toThrow(row.message);
    const unchanged = await page.evaluate(() => Reflect.get(globalThis, "goldenModels"));
    expect(unchanged).toEqual(row.unchanged);
  } finally {
    await browser.close();
  }
});
