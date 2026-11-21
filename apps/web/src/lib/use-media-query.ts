import { useSyncExternalStore } from 'react';

/**
 * True while a CSS media query matches (e.g. "(min-width: 1024px)"). useSyncExternalStore is
 * React's built-in way to read a value that lives outside React and can change at any time.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    },
    () => window.matchMedia(query).matches,
  );
}
