import { isPixelUIEnabled } from './ui-style';
import type { CreateButton } from './ui-factories';
import { createGameHeading, createGameText, createImg } from './ui-elements';

export type { CreateButton };

/**
 * Manages tutorial dialogue UI in the DOM overlay.
 * @internal Used by UIManager.
 */
export class TutorialUI {
  private tutorialDialogueElement: HTMLElement | null = null;
  private tutorialBackdropElement: HTMLElement | null = null;

  constructor(
    private readonly overlayRoot: HTMLElement,
    private readonly createButton: CreateButton
  ) {}

  public getElements(): { backdrop: HTMLElement | null; dialogue: HTMLElement | null } {
    return { backdrop: this.tutorialBackdropElement, dialogue: this.tutorialDialogueElement };
  }

  public showTutorialDialogue(
    speaker: string,
    text: string,
    onDismiss?: () => void,
    options?: {
      portraitUrl?: string;
      portraitAlt?: string;
      portraitSizePx?: number;
    }
  ): void {
    this.hideTutorialDialogue();

    const pixelUI = isPixelUIEnabled();

    const backdrop = document.createElement('div');
    backdrop.className = 'tutorial-backdrop';
    this.tutorialBackdropElement = backdrop;
    this.overlayRoot.appendChild(backdrop);

    const dialogue = document.createElement('div');
    dialogue.className = 'tutorial-dialogue';
    dialogue.id = 'tutorial-dialogue';

    const header = document.createElement('div');
    header.className = 'tutorial-header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '12px';

    if (options?.portraitUrl) {
      const portrait = createImg({
        src: options.portraitUrl,
        alt: options.portraitAlt ?? '',
      });
      portrait.style.width = `${options.portraitSizePx ?? 56}px`;
      portrait.style.height = `${options.portraitSizePx ?? 56}px`;
      portrait.style.objectFit = 'cover';
      portrait.style.flex = '0 0 auto';
      portrait.style.imageRendering = pixelUI ? 'pixelated' : 'auto';
      portrait.style.borderRadius = pixelUI ? '0px' : '8px';
      portrait.style.border = '2px solid rgba(255,255,255,0.18)';
      portrait.style.backgroundColor = 'rgba(0,0,0,0.18)';
      header.appendChild(portrait);
    }

    const speakerName = createGameHeading(speaker, 3);
    speakerName.style.margin = '0';
    speakerName.style.fontSize = '20px';
    speakerName.style.color = '#f39c12';
    speakerName.style.fontFamily = 'Orbitron, sans-serif';

    header.appendChild(speakerName);
    dialogue.appendChild(header);

    const content = createGameText(text);
    content.style.margin = '12px 0 0 0';
    content.style.fontSize = '16px';
    content.style.lineHeight = '1.6';
    content.style.color = '#e0e6ed';
    content.style.fontFamily = 'Rajdhani, sans-serif';
    content.style.whiteSpace = 'pre-line';

    dialogue.appendChild(content);

    const dismissBtn = this.createButton(
      'Got it',
      () => {
        this.hideTutorialDialogue();
        onDismiss?.();
      },
      {
        variant: 'info',
        style: {
          marginTop: '16px',
          width: '100%',
        },
      }
    );

    dialogue.appendChild(dismissBtn);

    this.tutorialDialogueElement = dialogue;
    this.overlayRoot.appendChild(dialogue);
  }

  public hideTutorialDialogue(): void {
    if (this.tutorialBackdropElement) {
      this.tutorialBackdropElement.remove();
      this.tutorialBackdropElement = null;
    }

    if (this.tutorialDialogueElement) {
      this.tutorialDialogueElement.remove();
      this.tutorialDialogueElement = null;
    }
  }
}
