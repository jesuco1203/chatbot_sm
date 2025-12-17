import { fetch } from 'undici';
import { loadEnv } from '../config/environment';
import { calculateDistance } from '../utils/geo';
import { sessionManager, UserSession } from './sessionManager';

const env = loadEnv();

export type LatLng = { lat: number; lng: number };

const COORDS_REGEX = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/;

export const roundDeliveryCost = (cost: number) => Math.ceil(cost * 2) / 2; // Redondea a 0.5 a favor del motorizado

export const parseCoordsFromText = (text?: string | null): LatLng | null => {
  if (!text) return null;
  const match = text.match(COORDS_REGEX);
  if (!match) return null;
  return { lat: Number(match[1]), lng: Number(match[2]) };
};

export const extractFirstUrl = (text?: string | null): string | null => {
  if (!text) return null;
  const urlMatch = text.match(/https?:\/\/\S+/i);
  return urlMatch ? urlMatch[0] : null;
};

export const resolveFinalUrl = async (url: string): Promise<string> => {
  const maxRedirects = 5;
  let current = url;

  for (let i = 0; i < maxRedirects; i++) {
    console.log(`[maps] hop=${i} GET ${current}`);

    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SanMarzanoBot/1.0)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'es-PE,es;q=0.9,en;q=0.8'
      }
    });

    const status = res.status;
    const location = res.headers.get('location') ?? undefined;
    console.log(`[maps] hop=${i} status=${status} location=${location ?? 'none'}`);

    if (status >= 300 && status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }

    return current;
  }

  return current;
};

export const coordsFromGoogleMapsUrl = async (url: string): Promise<LatLng | null> => {
  console.log('🗺️ Recibido link de Maps:', url);
  try {
    const finalUrl = await resolveFinalUrl(url);
    console.log('🗺️ URL final después de redirect:', finalUrl);

    const patterns: RegExp[] = [
      /!3d(-?\d+(\.\d+)?)!4d(-?\d+(\.\d+)?)/i, // ...!3dLAT!4dLNG
      /@(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)/i, // @LAT,LNG
      /[?&]q=(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)/i // q=LAT,LNG
    ];

    const [p1, p2, p3] = patterns;
    const matchFlags = {
      m1: !!(p1 && finalUrl.match(p1)),
      m2: !!(p2 && finalUrl.match(p2)),
      m3: !!(p3 && finalUrl.match(p3))
    };
    console.log('[maps] patrones match', matchFlags);

    for (const pat of patterns) {
      const m = finalUrl.match(pat);
      if (m) {
        const lat = Number(m[1]);
        const lng = Number(m[3]);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          console.log('🗺️ Coordenadas extraídas de Maps:', { lat, lng });
          return { lat, lng };
        }
      }
    }
  } catch (err) {
    console.error('❌ Error resolviendo URL de Maps:', err);
  }
  console.warn('⚠️ No se pudieron extraer coordenadas del link de Maps.');
  return null;
};

export const applyDeliveryFromCoords = async (
  phone: string,
  coords: LatLng,
  session?: UserSession
): Promise<UserSession> => {
  const currentSession = session ?? (await sessionManager.getSession(phone));
  const restaurantLocation = { latitude: env.restaurantLatitude, longitude: env.restaurantLongitude };
  const customerLocation = { latitude: coords.lat, longitude: coords.lng };
  const distance = calculateDistance(restaurantLocation, customerLocation);
  const rawCost = distance * env.deliveryRatePerKm;
  const baseCost = Math.max(rawCost, 3);
  const cost = roundDeliveryCost(baseCost);
  console.log('[delivery] costo base', baseCost, 'costo redondeado', cost);

  currentSession.delivery = {
    location: customerLocation,
    distance,
    cost
  };

  return currentSession;
};
