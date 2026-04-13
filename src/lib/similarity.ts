/**
 * Utility for string similarity and name matching
 */

/**
 * Normalizes a string: lowercase, remove accents, remove special chars
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s-]/g, "")    // Keep alphanumeric, spaces, hyphens
    .trim();
}

/**
 * Calculates Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculates similarity percentage between two strings (0 to 100)
 * Uses a hybrid approach: Word overlap + Fuzzy word matching
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);

  if (norm1 === norm2) return 100;
  if (!norm1 || !norm2) return 0;

  const words1 = norm1.split(/[\s-]+/).filter(w => w.length > 1);
  const words2 = norm2.split(/[\s-]+/).filter(w => w.length > 1);

  if (words1.length === 0 || words2.length === 0) {
    // Fallback to basic Levenshtein if no words
    const dist = levenshteinDistance(norm1, norm2);
    const maxLen = Math.max(norm1.length, norm2.length);
    return Math.round(Math.max(0, (1 - dist / maxLen) * 100));
  }

  // Smart Word Matching (handles inversions)
  let totalScore = 0;
  const matchedIndex2 = new Set<number>();

  for (const w1 of words1) {
    let bestWordScore = 0;
    let bestIdx = -1;

    for (let i = 0; i < words2.length; i++) {
      if (matchedIndex2.has(i)) continue;
      
      const w2 = words2[i];
      let score = 0;

      if (w1 === w2) {
        score = 1.0;
      } else {
        const dist = levenshteinDistance(w1, w2);
        const maxLen = Math.max(w1.length, w2.length);
        
        // Only allow small errors for short words
        const threshold = maxLen > 4 ? 2 : 1;
        if (dist <= threshold) {
          score = 1 - dist / maxLen;
        }
      }

      if (score > bestWordScore) {
        bestWordScore = score;
        bestIdx = i;
      }
    }

  if (bestWordScore > 0.7) { 
      totalScore += bestWordScore;
      if (bestIdx !== -1) matchedIndex2.add(bestIdx);
    }
  }

  // New Robust Scoring:
  // We calculate the score relative to both strings
  const scoreVs1 = totalScore / words1.length;
  const scoreVs2 = totalScore / words2.length;
  
  // We take the best coverage and apply a small penalty for the length difference
  // (to avoid "Jean" matching "Jean-Pierre" at 100% just because "Jean" is fully included)
  const lengthDiff = Math.abs(words1.length - words2.length);
  const lengthPenalty = lengthDiff * 0.05; // 5% penalty per missing word
  
  const finalScore = Math.max(scoreVs1, scoreVs2) - lengthPenalty;
  
  return Math.round(Math.max(0, finalScore * 100));
}
