import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';

/**
 * Main Menu Scene - Entry point for the game.
 * Presents options for New Game, Continue (Load), and Credits.
 * Separates meta-game actions from gameplay actions.
 */
export class MainMenuScene extends Phaser.Scene {
  private gameManager!: GameManager;
  private uiManager!: UIManager;
  private hasSavedGame: boolean = false;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    console.log('Main Menu Scene: Loaded');

    this.gameManager = GameManager.getInstance();
    this.uiManager = UIManager.getInstance();
    this.hasSavedGame = this.checkForSavedGame();

    this.setupBackground();
    this.setupUI();
  }

  private setupBackground(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Dark gradient background
    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    bg.setOrigin(0.5);

    // Title backdrop
    const titleBg = this.add.rectangle(width / 2, height * 0.25, width * 0.8, 150, 0x0f3460);
    titleBg.setOrigin(0.5);
  }

  private setupUI(): void {
    // Main container
    const container = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      minWidth: '500px',
      textAlign: 'center',
      backgroundColor: 'transparent',
    });

    // Game title
    const title = this.uiManager.createHeading('THE CURATOR', 1, {
      fontSize: '64px',
      color: '#f39c12',
      textAlign: 'center',
      marginBottom: '10px',
      textShadow: '4px 4px 8px rgba(0,0,0,0.8)',
      letterSpacing: '4px',
    });
    container.appendChild(title);

    // Subtitle
    const subtitle = this.uiManager.createText(
      'Master the Art of Car Curation',
      {
        fontSize: '20px',
        color: '#ecf0f1',
        textAlign: 'center',
        marginBottom: '60px',
        fontStyle: 'italic',
      }
    );
    container.appendChild(subtitle);

    // Button container
    const buttonContainer = this.uiManager.createButtonContainer({
      alignItems: 'center',
      marginTop: '40px',
    });

    // New Game button
    const newGameBtn = this.uiManager.createButton(
      'New Game',
      () => this.startNewGame(),
      {
        style: {
          width: '300px',
          fontSize: '20px',
          padding: '15px',
          backgroundColor: '#27ae60',
        }
      }
    );
    buttonContainer.appendChild(newGameBtn);

    // Continue button (only if save exists)
    if (this.hasSavedGame) {
      const continueBtn = this.uiManager.createButton(
        'Continue',
        () => this.continueGame(),
        {
          style: {
            width: '300px',
            fontSize: '20px',
            padding: '15px',
            backgroundColor: '#3498db',
          }
        }
      );
      buttonContainer.appendChild(continueBtn);

      // Load Game button
      const loadBtn = this.uiManager.createButton(
        'Load Saved Game',
        () => this.loadGame(),
        {
          style: {
            width: '300px',
            fontSize: '16px',
            padding: '12px',
            backgroundColor: '#2c3e50',
          }
        }
      );
      buttonContainer.appendChild(loadBtn);
    }

    // Credits button
    const creditsBtn = this.uiManager.createButton(
      'About',
      () => this.showAbout(),
      {
        style: {
          width: '300px',
          fontSize: '16px',
          padding: '12px',
          backgroundColor: '#34495e',
        }
      }
    );
    buttonContainer.appendChild(creditsBtn);

    container.appendChild(buttonContainer);

    // Footer text
    const footer = this.uiManager.createText(
      'v1.0 | A game about access, valuation, and timing',
      {
        fontSize: '12px',
        color: '#7f8c8d',
        textAlign: 'center',
        marginTop: '60px',
      }
    );
    container.appendChild(footer);

    this.uiManager.append(container);
  }

  private checkForSavedGame(): boolean {
    try {
      const saved = localStorage.getItem('theCuratorSave');
      return saved !== null;
    } catch {
      return false;
    }
  }

  private startNewGame(): void {
    this.uiManager.showModal(
      'Start New Game?',
      this.hasSavedGame
        ? 'Starting a new game will not delete your saved game.\n\nYou can return to your saved game from the main menu.'
        : 'Begin your journey as a car curator?\n\nYou start with $8,000 and a dream.',
      [
        {
          text: 'Start',
          onClick: () => {
            this.gameManager.reset();
            this.scene.start('GarageScene');
          },
        },
        { text: 'Cancel', onClick: () => {} },
      ]
    );
  }

  private continueGame(): void {
    if (this.gameManager.load()) {
      this.scene.start('GarageScene');
    } else {
      this.uiManager.showModal(
        'Load Failed',
        'Unable to load saved game. Starting a new game instead.',
        [
          {
            text: 'OK',
            onClick: () => this.startNewGame(),
          },
        ]
      );
    }
  }

  private loadGame(): void {
    // Same as continue, but with explicit feedback
    this.continueGame();
  }

  private showAbout(): void {
    this.uiManager.showModal(
      'About The Curator',
      'You are an aspiring car collector starting with a single garage slot.\n\n' +
        'Your goal: Curate the world\'s most prestigious private collection.\n\n' +
        'This game is about Access, Valuation, and Timing.\n\n' +
        '• Scout locations for rare finds\n' +
        '• Battle rivals in tense auctions\n' +
        '• Restore cars to display quality\n' +
        '• Build your reputation and complete sets\n\n' +
        'Developed with Phaser 3 + TypeScript\n' +
        'Designed by The Curator Team',
      [{ text: 'Back', onClick: () => {} }]
    );
  }

  shutdown(): void {
    this.uiManager.clear();
  }
}
