export type AddressMeta = { text?: string; location?: { lat: number; lng: number } | null };

export function parseAddress(raw?: string | null): AddressMeta {
  if (!raw) return {};
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return { text: raw };
  try {
    const parsed = JSON.parse(trimmed);
    return {
      text: parsed?.text ?? '',
      location: parsed?.location ?? null
    };
  } catch {
    return { text: raw };
  }
}

export function stringifyAddress(meta: AddressMeta): string {
  return JSON.stringify({
    text: meta.text ?? '',
    location: meta.location ?? null
  });
}
