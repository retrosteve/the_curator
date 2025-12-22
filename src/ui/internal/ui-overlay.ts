/**
 * Small helpers for working with the UI overlay root.
 * @internal
 */
export function clearOverlayPreserving(
  overlayRoot: HTMLElement,
  preserved: Array<HTMLElement | null | undefined>
): void {
  overlayRoot.innerHTML = '';

  for (const el of preserved) {
    if (el) overlayRoot.appendChild(el);
  }
}
