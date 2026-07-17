/**
 * Declarative binding — one call to `bind()` wires up every element
 * carrying a `data-cuelume-*` attribute:
 *
 *   data-cuelume-hover    → plays on pointerenter (fine mouse, throttled)
 *   data-cuelume-press    → plays on pointerdown
 *   data-cuelume-release  → plays on pointerup
 *   data-cuelume-toggle   → plays on click
 *
 * Delegated listeners resolve attributes when each event fires, so later
 * DOM additions, removals, and clones work without rescanning.
 */

import { play } from "../audio/engine.js";
import { isSoundName, type SoundName } from "../sounds/recipes.js";

const HOVER_GAP_MS = 150;
const HOVER_REARM_DISTANCE_PX = 4;
const boundRoots = new WeakSet<ParentNode>();
const handledEvents = new WeakSet<Event>();

let lastHoverTime = -Infinity;

// Browsers re-dispatch pointerenter when the DOM changes under a stationary
// cursor — an SPA navigation or a scroll can land a hover target beneath the
// pointer and chirp without any real mouse movement. Genuine hovers are always
// accompanied by pointermove, which is never synthesized, so after a click or
// scroll the hover channel stays disarmed until the pointer travels a few
// pixels (enough to ignore hand jitter during a click).
let hoverArmed = true;
let armX = 0;
let armY = 0;
let pointerX = 0;
let pointerY = 0;

function disarmHover(): void {
  hoverArmed = false;
  armX = pointerX;
  armY = pointerY;
}

function trackPointer(event: Event): void {
  const pointer = event as PointerEvent;
  pointerX = pointer.clientX;
  pointerY = pointer.clientY;
}

function resolve(el: HTMLElement, attr: string, fallback: SoundName): SoundName {
  const requested = el.getAttribute(attr);
  return isSoundName(requested) ? requested : fallback;
}

function isMouse(event: PointerEvent): boolean {
  return (
    event.pointerType === "mouse" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function findTarget(root: ParentNode, event: Event, attr: string): HTMLElement | null {
  if (!(event.target instanceof Element)) return null;
  const element = event.target.closest<HTMLElement>(`[${attr}]`);
  return element && (root as Node).contains(element) ? element : null;
}

function listen(
  root: ParentNode,
  eventName: "pointerenter" | "pointerdown" | "pointerup" | "click",
  attr: string,
  fallback: SoundName,
  mouseOnly = false,
): void {
  (root as EventTarget).addEventListener(
    eventName,
    (event) => {
      if (eventName === "pointerdown" && (event as PointerEvent).pointerType === "mouse") {
        trackPointer(event);
        disarmHover();
      }

      const element = findTarget(root, event, attr);
      if (!element || handledEvents.has(event)) return;
      if (mouseOnly && !isMouse(event as PointerEvent)) return;

      if (eventName === "pointerenter") {
        if (!hoverArmed) return;

        const relatedTarget = (event as PointerEvent).relatedTarget;
        if (relatedTarget instanceof Node && element.contains(relatedTarget)) return;

        const now = performance.now();
        if (now - lastHoverTime < HOVER_GAP_MS) return;
        lastHoverTime = now;
      }

      handledEvents.add(event);
      play(resolve(element, attr, fallback));
    },
    true,
  );
}

/**
 * Delegates `data-cuelume-*` interactions under `root` (default: the whole
 * document). Safe during SSR and safe to call repeatedly for the same root.
 */
export function bind(root?: ParentNode): void {
  if (typeof document === "undefined") return;
  const scope = root ?? document;
  if (boundRoots.has(scope)) return;
  boundRoots.add(scope);

  listen(scope, "pointerenter", "data-cuelume-hover", "chime", true);
  listen(scope, "pointerdown", "data-cuelume-press", "press");
  listen(scope, "pointerup", "data-cuelume-release", "release");
  listen(scope, "click", "data-cuelume-toggle", "toggle");

  const target = scope as EventTarget;
  target.addEventListener(
    "pointermove",
    (event) => {
      trackPointer(event);
      if (
        !hoverArmed &&
        Math.hypot(pointerX - armX, pointerY - armY) > HOVER_REARM_DISTANCE_PX
      ) {
        hoverArmed = true;
      }
    },
    true,
  );
  target.addEventListener("scroll", disarmHover, true);
}
