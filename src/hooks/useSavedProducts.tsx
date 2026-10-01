import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "@/components/ui/use-toast";

export const useSavedProducts = (productId?: string) => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Check if product is saved when component mounts or user/productId changes
  useEffect(() => {
    // Wait for auth to load before making any requests
    if (authLoading) {
      return;
    }

    if (!user || !productId) {
      setIsSaved(false);
      setCheckingStatus(false);
      return;
    }

    const checkSavedStatus = async () => {
      try {
        setCheckingStatus(true);
        const { data, error } = await supabase
          .rpc('is_product_saved', { product_uuid: productId });

        if (error) {
          throw error;
        }

        setIsSaved(!!data);
      } catch (error) {
        console.error('Error checking saved status:', error);
      } finally {
        setCheckingStatus(false);
      }
    };

    checkSavedStatus();
  }, [user, productId, authLoading]);

  const toggleSave = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save products",
        variant: "destructive"
      });
      return;
    }

    if (!productId || loading) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .rpc('toggle_saved_product', { product_uuid: productId });

      if (error) {
        throw error;
      }

      const result = data[0];
      setIsSaved(result.is_saved);
      
      toast({
        title: result.is_saved ? "Saved!" : "Removed from saved",
        description: result.message
      });
    } catch (error) {
      console.error('Error toggling save:', error);
      toast({
        title: "Error",
        description: "Failed to update saved status. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    isSaved,
    loading,
    checkingStatus,
    toggleSave
  };
};