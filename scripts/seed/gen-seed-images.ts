// scripts/seed/gen-seed-images — the REPRODUCIBLE generator for orbweaver's bundled seed imagery.
//
// Emits an on-brand, deterministic image SET into the server package's boot seed-assets dir:
//   • 6 avatars (512×512 PNG) — one per seeded entity (5 default characters + the default "You" persona).
//   • 5 gallery pieces (1024×1024 WebP) — larger generative pieces in the same visual system.
// The seeder (`packages/server/src/entry/boot/seed-assets/`) reads these at boot via fs and stores them
// through `assets.store` (PNG/WebP pass the magic-byte sniff; SVG would not, hence we rasterize here).
//
// Visual system — the "woven orb": concentric orbital rings + threaded arcs + orbiting nodes over the app's
// deep-charcoal surface, lit by each entity's signature accent. Every entity gets a DISTINCT palette + motif
// variation so the set reads as a family, not clones. Deterministic per-entity seed (mulberry32 PRNG keyed
// by the entity id) → re-running produces byte-identical files.
//
// Throwaway tooling: a standalone tsx script, not wired into the app graph.
// Run: `pnpm tsx scripts/seed/gen-seed-images.ts`.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "..", "packages", "server", "src", "entry", "boot", "seed-assets");
const AVATAR_DIR = join(OUT_DIR, "avatars");
const GALLERY_DIR = join(OUT_DIR, "gallery");

const AVATAR_SIZE = 512;
const GALLERY_SIZE = 1024;

// ── Deterministic PRNG (mulberry32) — a per-entity seed → a stable stream, so every run is byte-identical. ──

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Palettes — deep-charcoal ground + a signature accent per entity (matched to its card vibe). ──

interface Palette {
  /** Two-stop radial background (outer → inner), both near-charcoal. */
  readonly bg: readonly [string, string];
  /** The signature accent (rings/threads). */
  readonly accent: string;
  /** A secondary accent for depth (dimmer companion). */
  readonly accent2: string;
  /** Orbiting-node glow. */
  readonly node: string;
}

// The app ground: deep charcoal (near-neutral, chroma ~0.006 @ hue 60 — tokens.json bg/surface family).
const CHARCOAL_OUTER = "#0d0d0f";
const CHARCOAL_INNER = "#17161a";

interface EntitySpec {
  readonly id: string;
  readonly file: string;
  readonly palette: Palette;
  /** Motif knobs — each entity's variation of the woven-orb system. */
  readonly motif: {
    /** Concentric ring count. */
    readonly rings: number;
    /** Orbiting node count. */
    readonly nodes: number;
    /** Woven arc-thread count. */
    readonly threads: number;
    /** Ring stroke width (px @ 512). */
    readonly stroke: number;
    /** Ring eccentricity 0..1 (0 = perfect circles → serene; higher = elliptical/dynamic). */
    readonly eccentric: number;
    /** Jitter of ring radii 0..1 (0 = even/precise; higher = raw/aggressive). */
    readonly jitter: number;
  };
}

