/**
 * React-Anbindung an den Plus-Zustand.
 *
 * `usePlus()` liefert den aktuellen Stand samt Feature-Prüfung, `usePlusGate()`
 * beantwortet die einzige Frage, die die Seiten stellen: Ist diese Funktion
 * freigeschaltet, und wenn nicht, wie erkläre ich das.
 */
import type { PlusState } from "./store";
import type { PlusFeature } from "./types";

export interface PlusView extends PlusState {
  /** Gültiges Plus (bezahlt, Trial oder Grace Period). */
  isPlus: boolean;
  /** Läuft gerade der kostenlose Testzeitraum? */
  isTrial: boolean;
  /** Darf der Trial-CTA gezeigt werden? */
  trialEligible: boolean;
  has: (feature: PlusFeature) => boolean;
}

const FREE_STATE: PlusState = {
  loading: false,
  signedIn: false,
  account: null,
  claims: null,
  refreshing: false,
  error: null,
  fetchedAt: null,
  resendAllowedAt: 0,
};

const FREE_VIEW: PlusView = {
  ...FREE_STATE,
  isPlus: false,
  isTrial: false,
  trialEligible: false,
  has: (_feature) => true,
};

/**
 * Alle Funktionen laufen ohne Anmeldung oder Netzwerk-Freischaltung.
 */
export function usePlus(): PlusView {
  return FREE_VIEW;
}

export interface FeatureGate {
  /** Freigeschaltet · die Funktion darf laufen. */
  unlocked: boolean;
  /** Der Plus-Zustand steht noch nicht fest; Vorschau statt Sperrhinweis. */
  pending: boolean;
  plus: PlusView;
}

/**
 * Gate für eine einzelne Funktion.
 *
 * Gesperrte Funktionen bleiben sichtbar: Wer nicht weiß, was es gibt, kauft es
 * auch nicht, und ein plötzlich verschwundener Menüpunkt liest sich wie ein
 * Fehler. Die Seiten zeigen deshalb eine Vorschau und öffnen die gemeinsame
 * Plus-Erklärung.
 */
export function usePlusGate(feature: PlusFeature): FeatureGate {
  const plus = usePlus();
  return {
    unlocked: plus.has(feature),
    pending: false,
    plus,
  };
}
