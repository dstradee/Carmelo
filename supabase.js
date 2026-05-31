import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm';

const SUPABASE_URL = 'https://wtilirbdusugtxvbwlat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DzJrXO-AhxTB67zBW3DkIg_-j0Qihvh';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