// The 6 seeded entities. `id` keys the PRNG; `file` is the bundled avatar filename the seeder reads by handle.
// Character files are named by handle; the persona is `persona-you`.
const ENTITIES: readonly EntitySpec[] = [
  {
    // Assistant — calm, precise, quietly warm. The signature Ember, balanced even rings.
    id: "assistant",
    file: "assistant",
    palette: {
      bg: [CHARCOAL_OUTER, CHARCOAL_INNER],
      accent: "#f0913f", // Ember (oklch(0.72 0.175 52) ≈ warm orange)
      accent2: "#a8602c",
      node: "#ffc98a",
    },
    motif: { rings: 5, nodes: 6, threads: 5, stroke: 2.2, eccentric: 0.08, jitter: 0.04 },
  },
  {
    // Rev — brutal, funny, fire-alarm. Hot red-orange, aggressive jagged rings + more shards.
    id: "rev-card-refinery",
    file: "rev-card-refinery",
    palette: {
      bg: ["#100b0b", "#1c1210"],
      accent: "#ff5236", // fire-alarm red-orange
      accent2: "#b32b1d",
      node: "#ffb08f",
    },
    motif: { rings: 6, nodes: 9, threads: 8, stroke: 2.8, eccentric: 0.22, jitter: 0.24 },
  },
  {
    // Niko — shy hikikomori cat, wholesome. Soft violet/lavender, few gentle nested loops.
    id: "niko",
    file: "niko",
    palette: {
      bg: ["#0c0b12", "#151320"],
      accent: "#b48cf0", // soft lavender
      accent2: "#6f5aa8",
      node: "#e6d4ff",
    },
    motif: { rings: 4, nodes: 4, threads: 4, stroke: 2.0, eccentric: 0.12, jitter: 0.06 },
  },
  {
    // Mara — serene, exact, immovable auditor. Cool teal/cyan, precise thin symmetrical rings.
    id: "mara-soul-check",
    file: "mara-soul-check",
    palette: {
      bg: ["#0a0f10", "#101a1b"],
      accent: "#4fd6c4", // cool teal
      accent2: "#2b8a80",
      node: "#bff5ec",
    },
    motif: { rings: 7, nodes: 8, threads: 6, stroke: 1.6, eccentric: 0.02, jitter: 0.0 },
  },
  {
    // JFC — profane YAGNI graybeard. Industrial amber/gold, minimal BOLD geometry, few lines.
    id: "jfc-coder",
    file: "jfc-coder",
    palette: {
      bg: ["#100e08", "#1b1810"],
      accent: "#e0b23c", // industrial amber/gold
      accent2: "#997710",
      node: "#ffe9a8",
    },
    motif: { rings: 3, nodes: 3, threads: 3, stroke: 4.2, eccentric: 0.05, jitter: 0.02 },
  },
  {
    // Persona "You" — the observer at the center. Neutral slate-blue, open outward-radiating orbit.
    id: "persona-you",
    file: "persona-you",
    palette: {
      bg: [CHARCOAL_OUTER, "#14161c"],
      accent: "#6d8fc9", // neutral slate-blue
      accent2: "#3f5680",
      node: "#c7d8f5",
    },
    motif: { rings: 5, nodes: 5, threads: 6, stroke: 2.0, eccentric: 0.1, jitter: 0.03 },
  },
];

// ── SVG builders — the woven-orb composition, parameterized per entity + size. ──

const TAU = Math.PI * 2;

/** A concentric-ring + threaded-arc + orbiting-node "woven orb", deterministic for `spec.id`. */
function wovenOrbSvg(spec: EntitySpec, size: number, seedSuffix: string): string {
  const rand = mulberry32(hashSeed(`${spec.id}:${seedSuffix}`));
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.44;
  const { palette: p, motif: m } = spec;
  const parts: string[] = [];

  // Background radial + a soft central accent bloom (the "orb glow").
  parts.push(`<defs>
    <radialGradient id="bg" cx="50%" cy="46%" r="72%">
      <stop offset="0%" stop-color="${p.bg[1]}"/>
      <stop offset="100%" stop-color="${p.bg[0]}"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${p.accent}" stop-opacity="0.28"/>
      <stop offset="55%" stop-color="${p.accent}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${p.accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="${size * 0.006}"/>
    </filter>
  </defs>`);
  parts.push(`<rect width="${size}" height="${size}" fill="url(#bg)"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${maxR * 1.25}" fill="url(#glow)"/>`);

  const tilt = (rand() - 0.5) * 0.7; // orbit-plane tilt (radians) — a subtle 3D lean, stable per entity.

  // Concentric orbital rings (ellipses under a shared tilt) — the skeleton of the orb.
  const ringGroup: string[] = [];
  for (let i = 0; i < m.rings; i += 1) {
    const t = (i + 1) / m.rings;
    const jitter = 1 + (rand() - 0.5) * 2 * m.jitter;
    const rx = maxR * t * jitter;
    const ry = rx * (1 - m.eccentric * (0.5 + rand() * 0.5));
    const op = 0.22 + t * 0.5;
    const col = i % 2 === 0 ? p.accent : p.accent2;
    ringGroup.push(
      `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="none" stroke="${col}" stroke-width="${m.stroke.toFixed(2)}" stroke-opacity="${op.toFixed(3)}"/>`,
    );
  }
  parts.push(`<g transform="rotate(${((tilt * 180) / Math.PI).toFixed(2)} ${cx} ${cy})">${ringGroup.join("")}</g>`);

  // Woven arc-threads — curves that lace across the orb, tying the rings into a weave.
  const threadGroup: string[] = [];
  for (let i = 0; i < m.threads; i += 1) {
    const a0 = rand() * TAU;
    const a1 = a0 + (0.6 + rand() * 1.6) * (rand() > 0.5 ? 1 : -1);
    const r0 = maxR * (0.35 + rand() * 0.6);
    const r1 = maxR * (0.35 + rand() * 0.6);
    const x0 = cx + Math.cos(a0) * r0;
    const y0 = cy + Math.sin(a0) * r0;
    const x1 = cx + Math.cos(a1) * r1;
    const y1 = cy + Math.sin(a1) * r1;
    // Control point bowed toward the center → the thread arcs around the orb.
    const cxp = cx + (rand() - 0.5) * maxR * 0.5;
    const cyp = cy + (rand() - 0.5) * maxR * 0.5;
    threadGroup.push(
      `<path d="M ${x0.toFixed(2)} ${y0.toFixed(2)} Q ${cxp.toFixed(2)} ${cyp.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${p.accent}" stroke-width="${(m.stroke * 0.7).toFixed(2)}" stroke-opacity="${(0.14 + rand() * 0.2).toFixed(3)}" stroke-linecap="round"/>`,
    );
  }
  parts.push(threadGroup.join(""));

  // Orbiting nodes — glowing points sitting ON the rings (the woven-in beads).
  const nodeGroup: string[] = [];
  for (let i = 0; i < m.nodes; i += 1) {
    const ringT = (Math.floor(rand() * m.rings) + 1) / m.rings;
    const a = rand() * TAU;
    const rx = maxR * ringT;
    const ry = rx * (1 - m.eccentric * 0.6);
    // Apply the same tilt to node placement so beads sit on the tilted rings.
    const bx = Math.cos(a) * rx;
    const by = Math.sin(a) * ry;
    const x = cx + bx * Math.cos(tilt) - by * Math.sin(tilt);
    const y = cy + bx * Math.sin(tilt) + by * Math.cos(tilt);
    const rad = size * (0.006 + rand() * 0.012);
    nodeGroup.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(rad * 2.4).toFixed(2)}" fill="${p.node}" fill-opacity="0.18" filter="url(#soft)"/>`,
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rad.toFixed(2)}" fill="${p.node}" fill-opacity="0.9"/>`,
    );
  }
  parts.push(nodeGroup.join(""));

  // The core — a bright accent orb at center, the "weaver" the threads spin from.
  const coreR = size * 0.028;
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${(coreR * 3.2).toFixed(2)}" fill="${p.accent}" fill-opacity="0.14" filter="url(#soft)"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${coreR.toFixed(2)}" fill="${p.node}"/>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${parts.join("")}</svg>`;
}

