-- =====================================================================================
-- CONSOLIDATED MIGRATION FILE
-- Combined from all migrations (2025-08-23 to 2025-09-08)
-- Removes duplicates, handles dependencies, and maintains final state
-- =====================================================================================

-- =====================================================================================
-- PHASE 1: FOUNDATION - Core Functions and Profiles
-- =====================================================================================

-- 1) Core utility function for auto-updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2) Profiles table - core user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Make user_id unique for FK references
ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);

-- Foreign key to auth.users
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_id_fk 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index for performance
CREATE INDEX idx_profiles_user_id ON public.profiles (user_id);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Auto-update timestamps
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Create basic profile for email auth users
  -- Names can be updated later through the profile page
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    -- Try to extract first name from metadata, otherwise leave NULL
    COALESCE(NEW.raw_user_meta_data->>'first_name', NULL),
    -- Try to extract last name from metadata, otherwise leave NULL
    COALESCE(NEW.raw_user_meta_data->>'last_name', NULL)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================================
-- PHASE 2: CORE BUSINESS LOGIC - Products and Images
-- =====================================================================================

-- 4) Products table - marketplace listings
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  color TEXT,
  leather TEXT,
  year_purchased INTEGER,
  stamp TEXT,
  location TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Foreign key to profiles
ALTER TABLE public.products
  ADD CONSTRAINT products_user_fk
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Auto-update timestamps
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Product images table
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Foreign key to products
ALTER TABLE public.product_images
  ADD CONSTRAINT product_images_product_fk
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- Index for performance
CREATE INDEX idx_product_images_product_id ON public.product_images (product_id);

-- Enable RLS
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- Auto-update timestamps
CREATE TRIGGER update_product_images_updated_at
BEFORE UPDATE ON public.product_images
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================================
-- PHASE 3: STORAGE AND PUBLIC ACCESS
-- =====================================================================================

-- 6) Storage bucket for product images
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

-- Storage policies
CREATE POLICY "Public can view product images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Users can upload to their folder (product-images)"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'product-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own files (product-images)"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'product-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'product-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own files (product-images)"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'product-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 7) Public access policies for products and images
CREATE POLICY "Public can view products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Public can view product images"
ON public.product_images
FOR SELECT
TO anon, authenticated
USING (true);

-- User CRUD policies for products
CREATE POLICY "Users can create their own products"
ON public.products
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products"
ON public.products
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products"
ON public.products
FOR DELETE
USING (auth.uid() = user_id);

-- Product image policies (via product ownership)
CREATE POLICY "Users can create images for their products"
ON public.product_images
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = public.product_images.product_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update images for their products"
ON public.product_images
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = public.product_images.product_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = public.product_images.product_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete images for their products"
ON public.product_images
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = public.product_images.product_id
      AND p.user_id = auth.uid()
  )
);

-- =====================================================================================
-- PHASE 4: SECURE DATA ACCESS FUNCTIONS
-- =====================================================================================

-- 8) Secure RPC to expose only first_name and last_name from profiles
CREATE FUNCTION public.get_profile_names(user_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.first_name, p.last_name
  FROM public.profiles p
  WHERE user_ids IS NULL OR p.user_id = ANY(user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_names(uuid[]) TO anon, authenticated;

-- 9) Public product listing with search
CREATE FUNCTION public.get_public_products(search_term text DEFAULT NULL, sort_by text DEFAULT 'created_at')
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
  first_image_url text,
  created_at timestamptz,
  seller_name text
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
    pi.image_url AS first_image_url,
    p.created_at,
    COALESCE(NULLIF(TRIM(COALESCE(prof.first_name, '') || ' ' || COALESCE(prof.last_name, '')), ''), 'Anonymous') AS seller_name
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT image_url
    FROM public.product_images
    WHERE product_id = p.id
    ORDER BY created_at ASC
    LIMIT 1
  ) pi ON TRUE
  LEFT JOIN LATERAL (
    SELECT gp.first_name, gp.last_name
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
$$;

GRANT EXECUTE ON FUNCTION public.get_public_products(text, text) TO anon, authenticated;

-- 10) Public product detail view
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
    COALESCE(imgs.images, '[]'::json) AS images
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT gp.first_name, gp.last_name
    FROM public.get_profile_names(ARRAY[p.user_id]) gp
  ) prof ON TRUE
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

-- =====================================================================================
-- PHASE 5: MESSAGING SYSTEM - Tables and Core Functions
-- =====================================================================================

-- 11) Conversations table (without legacy buyer/seller columns)
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Foreign key to products
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_product_fk
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Auto-update timestamps
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 12) Participants table - flexible conversation membership
CREATE TABLE public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT participants_unique_conversation_user UNIQUE (conversation_id, user_id)
);

