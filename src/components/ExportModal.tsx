import { useEffect, useState } from "react";
import {
  downloadTeamsImage,
  renderTeamsImage,
  shareTeamsImage,
  type ExportModel,
} from "../export/teams-image";

export type ExportVariant = { model: ExportModel; filename: string };

type Props = {
  teamsOnly: ExportVariant;
  withSwaps: ExportVariant;
  onClose: () => void;
};

const TABS = [
  { key: "teams", label: "Só os times", hint: "Só os times e os nomes — sem pontuação e sem sugestões." },
  { key: "swaps", label: "Times + trocas", hint: "Os times mais as trocas de baixo impacto, para o grupo pedir troca antes do jogo." },
] as const;

/**
 * Shows the PNG that would be sent to the group before anything leaves the
 * device. Both variants are painted from a model that carries names only —
 * the "trocas" one adds the ±shift numbers, never the Elo behind them.
 */
export function ExportModal({ teamsOnly, withSwaps, onClose }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("teams");
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);

  const variant = tab === "teams" ? teamsOnly : withSwaps;
  const { model, filename } = variant;

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    setImage(null);
    setFailed(false);

    renderTeamsImage(model)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [model]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-4 max-h-full overflow-y-auto">
        <div>
          <h3 className="text-xl font-black text-white">Exportar imagem</h3>
          <p className="text-zinc-400 text-sm mt-1">
            {TABS.find((t) => t.key === tab)!.hint}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-black p-1 rounded-xl border border-zinc-800">
          {TABS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={tab === option.key}
              onClick={() => setTab(option.key)}
              className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                tab === option.key ? "bg-zinc-800 text-white" : "text-zinc-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {failed && <p className="text-red-400 text-sm">Não foi possível gerar a imagem.</p>}
        {!failed && !image && <p className="text-zinc-500 text-sm">Gerando…</p>}
        {image && (
          <img
            src={image.url}
            alt={model.title}
            className="w-full max-h-[55vh] object-contain rounded-2xl border border-zinc-800"
          />
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-transparent border border-zinc-700 text-white font-bold py-3 rounded-xl"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={!image}
            onClick={() => image && downloadTeamsImage(image.blob, filename)}
            className="flex-1 border border-zinc-700 text-white font-bold py-3 rounded-xl disabled:opacity-30"
          >
            Baixar
          </button>
          <button
            type="button"
            disabled={!image}
            onClick={() => image && shareTeamsImage(image.blob, filename)}
            className="flex-1 bg-emerald-500 text-black font-black py-3 rounded-xl disabled:opacity-30"
          >
            Compartilhar
          </button>
        </div>
      </div>
    </div>
  );
}
