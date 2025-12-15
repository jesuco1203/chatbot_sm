import { Request, Response } from 'express';
import { sendTemplate, sendWhatsappMessage } from '../../services/whatsappService';

export const sendTextMessage = async (req: Request, res: Response) => {
  const { to, text } = req.body;
  await sendWhatsappMessage({
    to,
    type: 'text',
    text: { body: text }
  });
  res.status(200).json({ status: 'sent' });
};

export const sendTemplateMessage = async (req: Request, res: Response) => {
  const { to, templateName, variables } = req.body;
  await sendTemplate(to, templateName, variables || []);
  res.status(200).json({ status: 'sent' });
};
