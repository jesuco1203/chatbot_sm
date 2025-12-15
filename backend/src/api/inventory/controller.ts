import { Request, Response } from 'express';
import { getIngredients, registerMovement, upsertIngredient } from '../../services/inventoryService';

export const listIngredients = async (_req: Request, res: Response) => {
  try {
    const items = await getIngredients();
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};

export const saveIngredient = async (req: Request, res: Response) => {
  try {
    await upsertIngredient(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};

export const addMovement = async (req: Request, res: Response) => {
  try {
    const { ingredientId, type, quantity, reason } = req.body;
    const finalQty = type === 'waste' || type === 'sale' ? -Math.abs(quantity) : Math.abs(quantity);
    await registerMovement(ingredientId, type, finalQty, reason);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
