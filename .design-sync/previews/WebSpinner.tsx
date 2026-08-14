// WebSpinner preview — THE loader (one identity, five sizes; compact glyph cut at/below 20px).
import { WebSpinner } from "@orb/ui";

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 24, padding: 16 };

/** The size spectrum — sm/md/lg mirror the icon table; xl/hero are standalone waits. */
export function SizeSpectrum() {
  return (
    <div className="bg-background text-foreground" style={row}>
      <WebSpinner size="sm" label="Loading (sm)" />
      <WebSpinner size="md" label="Loading (md)" />
      <WebSpinner size="lg" label="Loading (lg)" />
      <WebSpinner size="xl" label="Loading (xl)" />
      <WebSpinner size="hero" label="Loading (hero)" />
    </div>
  );
}

/** Brand-tinted waits — the spinner inherits currentColor. */
export function BrandTint() {
  return (
    <div className="bg-background text-primary" style={row}>
      <WebSpinner size="lg" label="Brand wait" />
      <WebSpinner size="hero" label="Brand hero wait" />
    </div>
  );
}
