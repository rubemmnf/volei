/**
 * Shared canvas primitives for the exported images. Every print the app sends to
 * the group is painted with these, so the variants stay visually one family.
 */

export const WIDTH = 1080;
export const MARGIN = 72;
export const PAD = 48;
export const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const BACKGROUND = "#000000";
export const CARD_FILL = "#18181b";
export const PILL_FILL = "#000000";
export const PILL_STROKE = "rgba(255,255,255,0.10)";
export const TITLE_COLOR = "#ffffff";
export const PLAYER_COLOR = "#e4e4e7";
export const MUTED_COLOR = "#a1a1aa";
export const FAINT_COLOR = "#71717a";

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** Fits text to `maxWidth`, cutting it back to an ellipsis when it will not. */
export function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** An offscreen canvas of the given height, already painted with the background. */
export function createCanvas(height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return { canvas, ctx };
}

export function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image"))),
      "image/png",
    );
  });
}
