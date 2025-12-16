import { formatCurrency } from '@/utils/format';
import { GAME_CONFIG, SKILL_METADATA, type SkillKey } from '@/config/game-config';
import { ensureStyleElement } from './ui-style';

/**
 * Manages transient toast UI (money floating text, XP toasts).
 * @internal Used by UIManager.
 */
export class ToastManager {
  private activeToasts: HTMLElement[] = [];

  constructor(private readonly appendToOverlay: (element: HTMLElement) => void) {}

  public showFloatingMoney(amount: number, isPositive: boolean = true): void {
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

    const { baseTopPosition, heightWithMargin } = GAME_CONFIG.ui.toast;
    const topPosition = baseTopPosition + (this.activeToasts.length * heightWithMargin);

    let toastText = `${skillIcon} +${amount} ${skillName} XP`;
    if (currentXP !== undefined && requiredXP !== undefined && currentLevel !== undefined) {
      if (requiredXP === 0) {
        toastText += ` (MAX LEVEL)`;
      } else {
        toastText += ` (${currentXP}/${requiredXP} to Lv${currentLevel + 1})`;
      }
    }

    const toast = document.createElement('div');
    toast.textContent = toastText;
    toast.style.cssText = `
      position: fixed;
      top: ${topPosition}px;
      right: 20px;
      padding: 12px 20px;
      background: ${skillColor};
      color: #fff;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      pointer-events: none;
      z-index: 10000;
      animation: slideInFadeOut ${GAME_CONFIG.ui.toast.animationDuration}ms ease-out forwards;
      transition: top 0.3s ease;
    `;

    this.activeToasts.push(toast);

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
    }, GAME_CONFIG.ui.toast.animationDuration);
  }

  public showToast(
    message: string,
    options?: { backgroundColor?: string; durationMs?: number }
  ): void {
    const safeMessage = message?.trim();
    if (!safeMessage) return;

    const durationMs = options?.durationMs ?? GAME_CONFIG.ui.toast.animationDuration;
    const backgroundColor = options?.backgroundColor ?? 'rgba(44, 62, 80, 0.95)';

    const { baseTopPosition, heightWithMargin } = GAME_CONFIG.ui.toast;
    const topPosition = baseTopPosition + (this.activeToasts.length * heightWithMargin);

    const toast = document.createElement('div');
    toast.textContent = safeMessage;
    toast.style.cssText = `
      position: fixed;
      top: ${topPosition}px;
      right: 20px;
      padding: 12px 20px;
      background: ${backgroundColor};
      color: #fff;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      pointer-events: none;
      z-index: 10000;
      animation: toastSlideInFadeOut ${durationMs}ms ease-out forwards;
      transition: top 0.3s ease;
      max-width: 380px;
      white-space: pre-wrap;
    `;

    this.activeToasts.push(toast);

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

  private repositionToasts(): void {
    const { baseTopPosition, heightWithMargin } = GAME_CONFIG.ui.toast;
    this.activeToasts.forEach((toast, index) => {
      toast.style.top = `${baseTopPosition + (index * heightWithMargin)}px`;
    });
  }
}
