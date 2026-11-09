import { Button } from "./ui";
import type { OnlineResult } from "../pages/OnlinePlay";

const RESULT_TEXT: Record<OnlineResult, string> = {
  win: "Vous avez gagné !",
  loss: "Vous avez perdu.",
  draw: "Partie nulle.",
};

export default function OnlineResultDialog({ result, onViewAnalysis }: {
  result: OnlineResult;
  onViewAnalysis: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="online-result-title"
        className="w-full max-w-[340px] rounded-xl border border-line bg-panel p-5 text-center shadow-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink3">Partie terminée</p>
        <h2 id="online-result-title" className="mt-2 text-[22px] font-semibold text-ink">{RESULT_TEXT[result]}</h2>
        <p className="mt-2 text-[13px] text-ink2">Votre partie est enregistrée. L’analyse démarre automatiquement.</p>
        <div className="mt-5"><Button primary onClick={onViewAnalysis}>Voir l’analyse</Button></div>
      </div>
    </div>
  );
}
