import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface SavedProduct {
  id: string;
  product_name: string;
  price: number;
  location: string;
  first_image_url?: string;
  seller_name: string;
  saved_at: string;
}

export const useUserSavedProducts = () => {
  const { user, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSavedProducts = async () => {
    if (!user) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch via secure RPC to avoid RLS join issues
      const { data, error } = await supabase.rpc('get_user_saved_products');
      if (error) throw error;

      const processed: SavedProduct[] = (data ?? []).map(p => ({
        id: p.product_id,
        product_name: p.product_name,
        price: p.price,
        location: p.location,
        first_image_url: p.first_image_url ?? undefined,
        seller_name: p.seller_name,
        saved_at: p.saved_at
      }));

      setProducts(processed);
    } catch (err) {
      console.error('Error fetching saved products:', err);
      setError(err instanceof Error ? err.message : "Failed to fetch saved products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchSavedProducts();
    }
  }, [user, authLoading]);

  return { 
    products, 
    loading: loading || authLoading, 
    error, 
    refetch: fetchSavedProducts 
  };
};