// server.js - Full backend for Render.com (Node.js)

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // Serves index.html and other static files

// === YOUR SUPABASE CREDENTIALS ===
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // service_role key (secret!)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// === CONFIG ===
const ADMIN_DISCORD_ID = "1478813503078006905"; // your admin ID
const MAX_ACTIVE_SLOTS = 6;
const KEY_DURATION_MS = 60 * 60 * 1000; // 1 hour

// ===================== API ENDPOINT: /api/manage-keys =====================
app.post('/api/manage-keys', async (req, res) => {
  const { action, discordId, keyValue, count } = req.body;

  if (!action || !discordId) {
    return res.status(400).json({ error: 'Missing action or discordId' });
  }

  // ──────────────── ADMIN ONLY ────────────────
  if (discordId !== ADMIN_DISCORD_ID) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // 1. Upload a single key (admin)
  if (action === 'upload') {
    if (!keyValue) return res.status(400).json({ error: 'Missing keyValue' });

    const { error } = await supabase
      .from('keys')
      .insert([{ key_value: keyValue, is_used: false }]);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: 'Key uploaded successfully' });
  }

  // 2. Admin gives themselves any number of keys
  if (action === 'assign_multiple') {
    if (!count || count < 1) return res.status(400).json({ error: 'Invalid count' });

    const assigned = [];
    let remaining = count;

    while (remaining > 0) {
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
        .update({
          assigned_user_id: discordId,
          is_used: true,
          expires_at: new Date(Date.now() + KEY_DURATION_MS).toISOString()
        })
        .eq('key_value', key.key_value);

      assigned.push(key.key_value);
      remaining--;
    }

    return res.json({
      success: assigned.length,
      assigned_keys: assigned,
      message: assigned.length === count ? 'All keys assigned' : 'Some keys queued (no more available)'
    });
  }

  // ──────────────── USER ACTIONS (no admin check needed) ────────────────

  // 3. Get user status: time left + queued keys
  if (action === 'get_status') {
    // Active key with time left
    const { data: active } = await supabase
      .from('keys')
      .select('expires_at')
      .eq('assigned_user_id', discordId)
      .eq('is_used', true)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })
      .limit(1)
      .single();

    const timeLeftSeconds = active?.expires_at
      ? Math.max(0, Math.floor((new Date(active.expires_at) - Date.now()) / 1000))
      : 0;

    // Queued keys count
    const { count: queuedCount } = await supabase
      .from('keys')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_user_id', discordId)
      .eq('is_used', false);

    // Optional: current active slots (for admin view or UI)
    const { data: activeSlots } = await supabase
      .from('keys')
      .select('assigned_user_id, expires_at')
      .eq('is_used', true)
      .gt('expires_at', new Date().toISOString());

    return res.json({
      timeLeftSeconds,
      queuedKeys: queuedCount || 0,
      activeSlots: activeSlots || []
    });
  }

  return res.status(400).json({ error: 'Invalid action' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
