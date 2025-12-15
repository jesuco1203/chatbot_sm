import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteProduct, fetchProducts, saveProduct } from '../services/api';
import { Product } from '../types';
import { toast } from 'sonner';

export const useProducts = () => {
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts
  });

  const saveMutation = useMutation({
    mutationFn: (product: Product) => saveProduct(product),
    onSuccess: () => {
      toast.success('Producto guardado');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => {
      toast.error('Error al guardar producto');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      toast.success('Producto eliminado');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => {
      toast.error('Error al eliminar producto');
    }
  });

  return {
    products: productsQuery.data || [],
    isLoading: productsQuery.isLoading,
    isError: productsQuery.isError,
    saveProduct: saveMutation.mutate,
    deleteProduct: deleteMutation.mutate
  };
};
