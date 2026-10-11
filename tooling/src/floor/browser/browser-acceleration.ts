import type { Browser } from "@playwright/test";

const SOFTWARE_RENDERER = /swiftshader|software rasterizer|llvmpipe/iu;

export interface BrowserAccelerationEvidence {
  readonly backend: string;
  readonly posture: "hardware" | "software" | "unknown";
  readonly gpuCompositing: string;
  readonly rasterization: string;
  readonly webgl: string;
  readonly webgpu: string;
}

export function classifyBrowserAcceleration(backend: string, gpuCompositing: string, rasterization: string): BrowserAccelerationEvidence["posture"] {
  if (SOFTWARE_RENDERER.test(backend)) {
    return "software";
  }
  return backend !== "unknown" && gpuCompositing.includes("enabled") && rasterization.includes("enabled") ? "hardware" : "unknown";
}

export function browserArgsWithAcceleration(callerArgs: readonly string[] = []): string[] {
  return ["--enable-gpu", ...callerArgs];
}

export async function readBrowserAcceleration(browser: Browser): Promise<BrowserAccelerationEvidence> {
  const cdp = await browser.newBrowserCDPSession();
  try {
    const info = await cdp.send("SystemInfo.getInfo");
    const backend = String(info.gpu.auxAttributes?.["glRenderer"] ?? info.gpu.devices[0]?.deviceString ?? "unknown");
    const features = info.gpu.featureStatus ?? {};
    const gpuCompositing = features["gpu_compositing"] ?? "unknown";
    const rasterization = features["rasterization"] ?? "unknown";
    return {
      backend,
      posture: classifyBrowserAcceleration(backend, gpuCompositing, rasterization),
      gpuCompositing,
      rasterization,
      webgl: features["webgl"] ?? "unknown",
      webgpu: features["webgpu"] ?? "unknown",
    };
  } finally {
    await cdp.detach();
  }
}
