import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const META_HEADER = 'x-hub-signature-256';

export const verifyMetaSignature = (appSecret: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers[META_HEADER] as string | undefined;
    if (!signature) {
      return res.status(401).json({ error: 'Missing Meta signature' });
    }

    const hash = crypto
      .createHmac('sha256', appSecret)
      .update((req as any).rawBody || '')
      .digest('hex');

    const expected = `sha256=${hash}`;
    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  };
};
