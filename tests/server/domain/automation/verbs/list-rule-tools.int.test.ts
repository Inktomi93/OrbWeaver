import "../../../../support/composed-real.ts";
import type { AutomationRuleToolView } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { loadPresentRole } from "@orb/server/domain/chat";
import type { PluginToolHandle } from "@orb/server/domain/tool-use";
import type { ServicesResult } from "@orb/server/entry/compose";
import { expect, OTHER_USER_ID, OWNER_USER_ID, test } from "../../../../support/fixtures.ts";
import { principal } from "../_support.ts";

const TOOL_NAME = "plugin_rule_catalog_shared";

function installTool(app: ServicesResult, db: Db, owner: UserId, probe: { readonly marker: string; readonly calls: string[] }): PluginToolHandle {
  const { marker, calls } = probe;
  return app.toolUse.registerPluginTool({
    name: TOOL_NAME,
    description: `${marker} metadata`,
    parameters: {
      type: "object",
      properties: { value: { type: "string", enum: [marker] } },
      required: ["value"],
      additionalProperties: false,
    },
    installer: principal(owner),
    invoke: (): Promise<string> => {
      calls.push(marker);
      return Promise.resolve(`${marker} private execution result`);
    },
    resolveInstallerRole: (chatId) => loadPresentRole(db, chatId, owner),
  });
}

function catalog(marker: string): AutomationRuleToolView[] {
  return [
    {
      name: TOOL_NAME,
      description: `${marker} metadata`,
      parameters: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { value: { type: "string", enum: [marker] } },
        required: ["value"],
        additionalProperties: false,
      },
    },
  ];
}

test("the real automation service lists only its caller's metadata for identically named installed tools", async ({ app, db }) => {
  const calls: string[] = [];
  const first = installTool(app, db, OWNER_USER_ID, { marker: "first installer", calls });
  try {
    const second = installTool(app, db, OTHER_USER_ID, { marker: "second installer", calls });
    try {
      const firstCatalog = await app.automation.listRuleTools({ principal: principal(OWNER_USER_ID) });
      const secondCatalog = await app.automation.listRuleTools({ principal: principal(OTHER_USER_ID) });
      expect(firstCatalog).toEqual(catalog("first installer"));
      expect(secondCatalog).toEqual(catalog("second installer"));
      expect(JSON.stringify(firstCatalog)).not.toContain("second installer");
      expect(JSON.stringify(secondCatalog)).not.toContain("first installer");
      expect(JSON.stringify([firstCatalog, secondCatalog])).not.toContain("private execution result");
      expect(calls).toEqual([]);
    } finally {
      second.unregister();
    }
  } finally {
    first.unregister();
  }
});

test("catalog rereads reflect deregistration without removing the other installer's same-name tool", async ({ app, db }) => {
  const calls: string[] = [];
  const first = installTool(app, db, OWNER_USER_ID, { marker: "first installer", calls });
  try {
    const second = installTool(app, db, OTHER_USER_ID, { marker: "second installer", calls });
    try {
      expect(await app.automation.listRuleTools({ principal: principal(OWNER_USER_ID) })).toEqual(catalog("first installer"));
      first.unregister();
      expect(await app.automation.listRuleTools({ principal: principal(OWNER_USER_ID) })).toEqual([]);
      expect(await app.automation.listRuleTools({ principal: principal(OTHER_USER_ID) })).toEqual(catalog("second installer"));
      expect(calls).toEqual([]);
    } finally {
      second.unregister();
    }
  } finally {
    first.unregister();
  }
});
