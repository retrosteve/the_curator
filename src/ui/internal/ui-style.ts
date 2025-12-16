/**
 * Ensures a single <style> tag exists for a given id.
 * Safe to call repeatedly; inserts only once.
 * @internal
 */
export function ensureStyleElement(id: string, cssText: string): void {
  if (document.getElementById(id)) return;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = cssText;
  document.head.appendChild(style);
}
