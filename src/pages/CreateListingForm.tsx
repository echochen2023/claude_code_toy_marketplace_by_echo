import NavigationBar from "@/components/NavigationBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, Camera, Wand2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import samplePic from "@/assets/toy_bear.png";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { resizeImage } from "@/lib/imageUtils";
import { ProductWithImage } from "@/hooks/useUserProducts";
import * as Sentry from "@sentry/react";

const BANNED_WORDS = ["fuck", "murder"];

function findBannedWords(fields: Record<string, string>): { field: string; word: string }[] {
  const hits: { field: string; word: string }[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const lower = value.toLowerCase();
    for (const word of BANNED_WORDS) {
      if (lower.includes(word)) {
        hits.push({ field, word });
      }
    }
  }
  return hits;
}

const CreateListingForm = () => {
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<{id: string, url: string}[]>([]);
  const [sampleImageFile, setSampleImageFile] = useState<File | null>(null);
  const [productName, setProductName] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [color, setColor] = useState<string>("");
  const [leather, setLeather] = useState<string>("");
  const [yearPurchased, setYearPurchased] = useState<string>("");
  const [stamp, setStamp] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Maximum file size: 5MB
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
  const IMAGE_RESIZE_WIDTH_PX = 400;
  const IMAGE_RESIZE_HEIGHT_PX = 400;

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const validFiles: File[] = [];
      const invalidFiles: string[] = [];
      
      // Process each file
      for (const file of Array.from(files).slice(0, 5 - selectedImages.length)) {
        if (file.size <= MAX_FILE_SIZE) {
          try {
            // Resize the image while maintaining aspect ratio
            const resizedFile = await resizeImage(file, IMAGE_RESIZE_WIDTH_PX, IMAGE_RESIZE_HEIGHT_PX);
            validFiles.push(resizedFile);
          } catch (error) {
            console.error("Error resizing image:", error);
            invalidFiles.push(`${file.name} (resize failed)`);
          }
        } else {
          invalidFiles.push(file.name);
        }
      }
      
      // Add valid files to state
      if (validFiles.length > 0) {
        setSelectedImages(prev => [...prev, ...validFiles]);
      }
      
      // Show error for invalid files
      if (invalidFiles.length > 0) {
        toast({
          title: "File size exceeded or resize failed",
          description: `${invalidFiles.join(", ")} ${invalidFiles.length === 1 ? "exceeds" : "exceed"} the 5MB limit or couldn't be resized.`,
          variant: "destructive"
        });
      }
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Check if we're in edit mode and fetch product data
  useEffect(() => {
    const productId = params.id;
    if (productId) {
      setIsEditMode(true);
      setProductId(productId);
      fetchProductData(productId);
    }
  }, [params.id]);

  // Fetch product data for editing
  const fetchProductData = async (id: string) => {
    setIsLoading(true);
    try {
      // Fetch product details
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (productError) {
        throw productError;
      }

      if (!product) {
        toast({ title: "Error", description: "Product not found", variant: "destructive" });
        navigate("/create-listing");
        return;
      }

      // Fetch product images
      const { data: images, error: imagesError } = await supabase
        .from("product_images")
        .select("id, image_url")
        .eq("product_id", id);

      if (imagesError) {
        throw imagesError;
      }

      // Set form values
      setProductName(product.product_name || "");
      setPrice(product.price?.toString() || "");
      setColor(product.color || "");
      setLeather(product.leather || "");
      setYearPurchased(product.year_purchased?.toString() || "");
      setStamp(product.stamp || "");
      setLocation(product.location || "");
      setDescription(product.description || "");
      
      // Set existing images
      if (images && images.length > 0) {
        setExistingImages(images.map(img => ({ id: img.id, url: img.image_url })));
      }
    } catch (error) {
      console.error("Error fetching product:", error);
      toast({ 
        title: "Error", 
        description: "Failed to load product details", 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch and prepare the sample image
  useEffect(() => {
    const loadSampleImage = async () => {
      try {
        const response = await fetch(samplePic);
        const blob = await response.blob();
        
        // Check if sample image is within size limit
        if (blob.size > MAX_FILE_SIZE) {
          console.warn("Sample image exceeds 5MB size limit");
          toast({
            title: "Sample image too large",
            description: "The sample image exceeds the 5MB size limit and won't be used.",
            variant: "destructive"
          });
          return;
        }
        
        const file = new File([blob], "toy_bear.png", { type: blob.type });
        
        // Resize the sample image 
        try {
          const resizedFile = await resizeImage(file, IMAGE_RESIZE_WIDTH_PX, IMAGE_RESIZE_HEIGHT_PX);
          setSampleImageFile(resizedFile);
        } catch (error) {
          console.error("Error resizing sample image:", error);
          setSampleImageFile(file); // Use original file as fallback
        }
      } catch (error) {
        console.error("Error loading sample image:", error);
      }
    };
    
    // Only load sample image if not in edit mode
    if (!isEditMode) {
      loadSampleImage();
    }
  }, [isEditMode]);

  const fillSampleValues = () => {
    setProductName("Toy Bear");
    setPrice("199.00");
    setColor("white");
    setLeather("Cotton");
    setYearPurchased("2025");
    setStamp("12345 52310421");
    setLocation("Mountain View, CA, USA");
    setDescription("I bought this lovely toy bear last year but now my 3-year-old boy has 20+ toys so I need to clean up a bit!");
    
    // Add the sample image if available
    if (sampleImageFile) {
      setSelectedImages([sampleImageFile]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (!user) {
        toast({ title: "Please sign in", description: "You must be logged in to publish.", variant: "destructive" });
        return;
      }

      const priceNumber = Number(price);
      const yearNumber = parseInt(yearPurchased, 10);

      const payload = {
        user_id: user.id,
        product_name: productName.trim(),
        price: isNaN(priceNumber) ? 0 : priceNumber,
        color: color.trim(),
        leather: leather.trim(),
        year_purchased: isNaN(yearNumber) ? null : yearNumber,
        stamp: stamp.trim(),
        location: location.trim(),
        description: description.trim(),
      };

      const bannedWordHits = findBannedWords({
        product_name: payload.product_name,
        color: payload.color,
        leather: payload.leather,
        stamp: payload.stamp,
        location: payload.location,
        description: payload.description,
      });

      if (bannedWordHits.length > 0) {
        const hitsByField = bannedWordHits.reduce<Record<string, string[]>>((acc, hit) => {
          (acc[hit.field] ??= []).push(hit.word);
          return acc;
        }, {});

        for (const [field, detectedWords] of Object.entries(hitsByField)) {
          Sentry.addBreadcrumb({
            category: "content-moderation",
            message: `Profanity detected in ${field}`,
            level: "warning",
            data: { field, detectedWords },
          });
        }

        // Fire-and-forget: flush the Replay buffer in the background so
        // reporting a flagged listing never delays the actual submission.
        Promise.resolve(Sentry.getReplay()?.flush())
          .catch(() => {})
          .finally(() => {
            Sentry.captureMessage("Product listing contains flagged language", {
              level: "warning",
              extra: {
                user_id: user.id,
                isEditMode,
                productId: isEditMode ? params.id : undefined,
                hits: bannedWordHits,
              },
            });
          });
      }

      let productId: string;

      if (isEditMode) {
        // Update existing product
        const { error: updateError } = await supabase
          .from("products")
          .update(payload)
          .eq("id", params.id);

        if (updateError) {
          console.error(updateError);
          toast({ title: "Update failed", description: updateError.message, variant: "destructive" });
          return;
        }
        
        productId = params.id!;
      } else {
        // Insert new product
        const { data: productData, error: insertError } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();

        if (insertError) {
          console.error(insertError);
          toast({ title: "Publish failed", description: insertError.message, variant: "destructive" });
          return;
        }
        
        productId = productData.id;
      }

      // Upload new images to storage and create image records
      if (selectedImages.length > 0) {
        const imagePromises = selectedImages.map(async (image, index) => {
          // Sanitize filename by replacing spaces with underscores
          const sanitizedName = image.name.replace(/\s+/g, '_');
          const fileName = `${Date.now()}_${index}_${sanitizedName}`;
          const filePath = `${user.id}/${fileName}`;
          
          // Upload to storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(filePath, image);

          if (uploadError) {
            console.error('Upload error:', uploadError);
            throw uploadError;
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(filePath);

          // Insert image record
          const { error: imageError } = await supabase
            .from('product_images')
            .insert({
              product_id: productId,
              image_url: urlData.publicUrl
            });

          if (imageError) {
            console.error('Image record error:', imageError);
            throw imageError;
          }

          return urlData.publicUrl;
        });

        try {
          await Promise.all(imagePromises);
        } catch (imageError) {
          console.error('Image upload failed:', imageError);
          toast({ 
            title: "Images upload failed", 
            description: "Product saved but some images couldn't be uploaded.",
            variant: "destructive" 
          });
        }
      }

      toast({ 
        title: isEditMode ? "Listing updated" : "Listing published", 
        description: isEditMode ? "Your product has been updated." : "Your product has been posted." 
      });

      // Clear form
      setSelectedImages([]);
      setExistingImages([]);
      setProductName("");
      setPrice("");
      setColor("");
      setLeather("");
      setYearPurchased("");
      setStamp("");
      setLocation("");
      setDescription("");
      
      // Redirect to the create-listing page
      navigate("/create-listing");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-orator">
      <NavigationBar />
      
      <main className="px-4 pb-8">
        <form className="space-y-4 max-w-full mx-auto" onSubmit={handleSubmit}>
          {/* Upload Section */}
          <div className="mt-4 mb-6">
            <div 
              className="relative border border-primary/30 rounded-2xl p-4 text-center cursor-pointer hover:border-primary/50 transition-colors bg-background"
              style={{ minHeight: '240px' }}
              onClick={() => document.getElementById('photo-upload')?.click()}
            >
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
                disabled={selectedImages.length >= 5}
              />
              
              {selectedImages.length === 0 && existingImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full space-y-3">
                  <Camera className="w-8 h-8 text-primary" />
                  <p className="text-primary font-medium text-base">Upload photos</p>
                </div>
              ) : (
                <div className="flex flex-wrap justify-center gap-4 p-2">
                  {/* Existing images */}
                  {existingImages.map((image, index) => (
                    <div key={`existing-${index}`} className="relative w-24 h-24">
                      <img
                        src={image.url}
                        alt={`Existing ${index + 1}`}
                        className="w-full h-full object-cover rounded-lg border border-primary/20"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExistingImages(prev => prev.filter((_, i) => i !== index));
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  
                  {/* Newly selected images */}
                  {selectedImages.map((image, index) => (
                    <div key={`new-${index}`} className="relative w-24 h-24">
                      <img
                        src={URL.createObjectURL(image)}
                        alt={`Upload ${index + 1}`}
                        className="w-full h-full object-cover rounded-lg border border-primary/20"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(index);
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {(selectedImages.length + existingImages.length) < 5 && (
                    <div className="border border-dashed border-primary/30 rounded-lg flex items-center justify-center w-24 h-24 mb-2">
                      <Plus className="w-6 h-6 text-primary/50" />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-sm text-primary/75">Upload up to 5 photos</p>
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  fillSampleValues();
                }}
                className="text-primary/20 hover:text-primary/60 transition-colors"
                title="Fill with sample data"
              >
                <Wand2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            {/* Product Name - Select Field */}
            <div className="space-y-2">
              <Label htmlFor="product-name" className="sr-only">Product name</Label>
              <Input
                id="product-name"
                placeholder="Product name"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="h-12 rounded-[22px] border-primary/30 focus:border-primary bg-background px-4 text-primary placeholder:text-primary/70 font-orator"
              />
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="price" className="sr-only">Price</Label>
              <Input
                id="price"
                type="number"
                placeholder="Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-12 rounded-[22px] border-primary/30 focus:border-primary bg-background px-4 text-primary placeholder:text-primary/70 font-orator"
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label htmlFor="color" className="sr-only">Color</Label>
              <Input
                id="color"
                placeholder="Color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-12 rounded-[22px] border-primary/30 focus:border-primary bg-background px-4 text-primary placeholder:text-primary/70 font-orator"
              />
            </div>

            {/* Leather */}
            <div className="space-y-2">
              <Label htmlFor="leather" className="sr-only">Leather</Label>
              <Input
                id="leather"
                placeholder="Leather"
                value={leather}
                onChange={(e) => setLeather(e.target.value)}
                className="h-12 rounded-[22px] border-primary/30 focus:border-primary bg-background px-4 text-primary placeholder:text-primary/70 font-orator"
              />
            </div>

            {/* Year Purchased */}
            <div className="space-y-2">
              <Label htmlFor="year-purchased" className="sr-only">Year purchased</Label>
              <Input
                id="year-purchased"
                type="number"
                placeholder="Year purchased"
                maxLength={4}
                value={yearPurchased}
                onChange={(e) => setYearPurchased(e.target.value)}
                className="h-12 rounded-[22px] border-primary/30 focus:border-primary bg-background px-4 text-primary placeholder:text-primary/70 font-orator"
              />
            </div>

            {/* Stamp */}
            <div className="space-y-2">
              <Label htmlFor="stamp" className="sr-only">Stamp</Label>
              <Input
                id="stamp"
                placeholder="Stamp"
                value={stamp}
                onChange={(e) => setStamp(e.target.value)}
                className="h-12 rounded-[22px] border-primary/30 focus:border-primary bg-background px-4 text-primary placeholder:text-primary/70 font-orator"
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location" className="sr-only">Location</Label>
              <Input
                id="location"
                placeholder="Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-12 rounded-[22px] border-primary/30 focus:border-primary bg-background px-4 text-primary placeholder:text-primary/70 font-orator"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="sr-only">Description</Label>
              <Textarea
                id="description"
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-[22px] min-h-[100px] border-primary/30 focus:border-primary bg-background px-4 py-3 resize-none text-primary placeholder:text-primary/70 font-orator"
              />
            </div>
          </div>

          {/* Publish Button */}
          <div className="pt-4">
            <Button 
              type="submit"
              variant="publish"
              size="marketplace"
              className="w-full font-orator text-base"
              disabled={isSubmitting || isLoading}
            >
              {isLoading ? "Loading..." : isSubmitting ? (isEditMode ? "Updating..." : "Publishing...") : (isEditMode ? "Update" : "Publish")}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default CreateListingForm;
