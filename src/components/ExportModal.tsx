import { useEffect, useState } from "react";
import {
  downloadTeamsImage,
  renderTeamsImage,
  shareTeamsImage,
  type ExportModel,
} from "../export/teams-image";

type Props = {
  model: ExportModel;
  filename: string;
  onClose: () => void;
};

/**
 * Shows the PNG that would be sent to the group before anything leaves the
 * device. The image is painted from `model`, which carries names only.
 */
export function ExportModal({ model, filename, onClose }: Props) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

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
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-4">
        <div>
          <h3 className="text-xl font-black text-white">Exportar imagem</h3>
          <p className="text-zinc-400 text-sm mt-1">
            Só os times e os nomes — sem pontuação e sem sugestões.
          </p>
        </div>

        {failed && <p className="text-red-400 text-sm">Não foi possível gerar a imagem.</p>}
        {!failed && !image && <p className="text-zinc-500 text-sm">Gerando…</p>}
        {image && (
          <img
            src={image.url}
            alt={model.title}
            className="w-full rounded-2xl border border-zinc-800"
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
