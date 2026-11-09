import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";

/** Contrôles de fenêtre dessinés dans l'application quand Tauri masque le cadre système. */
export default function DesktopWindowControls() {
  if (!isTauri()) return null;

  const appWindow = getCurrentWindow();
  const controls = [
    {
      label: "Fermer la fenêtre",
      color: "#ff5f57",
      action: () => appWindow.close(),
    },
    {
      label: "Réduire la fenêtre",
      color: "#febc2e",
      action: () => appWindow.minimize(),
    },
    {
      label: "Agrandir ou restaurer la fenêtre",
      color: "#28c840",
      action: () => appWindow.toggleMaximize(),
    },
  ];

  return (
    <div
      className="relative flex h-9 shrink-0 items-center gap-2 border-b border-line bg-panel px-3"
      data-tauri-drag-region
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) {
          void appWindow.toggleMaximize().catch(() => {});
        }
      }}
      aria-label="Contrôles de la fenêtre"
    >
      {controls.map(({ label, color, action }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => void action().catch(() => {})}
          className="h-3 w-3 rounded-full border border-black/15 transition-[filter] hover:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{ backgroundColor: color }}
        />
      ))}
      <span className="pointer-events-none absolute start-1/2 -translate-x-1/2 text-[11px] font-medium text-ink3">
        Kiebitz
      </span>
    </div>
  );
}
