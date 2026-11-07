import { useEffect, useState } from "react";

/** The counter advances in whole seconds; a wall-clock read is banned in render scope, so it ticks instead. */
const TICK_MS = 1000;

/**
 * Whole seconds counted while `running`, starting at zero when the component mounts. The count holds when `running`
 * goes false, so a "Thought for Ns" label keeps the figure the wait ended on.
 */
export function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) {
      return;
    }
    const id = setInterval(() => setSeconds((current) => current + 1), TICK_MS);
    return (): void => clearInterval(id);
  }, [running]);
  return seconds;
}