async function rasterizeAvatar(spec: EntitySpec): Promise<number> {
  const svg = wovenOrbSvg(spec, AVATAR_SIZE, "avatar");
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
  await writeFile(join(AVATAR_DIR, `${spec.file}.png`), png);
  return png.byteLength;
}

async function rasterizeGallery(spec: EntitySpec, index: number): Promise<number> {
  // Larger pieces in the same system — a distinct seed suffix so they aren't a scaled avatar.
  const svg = wovenOrbSvg(spec, GALLERY_SIZE, `gallery-${index}`);
  const webp = await sharp(Buffer.from(svg)).webp({ quality: 82, effort: 6 }).toBuffer();
  await writeFile(join(GALLERY_DIR, `${spec.file}-gallery.webp`), webp);
  return webp.byteLength;
}

async function main(): Promise<void> {
  await mkdir(AVATAR_DIR, { recursive: true });
  await mkdir(GALLERY_DIR, { recursive: true });

  let total = 0;
  for (const spec of ENTITIES) {
    // biome-ignore lint/performance/noAwaitInLoops: throwaway generator — serial is fine, order-stable output.
    const bytes = await rasterizeAvatar(spec);
    total += bytes;
    process.stdout.write(`avatar  ${spec.file}.png  ${bytes} bytes\n`);
  }

  // Gallery starter set: 5 pieces (skip the persona — the gallery is a CHARACTER surface).
  const galleryEntities = ENTITIES.filter((e) => e.file !== "persona-you");
  let g = 0;
  for (const spec of galleryEntities) {
    // biome-ignore lint/performance/noAwaitInLoops: throwaway generator — serial is fine.
    const bytes = await rasterizeGallery(spec, g);
    total += bytes;
    g += 1;
    process.stdout.write(`gallery ${spec.file}-gallery.webp  ${bytes} bytes\n`);
  }

  process.stdout.write(`\ntotal ${total} bytes across ${ENTITIES.length + galleryEntities.length} files\n`);
  process.stdout.write(`out: ${OUT_DIR}\n`);
}

await main();
