import { useState, type FormEvent } from "react";

const STORAGE_KEY = "kiebitz.youtube.videos";

export function youtubeId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.split("/")[1];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export default function Videos() {
  const [ids, setIds] = useState<string[]>(() => {
    try { const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(data) ? data.filter((id): id is string => typeof id === "string" && /^[\w-]{11}$/.test(id)) : []; }
    catch { return []; }
  });
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const save = (next: string[]) => { setIds(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); };
  const add = (event: FormEvent) => {
    event.preventDefault();
    const id = youtubeId(input);
    if (!id) { setError("Saisis une URL de vidéo YouTube valide."); return; }
    save(ids.includes(id) ? ids : [...ids, id]); setSelected(id); setInput(""); setError("");
  };
  return <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
    <h1 className="page-title text-[21px] font-semibold">Vidéos YouTube</h1>
    <form onSubmit={add} className="flex flex-wrap gap-2">
      <input aria-label="URL YouTube" value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-ink" />
      <button className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink" type="submit">Importer</button>
    </form>
    {error && <p role="alert" className="text-loss">{error}</p>}
    {selected && <div className="aspect-video overflow-hidden rounded-xl bg-black"><iframe className="h-full w-full" title="Lecteur vidéo YouTube" src={`https://www.youtube-nocookie.com/embed/${selected}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>}
    <div className="space-y-2">{ids.map((id, index) => <div key={id} className="flex items-center gap-2 rounded-lg border border-line bg-panel p-3"><button type="button" onClick={() => setSelected(id)} className="min-w-0 flex-1 truncate text-left text-accent">Vidéo {index + 1} · {id}</button><button type="button" aria-label={`Supprimer la vidéo ${index + 1}`} onClick={() => { save(ids.filter((item) => item !== id)); if (selected === id) setSelected(null); }} className="text-ink2">Supprimer</button></div>)}</div>
  </main>;
}
