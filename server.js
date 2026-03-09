import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// In-memory storage
let keyPool = [];               // unused keys you uploaded
let activeSlots = [];           // max 6: [{discordId, expiry, currentKey, queue: [remainingKeys]}]
let waitingQueue = [];          // users waiting for a slot to open [{discordId, remainingHours}]

const MAX_SLOTS = 6;
const HOUR_MS = 60 * 60 * 1000;
const ADMIN_ID = "1049068212182073344";

// Serve frontend
app.use(express.static(__dirname));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API
app.post('/api/manage-keys', (req, res) => {
  const { action, discordId, keys, amount } = req.body;

  if (!action || !discordId) {
    return res.status(400).json({ error: 'Missing action or discordId' });
  }

  // Admin only
  if (discordId !== ADMIN_ID && action !== 'buy' && action !== 'status') {
    return res.status(403).json({ error: 'Admin only' });
  }

  // Upload keys to pool
  if (action === 'upload') {
    if (!Array.isArray(keys)) return res.status(400).json({ error: 'keys must be array' });
    keyPool.push(...keys);
    return res.json({ message: `Added ${keys.length} keys. Pool: ${keyPool.length}` });
  }

  // Buy / give hours/keys
  if (action === 'buy' || action === 'give-self') {
    if (!amount || amount < 1) return res.status(400).json({ error: 'amount >= 1' });

    const newKeys = [];
    for (let i = 0; i < amount; i++) {
      if (keyPool.length === 0) break;
      newKeys.push(keyPool.shift());
    }

    // Find or create user slot entry
    let userSlot = activeSlots.find(s => s.discordId === discordId);
    if (!userSlot) {
      if (activeSlots.length >= MAX_SLOTS) {
        // No free slot → queue the whole purchase
        waitingQueue.push({ discordId, remainingHours: amount });
        return res.json({ success: 0, queued: amount, message: 'No free slot – queued' });
      }

      // Create new active slot with first key
      const firstKey = newKeys.shift() || null;
      userSlot = {
        discordId,
        expiry: firstKey ? Date.now() + HOUR_MS : 0,
        currentKey: firstKey,
        queue: newKeys
      };
      activeSlots.push(userSlot);
    } else {
      // Add to existing queue
      userSlot.queue.push(...newKeys);
    }

    return res.json({
      success: newKeys.length + (userSlot.currentKey ? 1 : 0),
      activeKey: userSlot.currentKey,
      queued: userSlot.queue.length,
      message: userSlot.currentKey ? '1 key activated, rest queued' : 'Queued all'
    });
  }

  // Status
  if (action === 'status') {
    const userSlot = activeSlots.find(s => s.discordId === discordId);
    const timeLeft = userSlot && userSlot.expiry ? Math.max(0, userSlot.expiry - Date.now()) : 0;

    return res.json({
      activeKey: userSlot?.currentKey || null,
      timeLeftSeconds: Math.floor(timeLeft / 1000),
      queuedKeys: userSlot?.queue.length || 0,
      queuePosition: waitingQueue.findIndex(q => q.discordId === discordId) + 1 || null,
      queueLength: waitingQueue.length,
      activeCount: activeSlots.length
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
});

// Expire & activate next key in queue
setInterval(() => {
  const now = Date.now();

  activeSlots = activeSlots.filter(slot => {
    if (slot.expiry <= now) {
      // Current key expired → activate next in queue if any
      if (slot.queue.length > 0) {
        const nextKey = slot.queue.shift();
        slot.currentKey = nextKey;
        slot.expiry = now + HOUR_MS;
        return true;
      }
      return false;
    }
    return true;
  });

  // Fill empty slots from waiting queue
  while (activeSlots.length < MAX_SLOTS && waitingQueue.length > 0 && keyPool.length > 0) {
    const next = waitingQueue.shift();
    const key = keyPool.shift();
    activeSlots.push({
      discordId: next.discordId,
      expiry: now + HOUR_MS,
      currentKey: key,
      queue: []
    });
  }
}, 30000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
