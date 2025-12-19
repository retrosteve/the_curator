import { formatCurrency } from '@/utils/format';
import { GAME_CONFIG, SKILL_METADATA, type SkillKey } from '@/config/game-config';
import { ensureStyleElement, isPixelUIEnabled } from './ui-style';

/**
 * Manages transient toast UI (money floating text, XP toasts).
 * @internal Used by UIManager.
 */
export class ToastManager {
  private activeToasts: HTMLElement[] = [];

  constructor(private readonly appendToOverlay: (element: HTMLElement) => void) {}

  private createTopRightToastElement(options: {
    text: string;
    background: string;
    animationName: string;
    durationMs: number;
    maxWidthPx?: number;
    portraitUrl?: string;
    portraitAlt?: string;
    portraitSizePx?: number;
  }): HTMLDivElement {
    const pixelUI = isPixelUIEnabled();
    const { baseTopPosition, heightWithMargin } = GAME_CONFIG.ui.toast;
    const topPosition = baseTopPosition + (this.activeToasts.length * heightWithMargin);

    const toast = document.createElement('div');

    toast.style.cssText = `
      position: fixed;
      top: ${topPosition}px;
      right: 20px;
      padding: 12px 20px;
      background: ${options.background};
      color: #fff;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      pointer-events: none;
      z-index: 10000;
      animation: ${options.animationName} ${options.durationMs}ms ease-out forwards;
      transition: top 0.3s ease;
      white-space: pre-wrap;
    `;

    if (options.portraitUrl) {
      toast.style.display = 'flex';
      toast.style.alignItems = 'flex-start';
      toast.style.gap = '10px';

      const portrait = document.createElement('img');
      portrait.src = options.portraitUrl;
      portrait.alt = options.portraitAlt ?? '';
      portrait.style.width = `${options.portraitSizePx ?? 32}px`;
      portrait.style.height = `${options.portraitSizePx ?? 32}px`;
      portrait.style.objectFit = 'cover';
      portrait.style.flex = '0 0 auto';
      portrait.style.imageRendering = pixelUI ? 'pixelated' : 'auto';
      portrait.style.borderRadius = pixelUI ? '0px' : '6px';
      portrait.style.border = '2px solid rgba(255,255,255,0.18)';
      portrait.style.backgroundColor = 'rgba(0,0,0,0.18)';

      const text = document.createElement('div');
      text.textContent = options.text;
      text.style.whiteSpace = 'pre-wrap';
      text.style.lineHeight = '1.2';

      toast.appendChild(portrait);
      toast.appendChild(text);
    } else {
      toast.textContent = options.text;
    }

    if (options.maxWidthPx !== undefined) {
      toast.style.maxWidth = `${options.maxWidthPx}px`;
    }

    if (pixelUI) {
      toast.style.borderRadius = '0px';
      toast.style.boxShadow = 'none';
    }

    return toast;
  }

  private enqueueToast(toast: HTMLElement, durationMs: number): void {
    this.activeToasts.push(toast);
    this.appendToOverlay(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }

      const index = this.activeToasts.indexOf(toast);
      if (index > -1) {
        this.activeToasts.splice(index, 1);
      }

      this.repositionToasts();
    }, durationMs);
  }

  public showFloatingMoney(amount: number, isPositive: boolean = true): void {
    const pixelUI = isPixelUIEnabled();

    const floatingText = document.createElement('div');
    const symbol = isPositive ? '+' : '-';
    const color = isPositive ? '#2ecc71' : '#e74c3c';

    floatingText.textContent = `${symbol}${formatCurrency(Math.abs(amount))}`;
    floatingText.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 36px;
      font-weight: bold;
      color: ${color};
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      pointer-events: none;
      z-index: 10000;
      animation: floatUp 1.5s ease-out forwards;
    `;

    if (pixelUI) {
      floatingText.style.textShadow = 'none';
    }

    ensureStyleElement(
      'floatingMoneyAnimation',
      `
        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) translateY(0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) translateY(-100px);
          }
        }
      `
    );

    this.appendToOverlay(floatingText);

    setTimeout(() => {
      if (floatingText.parentNode) {
        floatingText.parentNode.removeChild(floatingText);
      }
    }, 1500);
  }

  public showXPGain(
    skill: SkillKey,
    amount: number,
    currentXP?: number,
    requiredXP?: number,
    currentLevel?: number
  ): void {
    const skillMeta = SKILL_METADATA[skill];
    const skillIcon = skillMeta.icon;
    const skillName = skillMeta.name;
    const skillColor = skillMeta.color;

    let toastText = `${skillIcon} +${amount} ${skillName} XP`;
    if (currentXP !== undefined && requiredXP !== undefined && currentLevel !== undefined) {
      if (requiredXP === 0) {
        toastText += ` (MAX LEVEL)`;
      } else {
        toastText += ` (${currentXP}/${requiredXP} to Lv${currentLevel + 1})`;
      }
    }

    const durationMs = GAME_CONFIG.ui.toast.durationMs;
    const toast = this.createTopRightToastElement({
      text: toastText,
      background: skillColor,
      animationName: 'slideInFadeOut',
      durationMs,
    });

    ensureStyleElement(
      'xpToastAnimation',
      `
        @keyframes slideInFadeOut {
          0% {
            opacity: 0;
            transform: translateX(100px);
          }
          15% {
            opacity: 1;
            transform: translateX(0);
          }
          85% {
            opacity: 1;
            transform: translateX(0);
          }
          100% {
            opacity: 0;
            transform: translateX(100px);
          }
        }
      `
    );

    this.enqueueToast(toast, durationMs);
  }

  public showToast(
    message: string,
    options?: {
      backgroundColor?: string;
      durationMs?: number;
      portraitUrl?: string;
      portraitAlt?: string;
      portraitSizePx?: number;
    }
  ): void {
    const safeMessage = message?.trim();
    if (!safeMessage) return;

    const durationMs =
      options?.durationMs ??
      GAME_CONFIG.ui.toast.durationMs;
    const backgroundColor = options?.backgroundColor ?? 'rgba(44, 62, 80, 0.95)';

    const toast = this.createTopRightToastElement({
      text: safeMessage,
      background: backgroundColor,
      animationName: 'toastSlideInFadeOut',
      durationMs,
      maxWidthPx: 380,
      portraitUrl: options?.portraitUrl,
      portraitAlt: options?.portraitAlt,
      portraitSizePx: options?.portraitSizePx,
    });

    ensureStyleElement(
      'genericToastAnimation',
      `
        @keyframes toastSlideInFadeOut {
          0% {
            opacity: 0;
            transform: translateX(100px);
          }
          15% {
            opacity: 1;
            transform: translateX(0);
          }
          85% {
            opacity: 1;
            transform: translateX(0);
          }
          100% {
            opacity: 0;
            transform: translateX(100px);
          }
        }
      `
    );

    this.enqueueToast(toast, durationMs);
  }

  private repositionToasts(): void {
    const { baseTopPosition, heightWithMargin } = GAME_CONFIG.ui.toast;
    this.activeToasts.forEach((toast, index) => {
      toast.style.top = `${baseTopPosition + (index * heightWithMargin)}px`;
    });
  }
}
