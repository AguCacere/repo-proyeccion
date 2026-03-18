const SUPABASE_URL = 'https://ibtajsnwncotnitgaxtc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlidGFqc253bmNvdG5pdGdheHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTI0OTUsImV4cCI6MjA4ODcyODQ5NX0.izoonjIb3CJjSqpLHhiTH6x_ovWRTHcy_XosNSv_EJU';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
