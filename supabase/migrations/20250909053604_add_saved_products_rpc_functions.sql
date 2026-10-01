-- Function to check if a product is saved by the current user
CREATE OR REPLACE FUNCTION public.is_product_saved(product_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Return true if the product is saved by the current user
  RETURN EXISTS (
    SELECT 1 
    FROM public.saved_products 
    WHERE user_id = auth.uid() 
    AND product_id = product_uuid
  );
END;
$$;

-- Function to toggle saved status of a product
CREATE OR REPLACE FUNCTION public.toggle_saved_product(product_uuid uuid)
RETURNS TABLE(is_saved boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_saved boolean;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'User not authenticated'::text;
    RETURN;
  END IF;

  -- Check if product exists
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = product_uuid) THEN
    RETURN QUERY SELECT false, 'Product not found'::text;
    RETURN;
  END IF;

  -- Check current saved status
  SELECT EXISTS (
    SELECT 1 
    FROM public.saved_products 
    WHERE user_id = auth.uid() 
    AND product_id = product_uuid
  ) INTO current_saved;

  IF current_saved THEN
    -- Product is currently saved, so unsave it
    DELETE FROM public.saved_products 
    WHERE user_id = auth.uid() 
    AND product_id = product_uuid;
    
    RETURN QUERY SELECT false, 'Product removed from saved items'::text;
  ELSE
    -- Product is not saved, so save it
    INSERT INTO public.saved_products (user_id, product_id)
    VALUES (auth.uid(), product_uuid)
    ON CONFLICT (user_id, product_id) DO NOTHING;
    
    RETURN QUERY SELECT true, 'Product added to saved items'::text;
  END IF;
END;
$$;