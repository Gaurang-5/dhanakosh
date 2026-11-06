export function shouldShowCompositionLogo(
  width: number,
  height: number,
  avatarSymbol?: string,
): boolean {
  return width >= 72 && height >= 72 && !!avatarSymbol;
}
