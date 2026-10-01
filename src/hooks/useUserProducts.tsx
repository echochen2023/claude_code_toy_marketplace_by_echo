import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ProductWithImage {
  id: string;
  product_name: string;
  price: number;
  description: string;
  color: string;
  leather: string;
  year_purchased: number;
  stamp: string;
  location: string;
  created_at: string;
  first_image_url?: string;
}

export const useUserProducts = () => {
  const [products, setProducts] = useState<ProductWithImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchProducts = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch products with their first image
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select(`
          *,
          product_images (
            image_url
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (productsError) throw productsError;

      // Process products to include first image URL
      const productsWithImages: ProductWithImage[] = (productsData || []).map(product => ({
        ...product,
        first_image_url: product.product_images?.[0]?.image_url
      }));

      setProducts(productsWithImages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [user]);

  return { products, loading, error, refetch: fetchProducts };
};