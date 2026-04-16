import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('dashboard_admins').select('id, email, role');
  if (error) console.error('Error fetching admins:', error);
  else console.log('Admins in DB:', data);
}
run();
