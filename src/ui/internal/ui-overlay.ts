/**
 * Small helpers for working with the UI overlay root.
 * @internal
 */

const MODAL_BLOCKED_EVENTS: ReadonlyArray<keyof GlobalEventHandlersEventMap> = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'click',
  'mousedown',
  'mouseup',
  'mousemove',
  'wheel',
  'touchstart',
  'touchend',
  'touchmove',
];

/**
 * Prevent input events on a modal backdrop from reaching Phaser/canvas.
 * Add listeners in capture phase so we reliably swallow events.
 * @internal
 */
export function attachModalEventBlocker(backdrop: HTMLElement): void {
  const stop = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  for (const eventName of MODAL_BLOCKED_EVENTS) {
    backdrop.addEventListener(eventName, stop, { capture: true });
  }
}

export function clearOverlayPreserving(
  overlayRoot: HTMLElement,
  preserved: Array<HTMLElement | null | undefined>
): void {
  overlayRoot.innerHTML = '';

  for (const el of preserved) {
    if (el) overlayRoot.appendChild(el);
  }
}
