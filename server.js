import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// In-memory storage (lost on restart – fine for now)
let keyPool = [];               // unused keys (array of strings)
let activeSlots = [];           // max 6: [{discordId, expiry, key}]
let waitingQueue = [];          // [{discordId, hoursRequested}]

const MAX_SLOTS = 6;
const HOUR_MS = 60 * 60 * 1000; // 1 hour
const ADMIN_ID = "1049068212182073344"; // ← YOUR Discord ID

// Serve static files (index.html, etc.)
app.use(express.static(__dirname));

// Catch-all route – serve index.html for any non-API path
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ──────────────────────────────────────────────
// API: /api/manage-keys
// ──────────────────────────────────────────────
app.post('/api/manage-keys', (req, res) => {
  const { action, discordId, keys, amount } = req.body;

  if (!action || !discordId) {
    return res.status(400).json({ error: 'Missing action or discordId' });
  }

  // ─── Admin-only actions ───
  if (discordId !== ADMIN_ID) {
    return res.status(403).json({ error: 'Admin only' });
  }

  // Upload keys to pool
  if (action === 'upload') {
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'keys must be non-empty array' });
    }
    keyPool.push(...keys);
    return res.json({ message: `Added ${keys.length} keys. Pool now: ${keyPool.length}` });
  }

  // Admin gives himself keys/hours
  if (action === 'give-self') {
    if (!amount || amount < 1) return res.status(400).json({ error: 'amount >= 1 required' });
    waitingQueue.push({ discordId, hoursRequested: amount });
    return res.json({ message: `Queued ${amount} hours for admin` });
  }

  // ─── Everyone ───

  // Buy hours → activate or queue
  if (action === 'buy') {
    if (!amount || amount < 1) return res.status(400).json({ error: 'amount >= 1 required' });

    const freeSlots = MAX_SLOTS - activeSlots.length;

    if (freeSlots >= amount) {
      // Activate immediately
      const assigned = [];
      for (let i = 0; i < amount; i++) {
        if (keyPool.length === 0) break;
        const key = keyPool.shift();
        const expiry = Date.now() + HOUR_MS;
        activeSlots.push({ discordId, expiry, key });
        assigned.push({ key, expiry: new Date(expiry).toISOString() });
      }
      return res.json({ success: assigned.length, assigned });
    } else {
      // Queue
      waitingQueue.push({ discordId, hoursRequested: amount });
      return res.json({ success: 0, queued: amount, message: 'Slots full → queued' });
    }
  }

  // Get current status
  if (action === 'status') {
    const myActive = activeSlots.find(s => s.discordId === discordId);
    const timeLeftMs = myActive ? Math.max(0, myActive.expiry - Date.now()) : 0;

    const queuePosition = waitingQueue.findIndex(q => q.discordId === discordId) + 1;

    return res.json({
      active: !!myActive,
      timeLeftSeconds: Math.floor(timeLeftMs / 1000),
      queuePosition: queuePosition > 0 ? queuePosition : null,
      queueLength: waitingQueue.length,
      activeCount: activeSlots.length
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
});

// Background task: expire slots + activate queued users
setInterval(() => {
  const now = Date.now();

  // Remove expired
  activeSlots = activeSlots.filter(s => s.expiry > now);

  // Fill free slots from queue
  while (activeSlots.length < MAX_SLOTS && waitingQueue.length > 0 && keyPool.length > 0) {
    const next = waitingQueue.shift();
    let remaining = next.hoursRequested;

    while (remaining > 0 && keyPool.length > 0) {
      const key = keyPool.shift();
      const expiry = now + HOUR_MS;
      activeSlots.push({ discordId: next.discordId, expiry, key });
      remaining--;
    }
  }
}, 30000); // check every 30 seconds

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
