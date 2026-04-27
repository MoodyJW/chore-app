import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function main() {
  console.log("Fetching household for jwmoody@protonmail.com...");

  // Assuming auth users are synced to households table by ID, 
  // but we can't query auth.users easily without admin API. 
  // We can query households.
  
  // Wait, does the households table store emails? 
  // It only stores id, name, timezone, reset_day, reset_hour, created_at.
  // We need to use supabase.auth.admin to get the user ID by email.
  const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
  
  if (userError) {
    console.error("Error fetching users:", userError);
    return;
  }
  
  const user = users.find(u => u.email === "jwmoody@protonmail.com");
  if (!user) {
    console.log("Could not find user with that email.");
    return;
  }
  
  console.log(`Found user ID: ${user.id}`);
  
  const backupData = {
    household: null,
    chores: [],
    chore_completions: [],
    streaks: null,
    weeks: [],
    day_labels: []
  };

  // Fetch household
  const { data: household } = await supabase.from('households').select('*').eq('id', user.id).single();
  backupData.household = household;
  
  // Fetch chores (including inactive ones)
  const { data: chores } = await supabase.from('chores').select('*').eq('household_id', user.id);
  backupData.chores = chores || [];
  
  // Fetch streaks
  const { data: streaks } = await supabase.from('streaks').select('*').eq('household_id', user.id).single();
  backupData.streaks = streaks;
  
  // Fetch weeks
  const { data: weeks } = await supabase.from('weeks').select('*').eq('household_id', user.id);
  backupData.weeks = weeks || [];
  
  // Fetch day_labels
  const { data: day_labels } = await supabase.from('day_labels').select('*').eq('household_id', user.id);
  backupData.day_labels = day_labels || [];
  
  // Fetch completions for the user's weeks
  if (weeks && weeks.length > 0) {
    const weekIds = weeks.map(w => w.id);
    const { data: completions } = await supabase.from('chore_completions').select('*').in('week_id', weekIds);
    backupData.chore_completions = completions || [];
  }
  
  // Write to file
  const filename = "jwmoody_backup.json";
  fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));
  
  console.log(`\nSuccessfully backed up all data for jwmoody@protonmail.com to ${filename}!`);
  console.log(`Total chores backed up: ${backupData.chores.length}`);
  console.log(`Total completions backed up: ${backupData.chore_completions.length}`);
}

main().catch(console.error);
