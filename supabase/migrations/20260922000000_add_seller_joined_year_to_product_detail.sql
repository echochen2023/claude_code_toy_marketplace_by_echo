-- Add seller_joined_year to get_public_product_detail so the product page can
-- show how long a seller has had an account, without exposing their exact
-- join date. Table-returning functions can't change their RETURNS shape via
-- CREATE OR REPLACE, so the function is dropped and recreated.
DROP FUNCTION IF EXISTS public.get_public_product_detail(uuid);

CREATE FUNCTION public.get_public_product_detail(product_id uuid)
RETURNS TABLE (
  id uuid,
  product_name text,
  price numeric,
  color text,
  leather text,
  year_purchased integer,
  stamp text,
  location text,
  description text,
  created_at timestamptz,
  seller_name text,
  seller_joined_year integer,
  images json
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.product_name,
    p.price,
    p.color,
    p.leather,
    p.year_purchased,
    p.stamp,
    p.location,
    p.description,
    p.created_at,
    COALESCE(NULLIF(TRIM(COALESCE(prof.first_name, '') || ' ' || COALESCE(prof.last_name, '')), ''), 'Anonymous') AS seller_name,
    EXTRACT(YEAR FROM prof_meta.created_at)::integer AS seller_joined_year,
    COALESCE(imgs.images, '[]'::json) AS images
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT gp.first_name, gp.last_name
    FROM public.get_profile_names(ARRAY[p.user_id]) gp
  ) prof ON TRUE
  LEFT JOIN LATERAL (
    SELECT pr.created_at
    FROM public.profiles pr
    WHERE pr.user_id = p.user_id
  ) prof_meta ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_agg(
      json_build_object(
        'id', pi.id,
        'image_url', pi.image_url,
        'created_at', pi.created_at
      ) ORDER BY pi.created_at ASC
    ) AS images
    FROM public.product_images pi
    WHERE pi.product_id = p.id
  ) imgs ON TRUE
  WHERE p.id = product_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_product_detail(uuid) TO anon, authenticated;
