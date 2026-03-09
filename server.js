// Assign multiple keys (queued if slots full)
if (action === 'assign_multiple' && discordId && count > 0) {
  const assigned = [];

  for (let i = 0; i < count; i++) {
    const { count: active } = await supabase
      .from('keys')
      .select('*', { count: 'exact', head: true })
      .eq('is_used', true)
      .gt('expires_at', new Date().toISOString());

    const canActivateNow = active < 6;

    const { data: key } = await supabase
      .from('keys')
      .select('key_value')
      .eq('is_used', false)
      .is('assigned_user_id', null)
      .limit(1)
      .single();

    if (!key) break;

    if (canActivateNow) {
      await supabase.from('keys').update({
        assigned_user_id: discordId,
        is_used: true,
        expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour
      }).eq('key_value', key.key_value);
      assigned.push(key.key_value);
    } else {
      // Queue
      await supabase.from('keys').update({
        assigned_user_id: discordId,
        is_used: false
      }).eq('key_value', key.key_value);
      assigned.push(key.key_value + " (queued)");
    }
  }

  return res.json({ success: assigned.length, keys: assigned });
}

// Get current status
if (action === 'get_status' && discordId) {
  // Active slot
  const { data: active } = await supabase
    .from('keys')
    .select('expires_at')
    .eq('assigned_user_id', discordId)
    .eq('is_used', true)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at')
    .limit(1);

  const timeLeft = active?.expires_at
    ? Math.max(0, Math.floor((new Date(active.expires_at) - Date.now()) / 1000))
    : 0;

  // Queued keys count
  const { count: queued } = await supabase
    .from('keys')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_user_id', discordId)
    .eq('is_used', false);

  return res.json({
    timeLeftSeconds: timeLeft,
    queuedKeys: queued || 0
  });
}
