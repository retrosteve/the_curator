import type { AutosavePolicy } from '@/core/game-types';

export class DebouncedSaver {
  private timer: number | null = null;

  public constructor(
    private readonly saveFn: () => boolean,
    private readonly policy: AutosavePolicy,
    private readonly debounceMs: number
  ) {}

  public requestSave(options?: { critical?: boolean }): void {
    const isCritical = options?.critical === true;

    if (this.policy !== 'on-change') {
      this.clearPending();
      if (isCritical) {
        this.saveFn();
      }
      return;
    }

    this.clearPending();
    this.timer = window.setTimeout(() => {
      this.saveFn();
      this.timer = null;
    }, this.debounceMs);
  }

  public clearPending(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
