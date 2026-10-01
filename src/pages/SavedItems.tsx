import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NavigationBar from "@/components/NavigationBar";
import { useUserSavedProducts } from "@/hooks/useUserSavedProducts";
import { useAuth } from "@/hooks/useAuth";
import { useSavedProducts } from "@/hooks/useSavedProducts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

const SavedItems = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { products, loading, error, refetch } = useUserSavedProducts();
  const { toast } = useToast();
  const [removingProductId, setRemovingProductId] = useState<string | null>(null);

  // Redirect to auth if not logged in
  if (!authLoading && !user) {
    navigate('/auth');
    return null;
  }

  const handleRemoveFromSaved = async (productId: string) => {
    if (!user || removingProductId) return;

    try {
      setRemovingProductId(productId);
      
      const { error } = await supabase
        .from('saved_products')
        .delete()
        .eq('user_id', user.id)
        .eq('product_id', productId);

      if (error) throw error;

      toast({
        title: "Removed from saved",
        description: "Product removed from your saved items"
      });

      // Refresh the list
      refetch();
    } catch (error) {
      console.error('Error removing saved product:', error);
      toast({
        title: "Error",
        description: "Failed to remove product from saved items",
        variant: "destructive"
      });
    } finally {
      setRemovingProductId(null);
    }
  };

  const handleProductClick = (productId: string) => {
    navigate(`/product/${productId}`);
  };

  const handleBackToProducts = () => {
    navigate('/categories');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <main className="px-[var(--page-padding)]">
          <div className="pt-4 pb-6">
            <h1 className="text-display font-orator text-foreground">
              All saved items
            </h1>
          </div>
          <div className="flex justify-center py-8">
            <div className="text-foreground font-orator text-sm">Loading saved items...</div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <main className="px-[var(--page-padding)]">
          <div className="pt-4 pb-6">
            <h1 className="text-display font-orator text-foreground">
              All saved items
            </h1>
          </div>
          <div className="flex justify-center py-8">
            <div className="text-destructive font-orator text-sm">Error: {error}</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      
      <main className="px-[var(--page-padding)]">
        {/* Page Title */}
        <div className="pt-4 pb-6">
          <h1 className="text-display font-orator text-foreground">
            All saved items ({products.length})
          </h1>
        </div>

        {/* Saved Items List */}
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <p className="text-foreground/75 font-orator text-sm text-center">
              You haven't saved any items yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-6">
            {products.map((product) => (
              <div
                key={product.id}
                className="min-h-[64px] flex items-center space-x-3 cursor-pointer"
                onClick={() => handleProductClick(product.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleRemoveFromSaved(product.id);
                }}
              >
                {/* Product Thumbnail */}
                <div className="flex-shrink-0">
                  {product.first_image_url ? (
                    <img
                      src={product.first_image_url}
                      alt={product.product_name}
                      className="w-11 h-11 rounded-full object-cover border border-primary/20"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-muted border border-primary/20 flex items-center justify-center">
                      <span className="text-xs text-foreground/50 font-orator">No Image</span>
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  {/* Product Name */}
                  <h3 className="text-caption font-orator text-foreground truncate">
                    {product.product_name}
                  </h3>
                  
                  {/* Seller */}
                  <p className="text-caption font-orator text-foreground/90 truncate">
                    Seller: {product.seller_name}
                  </p>
                </div>

                {/* Remove Button (visible on long press) */}
                {removingProductId === product.id && (
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 rounded-full bg-foreground/20 animate-pulse" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Back Button */}
        <div className="flex justify-center pb-8">
          <Button
            onClick={handleBackToProducts}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/90 font-orator h-[46px] rounded-[20px] px-6"
          >
            Back to Products
          </Button>
        </div>
      </main>
    </div>
  );
};

export default SavedItems;