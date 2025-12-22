import type { ButtonVariant } from './ui-types';

export type CreateHeading = (
  text: string,
  level: 1 | 2 | 3,
  style?: Partial<CSSStyleDeclaration>
) => HTMLHeadingElement;

export type CreateText = (
  text: string,
  style?: Partial<CSSStyleDeclaration>
) => HTMLParagraphElement;

export type CreateButton = (
  text: string,
  onClick: () => void,
  options?: {
    variant?: ButtonVariant;
    style?: Partial<CSSStyleDeclaration>;
  }
) => HTMLButtonElement;

export type CreateDiv = (
  className: string,
  style?: Partial<CSSStyleDeclaration>
) => HTMLDivElement;
