// The four timing fields every long-animation-frame record carries. It lives in `kit`, DOM-free, because the
// client observer and the DOM-free `@orb/testkit` iso world both type against it.

export interface LongAnimationFrameTiming {
  readonly startTime: number;
  readonly duration: number;
  readonly blockingDuration: number;
  /** \>0 ⇒ style/layout ran inside this frame — the forced-reflow tell. */
  readonly styleAndLayoutStart: number;
}