-- Enable RLS
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_participants_user_id ON public.participants (user_id);
CREATE INDEX idx_participants_conv_user ON public.participants (conversation_id, user_id);

-- 13) Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Foreign keys
ALTER TABLE public.messages
  ADD CONSTRAINT messages_conversation_fk
  FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_fk
  FOREIGN KEY (sender_id) REFERENCES public.profiles(user_id) ON DELETE RESTRICT;

-- Indexes for performance
CREATE INDEX idx_messages_conversation_created_at ON public.messages (conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender_created_at ON public.messages (sender_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Configure for real-time
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- 14) Function to bump conversation timestamps on new messages
CREATE FUNCTION public.bump_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = now(),
      last_message_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bump_conversation_on_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.bump_conversation_on_message();

-- 15) Function to auto-add participants on conversation creation
CREATE FUNCTION public.add_participants_on_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  seller_user_id uuid;
BEGIN
  -- Get seller from product
  SELECT p.user_id INTO seller_user_id
  FROM public.products p
  WHERE p.id = NEW.product_id;
  
  -- Add seller as participant
  INSERT INTO public.participants (conversation_id, user_id)
  VALUES (NEW.id, seller_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER add_participants_on_conversation
AFTER INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.add_participants_on_conversation();

-- =====================================================================================
-- PHASE 6: MESSAGING RLS POLICIES
-- =====================================================================================

-- Participant policies
CREATE POLICY "Users can view their participant rows"
ON public.participants
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Conversation policies
CREATE POLICY "User can create conversation for product they don't own"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = public.conversations.product_id
      AND p.user_id != auth.uid()
  )
);

CREATE POLICY "Participants can view their conversations (via participants)"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.conversation_id = public.conversations.id
      AND pa.user_id = auth.uid()
  )
);

-- Message policies
CREATE POLICY "Participants can view messages"
ON public.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.conversation_id = public.messages.conversation_id
      AND pa.user_id = auth.uid()
  )
);

CREATE POLICY "Only participants can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (sender_id = auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.conversation_id = public.messages.conversation_id
      AND pa.user_id = auth.uid()
  )
);

CREATE POLICY "Sender can update own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.conversation_id = public.messages.conversation_id
      AND pa.user_id = auth.uid()
  )
)
WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Sender can delete own messages"
ON public.messages
FOR DELETE
TO authenticated
USING (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.conversation_id = public.messages.conversation_id
      AND pa.user_id = auth.uid()
  )
);

-- =====================================================================================
-- PHASE 7: MESSAGING RPC FUNCTIONS
-- =====================================================================================

-- 16) Get user's conversations with details
CREATE FUNCTION public.get_user_conversations()
RETURNS TABLE(
  id uuid,
  product_id uuid,
  seller_id uuid,
  updated_at timestamptz,
  last_message_at timestamptz,
  product_name text,
  first_image_url text,
  seller_name text,
  buyer_name text,
  last_message text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    c.product_id,
    p.user_id AS seller_id,
    c.updated_at,
    c.last_message_at,
    p.product_name,
    img.image_url AS first_image_url,
    COALESCE(NULLIF(TRIM(COALESCE(ps.first_name, '') || ' ' || COALESCE(ps.last_name, '')), ''), 'Anonymous') AS seller_name,
    COALESCE(NULLIF(TRIM(COALESCE(pb.first_name, '') || ' ' || COALESCE(pb.last_name, '')), ''), 'Anonymous') AS buyer_name,
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
    SELECT gp.first_name, gp.last_name
    FROM public.get_profile_names(ARRAY[p.user_id]) gp
  ) ps ON TRUE
  LEFT JOIN LATERAL (
    SELECT pa.user_id
    FROM public.participants pa
    WHERE pa.conversation_id = c.id AND pa.user_id != p.user_id
    LIMIT 1
  ) buyer ON TRUE
  LEFT JOIN LATERAL (
    SELECT gp.first_name, gp.last_name
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
$$;

GRANT EXECUTE ON FUNCTION public.get_user_conversations() TO authenticated;

-- 17) Get conversation details for participants
CREATE FUNCTION public.get_conversation_details(conv_id uuid)
RETURNS TABLE(
  id uuid,
  product_id uuid,
  seller_id uuid,
  buyer_id uuid,
  product_name text,
  price numeric,
  first_image_url text,
  seller_name text,
  buyer_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    c.product_id,
    p.user_id AS seller_id,
    buyer.user_id AS buyer_id,
    p.product_name,
    p.price,
    img.image_url AS first_image_url,
    COALESCE(NULLIF(TRIM(COALESCE(ps.first_name, '') || ' ' || COALESCE(ps.last_name, '')), ''), 'Anonymous') AS seller_name,
    COALESCE(NULLIF(TRIM(COALESCE(pb.first_name, '') || ' ' || COALESCE(pb.last_name, '')), ''), 'Anonymous') AS buyer_name
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
    SELECT gp.first_name, gp.last_name
    FROM public.get_profile_names(ARRAY[p.user_id]) gp
  ) ps ON TRUE
  LEFT JOIN LATERAL (
    SELECT pa.user_id
    FROM public.participants pa
    WHERE pa.conversation_id = c.id AND pa.user_id != p.user_id
    LIMIT 1
  ) buyer ON TRUE
  LEFT JOIN LATERAL (
    SELECT gp.first_name, gp.last_name
    FROM public.get_profile_names(ARRAY[buyer.user_id]) gp
  ) pb ON TRUE
  WHERE c.id = conv_id
    AND EXISTS (
      SELECT 1 FROM public.participants pa
      WHERE pa.conversation_id = c.id AND pa.user_id = auth.uid()
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_details(uuid) TO authenticated;

-- 18) Get conversation messages
CREATE FUNCTION public.get_conversation_messages(conv_id uuid)
RETURNS TABLE(id uuid, sender_id uuid, body text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id, m.sender_id, m.body, m.created_at
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.conversation_id = conv_id
    AND EXISTS (
      SELECT 1 FROM public.participants pa
      WHERE pa.conversation_id = c.id AND pa.user_id = auth.uid()
    )
  ORDER BY m.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid) TO authenticated;

