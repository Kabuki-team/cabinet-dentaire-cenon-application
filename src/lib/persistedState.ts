import { useEffect, useMemo, useState } from 'react';

/**
 * État d'interface conservé le temps de la session : période, filtres, recherches.
 *
 * `sessionStorage` et non `localStorage` : ce sont des préférences de navigation, pas des
 * réglages. Elles doivent survivre à un aller-retour entre pages, pas à la fermeture du
 * poste — un secrétariat qui rouvre l'app le lendemain attend un écran neutre. Même
 * support que le drapeau d'authentification, donc même durée de vie.
 */

const PREFIX = 'cenon.ui.';

function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = sessionStorage.getItem(PREFIX + cle);
    return brut === null ? defaut : (JSON.parse(brut) as T);
  } catch {
    return defaut; // navigation privée, quota, valeur corrompue : on repart du défaut
  }
}

export function usePersistedState<T>(cle: string, defaut: T) {
  const [valeur, setValeur] = useState<T>(() => lire(cle, defaut));

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIX + cle, JSON.stringify(valeur));
    } catch {
      /* stockage indisponible : l'état reste seulement en mémoire */
    }
  }, [cle, valeur]);

  return [valeur, setValeur] as const;
}

export interface Periode {
  start: Date | null;
  end: Date | null;
}

const isoDe = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];

/** Midi pour éviter le recul d'un jour selon le fuseau (cf. dateUtils). */
export const dateDepuisISO = (iso: string) => new Date(iso + 'T12:00:00');

export function moisCourant(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

/**
 * Période partagée par Dashboard, Revenus et la fiche praticien : changer la période sur
 * l'un la retrouve sur les autres. `null` signifie « pas de sélection explicite », ce que
 * ces pages interprètent déjà comme le mois courant.
 */
export function usePeriodePartagee(): [Periode, (start: Date | null, end: Date | null) => void] {
  const [iso, setIso] = usePersistedState<{ debut: string; fin: string } | null>('periode', null);

  const periode = useMemo<Periode>(() => ({
    start: iso ? dateDepuisISO(iso.debut) : null,
    end: iso ? dateDepuisISO(iso.fin) : null,
  }), [iso]);

  const majPeriode = (start: Date | null, end: Date | null) =>
    setIso(start && end ? { debut: isoDe(start), fin: isoDe(end) } : null);

  return [periode, majPeriode];
}
