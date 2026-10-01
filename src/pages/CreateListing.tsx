import NavigationBar from "@/components/NavigationBar";
import ProductCard from "@/components/ProductCard";
import { FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useUserProducts } from "@/hooks/useUserProducts";

const CreateListing = () => {
  const { products, loading, error } = useUserProducts();

  return (
    <div className="min-h-screen bg-[#f8f4f1]">
      <NavigationBar />
      
      {/* Main Content */}
      <main className="px-4">
        {/* Create Listing Button */}
        <div className="pt-3 pb-4">
          <Link to="/create-listing/new">
            <Button 
              variant="create" 
              size="marketplace" 
              className="w-full gap-3"
            >
              <FilePlus className="w-5 h-5" />
              + Create listing
            </Button>
          </Link>
        </div>

        {/* Overview Section */}
        <section className="pb-4">
          <div className="space-y-1">
            <h1 className="text-display text-[18px] font-orator font-medium text-primary">Overview</h1>
            <p className="text-[14px] font-orator text-primary opacity-80">Your active listings</p>
          </div>
        </section>

        {/* Products Grid or Empty State */}
        {loading ? (
          <div className="flex justify-center py-8">
            <p className="text-[14px] font-orator text-primary opacity-70">Loading...</p>
          </div>
        ) : error ? (
          <div className="flex justify-center py-8">
            <p className="text-[14px] font-orator text-red-500">Error: {error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex justify-center py-8">
            <p className="text-[14px] font-orator text-primary opacity-70">You have no active listings</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-8">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default CreateListing;