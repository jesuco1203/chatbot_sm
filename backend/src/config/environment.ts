import 'dotenv/config';

export interface EnvConfig {
  whatsappVerifyToken: string;
  whatsappAccessToken: string;
  whatsappPhoneId: string;
  metaAppId: string;
  metaAppSecret: string;
  databaseUrl: string;
  encryptionKey: string;
  geminiApiKey: string;
  restaurantLatitude: number;
  restaurantLongitude: number;
  deliveryRatePerKm: number;
}

export const loadEnv = (): EnvConfig => {
  const get = (key: string): string => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  };

  const getNumber = (key: string): number => {
    const value = get(key);
    const num = parseFloat(value);
    if (isNaN(num)) {
      throw new Error(`Environment variable ${key} is not a valid number.`);
    }
    return num;
  };

  return {
    whatsappVerifyToken: get('WHATSAPP_VERIFY_TOKEN'),
    whatsappAccessToken: get('WHATSAPP_ACCESS_TOKEN'),
    whatsappPhoneId: get('WHATSAPP_PHONE_ID'),
    metaAppId: get('META_APP_ID'),
    metaAppSecret: get('META_APP_SECRET'),
    databaseUrl: get('DATABASE_URL'),
    encryptionKey: get('PHONE_ENCRYPTION_KEY'),
    geminiApiKey: get('GEMINI_API_KEY'),
    restaurantLatitude: getNumber('RESTAURANT_LATITUDE'),
    restaurantLongitude: getNumber('RESTAURANT_LONGITUDE'),
    deliveryRatePerKm: getNumber('DELIVERY_RATE_PER_KM')
  };
};
