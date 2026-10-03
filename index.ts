import webpush from 'npm:web-push@3.6.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

async function supabaseRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.text().then((text) => text ? JSON.parse(text) : null);
}

Deno.serve(async () => {
  const now = new Date();
  let profiles;
  try { profiles = await supabaseRequest('profiles?select=id,items,planner_events'); }
  catch { profiles = await supabaseRequest('profiles?select=id,items'); }
  let sent = 0;
  for (const profile of profiles || []) {
    const subscriptions = await supabaseRequest(`push_subscriptions?user_id=eq.${profile.id}&select=endpoint,subscription`);
    for (const subscription of subscriptions || []) {
      const timezone = subscription.subscription?.timezone || 'UTC';
      const localParts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' }).formatToParts(now).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {} as Record<string, string>);
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(localParts.weekday);
      const date = `${localParts.year}-${localParts.month}-${localParts.day}`;
      const currentTime = `${localParts.hour}:${localParts.minute}`;
      for (const item of profile.items || []) {
        if (!item.reminderTime || item.reminderTime > currentTime || !(item.reminderDays || []).includes(day) || (item.doneDates || []).includes(date) || (item.doneDays || []).includes(day)) continue;
        const reminderTime = `${item.reminderTime}:00`;
        const reminder = { user_id: profile.id, item_id: String(item.id), reminder_date: date, reminder_time: reminderTime };
        const claim = await supabaseRequest('sent_reminders', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(reminder) });
        if (!claim?.length) continue;
        try { await webpush.sendNotification(subscription.subscription, JSON.stringify({ title: 'Ready Set School', body: `Remember: ${item.name}`, tag: `${item.id}-${date}-${reminderTime}` })); sent += 1; } catch (error) { if ((error as { statusCode?: number }).statusCode === 404 || (error as { statusCode?: number }).statusCode === 410) await supabaseRequest(`push_subscriptions?endpoint=eq.${encodeURIComponent(subscription.endpoint)}`, { method: 'DELETE' }); }
      }
      for (const plannerEvent of profile.planner_events || []) {
        if (!plannerEvent.startTime || !plannerEvent.reminderMinutes) continue;
        const [eventYear, eventMonth, eventDay] = plannerEvent.date.split('-').map(Number);
        const [eventHour, eventMinute] = plannerEvent.startTime.split(':').map(Number);
        const eventAt = Date.UTC(eventYear, eventMonth - 1, eventDay, eventHour, eventMinute);
        const reminderAt = eventAt - Number(plannerEvent.reminderMinutes) * 60000;
        const nowAt = Date.UTC(Number(localParts.year), Number(localParts.month) - 1, Number(localParts.day), Number(localParts.hour), Number(localParts.minute));
        if (nowAt < reminderAt || nowAt >= eventAt) continue;
        const reminderDate = new Date(reminderAt);
        const reminderDay = `${reminderDate.getUTCFullYear()}-${String(reminderDate.getUTCMonth() + 1).padStart(2, '0')}-${String(reminderDate.getUTCDate()).padStart(2, '0')}`;
        const reminderTime = `${String(reminderDate.getUTCHours()).padStart(2, '0')}:${String(reminderDate.getUTCMinutes()).padStart(2, '0')}:00`;
        const reminder = { user_id: profile.id, item_id: `planner-${plannerEvent.id}`, reminder_date: reminderDay, reminder_time: reminderTime };
        const claim = await supabaseRequest('sent_reminders', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(reminder) });
        if (!claim?.length) continue;
        try { await webpush.sendNotification(subscription.subscription, JSON.stringify({ title: plannerEvent.title, body: `Starts at ${plannerEvent.startTime}${plannerEvent.notes ? ` · ${plannerEvent.notes}` : ''}`, tag: `planner-${plannerEvent.id}-${plannerEvent.date}-${plannerEvent.startTime}` })); sent += 1; } catch (error) { if ((error as { statusCode?: number }).statusCode === 404 || (error as { statusCode?: number }).statusCode === 410) await supabaseRequest(`push_subscriptions?endpoint=eq.${encodeURIComponent(subscription.endpoint)}`, { method: 'DELETE' }); }
      }
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
