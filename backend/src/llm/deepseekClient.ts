import OpenAI from 'openai';
import { loadEnv } from '../config/environment';

const env = loadEnv();

export const deepseekClient = new OpenAI({
  apiKey: env.deepseekApiKey,
  baseURL: env.deepseekBaseUrl || 'https://api.deepseek.com'
});

export const defaultDeepseekModel = env.deepseekModel || 'deepseek-chat';
