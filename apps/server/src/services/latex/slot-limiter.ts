/** Gives back the slot. Calling it twice is harmless. */
export type ReleaseSlot = () => void;

export interface SlotLimiter {
  /** Takes a free slot, or returns null when all slots are busy (the caller answers 503 BUSY). */
  tryAcquire(): ReleaseSlot | null;
  readonly active: number;
}

/**
 * Caps how many pdflatex processes run at once (docs/SECURITY.md T9). pdflatex is CPU-heavy;
 * without a cap, a burst of requests could exhaust the container. There is deliberately no
 * queue: a waiting queue would hold requests open and use memory, while "busy, retry in a few
 * seconds" is simple and honest (docs/DECISIONS.md ADR-022).
 */
export function createSlotLimiter(maxSlots: number): SlotLimiter {
  let active = 0;

  return {
    tryAcquire() {
      if (active >= maxSlots) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
      };
    },
    get active() {
      return active;
    },
  };
}