-- =====================================================================================
-- PHASE 8: ENHANCED FEATURES - Saved Products and Read Status
-- =====================================================================================

-- 19) Saved products table
CREATE TABLE public.saved_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Foreign keys
ALTER TABLE public.saved_products
  ADD CONSTRAINT saved_products_user_fk
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(user_id)
  ON DELETE CASCADE;

ALTER TABLE public.saved_products
  ADD CONSTRAINT saved_products_product_fk
  FOREIGN KEY (product_id)
  REFERENCES public.products(id)
  ON DELETE CASCADE;

-- Uniqueness constraint
ALTER TABLE public.saved_products
  ADD CONSTRAINT saved_products_unique_user_product UNIQUE (user_id, product_id);

-- Indexes
CREATE INDEX saved_products_user_created_at_idx ON public.saved_products (user_id, created_at DESC);
CREATE INDEX saved_products_product_idx ON public.saved_products (product_id);

-- Enable RLS
ALTER TABLE public.saved_products ENABLE ROW LEVEL SECURITY;

-- Saved products policies
CREATE POLICY "Users can view their own saved products"
ON public.saved_products
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can save products"
ON public.saved_products
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their saved products"
ON public.saved_products
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their saved products"
ON public.saved_products
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 20) Message status table for read tracking
CREATE TABLE public.message_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_status_unique_message_user UNIQUE (message_id, user_id)
);

-- Foreign keys
ALTER TABLE public.message_status
  ADD CONSTRAINT message_status_message_fk
  FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE public.message_status
  ADD CONSTRAINT message_status_user_fk
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_message_status_user_read ON public.message_status (user_id, read_at);
CREATE INDEX idx_message_status_message ON public.message_status (message_id);

-- Enable RLS
ALTER TABLE public.message_status ENABLE ROW LEVEL SECURITY;

-- Auto-update timestamps
CREATE TRIGGER set_updated_at_on_message_status
BEFORE UPDATE ON public.message_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Message status policies
CREATE POLICY "Users can view their own message status"
ON public.message_status
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can create read status for messages they can access"
ON public.message_status
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.participants pa ON pa.conversation_id = m.conversation_id
    WHERE m.id = public.message_status.message_id
      AND pa.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own message status"
ON public.message_status
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own message status"
ON public.message_status
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- =====================================================================================
-- PHASE 9: UTILITY AND HELPER FUNCTIONS
-- =====================================================================================

