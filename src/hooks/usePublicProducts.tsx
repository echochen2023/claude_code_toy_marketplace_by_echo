import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PublicProduct {
  id: string;
  product_name: string;
  price: number;
  location: string;
  created_at: string;
  first_image_url?: string;
  seller_name: string;
}

export type SortBy = 'created_at' | 'price_asc' | 'price_desc';

export const usePublicProducts = () => {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async (searchTerm?: string, sortBy: SortBy = 'created_at') => {
    try {
      setLoading(true);
      
      // Use the secure RPC that matches our database function signature
      const { data: productsData, error: productsError } = await supabase
        .rpc('get_public_products', { 
          search_term: searchTerm || null, 
          sort_by: sortBy 
        });

      if (productsError) throw productsError;

      setProducts(productsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return { products, loading, error, refetch: fetchProducts };
};