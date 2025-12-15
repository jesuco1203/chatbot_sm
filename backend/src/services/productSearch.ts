import { MENU, MenuCategory, MenuItem } from '../data/menu';
import { bestFuzzyMatch, levenshtein, normalizeText, similarityRatio, tokenize } from '../utils/fuzzyMatch';

const STOPWORDS = new Set([
  'pizza',
  'piza',
  'pizzas',
  'una',
  'un',
  'quiero',
  'dame',
  'mejor',
  'pon',
  'por',
  'favor',
  'favorito',
  'favorita',
  'con',
  'de',
  'la',
  'las',
  'el',
  'los',
  'otra',
  'otro',
  'mas',
  'más',
  'quitar',
  'eliminar',
  'agrega',
  'agregar',
  'sumar',
  'resta',
  'es',
  'no',
  'ya',
  'todo',
  'papa',
  'papas',
  'gracias',
  'gracia',
  'listo',
  'lista',
  'listos',
  'nada',
  'vale',
  'ok',
  'okay',
  'porfa',
  'porfavor',
  'pedido',
  'pedidos',
  'habia',
  'había',
  'cosas',
  'solo',
  'solamente',
  'carrito',
  'finaliza',
  'finalizar',
  'termina',
  'terminar',
  'hola',
  'buenas',
  'categorias',
  'categoría',
  'menu',
  'menú',
  'carta',
  'chat',
  'vaciar',
  'vacie',
  'limpia',
  'limpiar',
  'salchi',
  'salchis',
  'salchipapa',
  'salchipapas',
  'salchicha',
  'hamburguesa',
  'hamburguesas',
  'parrilla',
  'parrillas'
]);

const SIZE_SYNONYMS: Record<string, string[]> = {
  grande: ['grande', 'gr', 'la mas grande', 'más grande'],
  familiar: ['familiar', 'fam'],
  personal: ['personal', 'individual'],
  porción: ['porcion', 'porción'],
  '500ml': ['500', '500ml', 'medio litro', 'chica'],
  '1.5Lt': ['1.5', '1.5lt', 'litro y medio', 'la mas grande']
};

const filteredTokens = (text: string) => tokenize(text).filter((token) => !STOPWORDS.has(token));

export const detectSizeFromText = (text: string, sizeOptions: string[]) => {
  const normalized = normalizeText(text);
  for (const option of sizeOptions) {
    const lower = option.toLowerCase();
    const synonyms = SIZE_SYNONYMS[lower] ?? [lower];
    if (synonyms.some((syn) => normalized.includes(syn))) {
      return option;
    }
  }
  return undefined;
};

export interface ProductMatch {
  item: MenuItem;
  sizeHint?: string | undefined;
  score: number;
  confidence: number;
  ratio: number;
}

export const findProductMatch = (text: string): ProductMatch | null => {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const match = bestFuzzyMatch(
    normalized,
    MENU,
    (item) => [`${item.name} ${item.description} ${item.id.replace(/_/g, ' ')}`]
  );

  if (!match || match.score === 0) return null;

  const baseTokens = filteredTokens(match.item.name);
  const confidence = match.score / Math.max(1, baseTokens.length);
  const ratio = match.ratio;

  if (match.score < 2 && ratio < 0.6) return null;

  return {
    item: match.item,
    sizeHint: detectSizeFromText(text, Object.keys(match.item.prices)),
    score: match.score,
    confidence,
    ratio
  };
};

const CATEGORY_HINTS: Record<'pizza' | 'lasagna' | 'drink' | 'extra', string[]> = {
  pizza: ['pizza', 'piza', 'pizzas'],
  lasagna: ['lasagna', 'lasaña', 'lasagnas'],
  drink: ['bebida', 'gaseosa', 'refresco', 'pepsi', 'coca', 'cola'],
  extra: ['extra', 'complemento', 'salsa', 'queso', 'maiz']
};

