import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const email = process.env.NAVME_SUPER_ADMIN_EMAIL || 'superadmin@navme';
  const rawPassword = process.env.NAVME_SUPER_ADMIN_PASSWORD || '12345678';
  const hash = bcrypt.hashSync(rawPassword, 10).replace('$2b$', '$2a$');
  const { data, error } = await supabase
    .from('dashboard_admins')
    .update({ password_hash: hash })
    .eq('email', email);
  if (error) console.error('Error updating:', error);
  else console.log(`Password reset successfully for ${email}`);
}
run();
