import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { ChevronRight, Trash2 } from "lucide-react";
import Board from "../components/Board";
import { Button } from "../components/ui";
import { useBoardSelection } from "../lib/boardMoves";
import { repAddLine, repList, repUnmarkKnown, type RepNode } from "../lib/repertoire";
import { useT } from "../lib/i18n";
import { confirmRepertoireLine } from "../lib/repertoireConfirm";
import { replaySans } from "../lib/position";

type Side = "white" | "black";

function pathOf(byId: Map<number, RepNode>, node: RepNode): string[] {
  const path: string[] = [];
  let current: RepNode | undefined = node;
  for (let i = 0; current && i < 80; i++) {
    path.unshift(current.san);
    current = byId.get(current.parent_id);
  }
  return path;
}

function moveLabel(node: RepNode): string {
  return `${Math.ceil(node.depth / 2)}${node.depth % 2 ? "." : "…"}${node.san}`;
}

function KnowledgeBranch({ node, children, selectedId, maxDepth, onPick, onRemove }: {
  node: RepNode;
  children: Map<number, RepNode[]>;
  selectedId: number | null;
  maxDepth: number;
  onPick: (node: RepNode) => void;
  onRemove: (node: RepNode) => void;
}) {
  const next = children.get(node.id) ?? [];
  return (
    <li className="border-l border-line pl-3">
      <div className="flex items-center gap-1 py-0.5">
        <button type="button" onClick={() => onPick(node)} aria-pressed={selectedId === node.id}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-panel3 ${selectedId === node.id ? "bg-accent-soft text-accent" : "text-ink2"}`}>
          <ChevronRight size={13} className="shrink-0" />
          <span className="font-medium">{moveLabel(node)}</span>
          {node.name && <span className="truncate text-[12px] text-ink3">{node.name}</span>}
        </button>
        {next.length === 0 && (
          <button type="button" onClick={() => onRemove(node)}
            aria-label={`Retirer ${moveLabel(node)} de la base de connaissance`}
            title="Retirer de la base de connaissance et remettre au répertoire"
            className="rounded-md p-1.5 text-ink3 hover:bg-panel3 hover:text-loss">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {node.depth < maxDepth && next.length > 0 && (
        <ul className="ml-2">
          {next.map((child) => <KnowledgeBranch key={child.id} node={child} children={children}
            selectedId={selectedId} maxDepth={maxDepth} onPick={onPick} onRemove={onRemove} />)}
        </ul>
      )}
    </li>
  );
}

export default function Knowledge() {
  const t = useT();
  const [nodes, setNodes] = useState<RepNode[]>([]);
  const [side, setSide] = useState<Side>("white");
  const [sans, setSans] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const refresh = useCallback(() => { void repList().then(setNodes).catch((reason) => setNotice(String(reason))); }, []);
  useEffect(refresh, [refresh]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const children = useMemo(() => {
    const map = new Map<number, RepNode[]>();
    for (const node of nodes) {
      if (!node.known) continue;
      map.set(node.parent_id, [...(map.get(node.parent_id) ?? []), node]);
    }
    for (const branch of map.values()) branch.sort((a, b) => (a.sort_order || a.id) - (b.sort_order || b.id));
    return map;
  }, [nodes]);
  const roots = (children.get(0) ?? []).filter((node) => node.side === side);
  const focus = focusId != null ? byId.get(focusId) : undefined;
  const focusChildren = focus?.known ? (children.get(focus.id) ?? []) : [];
  const knownCount = nodes.filter((node) => node.known && (children.get(node.id)?.length ?? 0) === 0).length;
  const position = useMemo(() => replaySans(sans), [sans]);
  const existingPath = useMemo(() => {
    let parent = 0;
    for (const san of sans) {
      const node = nodes.find((value) => value.side === side && value.parent_id === parent && value.san === san);
      if (!node) return false;
      parent = node.id;
    }
    return true;
  }, [sans, side, nodes]);
  const play = (from: string, to: string): boolean => {
    try {
      const chess = new Chess(position.fen);
      const move = chess.move({ from, to, promotion: "q" });
      setSans((current) => [...current, move.san]);
      setSelectedId(null);
      setNotice("");
      return true;
    } catch { return false; }
  };
  const selection = useBoardSelection(position.fen, play);
  const pick = (node: RepNode, openTree: boolean) => {
    setSans(pathOf(byId, node));
    setSelectedId(node.id);
    if (openTree) setFocusId(node.id);
    setNotice("");
  };
  const remove = async (node: RepNode, descendants = false) => {
    try {
      await repUnmarkKnown(node.id, descendants);
      if (focusId === node.id) setFocusId(null);
      setSelectedId(null);
      setNotice("Ligne retirée de la base de connaissance et remise au répertoire.");
      refresh();
    } catch (reason) { setNotice(String(reason)); }
  };
  const addToRepertoire = async () => {
    if (!sans.length || existingPath) return;
    if (!confirmRepertoireLine(t, sans)) return;
    const moveSide: Side = sans.length % 2 === 1 ? "white" : "black";
    try {
      await repAddLine(moveSide, "", sans);
      setSide(moveSide);
      setNotice("Ligne ajoutée au répertoire.");
      refresh();
    } catch (reason) { setNotice(String(reason)); }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <h1 className="page-title text-[21px] font-semibold">Base de connaissance</h1>
      <p className="mt-1 text-[13px] text-ink3">{knownCount} lignes connues · explore les trois premiers demi-coups, puis ouvre une branche pour voir sa suite.</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,640px)_minmax(340px,1fr)]">
        <div>
          <Board boardId="knowledge-board" fen={position.fen} width={640} orientation={side} draggable
            onPieceDrop={play} onSquareClick={selection.onSquareClick} squareStyles={selection.squareStyles} mouseDrag />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => { setSans((current) => current.slice(0, -1)); setSelectedId(null); }} disabled={!sans.length}>Coup précédent</Button>
            <Button onClick={() => { setSans([]); setFocusId(null); setSelectedId(null); }}>Position initiale</Button>
            {!existingPath && <Button primary onClick={() => void addToRepertoire()}>Ajouter au répertoire</Button>}
          </div>
          <nav aria-label="Coups parcourus" className="mt-3 flex flex-wrap gap-1 text-[13px]">
            {sans.map((san, i) => (
              <button key={`${i}-${san}`} type="button" onClick={() => { setSans(sans.slice(0, i + 1)); setSelectedId(null); }}
                className="rounded px-1.5 py-0.5 text-ink2 hover:bg-panel2 hover:text-accent">
                {i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ""}{san}
              </button>
            ))}
          </nav>
          {notice && <p role="status" className="mt-2 text-[13px]">{notice}</p>}
        </div>
        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">Arbre principal · 3 demi-coups</h2>
              <div className="flex gap-1 rounded-lg bg-panel2 p-1">
                {(["white", "black"] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={side === value}
                    onClick={() => { setSide(value); setSans([]); setFocusId(null); setSelectedId(null); }}
                    className={`rounded-md px-2.5 py-1 text-[12px] ${side === value ? "bg-panel3 font-semibold text-ink" : "text-ink3"}`}>
                    {value === "white" ? "Blancs" : "Noirs"}
                  </button>
                ))}
              </div>
            </div>
            {roots.length === 0 ? <p className="mt-3 text-[13px] text-ink3">Aucune ligne connue pour ce côté.</p> : (
              <ul className="mt-3 max-h-[320px] overflow-auto">
                {roots.map((node) => <KnowledgeBranch key={node.id} node={node} children={children}
                  selectedId={selectedId} maxDepth={3} onPick={(picked) => pick(picked, true)} onRemove={(picked) => void remove(picked)} />)}
              </ul>
            )}
          </section>
          <section className="rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">{focus ? `Suite après ${pathOf(byId, focus).join(" ")}` : "Suite de la branche"}</h2>
              {focus?.known && focusChildren.length > 0 && <Button onClick={() => void remove(focus, true)}>Retirer cette branche</Button>}
            </div>
            {!focus && <p className="mt-3 text-[13px] text-ink3">Clique sur un coup de l’arbre principal pour ouvrir ses variantes.</p>}
            {focus && focusChildren.length === 0 && <p className="mt-3 text-[13px] text-ink3">Cette ligne ne comporte pas encore de suite connue.</p>}
            {focusChildren.length > 0 && (
              <ul className="mt-3 max-h-[440px] overflow-auto">
                {focusChildren.map((node) => <KnowledgeBranch key={node.id} node={node} children={children}
                  selectedId={selectedId} maxDepth={80} onPick={(picked) => pick(picked, false)} onRemove={(picked) => void remove(picked)} />)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
