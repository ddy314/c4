import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const read = () => window.matchMedia(query).matches;
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

/** Respond to preference changes without requiring a page reload. */
export function useReducedEffects() {
  return useSyncExternalStore(subscribe, read, () => false);
}