const detectCategoryHint = (text: string): keyof typeof CATEGORY_HINTS | null => {
  for (const [category, hints] of Object.entries(CATEGORY_HINTS) as Array<[
    keyof typeof CATEGORY_HINTS,
    string[]
  ]>) {
    if (hints.some((hint) => text.includes(hint))) {
      return category;
    }
  }
  return null;
};

export const detectCategoryFromText = (text: string): MenuCategory | null => {
  const normalized = normalizeText(text);
  const hint = detectCategoryHint(normalized);
  return hint ?? null;
};

export const matchCartItem = (
  cart: { name: string; size?: string }[],
  reference: string,
  options?: { sizeHint?: string }
) => {
  const normalized = normalizeText(reference);
  const tokens = filteredTokens(normalized);
  if (!tokens.length) return null;

  let bestIndex = -1;
  let bestScore = 0;
  let bestRatio = 0;

  cart.forEach((item, idx) => {
    const itemText = `${item.name} ${item.size ?? ''}`;
    const itemTokens = filteredTokens(itemText);
    const matched = itemTokens.filter((token) =>
      tokens.some((t) => {
        const ratio = similarityRatio(t, token);
        const distance = levenshtein(t, token);
        return ratio >= 0.6 || distance < 3 || token.includes(t) || t.includes(token);
      })
    );
    if (!matched.length) return;

    let score = matched.length;
    if (options?.sizeHint && item.size) {
      const sizeRatio = similarityRatio(normalizeText(options.sizeHint), normalizeText(item.size));
      if (sizeRatio >= 0.6) score += 1;
    }
    const ratio = score / Math.max(1, itemTokens.length);

    if (score > bestScore || (score === bestScore && ratio > bestRatio)) {
      bestScore = score;
      bestRatio = ratio;
      bestIndex = idx;
    }
  });

  if (bestIndex === -1) return null;
  return { index: bestIndex, ratio: bestRatio };
};

export interface SearchCriteria {
  query?: string;
  category?: MenuCategory;
  exclude?: string[];
}

export const searchMenu = (criteria: SearchCriteria) => {
  console.log('🔍 INICIO BÚSQUEDA:', JSON.stringify(criteria));
  let results = MENU;
  console.log(`📊 Total ítems iniciales: ${results.length}`);

  if (criteria.category) {
    results = results.filter((item) => item.category === criteria.category);
    console.log(`   ➡️ Tras filtro categoría '${criteria.category}': ${results.length} ítems`);
  }

  if (criteria.exclude && criteria.exclude.length > 0) {
    const exclusions = criteria.exclude.map((e) => normalizeText(e));
    console.log(`   🚫 Excluyendo: ${exclusions.join(', ')}`);
    results = results.filter((item) => {
      const keywordsText = (item.keywords || []).join(' ');
      const text = normalizeText(`${item.name} ${item.description} ${keywordsText}`);
      const hasExcluded = exclusions.some((ex) => text.includes(ex));
      if (hasExcluded) {
        const hit = exclusions.find((ex) => text.includes(ex));
        console.log(`      ❌ Descartado: ${item.name} (contiene '${hit}')`);
      }
      return !hasExcluded;
    });
    console.log(`   ➡️ Tras exclusiones: ${results.length} ítems`);
  }

  if (criteria.query) {
    const q = normalizeText(criteria.query);
    console.log(`   🔎 Buscando query normalizada '${q}'`);
    const beforeQueryCount = results.length;
    results = results.filter((item) => {
      const keywordsText = (item.keywords || []).join(' ');
      const text = normalizeText(`${item.name} ${item.description} ${keywordsText}`);
      return text.includes(q);
    });
    console.log(`   ➡️ Tras filtro query '${q}': ${results.length}/${beforeQueryCount} ítems`);
  }

  console.log(`✅ RESULTADO FINAL: ${results.length} ítems encontrados.`);

  return results.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    prices: item.prices,
    price_info: Object.entries(item.prices || {})
      .map(([size, price]) => `${size}: S/${price}`)
      .join(', ')
  }));
};
