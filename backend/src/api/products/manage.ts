import { Request, Response } from 'express';
import { updateProduct, createProduct, deleteProduct, getRecipe, saveRecipe } from '../../services/productService';
import { loadMenuFromDb } from '../../data/menu';

export const updateProductHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    await updateProduct(id, req.body);
    console.log('🔄 Producto modificado. Refrescando menú en memoria...');
    await loadMenuFromDb();
    res.json({ success: true });
  } catch (e) {
    console.error('Error updating product:', e);
    res.status(500).json({ error: String(e) });
  }
};

export const createProductHandler = async (req: Request, res: Response) => {
  try {
    await createProduct(req.body);
    console.log('🔄 Producto nuevo. Refrescando menú en memoria...');
    await loadMenuFromDb();
    res.json({ success: true });
  } catch (e) {
    console.error('Error creating product:', e);
    res.status(500).json({ error: String(e) });
  }
};

export const deleteProductHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    await deleteProduct(id);
    console.log('🔄 Producto eliminado/desactivado. Refrescando menú en memoria...');
    await loadMenuFromDb();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};

export const getRecipeHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    const recipe = await getRecipe(id);
    res.json(recipe);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};

export const saveRecipeHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    await saveRecipe(id, req.body.ingredients || []);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
