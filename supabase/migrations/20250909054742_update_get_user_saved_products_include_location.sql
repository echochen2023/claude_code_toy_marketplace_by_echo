-- Drop and recreate get_user_saved_products function to include location
DROP FUNCTION IF EXISTS public.get_user_saved_products();

CREATE FUNCTION public.get_user_saved_products()
RETURNS TABLE(saved_id uuid, product_id uuid, product_name text, price numeric, location text, first_image_url text, seller_name text, saved_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    sp.id AS saved_id,
    p.id AS product_id,
    p.product_name,
    p.price,
    COALESCE(p.location, 'Location not specified') AS location,
    img.image_url AS first_image_url,
    COALESCE(NULLIF(TRIM(COALESCE(prof.first_name, '') || ' ' || COALESCE(prof.last_name, '')), ''), 'Anonymous') AS seller_name,
    sp.created_at AS saved_at
  FROM public.saved_products sp
  JOIN public.products p ON p.id = sp.product_id
  LEFT JOIN LATERAL (
    SELECT pi.image_url
    FROM public.product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.created_at ASC
    LIMIT 1
  ) img ON TRUE
  LEFT JOIN LATERAL (
    SELECT gp.first_name, gp.last_name
    FROM public.get_profile_names(ARRAY[p.user_id]) gp
  ) prof ON TRUE
  WHERE sp.user_id = auth.uid()
  ORDER BY sp.created_at DESC;
$$;
