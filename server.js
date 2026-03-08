import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// === REPLACE THESE WITH YOUR SUPABASE CREDENTIALS ===
const SUPABASE_URL = 'https://YOUR-PROJECT-ID.supabase.co';
const SUPABASE_SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE';
// =================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const ADMIN_ID = "1478813503078006905";

// Serve static files (index.html)
app.use(express.static(__dirname));

// API route for key management
app.post('/api/manage-keys', async (req, res) => {
  const { action, discordId, keyValue, count } = req.body;

  // Upload keys (admin only)
  if (action === 'upload' && discordId === ADMIN_ID) {
    const { error } = await supabase
      .from('keys')
      .insert([{ key_value: keyValue, is_used: false }]);
    return res.json(error ? { error: error.message } : { message: 'Key uploaded' });
  }

  // Assign a single key after purchase
  if (action === 'assign' && discordId) {
    const { data: key } = await supabase
      .from('keys')
      .select('key_value')
      .eq('is_used', false)
      .is('assigned_user_id', null)
      .limit(1)
      .single();

    if (!key) return res.status(404).json({ error: 'No keys available' });

    await supabase
      .from('keys')
      .update({ assigned_user_id: discordId, is_used: true })
      .eq('key_value', key.key_value);
    return res.json({ key: key.key_value });
  }

  // Assign multiple keys after purchase
  if (action === 'assign_multiple' && discordId) {
    const numKeys = count || 1;
    const assignedKeys = [];
    
    for (let i = 0; i < numKeys; i++) {
      const { data: key } = await supabase
        .from('keys')
        .select('key_value')
        .eq('is_used', false)
        .is('assigned_user_id', null)
        .limit(1)
        .single();

      if (!key) break;

      await supabase
        .from('keys')
        .update({ assigned_user_id: discordId, is_used: true })
        .eq('key_value', key.key_value);
      assignedKeys.push(key.key_value);
    }

    if (assignedKeys.length === 0) {
      return res.status(404).json({ error: 'No keys available' });
    }

    return res.json({ 
      success: assignedKeys.length, 
      assigned: assignedKeys 
    });
  }

  // Get a single assigned key for a user
  if (action === 'get' && discordId) {
    const { data } = await supabase
      .from('keys')
      .select('key_value')
      .eq('assigned_user_id', discordId)
      .eq('is_used', true)
      .single();
    return res.json(data ? { key: data.key_value } : { error: 'No key assigned' });
  }

  // Get all unused keys assigned to a user
  if (action === 'get_keys' && discordId) {
    const { data } = await supabase
      .from('keys')
      .select('key_value')
      .eq('assigned_user_id', discordId)
      .eq('is_used', false); // Only unused keys
    return res.json({ keys: data ? data.map(k => k.key_value) : [] });
  }

  res.status(400).json({ error: 'Invalid action' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
