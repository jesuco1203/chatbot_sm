import fetch from 'node-fetch';
import { loadEnv } from '../config/environment';

const env = loadEnv();
const BASE_URL = 'https://graph.facebook.com/v20.0';

export type WhatsappMessageType = 'text' | 'interactive' | 'template';

export interface SendMessagePayload {
  to: string;
  type: WhatsappMessageType;
  text?: { body: string };
  interactive?: Record<string, unknown>;
  template?: Record<string, unknown>;
  contextMessageId?: string | undefined;
}

export const sendWhatsappMessage = async ({ to, type, text, interactive, template, contextMessageId }: SendMessagePayload) => {
  const url = `${BASE_URL}/${env.whatsappPhoneId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type,
    ...(text ? { text } : {}),
    ...(interactive ? { interactive } : {}),
    ...(template ? { template } : {}),
    ...(contextMessageId ? { context: { message_id: contextMessageId } } : {})
  };

  const preview =
    type === 'text'
      ? text?.body
      : type === 'interactive'
      ? interactive?.type
      : type === 'template'
      ? template?.name
      : '';
  console.log(`[WhatsApp -> ${to}] type: ${type}${preview ? ` | ${preview}` : ''}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsappAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error: ${errorText}`);
  }

  return response.json();
};

export const sendTemplate = (to: string, templateName: string, variables: string[]) => {
  return sendWhatsappMessage({
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'es' },
      components: [
        {
          type: 'body',
          parameters: variables.map((value) => ({ type: 'text', text: value }))
        }
      ]
    }
  });
};

export const markMessageAsRead = async (messageId: string) => {
  const url = `${BASE_URL}/${env.whatsappPhoneId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.whatsappAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error(`Error marking message ${messageId} as read:`, error);
  }
};

export const sendTypingIndicator = async (to: string) => {
  const url = `${BASE_URL}/${env.whatsappPhoneId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    status: 'typing'
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.whatsappAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error(`Error sending typing indicator to ${to}:`, error);
  }
};

export const markTyping = async (to: string) => {
  const url = `${BASE_URL}/${env.whatsappPhoneId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'sender_action',
    sender_action: 'typing_on'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.whatsappAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Error al enviar "Escribiendo...":', JSON.stringify(errorData, null, 2));
    }
  } catch (error) {
    console.error('Error de red al enviar typing:', error);
  }
};
