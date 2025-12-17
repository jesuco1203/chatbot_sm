import { loadEnv } from '../config/environment';
import { ConversationContext } from './conversationService';
import {
  Intent,
  UnknownIntent,
  GreetingIntent,
  MenuRequestIntent,
  CategoryRequestIntent,
  HelpIntent,
  ConfirmOrderIntent
} from '../types/intents';
import { detectCategoryFromText } from './productSearch';
import { deepseekClient, defaultDeepseekModel } from '../llm/deepseekClient';

const env = loadEnv();

const GREETING_KEYWORDS = ['hola', 'holaa', 'hola!', 'hello', 'hi', 'buenas', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches'];
const MENU_KEYWORDS = ['menu', 'menú', 'carta', 'ver menu', 'ver carta', 'categorias', 'categorías'];
const CONFIRM_KEYWORDS = ['confirmar', 'pagar', 'finalizar', 'checkout', 'enviar pedido'];
const HELP_KEYWORDS = ['recomienda', 'recomendación', 'sugerencia', 'sugerencias', 'ayuda'];

const buildUnknownIntent = (rawText: string, reason?: string): UnknownIntent =>
  reason
    ? { type: 'unknown', rawText, reason }
    : { type: 'unknown', rawText };

const extractJson = (text: string) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON detected');
  return JSON.parse(text.slice(start, end + 1));
};

const quickHeuristics = (
  text: string
):
  | GreetingIntent
  | MenuRequestIntent
  | CategoryRequestIntent
  | HelpIntent
  | ConfirmOrderIntent
  | Intent
  | null => {
  const normalized = text.trim().toLowerCase();
  const condensed = normalized.replace(/\s+/g, '');

  if (GREETING_KEYWORDS.some((greet) => condensed === greet.replace(/\s+/g, ''))) {
    return { type: 'greeting', rawText: text };
  }

  const category = detectCategoryFromText(normalized);
  if (category) {
    return { type: 'category_request', rawText: text, category };
  }

  if (MENU_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return { type: 'menu_request', rawText: text };
  }

  if (CONFIRM_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return { type: 'confirm_order', rawText: text };
  }

  if (HELP_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return { type: 'help', rawText: text };
  }

  if (normalized.includes('carrito')) {
    return { type: 'show_cart', rawText: text };
  }

  if (normalized.includes('finalizar') || normalized.includes('checkout')) {
    return { type: 'go_to_checkout', rawText: text };
  }

  return null;
};

export const inferIntentFromLLM = async (
  text: string,
  session: ConversationContext
): Promise<Intent> => {
  const heuristic = quickHeuristics(text);
  if (heuristic) return heuristic;

  const cart = {
    items: session.cart.map((item, idx) => ({
      index: idx + 1,
      name: item.name,
      size: item.size,
      quantity: item.quantity
    }))
  };

const prompt = `
Eres un asistente de pedidos de una pizzería en WhatsApp.
Devuelves SOLO un JSON válido con la intención detectada y los campos relevantes.
Aplica fuzzy matching para reconocer productos con typos o acentos faltantes.

Intents permitidos:
- add_product {productName, size, quantity}
- remove_product {productName, size, quantity}
- change_quantity {productName, size, quantity, delta}
- category_request {category}
- menu_request
- confirm_order
- show_cart
- go_to_checkout
- help
- greeting
- smalltalk
- unknown

Reglas:
- Usa add_product cuando el usuario mencione explícitamente un producto del menú aunque tenga typos.
- Usa remove_product cuando quiera eliminar/quitar algo del carrito.
- Usa change_quantity cuando pida sumar/restar unidades o cambiar la cantidad.
- Si menciona un producto inexistente en el menú responde unknown con reason:"out_of_menu".
- Usa category_request cuando pida ver pizzas, bebidas, lasagnas o extras (no listar en texto).
- Usa menu_request para "ver carta", "ver menú" o similares.
- Usa smalltalk para chitchat sin intención de compra.
- Si no se entiende la intención devuelve unknown.

Ejemplos:
{"type":"add_product","rawText":"pizza americana familiar","productName":"pizza americana","size":"Familiar","quantity":1}
{"type":"remove_product","rawText":"quita la pepsi","productName":"pepsi","quantity":1}
{"type":"change_quantity","rawText":"súmale una americana","productName":"pizza americana","delta":1}
{"type":"category_request","rawText":"muéstrame las pizzas","category":"pizza"}
{"type":"menu_request","rawText":"ver carta"}
{"type":"confirm_order","rawText":"confirmar pedido"}
{"type":"show_cart","rawText":"ver carrito"}
{"type":"greeting","rawText":"hola"}
{"type":"unknown","rawText":"quiero sushi","reason":"out_of_menu"}

Texto:
"""${text}"""

Carrito:
${JSON.stringify(cart)}
`;

  try {
    const completion = await deepseekClient.chat.completions.create({
      model: defaultDeepseekModel,
      messages: [
        { role: 'system', content: 'Eres un asistente de pedidos de una pizzería en WhatsApp.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 300
    });

    const content: any = completion.choices[0]?.message?.content;
    const responseText = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((c: any) => (typeof c === 'string' ? c : c.text ?? '')).join('')
        : '';

    if (!responseText) throw new Error('Empty response');

    const json = extractJson(responseText);
    if (!json.rawText) json.rawText = text;
    return json as Intent;
  } catch (error) {
    return buildUnknownIntent(text, (error as Error).message);
  }
};
