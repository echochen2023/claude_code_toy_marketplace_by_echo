-- Show users by nickname in product pages and chats, falling back to
-- first_name + last_name when no nickname is set (then 'Anonymous').
--
-- get_profile_names gains `nickname` and a computed `display_name` column so the
-- fallback rule lives in one place. Adding output columns requires DROP + CREATE.
DROP FUNCTION IF EXISTS public.get_profile_names(uuid[]);

CREATE FUNCTION public.get_profile_names(user_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  nickname text,
  display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.first_name,
    p.last_name,
    p.nickname,
    COALESCE(
      NULLIF(TRIM(p.nickname), ''),
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '')
    ) AS display_name
  FROM public.profiles p
  WHERE user_ids IS NULL OR p.user_id = ANY(user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_names(uuid[]) TO anon, authenticated;

-- The functions below keep their output columns, so CREATE OR REPLACE is enough;
-- only the name expressions now read get_profile_names().display_name.

CREATE OR REPLACE FUNCTION public.get_conversation_details(conv_id uuid)
 RETURNS TABLE(id uuid, product_id uuid, seller_id uuid, buyer_id uuid, product_name text, price numeric, first_image_url text, seller_name text, buyer_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.product_id,
    p.user_id AS seller_id,
    buyer.user_id AS buyer_id,
    p.product_name,
    p.price,
    img.image_url AS first_image_url,
    COALESCE(ps.display_name, 'Anonymous') AS seller_name,
    COALESCE(pb.display_name, 'Anonymous') AS buyer_name
  FROM public.conversations c
  JOIN public.products p ON p.id = c.product_id
  LEFT JOIN LATERAL (
    SELECT pi.image_url
    FROM public.product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.created_at ASC
    LIMIT 1
  ) img ON TRUE
  LEFT JOIN LATERAL (
    SELECT gp.display_name
    FROM public.get_profile_names(ARRAY[p.user_id]) gp
  ) ps ON TRUE
  LEFT JOIN LATERAL (
    SELECT pa.user_id
    FROM public.participants pa
    WHERE pa.conversation_id = c.id AND pa.user_id != p.user_id
    LIMIT 1
  ) buyer ON TRUE
  LEFT JOIN LATERAL (
    SELECT gp.display_name
    FROM public.get_profile_names(ARRAY[buyer.user_id]) gp
  ) pb ON TRUE
  WHERE c.id = conv_id
    AND EXISTS (
      SELECT 1 FROM public.participants pa
      WHERE pa.conversation_id = c.id AND pa.user_id = auth.uid()
    )
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_message_read_receipts(msg_id uuid)
 RETURNS TABLE(user_id uuid, user_name text, read_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ms.user_id,
    COALESCE(prof.display_name, 'Anonymous') AS user_name,
    ms.read_at
  FROM public.message_status ms
  JOIN public.messages m ON m.id = ms.message_id
  LEFT JOIN LATERAL (
    SELECT gp.display_name
    FROM public.get_profile_names(ARRAY[ms.user_id]) gp
  ) prof ON TRUE
  WHERE ms.message_id = msg_id
    AND ms.read_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.participants pa
      WHERE pa.conversation_id = m.conversation_id AND pa.user_id = auth.uid()
    )
  ORDER BY ms.read_at DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_product_detail(product_id uuid)
 RETURNS TABLE(id uuid, product_name text, price numeric, color text, leather text, year_purchased integer, stamp text, location text, description text, created_at timestamp with time zone, seller_name text, seller_joined_year integer, images json)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    COALESCE(prof.display_name, 'Anonymous') AS seller_name,
    EXTRACT(YEAR FROM prof_meta.created_at)::integer AS seller_joined_year,
    COALESCE(imgs.images, '[]'::json) AS images
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT gp.display_name
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_products(search_term text DEFAULT NULL::text, sort_by text DEFAULT 'created_at'::text)
 RETURNS TABLE(id uuid, product_name text, price numeric, color text, leather text, year_purchased integer, stamp text, location text, description text, first_image_url text, created_at timestamp with time zone, seller_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    pi.image_url AS first_image_url,
    p.created_at,
    COALESCE(prof.display_name, 'Anonymous') AS seller_name
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT image_url
    FROM public.product_images
    WHERE product_id = p.id
    ORDER BY created_at ASC
    LIMIT 1
  ) pi ON TRUE
  LEFT JOIN LATERAL (
    SELECT gp.display_name
    FROM public.get_profile_names(ARRAY[p.user_id]) gp
  ) prof ON TRUE
  WHERE 
    CASE 
      WHEN search_term IS NOT NULL THEN
        (p.product_name ILIKE '%' || search_term || '%' OR 
         p.description ILIKE '%' || search_term || '%' OR
         p.color ILIKE '%' || search_term || '%' OR
         p.leather ILIKE '%' || search_term || '%' OR
         p.location ILIKE '%' || search_term || '%')
      ELSE TRUE
    END
  ORDER BY 
    CASE WHEN sort_by = 'price_asc' THEN p.price END ASC,
    CASE WHEN sort_by = 'price_desc' THEN p.price END DESC,
    CASE WHEN sort_by = 'created_at' OR sort_by IS NULL THEN p.created_at END DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_conversations()
 RETURNS TABLE(id uuid, product_id uuid, seller_id uuid, updated_at timestamp with time zone, last_message_at timestamp with time zone, product_name text, first_image_url text, seller_name text, buyer_name text, last_message text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.product_id,
    p.user_id AS seller_id,
    c.updated_at,
    c.last_message_at,
    p.product_name,
    img.image_url AS first_image_url,
    COALESCE(ps.display_name, 'Anonymous') AS seller_name,
    COALESCE(pb.display_name, 'Anonymous') AS buyer_name,
    lm.body AS last_message
  FROM public.conversations c
  JOIN public.products p ON p.id = c.product_id
  LEFT JOIN LATERAL (
    SELECT pi.image_url
    FROM public.product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.created_at ASC
    LIMIT 1
  ) img ON TRUE
  LEFT JOIN LATERAL (
    SELECT gp.display_name
    FROM public.get_profile_names(ARRAY[p.user_id]) gp
  ) ps ON TRUE
  LEFT JOIN LATERAL (
    SELECT pa.user_id
    FROM public.participants pa
    WHERE pa.conversation_id = c.id AND pa.user_id != p.user_id
    LIMIT 1
  ) buyer ON TRUE
  LEFT JOIN LATERAL (
    SELECT gp.display_name
    FROM public.get_profile_names(ARRAY[buyer.user_id]) gp
  ) pb ON TRUE
  LEFT JOIN LATERAL (
    SELECT m.body
    FROM public.messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON TRUE
  WHERE EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.conversation_id = c.id AND pa.user_id = auth.uid()
  )
  ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_saved_products()
 RETURNS TABLE(saved_id uuid, product_id uuid, product_name text, price numeric, location text, first_image_url text, seller_name text, saved_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    sp.id AS saved_id,
    p.id AS product_id,
    p.product_name,
    p.price,
    COALESCE(p.location, 'Location not specified') AS location,
    img.image_url AS first_image_url,
    COALESCE(prof.display_name, 'Anonymous') AS seller_name,
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
    SELECT gp.display_name
    FROM public.get_profile_names(ARRAY[p.user_id]) gp
  ) prof ON TRUE
  WHERE sp.user_id = auth.uid()
  ORDER BY sp.created_at DESC;
$function$
;

