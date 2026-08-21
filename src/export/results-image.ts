import type { Player, Session } from "../types";
import { TEAM_META } from "../components/team-meta";
import { matchLabel } from "../components/match-label";
import {
  rankTeams,
  sessionSummaryStats,
  sessionWinners,
  teamStats,
  type TeamStat,
} from "../algorithm/session-stats";
import {
  CARD_FILL,
  createCanvas,
  FAINT_COLOR,
  FONT_STACK,
  MARGIN,
  MUTED_COLOR,
  PILL_FILL,
  PILL_STROKE,
  PLAYER_COLOR,
  roundedRect,
  TITLE_COLOR,
  toPngBlob,
  truncate,
  WIDTH,
} from "./canvas";

/** The team that won the night, as it appears in the image. */
export type ExportChampion = {
  name: string;
  color: string;
  players: string[];
  /** "2V · 0D · saldo +11" */
  record: string;
};

export type ExportStanding = {
  position: number;
  name: string;
  color: string;
  wins: number;
  losses: number;
  pointDiff: number;
  pointsFor: number;
};

/**
 * Everything the results image is allowed to contain. Like the teams export it
 * deliberately has no Elo: the painter can only draw what lives in here, so a
 * print sent to the group cannot leak ratings. Every string is already in
 * Portuguese — nothing downstream translates.
 */
export type ResultsExportModel = {
  title: string;
  subtitle: string;
  /** "CAMPEÃO", or "CAMPEÕES" when no criterion separated the leaders. */
  championLabel: string;
  champions: ExportChampion[];
  standings: ExportStanding[];
  matches: { label: string; excluded: boolean }[];
  stats: { label: string; value: string }[];
  /** Present only when the session opened with balancing rounds. */
  note?: string;
};

const HEADER_HEIGHT = 200;
const CARD_GAP = 36;
const CARD_RADIUS = 40;
const SECTION_PAD = 44;
const SECTION_TITLE_HEIGHT = 62;
const PILL_HEIGHT = 62;
const PILL_GAP = 16;
const STANDING_ROW_HEIGHT = 76;
const TEXT_ROW_HEIGHT = 56;
const NOTE_HEIGHT = 48;

export function buildResultsExportModel(session: Session, players: Player[]): ResultsExportModel {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const stats = teamStats(session);
  const summary = sessionSummaryStats(session);
  const winners = sessionWinners(stats);

  return {
    title: `Resultado · ${formatDate(session.date)}`,
    subtitle: `${summary.totalMatches} ${summary.totalMatches === 1 ? "jogo" : "jogos"}`,
    championLabel: winners.length > 1 ? "CAMPEÕES" : "CAMPEÃO",
    champions: winners.map((index) => ({
      name: TEAM_META[index].name,
      color: TEAM_META[index].hex,
      players: session.teams[index].map((id) => playerById.get(id)?.name ?? "?"),
      record: recordOf(stats[index]),
    })),
    standings: rankTeams(stats).map((stat, i) => ({
      position: i + 1,
      name: TEAM_META[stat.teamIndex].name,
      color: TEAM_META[stat.teamIndex].hex,
      wins: stat.wins,
      losses: stat.losses,
      pointDiff: stat.pointDiff,
      pointsFor: stat.pointsFor,
    })),
    matches: session.matches.map((match, i) => ({
      label: matchLabel(match, session, playerById),
      excluded: i < session.balancingRounds,
    })),
    stats: [
      { label: "Jogos", value: String(summary.totalMatches) },
      { label: "Pontos totais", value: String(summary.totalPoints) },
      ...(summary.biggestWin
        ? [
            {
              label: "Maior vitória",
              value:
                summary.biggestWin.teamIndex >= 0
                  ? `${TEAM_META[summary.biggestWin.teamIndex].name} por ${summary.biggestWin.margin}`
                  : matchLabel(summary.biggestWin.match, session, playerById),
            },
          ]
        : []),
      ...(summary.closestMatch
        ? [
            {
              label: "Jogo mais apertado",
              value: matchLabel(summary.closestMatch.match, session, playerById),
            },
          ]
        : []),
    ],
    ...balancingNote(session.balancingRounds),
  };
}

export function resultsFilename(session: Session): string {
  return `resultado-${formatDate(session.date).replace("/", "-")}.png`;
}

