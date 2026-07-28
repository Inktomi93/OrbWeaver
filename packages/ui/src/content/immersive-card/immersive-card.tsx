import type { CardSpanOrigin } from "@orb/kit/content";
import type { ReactElement } from "react";
import { useState } from "react";
import { cn } from "#lib";
import { Button } from "#primitives/button";
import { Dialog, DialogPopup, DialogTitle } from "#primitives/dialog";
import { Code, Expand, Icon } from "#primitives/icons";
import { SandboxFrame, useSandboxTheme } from "../sandbox-frame";
import { immersiveCardVariants } from "./variants";

// The inline (collapsed) render height — mirrors the SandboxFrame default; the expand affordance is the
// "see it big" path, so the inline card stays a bounded strip in the transcript.
const DEFAULT_HEIGHT_PX = 320;

const UNTITLED_LABEL = "Immersive card";

export interface ImmersiveCardProps {
  /** The card's stored source — the fence body / detected block, handed to the sandbox verbatim. */
  readonly html: string;
  readonly css?: string | undefined;
  /** The `:::card title="…"` label — the chrome + lightbox label; absent renders the untitled label. */
  readonly title?: string | undefined;
  /** §4.8 provenance: `lenient` cards mark their chrome so an implicit wrap is visibly explainable. */
  readonly origin?: CardSpanOrigin | undefined;
  readonly heightPx?: number | undefined;
  readonly className?: string | undefined;
}

interface CardBodyProps {
  /** Fill the parent (the lightbox arm) instead of the fixed inline height. */
  readonly fill: boolean;
  readonly showRaw: boolean;
  readonly html: string;
  readonly css: string | undefined;
  readonly themeTokens: Readonly<Record<string, string>>;
  readonly fontFamily: string | undefined;
  readonly label: string;
  readonly heightPx: number;
}

/** The card's content pane: the sandboxed render, or (view-raw) the exact stored source as a code echo. */
function CardBody({ fill, showRaw, html, css, themeTokens, fontFamily, label, heightPx }: CardBodyProps): ReactElement {
  const slots = immersiveCardVariants();
  if (showRaw) {
    return (
      <pre
        className={cn(slots.pre(), fill ? "min-h-0 flex-1" : undefined)}
        style={fill ? undefined : { height: `${heightPx}px` }}
        data-slot="immersive-card-raw"
      >
        {html}
      </pre>
    );
  }
  return (
    <SandboxFrame
      html={html}
      {...(css === undefined ? {} : { css })}
      themeTokens={themeTokens}
      {...(fontFamily === undefined ? {} : { fontFamily })}
      title={label}
      {...(fill ? { fill: true } : { heightPx })}
      className={fill ? "min-h-0 w-full flex-1 rounded-card border border-border bg-card" : "w-full rounded-none border-0 bg-card"}
    />
  );
}

/**
 * `<ImmersiveCard>` — the tierB card LIFECYCLE chrome (parity-plus §4.7): the collapsed inline sandbox
 * with a header band, a VIEW-RAW toggle (the exact stored source in a code view — the in-lore "read the
 * code the character wrote" arm and the lenient-wrap safety valve), and an EXPAND affordance (a dialog
 * lightbox at full shell size, labelled by the card title). The security boundary is entirely
 * `SandboxFrame`'s (one sandbox home); this component is chrome + state only.
 */
export function ImmersiveCard({ html, css, title, origin, heightPx = DEFAULT_HEIGHT_PX, className }: ImmersiveCardProps): ReactElement {
  const [showRaw, setShowRaw] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const slots = immersiveCardVariants();
  const label = title !== undefined && title !== "" ? title : UNTITLED_LABEL;
  // The sandboxed iframe can't resolve the app's `var(--token)` cascade, so the base body rule is fed
  // CONCRETE theme-resolved surface/text/font values (recolors live on a theme switch).
  const { themeTokens, fontFamily } = useSandboxTheme();
  const bodyProps = { showRaw, html, css, themeTokens, fontFamily, label, heightPx };

  const rawToggle = (
    <Button
      intent="ghost"
      size="icon"
      aria-pressed={showRaw}
      aria-label={showRaw ? "Show rendered card" : "View raw source"}
      title={showRaw ? "Show rendered card" : "View raw source"}
      onClick={(): void => setShowRaw((v: boolean): boolean => !v)}
    >
      <Icon icon={Code} size="sm" />
    </Button>
  );

  return (
    <div className={cn(slots.root(), className)} data-slot="immersive-card" data-origin={origin}>
      <div className={slots.header()} data-slot="immersive-card-header">
        <span className={slots.title()} data-slot="immersive-card-title">
          ✦ {label}
        </span>
        {origin === "lenient" ? (
          <span className={slots.origin()} title="Auto-rendered from raw HTML in the message" data-slot="immersive-card-origin">
            auto
          </span>
        ) : null}
        {rawToggle}
        <Button intent="ghost" size="icon" aria-label="Expand card" title="Expand card" onClick={(): void => setExpanded(true)}>
          <Icon icon={Expand} size="sm" />
        </Button>
      </div>
      <CardBody fill={false} {...bodyProps} />
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogPopup size="xl" className="gap-row">
          <div className={slots.lightboxHeader()} data-slot="immersive-card-lightbox-header">
            <DialogTitle className={slots.lightboxTitle()}>{label}</DialogTitle>
            {rawToggle}
          </div>
          <div className={slots.lightboxBody()} data-slot="immersive-card-lightbox-body">
            <CardBody fill={true} {...bodyProps} />
          </div>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
