import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import NavigationBar from "@/components/NavigationBar";
import { MapPin, Share, Heart, ArrowLeft, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { useSavedProducts } from "@/hooks/useSavedProducts";

interface ProductDetail {
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
  seller_name: string;
  seller_joined_year: number;
  images: string[];
}

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Hi, is this still available?");
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [messageSent, setMessageSent] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [isOwnProduct, setIsOwnProduct] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { isSaved, loading: saveLoading, toggleSave } = useSavedProducts(id);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;

      try {
        setLoading(true);
        
        // Use the secure RPC to fetch product details
        const { data: productData, error: productError } = await supabase
          .rpc('get_public_product_detail', { product_id: id });

        if (productError) throw productError;

        if (!productData || productData.length === 0) {
          setProduct(null);
          return;
        }

        // seller_joined_year was added to this RPC but the generated types
        // haven't been regenerated to include it yet.
        const rawProduct = productData[0] as typeof productData[0] & {
          seller_joined_year: number;
        };
        const productDetail: ProductDetail = {
          ...rawProduct,
          images: Array.isArray(rawProduct.images)
            ? rawProduct.images.map((img: { image_url: string }) => img.image_url)
            : []
        };
        setProduct(productDetail);

        // Check if this is the user's own product and if user has already started a conversation
        if (user) {
          // Check if the current user owns this product using secure RPC
          const { data: isOwner } = await supabase
            .rpc('is_product_owner', { product_uuid: id });

          if (isOwner) {
            setIsOwnProduct(true);
          } else {
            // Only check for existing conversation if it's not their own product
            const { data: existingConversation } = await supabase
              .rpc('get_user_conversation_for_product', { prod_id: id });

            if (existingConversation && existingConversation.length > 0) {
              setMessageSent(true);
              setConversationId(existingConversation[0].conversation_id);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching product:", error);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id, user]);

  useEffect(() => {
    if (!api) {
      return;
    }

    setCurrent(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleSeeConversation = () => {
    if (conversationId) {
      navigate(`/conversation/${conversationId}`);
    }
  };

  const handleSendMessage = async () => {
    if (!user || !product || !message.trim()) {
      toast({
        title: "Error",
        description: "Please sign in and enter a message",
        variant: "destructive"
      });
      return;
    }

    if (sendingMessage) return;

    try {
      setSendingMessage(true);

      // Create or get existing conversation using secure RPC
      const { data: conversationResult, error: conversationError } = await supabase
        .rpc('create_conversation', { prod_id: product.id });

      if (conversationError) throw conversationError;

      const conversationId = conversationResult;
      if (!conversationId) throw new Error('Failed to create conversation');

      // Send the message
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          body: message.trim()
        });

      if (messageError) throw messageError;

      setMessageSent(true);
      setConversationId(conversationId);
      toast({
        title: "Success",
        description: "Message sent to seller"
      });

    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="flex items-center justify-center h-64">
          <div className="text-primary font-orator">Loading...</div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="flex items-center justify-center h-64">
          <div className="text-primary font-orator">Product not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      
      <div className="pb-8">
        {/* Product Image Carousel */}
        <div className="w-full">
          <div className="relative" style={{ width: '100%', maxWidth: '400px', height: '300px', margin: '0 auto' }}>
            {product.images.length > 0 ? (
              <Carousel className="w-full h-full" setApi={setApi}>
                <CarouselContent className="ml-0">
                  {product.images.map((imageUrl, index) => (
                    <CarouselItem key={index} className="pl-0">
                      <div className="flex items-center justify-center w-full h-full bg-white">
                        <img
                          src={imageUrl}
                          alt={`${product.product_name} - Image ${index + 1}`}
                          className="max-w-full max-h-full object-contain"
                          style={{ maxWidth: '400px', maxHeight: '300px' }}
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {product.images.length > 1 && (
                  <>
                    <CarouselPrevious className="left-4" />
                    <CarouselNext className="right-4" />
                  </>
                )}
              </Carousel>
            ) : (
              <div className="w-full h-full bg-muted/20 flex items-center justify-center">
                <span className="text-muted-foreground text-sm font-orator">No image available</span>
              </div>
            )}
          </div>
          
          {/* Pagination dots */}
          {product.images.length > 1 && (
            <div className="flex justify-center mt-3 gap-2">
              {product.images.map((_, index) => (
                <button
                  key={index}
                  onClick={() => api?.scrollTo(index)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === current ? 'bg-primary' : 'bg-primary/30'
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-4">
          {/* Title Block */}
          <div className="mt-4 mb-4">
            <h1 className="font-orator text-primary text-lg font-medium mb-1">
              {product.product_name}
            </h1>
            <div className="text-primary text-xl font-orator font-medium mb-2">
              ${product.price.toLocaleString()}
            </div>
            <div className="flex items-center gap-1 text-primary text-sm font-orator">
              <MapPin className="w-4 h-4" />
              <span>{product.location}</span>
            </div>
          </div>

          {/* Message Card */}
          <div className="mb-4 p-4 rounded-2xl border border-primary/20 bg-background">
            {isOwnProduct ? (
              <div className="p-4 rounded-2xl bg-teal-500/20 border border-teal-500/30">
                <h3 className="font-orator text-teal-700 text-sm font-medium mb-2">
                  Warning
                </h3>
                <p className="font-orator text-teal-700 text-sm">
                  This is your product. No need to message yourself!
                </p>
              </div>
            ) : !messageSent ? (
              <>
                <h3 className="font-orator text-primary text-sm font-medium mb-3">
                  Send seller a message
                </h3>
                <div className="flex gap-2">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="flex-1 h-10 rounded-full border-primary/30 bg-background text-primary placeholder:text-primary/60 font-orator text-sm"
                    placeholder="Is this still available?"
                    disabled={sendingMessage}
                  />
                  <Button 
                    onClick={handleSendMessage}
                    disabled={sendingMessage || !message.trim()}
                    className="h-10 min-w-18 px-6 rounded-full bg-primary text-white hover:bg-primary/90 font-orator text-sm disabled:opacity-50"
                  >
                    {sendingMessage ? "Sending..." : "Send"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                  <span className="font-orator text-primary text-sm font-medium">
                    Message sent to seller
                  </span>
                </div>
                <Button 
                  onClick={handleSeeConversation}
                  className="w-full h-10 rounded-lg bg-primary text-white hover:bg-primary/90 font-orator text-sm transition-colors"
                >
                  See conversation
                </Button>
              </>
            )}
          </div>

          {/* Quick Actions */}
          <div className="mb-6 flex justify-center gap-8">
            <div className="flex flex-col items-center gap-2 cursor-pointer">
              <div className="w-12 h-12 rounded-full bg-background border border-primary/20 flex items-center justify-center">
                <Share className="w-5 h-5 text-primary" />
              </div>
              <span className="text-primary text-xs font-orator">Share</span>
            </div>
            <div 
              className="flex flex-col items-center gap-2 cursor-pointer"
              onClick={!isOwnProduct ? toggleSave : undefined}
            >
              <div className={`w-12 h-12 rounded-full bg-background border border-primary/20 flex items-center justify-center transition-colors ${
                isOwnProduct ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/5'
              }`}>
                <Heart 
                  className={`w-5 h-5 transition-colors ${
                    isSaved ? 'text-red-500 fill-red-500' : 'text-primary'
                  } ${saveLoading ? 'opacity-50' : ''}`} 
                />
              </div>
              <span className="text-primary text-xs font-orator">
                {isSaved ? 'Saved' : 'Save'}
              </span>
            </div>
          </div>

          {/* Seller Information */}
          <div className="mb-4">
            <div className="w-full h-px bg-primary/12 mb-4" />
            <h3 className="font-orator text-primary text-sm font-medium mb-3">
              Seller information
            </h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center">
                <span className="text-primary text-sm font-orator">
                  {product.seller_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="text-primary text-sm font-orator font-medium">
                  {product.seller_name}
                </div>
                <div className="text-primary/70 text-xs font-orator">
                  Joined in {product.seller_joined_year}
                </div>
              </div>
            </div>
            <div className="w-full h-px bg-primary/12 mt-4" />
          </div>

          {/* Details */}
          <div className="mb-4">
            <h3 className="font-orator text-primary text-sm font-medium mb-3">
              Details
            </h3>
            <div className="space-y-2">
              <div className="flex text-sm font-orator">
                <span className="text-primary/70 w-24">Color:</span>
                <span className="text-primary">{product.color}</span>
              </div>
              <div className="flex text-sm font-orator">
                <span className="text-primary/70 w-24">Leather:</span>
                <span className="text-primary">{product.leather}</span>
              </div>
              <div className="flex text-sm font-orator">
                <span className="text-primary/70 w-24">Year purchased:</span>
                <span className="text-primary">{product.year_purchased}</span>
              </div>
              <div className="flex text-sm font-orator">
                <span className="text-primary/70 w-24">Stamp:</span>
                <span className="text-primary">{product.stamp}</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <h3 className="font-orator text-primary text-sm font-medium mb-3">
              Description
            </h3>
            <div className="p-4 rounded-2xl border border-primary/30 bg-background">
              <p className="text-primary text-sm font-orator leading-relaxed">
                {product.description}
              </p>
            </div>
          </div>

          {/* Back Button */}
          <Button 
            onClick={handleBack}
            className="w-full h-12 rounded-xl bg-primary text-white hover:bg-primary/90 font-orator font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
