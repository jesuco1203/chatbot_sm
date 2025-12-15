import { Request, Response } from 'express';
import { loadEnv } from '../../config/environment';
import { handleIncoming } from './handler';

const env = loadEnv();
const processedMessages = new Set<string>();

export const verify = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.whatsappVerifyToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Verification failed');
};

export const webhook = async (req: Request, res: Response) => {
  const body = req.body;

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const messages = change.value?.messages || [];
      for (const message of messages) {
        const type = message?.type;
        const isInteractive = type === 'interactive';
        const interactiveType = isInteractive ? message?.interactive?.type : null;

        let inputSource = '❓ DESCONOCIDO';
        let content = '';
        let rawId = '';

        if (type === 'text') {
          inputSource = '📝 TEXTO ESCRITO';
          content = message?.text?.body;
        } else if (isInteractive) {
          if (interactiveType === 'button_reply') {
            inputSource = '🔘 BOTÓN PULSADO';
            content = message?.interactive?.button_reply?.title;
            rawId = message?.interactive?.button_reply?.id;
          } else if (interactiveType === 'list_reply') {
            inputSource = '📜 LISTA SELECCIONADA';
            content = message?.interactive?.list_reply?.title;
            rawId = message?.interactive?.list_reply?.id;
          }
        } else if (type === 'button') {
          inputSource = '🔘 BOTÓN TEMPLATE';
          content = message?.button?.text;
          rawId = message?.button?.payload;
        } else if (type === 'audio') {
          inputSource = '🎤 AUDIO';
          content = '[Archivo de Audio]';
        } else if (type === 'location') { // Added for location messages
          inputSource = '📍 UBICACIÓN';
          content = `Lat: ${message?.location?.latitude}, Lng: ${message?.location?.longitude}`;
        }

        console.log('\n╭──────────────────────────────────────────────────╮');
        console.log(`│ 📥 INCOMING MESSAGE                              │`);
        console.log(`│ 👤 De:      ${String(message?.from).padEnd(29)}│`);
        console.log(`│ 📨 Tipo:    ${inputSource.padEnd(29)}│`);
        console.log(`│ 📄 Texto:   ${(content || '').substring(0, 29).padEnd(29)}│`);
        if (rawId) {
        console.log(`│ 🆔 Payload: ${rawId.substring(0, 29).padEnd(29)}│`);
        }
        console.log('╰──────────────────────────────────────────────────╯\n');

        if (message?.id) {
          if (processedMessages.has(message.id)) {
            console.log('Duplicate message ignored:', message.id);
            continue;
          }
          processedMessages.add(message.id);
        }

        await handleIncoming({
          id: message.id,
          from: message.from,
          text: message.text,
          button: message.button,
          interactive: message.interactive,
          location: message.location // Added location to handleIncoming
        });
      }
    }
  }

  res.sendStatus(200);
};
