import type { ReactElement } from "react";

interface RegisteredFrame {
  readonly title: string;
  readonly html: string;
  readonly css?: string;
}

interface PocketArcadeFrameProps {
  readonly mainSource: string;
}

interface PocketArcadeHost {
  readonly grants: readonly string[];
  readonly log: {
    readonly info: () => void;
    readonly warn: () => void;
    readonly error: () => void;
  };
  readonly ui: {
    readonly registerFrame: (definition: RegisteredFrame) => void;
  };
}

function registeredFrame(mainSource: string): RegisteredFrame {
  let registered: RegisteredFrame | undefined;
  const hostOrb = {
    host: (): PocketArcadeHost => ({
      grants: ["ui.frame"],
      log: { info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined },
      ui: {
        registerFrame: (definition: RegisteredFrame): void => {
          registered = definition;
        },
      },
    }),
  };
  const hadOrb = Reflect.has(globalThis, "orb");
  const previousOrb = Reflect.get(globalThis, "orb");
  const script = document.createElement("script");
  script.textContent = `{\n${mainSource}\n}`;
  Reflect.set(globalThis, "orb", hostOrb);
  try {
    document.head.append(script);
  } finally {
    script.remove();
    if (hadOrb) {
      Reflect.set(globalThis, "orb", previousOrb);
    } else {
      Reflect.deleteProperty(globalThis, "orb");
    }
  }
  if (registered === undefined) {
    throw new Error("Pocket Arcade did not register its frame");
  }
  return registered;
}

export function PocketArcadeFrame({ mainSource }: PocketArcadeFrameProps): ReactElement {
  const frame = registeredFrame(mainSource);

  return <iframe title={frame.title} sandbox="allow-scripts" srcDoc={`<style>${frame.css ?? ""}</style>${frame.html}`} />;
}
