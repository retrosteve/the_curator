/**
 * Handles highlighting DOM elements for the tutorial.
 * Keeps UIManager slimmer by encapsulating query + class toggling.
 * @internal
 */
export class TutorialHighlighter {
  private targets: string[] = [];
  private highlightedElement: HTMLElement | null = null;

  constructor(private readonly overlayRoot: HTMLElement) {}

  public setTargets(targets: string[]): void {
    this.targets = targets;
  }

  public refresh(): void {
    if (this.highlightedElement) {
      this.highlightedElement.classList.remove('tutorial-highlight');
      this.highlightedElement = null;
    }

    if (this.targets.length === 0) return;

    for (const target of this.targets) {
      const el = this.overlayRoot.querySelector(`[data-tutorial-target="${target}"]`);
      if (el instanceof HTMLElement) {
        el.classList.add('tutorial-highlight');
        this.highlightedElement = el;
        return;
      }
    }
  }
}
