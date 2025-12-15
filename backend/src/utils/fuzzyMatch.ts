const stripAccents = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const normalizeText = (value: string) =>
  stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const tokenize = (value: string) =>
  normalizeText(value)
    .split(' ')
    .filter(Boolean);

export const levenshtein = (a: string, b: string) => {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        const deletion = matrix[i - 1]![j]!;
        const insertion = matrix[i]![j - 1]!;
        const substitution = matrix[i - 1]![j - 1]!;
        matrix[i]![j] = Math.min(deletion, insertion, substitution) + 1;
      }
    }
  }

  return matrix[a.length]![b.length]!;
};

export const similarityRatio = (a: string, b: string) => {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - distance / maxLen;
};

export const tokensOverlap = (sourceTokens: string[], targetTokens: string[]) =>
  sourceTokens.some((token) => targetTokens.includes(token));

export interface FuzzyMatchResult<T> {
  item: T;
  score: number;
  ratio: number;
  matchedTokens: string[];
}

export const bestFuzzyMatch = <T>(
  text: string,
  candidates: T[],
  extractor: (candidate: T) => string[]
): FuzzyMatchResult<T> | null => {
  const baseTokens = tokenize(text);
  if (!baseTokens.length) return null;

  let best: FuzzyMatchResult<T> | null = null;

  for (const candidate of candidates) {
    const candidateTexts = extractor(candidate);
    const candidateTokens = candidateTexts.flatMap((value) => tokenize(value));
    if (!candidateTokens.length) continue;

    const matchedTokens: string[] = [];
    let score = 0;

    for (const token of baseTokens) {
      const directHit = candidateTokens.find((ct) => ct === token);
      if (directHit) {
        matchedTokens.push(token);
        score += 2;
        continue;
      }

      const similarToken = candidateTokens.find((ct) => {
        const ratio = similarityRatio(token, ct);
        const distance = levenshtein(token, ct);
        return ratio >= 0.6 || distance < 3 || ct.includes(token) || token.includes(ct);
      });

      if (similarToken) {
        matchedTokens.push(similarToken);
        score += 1;
      }
    }

    const ratio = score / Math.max(1, candidateTokens.length);

    if (!best || score > best.score || (score === best.score && ratio > best.ratio)) {
      best = {
        item: candidate,
        score,
        ratio,
        matchedTokens
      };
    }
  }

  return best;
};
