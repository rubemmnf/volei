import type { Player } from "../types";
import { TEAM_META } from "../components/team-meta";

/**
 * Everything the shared image is allowed to contain. Deliberately has no Elo
 * and no swap suggestions: the painter can only draw what lives in here, so
 * ratings cannot leak into a print sent to the group.
 */
export type ExportModel = {
  title: string;
  teams: { name: string; color: string; players: string[] }[];
};

const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 72;
const CARD_HEIGHT = 340;
const CARD_GAP = 36;
const CARDS_TOP = 184;
const PAD = 48;
const PILL_HEIGHT = 68;
const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const BACKGROUND = "#000000";
const CARD_FILL = "#18181b";
const PILL_FILL = "#000000";
const PILL_STROKE = "rgba(255,255,255,0.10)";
const TITLE_COLOR = "#ffffff";
const PLAYER_COLOR = "#e4e4e7";

export function buildExportModel(preview: Player[][], date: Date): ExportModel {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return {
    title: `Times · ${day}/${month}`,
    teams: preview.map((team, i) => ({
      name: TEAM_META[i].name,
      color: TEAM_META[i].hex,
      players: team.map((player) => player.name),
    })),
  };
}

export function exportFilename(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `times-${day}-${month}.png`;
}

/** Paints the model onto an offscreen canvas and hands back a PNG blob. */
export function renderTeamsImage(model: ExportModel): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `800 56px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText(model.title, WIDTH / 2, MARGIN + 56);
  ctx.textAlign = "left";

  model.teams.forEach((team, i) => {
    drawTeamCard(ctx, team, CARDS_TOP + i * (CARD_HEIGHT + CARD_GAP));
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image"))),
      "image/png",
    );
  });
}

function drawTeamCard(ctx: CanvasRenderingContext2D, team: ExportModel["teams"][number], top: number) {
  const cardWidth = WIDTH - MARGIN * 2;

  roundedRect(ctx, MARGIN, top, cardWidth, CARD_HEIGHT, 40);
  ctx.fillStyle = CARD_FILL;
  ctx.fill();
  ctx.strokeStyle = team.color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = team.color;
  ctx.font = `800 46px ${FONT_STACK}`;
  ctx.fillText(team.name, MARGIN + PAD, top + 86);

  const columnWidth = (cardWidth - PAD * 2 - 24) / 2;
  team.players.forEach((name, i) => {
    const x = MARGIN + PAD + (i % 2) * (columnWidth + 24);
    const y = top + 130 + Math.floor(i / 2) * (PILL_HEIGHT + 20);

    roundedRect(ctx, x, y, columnWidth, PILL_HEIGHT, 20);
    ctx.fillStyle = PILL_FILL;
    ctx.fill();
    ctx.strokeStyle = PILL_STROKE;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = PLAYER_COLOR;
    ctx.font = `600 34px ${FONT_STACK}`;
    ctx.fillText(truncate(ctx, name, columnWidth - 40), x + 20, y + 46);
  });
}

function roundedRect(
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

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** Hands the PNG to the OS share sheet, falling back to a download. */
export async function shareTeamsImage(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      // The user dismissing the share sheet is not a failure worth reporting.
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }

  downloadTeamsImage(blob, filename);
}

export function downloadTeamsImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
