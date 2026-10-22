import "@orb/client/styles";
import { CtProviders } from "@orb/testkit/browser/ct-providers.tsx";
import { TOKENS } from "@orb/ui/tokens";
import type { ComponentType } from "react";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

// The module boundary is a dictionary of browser-owned component exports, never Node test modules.
const stories = import.meta.glob<Readonly<Record<string, ComponentType<object>>>>(["../tests/**/*-stories.tsx", "../tests/support/browser/*-fixtures.tsx"]);
const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("The component gallery requires #root");
}
const element = rootElement;
let root: Root | undefined;
const render: { active: boolean; errors: Error[] } = { active: false, errors: [] };

async function settleAppFaces(): Promise<void> {
  const stacks = [TOKENS["font.sans"].value, TOKENS["font.mono"].value];
  await Promise.all(stacks.flatMap((stack) => [document.fonts.load(`13px ${stack}`), document.fonts.load(`italic 13px ${stack}`)]));
  await document.fonts.ready;
}

globalThis.mount = async ({ story, props }): Promise<void> => {
  const separator = story.lastIndexOf("/");
  const file = `../${story.slice(0, separator)}.tsx`;
  const load = stories[file];
  const Story = separator === -1 || load === undefined ? undefined : (await load())[story.slice(separator + 1)];
  if (Story === undefined) {
    throw new Error(`Unknown component story: ${story}`);
  }
  await settleAppFaces();
  render.errors.length = 0;
  render.active = true;
  root ??= createRoot(element, {
    // React 19 reports uncaught render failures here rather than throwing them out of flushSync.
    onUncaughtError: (error): void => {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (render.active) {
        render.errors.push(failure);
      } else {
        globalThis.reportError(failure);
      }
    },
  });
  const mountedRoot = root;
  try {
    flushSync(() => {
      mountedRoot.render(
        <StrictMode>
          <CtProviders>
            <Story {...props} />
          </CtProviders>
        </StrictMode>,
      );
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const failure = render.errors[0];
    if (failure !== undefined) {
      mountedRoot.unmount();
      root = undefined;
      throw failure;
    }
  } finally {
    render.active = false;
  }
};

globalThis.unmount = (): Promise<void> => {
  root?.unmount();
  root = undefined;
  return Promise.resolve();
};
