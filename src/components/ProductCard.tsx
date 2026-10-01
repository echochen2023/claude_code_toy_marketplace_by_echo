import { Link } from "react-router-dom";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ProductWithImage } from "@/hooks/useUserProducts";
import { useNavigate } from "react-router-dom";

interface ProductCardProps {
  product: ProductWithImage;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const navigate = useNavigate();

  return (
    <div 
      className="bg-white rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity" 
    >
      {/* Product Image */}
      <div className="overflow-hidden">
        <AspectRatio ratio={4/3}>
          {product.first_image_url ? (
            <img
              src={product.first_image_url}
              alt={product.product_name}
              className="w-full h-full object-contain rounded-t-md"
            />
          ) : (
            <div className="w-full h-full bg-gray-200 flex items-center justify-center rounded-t-md">
              <span className="text-gray-400 text-sm">No image</span>
            </div>
          )}
        </AspectRatio>
      </div>

      {/* Product Info */}
      <div className="p-2">
        {/* Title Row */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-orator text-primary text-sm font-medium truncate">
            {product.product_name}
          </h3>
          <Link 
            to={`/create-listing/edit/${product.id}`}
            className="text-primary text-sm font-orator underline-offset-2 hover:underline min-w-[44px] h-[44px] flex items-center justify-center -m-2"
            onClick={(e) => e.stopPropagation()} // Prevent click from bubbling up to parent
          >
            Edit
          </Link>
        </div>

        {/* Price */}
        <div className="text-primary text-sm font-orator">
          ${product.price.toLocaleString()}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
