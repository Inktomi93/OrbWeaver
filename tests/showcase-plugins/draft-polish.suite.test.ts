import { join } from "node:path";
import vm from "node:vm";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { AMBIENT_STUBS } from "@orb/server/infra/plugin-host";
import { unzipSync } from "fflate";
import { expect, test } from "../support/tool-fixtures.ts";

async function polishGuest(): Promise<{
  context: vm.Context;
  commands: { composerDraft?: true; onRun: (input: { draft?: string }) => void | string | Promise<void | string> }[];
  hidden: string[];
}> {
  const root = join(import.meta.dirname, "..", "..");
  const built = await packPluginDirectory({
    pluginDirectory: join(root, "packages/showcase-plugins/bundles/draft-polish"),
    sdkDirectory: join(root, "packages/plugin-sdk"),
  });
  expect(built.diagnostics).toEqual([]);
  if (built.bundle === null) {
    throw new Error("Draft Polish did not compile");
  }
  const bytes = unzipSync(built.bundle)["main.js"];
  if (bytes === undefined) {
    throw new Error("Draft Polish has no main.js");
  }
  const commands: { composerDraft?: true; onRun: (input: { draft?: string }) => void | string | Promise<void | string> }[] = [];
  const hidden: string[] = [];
  const context = vm.createContext({});
  vm.runInContext(AMBIENT_STUBS, context);
  context["orb"] = {
    host: (): Record<string, unknown> => ({
      grants: ["chat.transform", "ui.surface"],
      ui: {
        registerCommand: (command: (typeof commands)[number]): void => {
          commands.push(command);
        },
      },
      transforms: {
        register: (transform: { point: string }): void => {
          hidden.push(transform.point);
        },
        registerDisplay: (): void => undefined,
      },
      log: { info: (): void => undefined, warn: (): void => undefined },
    }),
  };
  vm.runInContext(new TextDecoder().decode(bytes), context);
  return { context, commands, hidden };
}

test("Draft Polish offers an explicit draft command and registers no hidden outgoing rewrite", async () => {
  const guest = await polishGuest();
  expect(guest.hidden).toEqual([]);
  expect(guest.commands).toHaveLength(1);
  expect(guest.commands[0]?.composerDraft).toBe(true);
  expect(await guest.commands[0]?.onRun({ draft: "Hello...  there !" })).toBe("Hello… there!");
});

test("explicit polish changes prose but preserves inline and fenced code bytes and code-adjacent spacing", async () => {
  const guest = await polishGuest();
  const code = '`a  ...  b`\n```ts\nconst x = "...";  \n\t x  += 1 ;\n```';
  const draft = `Hello...  ran ${code}\nDone  !  `;
  guest.context["inputDraft"] = draft;
  const output = vm.runInContext("polish(inputDraft)", guest.context) as string;
  expect(output).toBe(`Hello… ran ${code}\nDone!`);
});