/** "2026-08-10" reads as "10/08"; anything else is left alone. */
function formatDate(date: string): string {
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}/${parts[1]}`;
}

function recordOf(stat: TeamStat): string {
  return `${stat.wins}V · ${stat.losses}D · saldo +${stat.pointDiff}`;
}

function balancingNote(rounds: number): { note?: string } {
  if (rounds <= 0) return {};
  if (rounds === 1) return { note: "A 1ª rodada foi de ajuste e não vale." };
  return { note: `As ${rounds} primeiras rodadas foram de ajuste e não valem.` };
}

/** Paints the model onto an offscreen canvas and hands back a PNG blob. */
export function renderResultsImage(model: ResultsExportModel): Promise<Blob> {
  const { canvas, ctx } = createCanvas(imageHeight(model));

  ctx.textAlign = "center";
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `800 56px ${FONT_STACK}`;
  ctx.fillText(model.title, WIDTH / 2, MARGIN + 56);
  ctx.fillStyle = MUTED_COLOR;
  ctx.font = `600 32px ${FONT_STACK}`;
  ctx.fillText(model.subtitle, WIDTH / 2, MARGIN + 106);
  ctx.textAlign = "left";

  let top = HEADER_HEIGHT;
  for (const champion of model.champions) {
    drawChampionCard(ctx, model.championLabel, champion, top);
    top += championCardHeight(champion) + CARD_GAP;
  }

  drawStandingsCard(ctx, model.standings, top);
  top += standingsCardHeight(model.standings) + CARD_GAP;

  drawMatchesCard(ctx, model, top);
  top += matchesCardHeight(model) + CARD_GAP;

  drawStatsCard(ctx, model.stats, top);

  return toPngBlob(canvas);
}

function imageHeight(model: ResultsExportModel): number {
  const champions = model.champions.reduce(
    (total, champion) => total + championCardHeight(champion) + CARD_GAP,
    0,
  );

  return (
    HEADER_HEIGHT +
    champions +
    standingsCardHeight(model.standings) +
    CARD_GAP +
    matchesCardHeight(model) +
    CARD_GAP +
    statsCardHeight(model.stats) +
    MARGIN
  );
}

function championCardHeight(champion: ExportChampion): number {
  const rows = Math.ceil(champion.players.length / 2);
  return (
    SECTION_PAD * 2 + 36 + 62 + 44 + rows * PILL_HEIGHT + Math.max(0, rows - 1) * PILL_GAP
  );
}

function standingsCardHeight(standings: ExportStanding[]): number {
  return SECTION_PAD * 2 + SECTION_TITLE_HEIGHT + standings.length * STANDING_ROW_HEIGHT;
}

function matchesCardHeight(model: ResultsExportModel): number {
  const note = model.note ? NOTE_HEIGHT : 0;
  return SECTION_PAD * 2 + SECTION_TITLE_HEIGHT + model.matches.length * TEXT_ROW_HEIGHT + note;
}

function statsCardHeight(stats: ResultsExportModel["stats"]): number {
  return SECTION_PAD * 2 + SECTION_TITLE_HEIGHT + stats.length * TEXT_ROW_HEIGHT;
}

/** The card frame every section shares. Returns the x of its content column. */
function drawCard(
  ctx: CanvasRenderingContext2D,
  top: number,
  height: number,
  stroke: string,
): number {
  roundedRect(ctx, MARGIN, top, WIDTH - MARGIN * 2, height, CARD_RADIUS);
  ctx.fillStyle = CARD_FILL;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.stroke();

  return MARGIN + SECTION_PAD;
}

function drawSectionTitle(ctx: CanvasRenderingContext2D, title: string, left: number, top: number) {
  ctx.fillStyle = MUTED_COLOR;
  ctx.font = `800 36px ${FONT_STACK}`;
  ctx.fillText(title, left, top + SECTION_PAD + 36);
}

function drawChampionCard(
  ctx: CanvasRenderingContext2D,
  label: string,
  champion: ExportChampion,
  top: number,
) {
  const left = drawCard(ctx, top, championCardHeight(champion), champion.color);
  const contentWidth = WIDTH - MARGIN * 2 - SECTION_PAD * 2;

  ctx.fillStyle = MUTED_COLOR;
  ctx.font = `800 28px ${FONT_STACK}`;
  ctx.fillText(`🏆 ${label}`, left, top + SECTION_PAD + 28);

  ctx.fillStyle = champion.color;
  ctx.font = `800 56px ${FONT_STACK}`;
  ctx.fillText(champion.name, left, top + SECTION_PAD + 92);

  ctx.fillStyle = PLAYER_COLOR;
  ctx.font = `700 30px ${FONT_STACK}`;
  ctx.fillText(champion.record, left, top + SECTION_PAD + 134);

  const columnWidth = (contentWidth - 24) / 2;
  champion.players.forEach((name, i) => {
    const x = left + (i % 2) * (columnWidth + 24);
    const y = top + SECTION_PAD + 142 + Math.floor(i / 2) * (PILL_HEIGHT + PILL_GAP);

    roundedRect(ctx, x, y, columnWidth, PILL_HEIGHT, 18);
    ctx.fillStyle = PILL_FILL;
    ctx.fill();
    ctx.strokeStyle = PILL_STROKE;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = PLAYER_COLOR;
    ctx.font = `600 30px ${FONT_STACK}`;
    ctx.fillText(truncate(ctx, name, columnWidth - 36), x + 20, y + 42);
  });
}

function drawStandingsCard(
  ctx: CanvasRenderingContext2D,
  standings: ExportStanding[],
  top: number,
) {
  const left = drawCard(ctx, top, standingsCardHeight(standings), PILL_STROKE);
  const right = WIDTH - MARGIN - SECTION_PAD;
  drawSectionTitle(ctx, "Classificação", left, top);

  standings.forEach((row, i) => {
    const y = top + SECTION_PAD + SECTION_TITLE_HEIGHT + i * STANDING_ROW_HEIGHT + 42;

    ctx.fillStyle = FAINT_COLOR;
    ctx.font = `800 34px ${FONT_STACK}`;
    ctx.fillText(`${row.position}º`, left, y);

    ctx.fillStyle = row.color;
    ctx.font = `800 36px ${FONT_STACK}`;
    ctx.fillText(row.name, left + 70, y);

    ctx.textAlign = "right";
    ctx.fillStyle = PLAYER_COLOR;
    ctx.font = `700 32px ${FONT_STACK}`;
    ctx.fillText(`${row.wins}V · ${row.losses}D`, right - 250, y);

    ctx.fillStyle = MUTED_COLOR;
    ctx.fillText(`+${row.pointDiff}`, right - 140, y);

    ctx.fillStyle = FAINT_COLOR;
    ctx.font = `700 30px ${FONT_STACK}`;
    ctx.fillText(`${row.pointsFor} pts`, right, y);
    ctx.textAlign = "left";
  });
}

function drawMatchesCard(ctx: CanvasRenderingContext2D, model: ResultsExportModel, top: number) {
  const left = drawCard(ctx, top, matchesCardHeight(model), PILL_STROKE);
  const contentWidth = WIDTH - MARGIN * 2 - SECTION_PAD * 2;
  drawSectionTitle(ctx, "Partidas", left, top);

  const bodyTop = top + SECTION_PAD + SECTION_TITLE_HEIGHT;
  model.matches.forEach((match, i) => {
    const y = bodyTop + i * TEXT_ROW_HEIGHT + 34;

    ctx.fillStyle = match.excluded ? FAINT_COLOR : PLAYER_COLOR;
    ctx.font = `600 32px ${FONT_STACK}`;
    const suffix = match.excluded ? "  (ajuste)" : "";
    ctx.fillText(truncate(ctx, `${match.label}${suffix}`, contentWidth), left, y);
  });

  if (model.note) {
    ctx.fillStyle = FAINT_COLOR;
    ctx.font = `600 26px ${FONT_STACK}`;
    ctx.fillText(
      truncate(ctx, model.note, contentWidth),
      left,
      bodyTop + model.matches.length * TEXT_ROW_HEIGHT + 30,
    );
  }
}

function drawStatsCard(
  ctx: CanvasRenderingContext2D,
  stats: ResultsExportModel["stats"],
  top: number,
) {
  const left = drawCard(ctx, top, statsCardHeight(stats), PILL_STROKE);
  const right = WIDTH - MARGIN - SECTION_PAD;
  drawSectionTitle(ctx, "Estatísticas", left, top);

  stats.forEach((row, i) => {
    const y = top + SECTION_PAD + SECTION_TITLE_HEIGHT + i * TEXT_ROW_HEIGHT + 34;

    ctx.fillStyle = MUTED_COLOR;
    ctx.font = `600 30px ${FONT_STACK}`;
    ctx.fillText(row.label, left, y);

    ctx.textAlign = "right";
    ctx.fillStyle = PLAYER_COLOR;
    ctx.font = `700 30px ${FONT_STACK}`;
    ctx.fillText(truncate(ctx, row.value, 560), right, y);
    ctx.textAlign = "left";
  });
}
