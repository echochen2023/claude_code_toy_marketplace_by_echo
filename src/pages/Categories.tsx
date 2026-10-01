import { useState } from "react";
import NavigationBar from "@/components/NavigationBar";
import PublicProductCard from "@/components/PublicProductCard";
import FilterSheet from "@/components/FilterSheet";
import { usePublicProducts, SortBy } from "@/hooks/usePublicProducts";

const Categories = () => {
  const { products, loading, error, refetch } = usePublicProducts();
  const [sortBy, setSortBy] = useState<SortBy>('created_at');

  const handleFilter = (newSortBy: SortBy) => {
    setSortBy(newSortBy);
    refetch(undefined, newSortBy);
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      
      <main className="px-[var(--page-padding)]">
        {/* Category Header */}
        <div className="pt-2 pb-4 space-y-1">
          {/* Breadcrumb */}
          <div className="text-xs font-orator text-foreground/70 uppercase tracking-wide">
            WOMEN/MEN
          </div>
          
          {/* Title Row */}
          <div className="flex items-center justify-between">
            <h1 className="text-display font-medium text-foreground">
              Toys ({products.length})
            </h1>
            
            <FilterSheet
              onApplyFilter={handleFilter}
              currentSortBy={sortBy}
            >
              <button className="text-foreground font-orator text-sm underline-offset-2 hover:underline min-w-[44px] h-[44px] flex items-center justify-center -m-2">
                Filter
              </button>
            </FilterSheet>
          </div>
        </div>

        {/* Products Grid */}
        <div className="pb-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="text-foreground font-orator text-sm">Loading products...</div>
            </div>
          ) : error ? (
            <div className="flex justify-center py-8">
              <div className="text-destructive font-orator text-sm">Error: {error}</div>
            </div>
          ) : products.length === 0 ? (
            <div className="flex justify-center py-8">
              <div className="text-foreground/70 font-orator text-sm">No products found</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {products.map((product) => (
                <PublicProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Categories;