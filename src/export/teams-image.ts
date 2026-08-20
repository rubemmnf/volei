import type { Player } from "../types";
import { TEAM_META } from "../components/team-meta";
import { suggestBalancedSwaps, TEAM_PAIRS } from "../algorithm/suggest-balanced-swaps";

/** One suggested trade, as it appears in the image. */
export type ExportSwap = { from: string; to: string; shift: number };

/** The low-impact swaps between one pair of teams. */
export type ExportSwapPair = {
  x: { name: string; color: string };
  y: { name: string; color: string };
  swaps: ExportSwap[];
};

/**
 * Everything the shared image is allowed to contain. Deliberately has no Elo:
 * the painter can only draw what lives in here, so ratings cannot leak into a
 * print sent to the group. `swaps` is present only in the variant the
 * organizer explicitly asks for.
 */
export type ExportModel = {
  title: string;
  teams: { name: string; color: string; players: string[] }[];
  swaps?: ExportSwapPair[];
};

const WIDTH = 1080;
const TEAMS_ONLY_HEIGHT = 1350;
const MARGIN = 72;
const CARD_HEIGHT = 340;
const CARD_GAP = 36;
const CARDS_TOP = 184;
const PAD = 48;
const PILL_HEIGHT = 68;
const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const SWAPS_GAP = 48;
const SWAPS_PAD = 40;
const SWAPS_TITLE_HEIGHT = 64;
const PAIR_HEADER_HEIGHT = 46;
const SWAP_ROW_HEIGHT = 62;
const SWAP_ROW_GAP = 12;
const PAIR_GAP = 30;

const BACKGROUND = "#000000";
const CARD_FILL = "#18181b";
const PILL_FILL = "#000000";
const PILL_STROKE = "rgba(255,255,255,0.10)";
const TITLE_COLOR = "#ffffff";
const PLAYER_COLOR = "#e4e4e7";
const MUTED_COLOR = "#a1a1aa";
const FAINT_COLOR = "#71717a";

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

/**
 * The same image plus the low-impact swaps, for the print the organizer sends
 * before the session so the group can ask for trades. Carries the `±shift`
 * numbers but still no Elo.
 */
export function buildSwapsExportModel(preview: Player[][], date: Date): ExportModel {
  return {
    ...buildExportModel(preview, date),
    swaps: TEAM_PAIRS.map(([x, y]) => ({
      x: { name: TEAM_META[x].name, color: TEAM_META[x].hex },
      y: { name: TEAM_META[y].name, color: TEAM_META[y].hex },
      swaps: suggestBalancedSwaps(preview[x], preview[y]).map((swap) => ({
        from: swap.fromX.name,
        to: swap.fromY.name,
        shift: swap.shift,
      })),
    })),
  };
}

export function exportFilename(date: Date, withSwaps = false): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `times${withSwaps ? "-trocas" : ""}-${day}-${month}.png`;
}

/** Paints the model onto an offscreen canvas and hands back a PNG blob. */
export function renderTeamsImage(model: ExportModel): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = imageHeight(model);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `800 56px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText(model.title, WIDTH / 2, MARGIN + 56);
  ctx.textAlign = "left";

  model.teams.forEach((team, i) => {
    drawTeamCard(ctx, team, CARDS_TOP + i * (CARD_HEIGHT + CARD_GAP));
  });

  if (model.swaps?.length) {
    drawSwapsCard(ctx, model.swaps, cardsBottom(model) + SWAPS_GAP);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image"))),
      "image/png",
    );
  });
}

function cardsBottom(model: ExportModel): number {
  const count = model.teams.length;
  return CARDS_TOP + count * CARD_HEIGHT + Math.max(0, count - 1) * CARD_GAP;
}

function imageHeight(model: ExportModel): number {
  if (!model.swaps?.length) return TEAMS_ONLY_HEIGHT;
  return cardsBottom(model) + SWAPS_GAP + swapsCardHeight(model.swaps) + MARGIN;
}

function pairHeight(pair: ExportSwapPair): number {
  const rows = pair.swaps.length;
  return PAIR_HEADER_HEIGHT + rows * SWAP_ROW_HEIGHT + Math.max(0, rows - 1) * SWAP_ROW_GAP;
}

function swapsCardHeight(pairs: ExportSwapPair[]): number {
  const body = pairs.reduce((total, pair) => total + pairHeight(pair), 0);
  return SWAPS_PAD * 2 + SWAPS_TITLE_HEIGHT + body + Math.max(0, pairs.length - 1) * PAIR_GAP;
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

function drawSwapsCard(ctx: CanvasRenderingContext2D, pairs: ExportSwapPair[], top: number) {
  const cardWidth = WIDTH - MARGIN * 2;

  roundedRect(ctx, MARGIN, top, cardWidth, swapsCardHeight(pairs), 40);
  ctx.fillStyle = CARD_FILL;
  ctx.fill();
  ctx.strokeStyle = PILL_STROKE;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = MUTED_COLOR;
  ctx.font = `800 36px ${FONT_STACK}`;
  ctx.fillText("Trocas de baixo impacto", MARGIN + SWAPS_PAD, top + SWAPS_PAD + 40);

  let cursor = top + SWAPS_PAD + SWAPS_TITLE_HEIGHT;
  pairs.forEach((pair, i) => {
    drawSwapPair(ctx, pair, cursor, cardWidth);
    cursor += pairHeight(pair) + (i < pairs.length - 1 ? PAIR_GAP : 0);
  });
}

function drawSwapPair(
  ctx: CanvasRenderingContext2D,
  pair: ExportSwapPair,
  top: number,
  cardWidth: number,
) {
  const left = MARGIN + SWAPS_PAD;
  const rowWidth = cardWidth - SWAPS_PAD * 2;

  ctx.font = `800 30px ${FONT_STACK}`;
  let x = left;
  for (const [text, color] of [
    [pair.x.name, pair.x.color],
    [" ⇄ ", FAINT_COLOR],
    [pair.y.name, pair.y.color],
  ] as const) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, top + 30);
    x += ctx.measureText(text).width;
  }

  pair.swaps.forEach((swap, i) => {
    const y = top + PAIR_HEADER_HEIGHT + i * (SWAP_ROW_HEIGHT + SWAP_ROW_GAP);

    roundedRect(ctx, left, y, rowWidth, SWAP_ROW_HEIGHT, 18);
    ctx.fillStyle = PILL_FILL;
    ctx.fill();
    ctx.strokeStyle = PILL_STROKE;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = PLAYER_COLOR;
    ctx.font = `600 30px ${FONT_STACK}`;
    ctx.fillText(truncate(ctx, `${swap.from} ⇄ ${swap.to}`, rowWidth - 160), left + 20, y + 41);

    ctx.fillStyle = FAINT_COLOR;
    ctx.font = `800 30px ${FONT_STACK}`;
    ctx.textAlign = "right";
    ctx.fillText(`±${swap.shift}`, left + rowWidth - 20, y + 41);
    ctx.textAlign = "left";
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
