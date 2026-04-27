import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function main() {
  const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) throw userError;
  
  const user = users.find(u => u.email === "jwmoody@protonmail.com");
  if (!user) throw new Error("User not found");
  
  // Set current_streak to 1 and last_streak_date to Sunday (2026-04-26)
  const { error } = await supabase
    .from('streaks')
    .update({
      current_streak: 1,
      longest_streak: 1,
      last_streak_date: '2026-04-26',
      updated_at: new Date().toISOString()
    })
    .eq('household_id', user.id);
    
  if (error) throw error;
  
  console.log("Successfully restored streak for Sunday!");
}

main().catch(console.error);
