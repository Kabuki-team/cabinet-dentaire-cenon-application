/**
 * Date utility for French format (DD/MM/YYYY) and ISO format (YYYY-MM-DD)
 */

/**
 * Formats an ISO date string (YYYY-MM-DD) or Date object to French format (DD/MM/YYYY)
 */
export function formatToFrench(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";
  
  if (dateInput instanceof Date) {
    // Utilise UTC pour éviter tout décalage de fuseau
    const d = String(dateInput.getUTCDate()).padStart(2, '0');
    const m = String(dateInput.getUTCMonth() + 1).padStart(2, '0');
    const y = dateInput.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }

  const s = String(dateInput).trim();

  // Handle YYYY-MM-DD (ISO)
  const isoParts = s.split('-');
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    return `${isoParts[2].padStart(2, '0')}/${isoParts[1].padStart(2, '0')}/${isoParts[0]}`;
  }

  // Handle DD/MM/YYYY already in French — return as-is
  const frParts = s.split('/');
  if (frParts.length === 3 && frParts[2].length === 4) {
    return `${frParts[0].padStart(2,'0')}/${frParts[1].padStart(2,'0')}/${frParts[2]}`;
  }

  return s; // Fallback
}

/**
 * Formats a French date string (DD/MM/YYYY) to ISO format (YYYY-MM-DD)
 */
export function formatToISO(frenchDate: string | null | undefined): string {
  if (!frenchDate) return "";
  
  const str = String(frenchDate).trim();
  const parts = str.split(/[\/\-\.]/);
  
  if (parts.length === 3) {
    let d = parts[0].trim();
    let m = parts[1].trim();
    let y = parts[2].trim().split(' ')[0];

    // Handle DD/MM/YYYY
    if (y.length === 4) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // Handle YYYY-MM-DD
    if (d.length === 4) {
      return `${d}-${m.padStart(2, '0')}-${y.padStart(2, '0')}`;
    }
  }

  return str;
}

/**
 * Safe conversion from any date input to ISO YYYY-MM-DD.
 * Handles: Excel numeric dates, DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY.
 * Timezone-safe: all internal calculations use UTC noon to avoid ±1 day drift.
 */
export function toISODate(dateInput: any): string {
  if (!dateInput) return "";
  
  if (dateInput instanceof Date) {
    // Utilise UTC pour éviter tout décalage de fuseau
    const y = dateInput.getUTCFullYear();
    const m = String(dateInput.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  let str = String(dateInput).trim();

  // Excel numeric dates (ex: 36068 → 1998-09-29)
  // La constante 25569 = jours entre 01/01/1900 (Excel) et 01/01/1970 (Unix epoch),
  // elle intègre déjà le faux 29-fév-1900 d'Excel. On cible midi UTC (+0.5j) pour
  // être immunisé contre les décalages de fuseau horaire (±12h max).
  if (!isNaN(Number(str)) && str.length >= 5 && !str.includes('/') && !str.includes('-')) {
    const msFromEpoch = (Number(str) - 25569 + 0.5) * 86400 * 1000;
    const d = new Date(msFromEpoch);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }

  const parts = str.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let p0 = parts[0].trim();
    let p1 = parts[1].trim();
    let p2 = parts[2].trim().split(' ')[0];

    // ISO YYYY-MM-DD
    if (p0.length === 4) return `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
    
    // FR DD/MM/YYYY or US MM/DD/YYYY
    if (p2.length === 4 || p2.length === 2) {
      const year = p2.length === 2 ? `20${p2}` : p2;
      const val1 = parseInt(p1);

      if (val1 > 12) { // val1 ne peut pas être un mois → c'est un jour → format US MM/DD/YY
        return `${year}-${p0.padStart(2, '0')}-${p1.padStart(2, '0')}`;
      } else { // Format FR JJ/MM/AAAA (par défaut)
        return `${year}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
      }
    }
  }
  
  return str;
}
