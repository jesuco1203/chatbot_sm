import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { loadEnv } from './config/environment';
import { verify as whatsappVerify, webhook as whatsappWebhook } from './api/whatsapp/webhook';
import { sendTemplateMessage, sendTextMessage } from './api/whatsapp/messages';
import { createOrderHandler } from './api/orders/create';
import { updateOrderHandler } from './api/orders/update';
import { getOrderStatus } from './api/orders/status';
import { listOrdersHandler } from './api/orders/list';
import { listProducts } from './api/products/index';
import {
  updateProductHandler,
  createProductHandler,
  deleteProductHandler,
  getRecipeHandler,
  saveRecipeHandler
} from './api/products/manage';
import { getStatsHandler, getHistoryHandler, getRangeReportHandler } from './api/reports/controller';
import { listIngredients, saveIngredient, addMovement } from './api/inventory/controller';
import { verifyMetaSignature } from './middleware/whatsappAuth';
import { apiLimiter, whatsappLimiter } from './middleware/rateLimiter';
import { loadMenuFromDb } from './data/menu';

const env = loadEnv();
const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);
app.use(cors());
app.use(bodyParser.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/whatsapp/webhook', whatsappVerify);
app.post('/api/whatsapp/webhook', whatsappLimiter, whatsappWebhook);

app.post('/api/whatsapp/messages/text', apiLimiter, sendTextMessage);
app.post('/api/whatsapp/messages/template', apiLimiter, sendTemplateMessage);

app.post('/api/orders', apiLimiter, createOrderHandler);
app.patch('/api/orders/:orderId', apiLimiter, updateOrderHandler);
app.get('/api/orders/history', apiLimiter, getHistoryHandler);
app.get('/api/orders/:orderId', apiLimiter, getOrderStatus);
app.get('/api/orders', apiLimiter, listOrdersHandler);

app.get('/api/products', apiLimiter, listProducts);
app.post('/api/products', apiLimiter, createProductHandler);
app.put('/api/products/:id', apiLimiter, updateProductHandler);
app.delete('/api/products/:id', apiLimiter, deleteProductHandler);
app.get('/api/products/:id/recipe', apiLimiter, getRecipeHandler);
app.post('/api/products/:id/recipe', apiLimiter, saveRecipeHandler);
app.get('/api/reports/daily', apiLimiter, getStatsHandler);
app.get('/api/reports/range', apiLimiter, getRangeReportHandler);
app.get('/api/inventory', apiLimiter, listIngredients);
app.post('/api/inventory', apiLimiter, saveIngredient);
app.post('/api/inventory/movement', apiLimiter, addMovement);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const startServer = async () => {
  await loadMenuFromDb().catch((err) => console.error('❌ Error al cargar menú inicial:', err));

  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
};

startServer();
