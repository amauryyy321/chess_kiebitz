import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Swords, UserRound } from "lucide-react";
import Board from "../components/Board";
import { Button } from "../components/ui";
import { useBoardSelection } from "../lib/boardMoves";
import { lichessToken } from "../lib/lichess";
import { importLichessGame } from "../lib/importer";
import { gameIdBySource, upsertGames, type GameRecord } from "../lib/db";
import { boardAccount, boardEvents, boardGame, boardMove, boardPlaying, boardResign, seekRatedGame, type BoardGameFull, type BoardGameState } from "../lib/lichessBoard";
import { legalPremove, makePremove, projectPremoves, type Premove } from "../lib/premoves";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const LAST_MOVE_YELLOW = "rgba(250, 204, 21, 0.55)";
const PREMOVE_BLUE = "rgba(87, 156, 241, 0.48)";
export type OnlineResult = "win" | "loss" | "draw";

function PlayerBar({ name, rating, clock, moving, mine }: {
  name: string;
  rating?: number;
  clock: string;
  moving: boolean;
  mine: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel3 text-ink2"><UserRound size={19} /></span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-ink">{name}</span>
          <span className="block text-[11px] text-ink3">{mine ? "Vous" : "Adversaire"}{rating != null ? ` · ${rating}` : ""}</span>
        </span>
      </div>
      <span className={`min-w-[84px] rounded-lg px-3 py-1.5 text-center font-mono text-[19px] font-semibold tabular-nums ${moving ? "bg-accent text-accent-ink" : "bg-panel2 text-ink2"}`}>
        {clock}
      </span>
    </div>
  );
}

function fallbackRecord(full: BoardGameFull, state: BoardGameState, user: string): GameRecord {
  const chess = new Chess();
  for (const uci of state.moves.split(" ").filter(Boolean)) {
    try { chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); }
    catch { break; }
  }
  const white = full.white.id.toLowerCase() === user.toLowerCase();
  const color = white ? "white" : "black";
  const mine = white ? full.white : full.black;
  const other = white ? full.black : full.white;
  const now = Date.now();
  return {
    id: null, source: "lichess", source_id: full.id, url: `https://lichess.org/${full.id}`,
    played_at: new Date(now).toISOString().slice(0, 10), played_ts: Math.floor(now / 1000),
    time_class: (full as BoardGameFull & { speed?: string }).speed ?? "blitz", color,
    my_name: mine.name, opponent: other.name, my_elo: mine.rating ?? 0, opp_elo: other.rating ?? 0,
    result: state.winner ? state.winner === color ? "win" : "loss" : "draw",
    termination: state.status === "resign" ? "resign" : state.status === "mate" ? "mate" : "",
    opening: "", eco: "", moves_count: Math.ceil(chess.history().length / 2), accuracy: null,
    moves: chess.history().join(" "), note: "", analyzed: false,
    variant: "standard", start_fen: "", time_control: `${Math.round(full.clock?.initial ?? 300000) / 1000}+${Math.round((full.clock?.increment ?? 0) / 1000)}`,
  };
}

