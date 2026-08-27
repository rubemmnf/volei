import { useEffect, useState } from "react";
import { canShareImage, shareImage } from "../export/share";

/** One image the organizer can send to the group. */
export type ExportTab = {
  key: string;
  label: string;
  hint: string;
  /** Alt text for the preview — the image's own title reads best here. */
  alt: string;
  filename: string;
  render: () => Promise<Blob>;
};

type Props = {
  tabs: ExportTab[];
  onClose: () => void;
};

/**
 * Shows the PNG that would be sent to the group before anything leaves the
 * device. Every tab is painted from a model that carries names and scores only,
 * never the Elo behind them. A single tab hides the switcher.
 */
export function ExportModal({ tabs, onClose }: Props) {
  const [key, setKey] = useState(tabs[0].key);
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);

  const tab = tabs.find((option) => option.key === key) ?? tabs[0];
  const { render, filename } = tab;

  // One action, not two: sharing already falls back to a download on its own,
  // so a separate download button would only cost the organizer a click.
  const canShare = canShareImage();

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    setImage(null);
    setFailed(false);

    render()
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
    // The key identifies which image to paint. `render` is a fresh closure on
    // every parent render, so depending on it would repaint forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.key]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-4 max-h-full overflow-y-auto">
        <div>
          <h3 className="text-xl font-black text-white">Exportar imagem</h3>
          <p className="text-zinc-400 text-sm mt-1">{tab.hint}</p>
        </div>

        {tabs.length > 1 && (
          <div className="grid grid-cols-2 gap-1 bg-black p-1 rounded-xl border border-zinc-800">
            {tabs.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={option.key === tab.key}
                onClick={() => setKey(option.key)}
                className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                  option.key === tab.key ? "bg-zinc-800 text-white" : "text-zinc-500"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {failed && <p className="text-red-400 text-sm">Não foi possível gerar a imagem.</p>}
        {!failed && !image && <p className="text-zinc-500 text-sm">Gerando…</p>}
        {image && (
          <img
            src={image.url}
            alt={tab.alt}
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
            onClick={() => image && shareImage(image.blob, filename)}
            className="flex-1 bg-emerald-500 text-black font-black py-3 rounded-xl disabled:opacity-30"
          >
            {canShare ? "Compartilhar" : "Baixar"}
          </button>
        </div>
      </div>
    </div>
  );
}
