import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://dvtychdkydveszeqnesz.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_-g_ImttUqiRHeM_p1JiHJg_2wDO1dzL'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
