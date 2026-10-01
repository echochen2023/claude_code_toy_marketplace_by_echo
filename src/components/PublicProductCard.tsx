import { AspectRatio } from "@/components/ui/aspect-ratio";
import { PublicProduct } from "@/hooks/usePublicProducts";
import { useNavigate } from "react-router-dom";

interface PublicProductCardProps {
  product: PublicProduct;
}

const PublicProductCard = ({ product }: PublicProductCardProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/product/${product.id}`);
  };

  return (
    <div 
      className="bg-white rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity" 
      onClick={handleClick}
    >
      {/* Product Image */}
      <div className="overflow-hidden">
        <AspectRatio ratio={4/3}>
          {product.first_image_url ? (
            <img
              src={product.first_image_url}
              alt={product.product_name}
              className="w-full h-full object-contain rounded-sm"
            />
          ) : (
            <div className="w-full h-full bg-muted/20 flex items-center justify-center rounded-sm">
              <span className="text-muted-foreground text-sm font-orator">No image</span>
            </div>
          )}
        </AspectRatio>
      </div>

      {/* Product Info */}
      <div className="p-2">
        {/* Title */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-orator text-primary text-sm font-medium truncate">
            {product.product_name}
          </h3>
        </div>

        {/* Price */}
        <div className="text-primary text-sm font-orator">
          ${product.price.toLocaleString()}
        </div>
      </div>
    </div>
  );
};

export default PublicProductCard;
