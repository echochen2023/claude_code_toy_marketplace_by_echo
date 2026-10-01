#### Knowledge
Always look up what existing RPC function are in supabase and conside reuse them to fetch relevant data. 

When the task involves accessing data in supabase tables, always consider create a new RPC function to fetch so that you don't encounter the RLS permission issue when joining tables which results in no response. 

Do not commit any PII information such as email.

Use camel style to name files, ex. CreateListingForm.tsx  