export default function OnlinePlay({
  onRecorded,
  onConnectionIssue,
}: {
  onRecorded: (gameId: number, result: OnlineResult | null, notice?: string) => void;
  onConnectionIssue: (notice: string) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [gameId, setGameId] = useState<string | null>(null);
  const [full, setFull] = useState<BoardGameFull | null>(null);
  const [state, setState] = useState<BoardGameState | null>(null);
  const [stateAt, setStateAt] = useState(Date.now());
  const [clockNow, setClockNow] = useState(Date.now());
  const [seeking, setSeeking] = useState<5 | 10 | null>(null);
  const [busyMove, setBusyMove] = useState(false);
  const [premoves, setPremoves] = useState<Premove[]>([]);
  const [pendingMove, setPendingMove] = useState<{ ply: number; fen: string } | null>(null);
  const submittedAtPly = useRef<number | null>(null);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [error, setError] = useState("");
  const seekAbort = useRef<AbortController | null>(null);
  const finished = useRef(false);
  const callbackRef = useRef({ onRecorded, onConnectionIssue });
  callbackRef.current = { onRecorded, onConnectionIssue };
  useEffect(() => {
    setViewPly(null);
    setPremoves([]);
    setPendingMove(null);
    submittedAtPly.current = null;
  }, [gameId]);
  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void lichessToken().then(async (value) => {
      if (!active) return;
      setToken(value);
      if (!value) return;
      try {
        const account = await boardAccount(value);
        if (active) setUser(account.id || account.username);
      } catch (reason) { if (active) setError(String(reason)); }
    });
    return () => { active = false; seekAbort.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    const abort = new AbortController();
    const connect = async () => {
      while (!abort.signal.aborted) {
        try {
          await boardEvents(token, abort.signal, (id) => {
            seekAbort.current?.abort();
            setSeeking(null);
            setGameId(id);
          });
          if (!abort.signal.aborted) setError("Flux Lichess interrompu. Reconnexion en cours …");
        } catch (reason) {
          if (!abort.signal.aborted) setError(`Connexion Lichess interrompue : ${String(reason)}. Reconnexion en cours …`);
        }
        if (!abort.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    };
    void connect();
    return () => abort.abort();
  }, [token, user]);

  // The event stream is authoritative, but a seek may pair before it has
  // actually opened. The account endpoint also restores a game after restart.
  useEffect(() => {
    if (!token || !user || gameId) return;
    let active = true;
    const recover = async () => {
      try {
        const games = await boardPlaying(token);
        if (active && games.length > 0) {
          seekAbort.current?.abort();
          setSeeking(null);
          setGameId(games[0]);
          setError("");
        }
      } catch (reason) {
        if (active && seeking) setError(`Recherche de la partie en cours : ${String(reason)}`);
      }
    };
    void recover();
    const interval = setInterval(() => void recover(), 4000);
    return () => { active = false; clearInterval(interval); };
  }, [token, user, gameId, seeking]);

  const startSeek = (minutes: 5 | 10) => {
    if (!token || seeking || gameId) return;
    setError("");
    const abort = new AbortController();
    seekAbort.current = abort;
    setSeeking(minutes);
    void seekRatedGame(token, minutes, abort.signal)
      .catch((reason) => { if (!abort.signal.aborted) setError(String(reason)); })
      .finally(() => setSeeking(null));
  };

  useEffect(() => {
    if (!token || !gameId) return;
    const abort = new AbortController();
    const connect = async () => {
      while (!abort.signal.aborted && !finished.current) {
        try {
          await boardGame(token, gameId, abort.signal, (event) => {
            if (event.type === "gameFull") {
              setFull(event);
              setState(event.state);
            } else setState(event);
            setStateAt(Date.now());
            setError("");
          });
        } catch (reason) {
          if (!abort.signal.aborted) setError(`Connexion Lichess interrompue : ${String(reason)}. Reconnexion en cours …`);
        }
        if (!abort.signal.aborted && !finished.current) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    };
    void connect();
    return () => abort.abort();
  }, [token, gameId]);

  useEffect(() => {
    if (!state || state.status === "started" || !gameId || !full || !user || finished.current) return;
    finished.current = true;
    const complete = async () => {
      let record: GameRecord;
      let notice: string | undefined;
      try { record = await importLichessGame(user, gameId); }
      catch (reason) {
        record = fallbackRecord(full, state, user);
        notice = `L'export Lichess a échoué (${String(reason)}). Les coups reçus ont été enregistrés localement.`;
      }
      await upsertGames([record]);
      const localId = await gameIdBySource("lichess", gameId);
      if (localId == null) throw new Error("Partie enregistrée, mais introuvable dans la base locale.");
      const result: OnlineResult | null = state.status === "aborted" || state.status === "noStart"
        ? null : state.winner ? state.winner === (full.white.id.toLowerCase() === user.toLowerCase() ? "white" : "black") ? "win" : "loss" : "draw";
      callbackRef.current.onRecorded(localId, result, notice);
    };
    void complete().catch((reason) => callbackRef.current.onConnectionIssue(`Enregistrement impossible : ${String(reason)}`));
  }, [state, full, gameId, user]);

  const chess = useMemo(() => {
    const position = new Chess(START_FEN);
    for (const uci of state?.moves.split(" ").filter(Boolean) ?? []) {
      try { position.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); }
      catch { break; }
    }
    return position;
  }, [state?.moves]);
  const positions = useMemo(() => {
    const replay = new Chess(START_FEN);
    const steps: { fen: string; lastMove: { from: string; to: string } | null; san: string }[] = [
      { fen: replay.fen(), lastMove: null, san: "" },
    ];
    for (const uci of state?.moves.split(" ").filter(Boolean) ?? []) {
      try {
        const move = replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        steps.push({ fen: replay.fen(), lastMove: { from: move.from, to: move.to }, san: move.san });
      } catch { break; }
    }
    return steps;
  }, [state?.moves]);
  const livePly = positions.length - 1;
  useEffect(() => {
    setPendingMove((pending) => pending && livePly > pending.ply ? null : pending);
  }, [livePly]);
  const shownPly = viewPly == null ? livePly : Math.min(viewPly, livePly);
  const shown = positions[shownPly];
  const reviewing = shownPly < livePly;
  const showPly = (ply: number) => setViewPly(ply >= livePly ? null : ply);
  const color = !full || full.white.id.toLowerCase() === user.toLowerCase() ? "white" : "black";
  const myTurn = !pendingMove && chess.turn() === (color === "white" ? "w" : "b");
  const liveFen = pendingMove && livePly === pendingMove.ply ? pendingMove.fen : shown.fen;
  const active = state?.status === "started";
  const plannedFen = useMemo(() => {
    if (!active || myTurn || reviewing) return shown.fen;
    try { return projectPremoves(liveFen, color, premoves); }
    catch { return liveFen; }
  }, [active, myTurn, reviewing, shown.fen, liveFen, color, premoves]);
  const queuePremove = (from: string, to: string): boolean => {
    if (!active || myTurn || reviewing) return false;
    const planned = makePremove(plannedFen, color, from, to);
    if (!planned) return false;
    setPremoves((current) => [...current, planned]);
    return true;
  };

  // Submit only after an authoritative position gives us the turn. One
  // planned move is consumed per turn; the rest remain available for later.
  useEffect(() => {
    if (!active || !myTurn || !token || !gameId || !premoves.length || busyMove) return;
    const ply = chess.history().length;
    if (submittedAtPly.current === ply) return;
    submittedAtPly.current = ply;
    const planned = premoves[0];
    if (!legalPremove(chess.fen(), planned)) {
      setPremoves([]);
      setError("La suite anticipée n'est plus légale dans la position reçue. Elle a été annulée.");
      return;
    }
    const optimistic = new Chess(chess.fen());
    optimistic.move({ from: planned.from, to: planned.to, promotion: planned.uci[4] ?? "q" });
    setPendingMove({ ply, fen: optimistic.fen() });
    setPremoves((current) => current.slice(1));
    setBusyMove(true);
    void boardMove(token, gameId, planned.uci)
      .catch((reason) => {
        setPremoves([]);
        setPendingMove(null);
        setError(`Coup anticipé refusé par Lichess : ${String(reason)}`);
      })
      .finally(() => setBusyMove(false));
  }, [active, myTurn, token, gameId, premoves, busyMove, chess]);
  const clockSeconds = (which: "white" | "black") => {
    if (!state) return null;
    const remaining = which === "white" ? state.wtime : state.btime;
    const moving = chess.turn() === (which === "white" ? "w" : "b");
    const adjusted = active && moving ? remaining - (clockNow - stateAt) : remaining;
    return Math.max(0, Math.ceil(adjusted / 1000));
  };
  const clockText = (seconds: number | null) => seconds == null ? "—" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const submit = (from: string, to: string): boolean => {
    if (!token || !gameId || !active || !myTurn || busyMove || reviewing) return false;
    let uci = `${from}${to}`;
    const probe = new Chess(chess.fen());
    try {
      const move = probe.move({ from, to, promotion: "q" });
      if (move.promotion) uci += move.promotion;
    } catch { return false; }
    setPendingMove({ ply: livePly, fen: probe.fen() });
    setBusyMove(true);
    void boardMove(token, gameId, uci)
      .catch((reason) => { setPendingMove(null); setPremoves([]); setError(`Coup refusé par Lichess : ${String(reason)}`); })
      .finally(() => setBusyMove(false));
    return true;
  };
  const planning = !!active && !myTurn && !reviewing;
  const boardFen = planning ? plannedFen : shown.fen;
  const selection = useBoardSelection(boardFen, myTurn ? submit : queuePremove, !!active && !reviewing && (!myTurn || (!busyMove && premoves.length === 0)));
  const squareStyles = {
    ...(shown.lastMove ? {
      [shown.lastMove.from]: { backgroundColor: LAST_MOVE_YELLOW },
      [shown.lastMove.to]: { backgroundColor: LAST_MOVE_YELLOW },
    } : {}),
    ...(planning && premoves.length ? {
      [premoves[premoves.length - 1].from]: { backgroundColor: PREMOVE_BLUE },
      [premoves[premoves.length - 1].to]: { backgroundColor: PREMOVE_BLUE },
    } : {}),
    ...selection.squareStyles,
  };
  const moves = positions.slice(1).map((step) => step.san);
  const topColor = color === "white" ? "black" : "white";
  const me = full ? (color === "white" ? full.white : full.black) : null;
  const opponent = full ? (color === "white" ? full.black : full.white) : null;
  const initialClock = seeking ? `${seeking}:00` : "—";
  const currentClock = (which: "white" | "black") => {
    const seconds = clockSeconds(which);
    return seconds == null ? initialClock : clockText(seconds);
  };
  const status = full ? active ? myTurn ? "À toi de jouer" : "Au tour de l'adversaire" : "Partie terminée · enregistrement et analyse en cours"
    : gameId ? "Connexion à la partie Lichess …"
    : seeking ? `Recherche d'un adversaire en ${seeking === 5 ? "5 + 5" : "10 + 0"} …`
    : token ? "Choisis une cadence pour chercher un adversaire." : "Connecte ton compte Lichess dans les réglages.";

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6">
      <h1 className="page-title mb-5 flex items-center gap-2 text-[21px] font-semibold"><Swords size={20} /> Jouer sur Lichess</h1>
                {!gameId && (
            <div className="flex flex-wrap gap-2 border-b border-line px-4 py-4">
              <Button primary onClick={() => startSeek(5)} disabled={!user || !!seeking}>5 + 5 · classée</Button>
              <Button onClick={() => startSeek(10)} disabled={!user || !!seeking}>Jouer · 10 + 0 classée</Button>
              {seeking && <Button onClick={() => seekAbort.current?.abort()}>Annuler <Loader2 size={14} className="animate-spin" /></Button>}
              <p className="w-full text-[12px] text-ink3">5 + 5 : 5 minutes et 5 secondes ajoutées après chaque coup.</p>
            </div>
          )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,640px)_minmax(300px,1fr)]">
        <div className="min-w-0 space-y-2.5">
          <PlayerBar name={opponent?.name ?? "Adversaire"} rating={opponent?.rating}
            clock={currentClock(topColor)} moving={!!active && chess.turn() === (topColor === "white" ? "w" : "b")} mine={false} />
          <Board boardId="lichess-online" fen={boardFen} width={640} orientation={color}
            draggable={!!active && !reviewing && (!myTurn || (!busyMove && premoves.length === 0))} onPieceDrop={myTurn ? submit : queuePremove}
            onSquareClick={selection.onSquareClick} squareStyles={squareStyles} mouseDrag />
          {reviewing && <p role="status" className="rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-ink2">Tu regardes une ancienne position. La partie et les pendules continuent en direct.</p>}
          {active && premoves.length > 0 && <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-ink2">
            <span>{premoves.length} coup{premoves.length > 1 ? "s" : ""} anticipé{premoves.length > 1 ? "s" : ""} en attente · position prévue en bleu</span>
            <Button onClick={() => setPremoves((current) => current.slice(0, -1))} disabled={busyMove}>Retirer le dernier</Button>
            <Button onClick={() => setPremoves([])} disabled={busyMove}>Tout annuler</Button>
          </div>}
          <PlayerBar name={me?.name ?? (user || "Vous")} rating={me?.rating}
            clock={currentClock(color)} moving={!!active && myTurn} mine />
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Partie en ligne</h2>
              <span className="rounded-md bg-panel3 px-2 py-1 text-[11px] font-medium text-ink2">Standard · classée</span>
            </div>
            <p role="status" className="mt-2 text-[13px] text-ink2">{status}</p>
          </div>
          {!token && <p className="px-4 py-3 text-[13px] text-ink3">Ajoute un jeton Lichess autorisé pour « board:play » dans les réglages.</p>}

          <div className="min-h-[220px] px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink3">
              <span>Coups joués</span>
              {reviewing && <span className="text-accent">Position {shownPly} / {livePly}</span>}
            </div>
            {moves.length === 0 ? <p className="py-5 text-center text-[13px] text-ink3">Les coups de la partie apparaîtront ici.</p> : (
              <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
                {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
                  <div key={i} className={`grid grid-cols-[44px_1fr_1fr] text-[13px] ${i % 2 ? "bg-panel2/70" : "bg-panel"}`}>
                    <span className="px-3 py-1.5 tabular-nums text-ink3">{i + 1}.</span>
                    <button type="button" onClick={() => showPly(i * 2 + 1)}
                      aria-label={`Voir la position après ${i + 1}. ${moves[i * 2]}`}
                      className={`px-2 py-1.5 text-left font-medium text-ink ${shownPly === i * 2 + 1 ? "bg-accent-soft" : ""}`}
                      style={livePly === i * 2 + 1 ? { backgroundColor: "rgba(250, 204, 21, 0.28)" } : undefined}>{moves[i * 2]}</button>
                    {moves[i * 2 + 1] ? <button type="button" onClick={() => showPly(i * 2 + 2)}
                      aria-label={`Voir la position après ${i + 1}… ${moves[i * 2 + 1]}`}
                      className={`px-2 py-1.5 text-left font-medium text-ink ${shownPly === i * 2 + 2 ? "bg-accent-soft" : ""}`}
                      style={livePly === i * 2 + 2 ? { backgroundColor: "rgba(250, 204, 21, 0.28)" } : undefined}>{moves[i * 2 + 1]}</button> : <span />}
                  </div>
                ))}
              </div>
            )}
          </div>
          {livePly > 0 && <div className="flex flex-wrap items-center gap-1 border-t border-line px-4 py-2">
            <Button label="Position initiale" onClick={() => setViewPly(0)} disabled={shownPly === 0}><ChevronsLeft size={16} /></Button>
            <Button label="Coup précédent" onClick={() => setViewPly(Math.max(0, shownPly - 1))} disabled={shownPly === 0}><ChevronLeft size={16} /></Button>
            <Button label="Coup suivant" onClick={() => showPly(shownPly + 1)} disabled={shownPly === livePly}><ChevronRight size={16} /></Button>
            <Button label="Dernier coup" onClick={() => setViewPly(null)} disabled={shownPly === livePly}><ChevronsRight size={16} /></Button>
            {reviewing && <Button onClick={() => setViewPly(null)}>Revenir à la partie</Button>}
          </div>}
          {active && gameId && <div className="border-t border-line px-4 py-3"><Button onClick={() => token && void boardResign(token, gameId).catch((reason) => setError(String(reason)))}>Abandonner</Button></div>}
          {error && <p role="alert" className="border-t border-line px-4 py-3 text-[13px] text-loss">{error}</p>}
        </div>
      </div>
    </div>
  );
}