-- 21) Check if user owns a product
CREATE FUNCTION public.is_product_owner(product_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = product_uuid AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_product_owner(uuid) TO authenticated;

-- 22) Get user's saved products
CREATE FUNCTION public.get_user_saved_products()
RETURNS TABLE (
  saved_id uuid,
  product_id uuid,
  product_name text,
  price numeric,
  first_image_url text,
  seller_name text,
  saved_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    sp.id AS saved_id,
    p.id AS product_id,
    p.product_name,
    p.price,
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

GRANT EXECUTE ON FUNCTION public.get_user_saved_products() TO authenticated;

-- 23) Check if user is participant of conversation
CREATE FUNCTION public.is_participant_of_conversation(conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.participants
    WHERE conversation_id = conv_id AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_participant_of_conversation(uuid) TO authenticated;

-- 24) Check if user can access message
CREATE FUNCTION public.is_participant_of_message(msg_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.participants pa ON pa.conversation_id = m.conversation_id
    WHERE m.id = msg_id AND pa.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_participant_of_message(uuid) TO authenticated;

-- 25) Get or create conversation for product
CREATE FUNCTION public.get_user_conversation_for_product(prod_id uuid)
RETURNS TABLE (conversation_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id
  FROM public.conversations c
  JOIN public.participants pa ON pa.conversation_id = c.id
  WHERE c.product_id = prod_id AND pa.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_conversation_for_product(uuid) TO authenticated;

-- 26) Create new conversation
CREATE FUNCTION public.create_conversation(prod_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_conversation_id uuid;
  seller_id uuid;
BEGIN
  -- Get seller ID
  SELECT user_id INTO seller_id FROM public.products WHERE id = prod_id;
  
  -- Prevent self-conversation
  IF seller_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;
  
  -- Create conversation
  INSERT INTO public.conversations (product_id)
  VALUES (prod_id)
  RETURNING id INTO new_conversation_id;
  
  -- Add buyer as participant (seller added automatically via trigger)
  INSERT INTO public.participants (conversation_id, user_id)
  VALUES (new_conversation_id, auth.uid())
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  
  RETURN new_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_conversation(uuid) TO authenticated;

-- =====================================================================================
-- PHASE 10: READ STATUS TRACKING FUNCTIONS
-- =====================================================================================

-- 27) Mark single message as read
CREATE FUNCTION public.mark_message_read(msg_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.message_status (message_id, user_id, read_at)
  VALUES (msg_id, auth.uid(), now())
  ON CONFLICT (message_id, user_id)
  DO UPDATE SET read_at = now(), updated_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.mark_message_read(uuid) TO authenticated;

-- 28) Mark all messages in conversation as read
CREATE FUNCTION public.mark_conversation_read(conv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.message_status (message_id, user_id, read_at)
  SELECT m.id, auth.uid(), now()
  FROM public.messages m
  WHERE m.conversation_id = conv_id
    AND EXISTS (
      SELECT 1 FROM public.participants pa
      WHERE pa.conversation_id = conv_id AND pa.user_id = auth.uid()
    )
  ON CONFLICT (message_id, user_id)
  DO UPDATE SET read_at = now(), updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- 29) Get unread count for conversation
CREATE FUNCTION public.get_unread_count_for_conversation(conv_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)
  FROM public.messages m
  WHERE m.conversation_id = conv_id
    AND m.sender_id != auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.message_status ms
      WHERE ms.message_id = m.id
        AND ms.user_id = auth.uid()
        AND ms.read_at IS NOT NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.participants pa
      WHERE pa.conversation_id = conv_id AND pa.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_count_for_conversation(uuid) TO authenticated;

-- 30) Get read receipts for message
CREATE FUNCTION public.get_message_read_receipts(msg_id uuid)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  read_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ms.user_id,
    COALESCE(NULLIF(TRIM(COALESCE(prof.first_name, '') || ' ' || COALESCE(prof.last_name, '')), ''), 'Anonymous') AS user_name,
    ms.read_at
  FROM public.message_status ms
  JOIN public.messages m ON m.id = ms.message_id
  LEFT JOIN LATERAL (
    SELECT gp.first_name, gp.last_name
    FROM public.get_profile_names(ARRAY[ms.user_id]) gp
  ) prof ON TRUE
  WHERE ms.message_id = msg_id
    AND ms.read_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.participants pa
      WHERE pa.conversation_id = m.conversation_id AND pa.user_id = auth.uid()
    )
  ORDER BY ms.read_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_message_read_receipts(uuid) TO authenticated;

-- 31) Get conversation messages with read status
CREATE FUNCTION public.get_conversation_messages_with_read_status(conv_id uuid)
RETURNS TABLE (
  id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  is_read boolean,
  read_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    m.id,
    m.sender_id,
    m.body,
    m.created_at,
    (ms.read_at IS NOT NULL) AS is_read,
    ms.read_at
  FROM public.messages m
  LEFT JOIN public.message_status ms ON ms.message_id = m.id AND ms.user_id = auth.uid()
  WHERE m.conversation_id = conv_id
    AND EXISTS (
      SELECT 1 FROM public.participants pa
      WHERE pa.conversation_id = conv_id AND pa.user_id = auth.uid()
    )
  ORDER BY m.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_messages_with_read_status(uuid) TO authenticated;

-- =====================================================================================
-- END OF CONSOLIDATED MIGRATION
-- =====================================================================================