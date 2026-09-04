// Sharp contact-sheet renderer: deterministic frame order with embedded relative time and action label.
import sharp from "sharp";
import type { FilmstripFrame } from "../contract/filmstrip.ts";

const TILE_WIDTH = 320;
const IMAGE_HEIGHT = 180;
const FOOTER_HEIGHT = 52;
const TILE_HEIGHT = IMAGE_HEIGHT + FOOTER_HEIGHT;
const COLUMNS = 4;
const LABEL_CAP = 44;

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function footer(frame: FilmstripFrame, shownIndex: number): Buffer {
  const label = frame.label.length > LABEL_CAP ? `${frame.label.slice(0, LABEL_CAP - 1)}…` : frame.label;
  return Buffer.from(
    `<svg width="${String(TILE_WIDTH)}" height="${String(FOOTER_HEIGHT)}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111827"/>
      <text x="10" y="20" fill="#f9fafb" font-family="monospace" font-size="13">frame ${String(shownIndex + 1)} · +${String(Math.round(frame.elapsedMs))}ms</text>
      <text x="10" y="40" fill="#d1d5db" font-family="monospace" font-size="12">${escapeXml(label)}</text>
    </svg>`,
  );
}

async function tile(frame: FilmstripFrame, shownIndex: number): Promise<Buffer> {
  const image = await Promise.resolve(
    sharp(frame.bytes).rotate().resize({ width: TILE_WIDTH, height: IMAGE_HEIGHT, fit: "contain", background: "#030712" }).png().toBuffer(),
  );
  return Promise.resolve(
    sharp({ create: { width: TILE_WIDTH, height: TILE_HEIGHT, channels: 4, background: "#030712" } })
      .composite([
        { input: image, left: 0, top: 0 },
        { input: footer(frame, shownIndex), left: 0, top: IMAGE_HEIGHT },
      ])
      .png()
      .toBuffer(),
  );
}

export async function writeFilmstripContactSheet(frames: readonly FilmstripFrame[], path: string): Promise<void> {
  if (frames.length === 0) {
    throw new Error("FILMSTRIP REFUSED: Page.startScreencast produced no frames");
  }
  const tiles = await Promise.all(frames.map(tile));
  const rows = Math.ceil(tiles.length / COLUMNS);
  await Promise.resolve(
    sharp({ create: { width: TILE_WIDTH * COLUMNS, height: TILE_HEIGHT * rows, channels: 4, background: "#030712" } })
      .composite(tiles.map((input, index) => ({ input, left: (index % COLUMNS) * TILE_WIDTH, top: Math.floor(index / COLUMNS) * TILE_HEIGHT })))
      .png()
      .toFile(path),
  );
}
