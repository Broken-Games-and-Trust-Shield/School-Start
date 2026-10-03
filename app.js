const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const storageKey = 'ready-set-school-items';
const scheduleKey = 'ready-set-school-schedule-pdf';
const scheduleImageKey = 'ready-set-school-schedule-image';
const scheduleTextKey = 'ready-set-school-schedule-text';
const profileKey = 'ready-set-school-profile';
const accountsKey = 'ready-set-school-accounts';
const notificationKey = 'ready-set-school-notifications';
const assistantPermissionKey = 'ready-set-school-assistant-schedule-permission';
const plannerEventsKey = 'ready-set-school-planner-events';
const plannerEventsStorageKey = () => `${plannerEventsKey}:${cloudSession?.user?.id || activeAccountKey || 'local'}`;
const supabaseUrl = 'https://vpbphspitqunjaxpmnbt.supabase.co';
const supabaseAnonKey = 'sb_publishable_5nBMd8_pZsePqJEyvjO2Bg_nip6gLAs';
const cloudSessionKey = 'ready-set-school-cloud-session';
const rememberSessionKey = 'ready-set-school-remember-session';
const activeSessionKey = 'ready-set-school-active-session';
const rememberedSessionMaxAge = 7 * 24 * 60 * 60 * 1000;
const vapidPublicKey = 'BFTef9m9TYbsDVPXFHf6DY6GdC7b5JcQHONngqbIJi7e_Oq6bdjgluOCN2Vqki8kb3ffNhJCZPdRRs6Bwqkeka8';
const appRedirectUrl = /^https?:$/.test(window.location.protocol) ? `${window.location.origin}${window.location.pathname}` : null;
const today = new Date().getDay();
let selectedDay = today === 0 || today === 6 ? 1 : today;
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
let selectedChecklistDate = localDateKey();
let selectedPlannerDate = localDateKey();
let plannerMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let plannerMode = 'month';
const defaultItems = [
  { id: 1, name: 'Backpack', days: [1, 2, 3, 4, 5], doneDays: [], reminderTime: '' },
  { id: 2, name: 'Water bottle', days: [1, 2, 3, 4, 5], doneDays: [], reminderTime: '' },
  { id: 3, name: 'Lunch box', days: [1, 2, 3, 4, 5], doneDays: [], reminderTime: '' },
  { id: 4, name: 'Math homework', days: [1, 3], doneDays: [], reminderTime: '' }
];
const getWeekKey = (date = new Date()) => {
  const monday = new Date(date);
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
};
const currentWeekKey = getWeekKey();
const normalizeItems = (list) => (Array.isArray(list) ? list : []).map((item) => ({ ...item, doneDays: Array.isArray(item.doneDays) ? item.doneDays : [], doneDates: Array.isArray(item.doneDates) ? item.doneDates : [], doneWeek: item.doneWeek || null, reminderDays: Array.isArray(item.reminderDays) ? item.reminderDays : (item.reminderTime ? item.days : []), reminderTime: item.reminderTime || '', startDate: item.startDate || '', dueDate: item.dueDate || '', monthWeeks: Array.isArray(item.monthWeeks) && item.monthWeeks.length ? item.monthWeeks : [1, 2, 3, 4, 5, 6], priority: item.priority || 'normal', notes: item.notes || '' }));
const savedItems = JSON.parse(localStorage.getItem(storageKey) || 'null');
const legacyProfile = JSON.parse(localStorage.getItem(profileKey) || 'null');
let accounts = JSON.parse(localStorage.getItem(accountsKey) || 'null') || {};
if (legacyProfile && !Object.keys(accounts).length) {
  const legacyKey = legacyProfile.email.trim().toLowerCase();
  accounts[legacyKey] = { ...legacyProfile, username: legacyProfile.username || legacyProfile.name, items: normalizeItems(savedItems || defaultItems) };
  localStorage.setItem(accountsKey, JSON.stringify(accounts));
}
let items = [];
let plannerEvents = JSON.parse(localStorage.getItem(plannerEventsKey) || '[]');
let plannerEventsCloudSync = true;
const $ = (selector) => document.querySelector(selector);
let account = null;
let accountName = '';
let activeAccountKey = null;
let scheduleUrl = localStorage.getItem(scheduleKey);
let scheduleText = localStorage.getItem(scheduleTextKey) || '';
let profile = null;
let reminderTimer;
let plannerReminderTimer;
let deferredInstallPrompt = null;
let notifications = JSON.parse(localStorage.getItem(notificationKey) || '[]');
let assistantCanScanSchedule = localStorage.getItem(assistantPermissionKey) === 'true';
let cloudSession = JSON.parse(localStorage.getItem(cloudSessionKey) || 'null');
let rememberedSession = JSON.parse(localStorage.getItem(rememberSessionKey) || 'null');
let activeSessionId = localStorage.getItem(activeSessionKey) || crypto.randomUUID();
let sessionHeartbeat;
function resetExpiredChecks() {
  let reset = false;
  items.forEach((item) => {
    if (item.doneDays.length && item.doneWeek !== currentWeekKey) {
      item.doneDays = [];
      item.doneWeek = null;
      reset = true;
    }
  });
  if (reset) void saveItems();
}
if (cloudSession && rememberedSession?.remaining > 0) {
  if (!rememberedSession.lastUsedAt) {
    rememberedSession.lastUsedAt = Date.now();
    rememberedSession.remaining = Math.min(5, rememberedSession.remaining);
    localStorage.setItem(rememberSessionKey, JSON.stringify(rememberedSession));
  } else if (Date.now() - rememberedSession.lastUsedAt > rememberedSessionMaxAge) {
    cloudSession = null;
    rememberedSession = null;
    localStorage.removeItem(cloudSessionKey);
    localStorage.removeItem(rememberSessionKey);
  }
} else if (cloudSession) {
  cloudSession = null;
  localStorage.removeItem(cloudSessionKey);
  rememberedSession = null;
  localStorage.removeItem(rememberSessionKey);
}
async function supabaseRequest(path, options = {}) {
  const headers = { apikey: supabaseAnonKey, 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (!headers.Authorization) headers.Authorization = `Bearer ${cloudSession?.access_token || supabaseAnonKey}`;
  if (path === '/auth/v1/logout') await releaseAccountSession();
  const response = await fetch(`${supabaseUrl}${path}`, { ...options, headers });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.msg || error.message || error.error_description || 'Cloud request failed.'); }
  const responseText = await response.text();
  const result = responseText ? JSON.parse(responseText) : null;
  if (path.startsWith('/rest/v1/profiles?') && Array.isArray(result) && result[0]) {
    plannerEventsCloudSync = Object.prototype.hasOwnProperty.call(result[0], 'planner_events');
    plannerEvents = Array.isArray(result[0].planner_events) ? result[0].planner_events : JSON.parse(localStorage.getItem(plannerEventsStorageKey()) || '[]');
    localStorage.setItem(plannerEventsStorageKey(), JSON.stringify(plannerEvents));
  }
  if ((path.startsWith('/auth/v1/token') || path.startsWith('/auth/v1/signup')) && result?.access_token) {
    cloudSession = result;
    localStorage.setItem(cloudSessionKey, JSON.stringify(cloudSession));
    if (!(await claimAccountSession())) {
      await fetch(`${supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${result.access_token}` } }).catch(() => {});
      cloudSession = null;
      localStorage.removeItem(cloudSessionKey);
      throw new Error('This account is already in use on another computer. Log out there first.');
    }
    localStorage.setItem(activeSessionKey, activeSessionId);
    if (path === '/auth/v1/token?grant_type=password' && $('#remember-me').checked) {
      rememberedSession = { remaining: 5, lastUsedAt: Date.now() };
      localStorage.setItem(rememberSessionKey, JSON.stringify(rememberedSession));
    } else if (path === '/auth/v1/token?grant_type=password') {
      rememberedSession = null;
      localStorage.removeItem(rememberSessionKey);
    }
    startSessionHeartbeat();
  }
  return result;
}
async function claimAccountSession() {
  const result = await supabaseRequest('/rest/v1/rpc/claim_account_session', { method: 'POST', body: JSON.stringify({ p_session_id: activeSessionId }) });
  return result === true;
}
async function releaseAccountSession() {
  clearInterval(sessionHeartbeat);
  if (!cloudSession?.user?.id) return;
  await supabaseRequest('/rest/v1/rpc/release_account_session', { method: 'POST', body: JSON.stringify({ p_session_id: activeSessionId }) }).catch(() => {});
}
function startSessionHeartbeat() {
  clearInterval(sessionHeartbeat);
  sessionHeartbeat = setInterval(async () => {
    if (!account || !cloudSession) return;
    const claimed = await claimAccountSession().catch(() => false);
    if (!claimed) window.location.reload();
  }, 30000);
}
async function saveCloudProfile() {
  if (!cloudSession?.user?.id || !profile) return;
  const profileData = { id: cloudSession.user.id, email: profile.email, username: profile.username, name: profile.name, photo: profile.photo || null, items: normalizeItems(items), schedule_url: scheduleUrl, schedule_image: localStorage.getItem(scheduleImageKey), notifications: notifications.slice(0, 30) };
  if (plannerEventsCloudSync) profileData.planner_events = plannerEvents;
  await supabaseRequest('/rest/v1/profiles?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(profileData) });
}
function urlBase64ToUint8Array(value) { const padding = '='.repeat((4 - value.length % 4) % 4); const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)); }
async function registerPushSubscription() {
  if (!vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !cloudSession?.user?.id) return;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
  }
  await supabaseRequest('/rest/v1/push_subscriptions?on_conflict=user_id,endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: cloudSession.user.id, endpoint: subscription.endpoint, subscription: { ...subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }) });
}
const saveItems = async () => {
  if (cloudSession) { await saveCloudProfile(); return; }
  if (!activeAccountKey) return;
  accounts[activeAccountKey] = { ...accounts[activeAccountKey], ...profile, items: normalizeItems(items), plannerEvents };
  localStorage.setItem(accountsKey, JSON.stringify(accounts));
};
async function savePlannerEvents() {
  localStorage.setItem(plannerEventsStorageKey(), JSON.stringify(plannerEvents));
  if (cloudSession) { await saveCloudProfile(); return; }
  if (!activeAccountKey) return;
  accounts[activeAccountKey] = { ...accounts[activeAccountKey], ...profile, items: normalizeItems(items), plannerEvents };
  localStorage.setItem(accountsKey, JSON.stringify(accounts));
}
function updateAccountUI() {
  $('#account-name').textContent = accountName || 'Log in to your profile';
  $('#account-status').textContent = account ? profile?.email || 'Ready on this device' : 'No account signed in';
  $('#account-avatar').textContent = profile?.photo ? '' : accountName?.[0]?.toUpperCase() || '?';
  $('#account-avatar').style.backgroundImage = profile?.photo ? `url(${profile.photo})` : '';
  $('#account-action').textContent = account ? 'Log out' : 'Log in';
  $('#profile-settings').classList.toggle('hidden', !account);
  $('#greeting-name').textContent = accountName || 'there';
  $('#open-add').disabled = !account;
}
function saveNotifications() { localStorage.setItem(notificationKey, JSON.stringify(notifications.slice(0, 30))); if (cloudSession) void saveCloudProfile(); }
function renderNotifications() {
  const unread = notifications.filter((notification) => !notification.read).length;
  $('#notification-count').textContent = unread;
  $('#notification-count').classList.toggle('hidden', unread === 0);
  $('#notification-list').innerHTML = notifications.length ? notifications.map((notification) => `<article class="notification-entry ${notification.read ? '' : 'unread'}"><span class="notification-dot"></span><div><strong>${escapeHtml(notification.title)}</strong><p>${escapeHtml(notification.body)}</p><small>${escapeHtml(notification.time)}</small></div></article>`).join('') : '<p class="notification-empty">No reminders yet. They will appear here when a task is due.</p>';
}
function assistantDay(message) {
  const lower = message.toLowerCase();
  if (/\btom+or+ow\b/.test(lower)) return (new Date().getDay() + 1) % 7;
  if (/\btoday\b/.test(lower)) return new Date().getDay();
  const dayAliases = ['sunday|sun', 'monday|mon', 'tuesday|tue|tues', 'wednesday|wed', 'thursday|thu|thur|thurs', 'friday|fri', 'saturday|sat'];
  const dayIndex = dayAliases.findIndex((aliases) => new RegExp(`\\b(?:${aliases})s?\\b`).test(lower));
  return dayIndex === -1 ? selectedDay : dayIndex;
}
function assistantDays(message) {
  const aliases = ['sunday|sun', 'monday|mon', 'tuesday|tue|tues', 'wednesday|wed', 'thursday|thu|thur|thurs', 'friday|fri', 'saturday|sat'];
  const lower = message.toLowerCase();
  if (/\bweekdays?\b/.test(lower)) return [1, 2, 3, 4, 5];
  if (/\bweekends?\b/.test(lower)) return [0, 6];
  if (/\bevery day\b|\bdaily\b/.test(lower)) return [0, 1, 2, 3, 4, 5, 6];
  const matchedDays = aliases.flatMap((day, index) => new RegExp(`\\b(?:${day})s?\\b`, 'i').test(message) ? [index] : []);
  if (matchedDays.length) return matchedDays;
  return [assistantDay(message)];
}
function assistantTaskName(rawTask) {
  const dateTerms = /\b(?:due|by|on|for|every|each|this|next)?\s*(?:today|tom+or+ow|yesterday|sundays?|suns?|mondays?|mons?|tuesdays?|tue?s?|wednesdays?|weds?|thursdays?|thurs?|fridays?|fris?|saturdays?|sats?|weekdays?|weekends?|daily)\b/gi;
  const monthTerms = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/gi;
  const ordinalMonthTerms = /\b(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:,?\s+\d{4})?\b/gi;
  return rawTask.replace(dateTerms, ' ').replace(monthTerms, ' ').replace(ordinalMonthTerms, ' ').replace(/\b(?:due|by|deadline|high priority|low priority|urgent|important)\b/gi, ' ').replace(/\s+\b(?:and|or)\b(?=\s*(?:[?.!,;:]|$))/gi, ' ').replace(/\b(?:on|at|in|by|for|due|to)\b\s*(?=[:;,]|$)/gi, ' ').replace(/[?.!,;:]+$/, '').replace(/[\s,]+$/, '').replace(/^\s*(?:on|at|in|by|for|due|to)\b\s*/i, ' ').replace(/^[\s,:-]+/, '').replace(/\s+[,;:]/g, ' ').replace(/\b(?:on|at|in|by|for|due|to)\b\s*$/i, '').replace(/^to\s+/i, '').replace(/\s{2,}/g, ' ').trim();
}
function assistantDateKey(message) {
  const lower = message.toLowerCase();
  const now = new Date();
  if (/\btoday\b/.test(lower)) return localDateKey(now);
  if (/\btom+or+ow\b/.test(lower)) return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const iso = message.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) { const date = dateFromKey(iso[0]); return Number.isNaN(date.getTime()) ? null : iso[0]; }
  const numeric = message.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : now.getFullYear();
    const date = new Date(year, Number(numeric[1]) - 1, Number(numeric[2]));
    if (date.getMonth() !== Number(numeric[1]) - 1 || date.getDate() !== Number(numeric[2])) return null;
    if (!numeric[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date.setFullYear(year + 1);
    return localDateKey(date);
  }
  const ordinalMonthMatch = lower.match(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)(?:,?\s+(\d{4}))?\b/);
  if (ordinalMonthMatch) return assistantDateKey(`${ordinalMonthMatch[2]} ${ordinalMonthMatch[1]}${ordinalMonthMatch[3] ? ` ${ordinalMonthMatch[3]}` : ''}`);
  const monthMatch = lower.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  if (monthMatch) {
    const monthNumber = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].findIndex((month) => monthMatch[1].startsWith(month));
    const year = Number(monthMatch[3] || now.getFullYear());
    const date = new Date(year, monthNumber, Number(monthMatch[2]));
    if (date.getMonth() !== monthNumber || date.getDate() !== Number(monthMatch[2])) return null;
    if (!monthMatch[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date.setFullYear(year + 1);
    return localDateKey(date);
  }
  const weekdays = ['sunday|sun', 'monday|mon', 'tuesday|tue|tues', 'wednesday|wed', 'thursday|thu|thur|thurs', 'friday|fri', 'saturday|sat'];
  const weekday = weekdays.findIndex((aliases) => new RegExp(`\\b(?:${aliases})s?\\b`).test(lower));
  if (weekday === -1) return null;
  let offset = (weekday - now.getDay() + 7) % 7;
  if (/\bnext\b/.test(lower) && offset === 0) offset = 7;
  return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}
function assistantTime(message) {
  const match = message.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (!match) return '';
  let hour = Number(match[1] || match[4]);
  const minute = match[2] || match[5] || '00';
  const meridiem = match[3]?.toLowerCase();
  if (meridiem && hour > 12) return '';
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}
function assistantPlannerSummary(dateKey, days = 1) {
  const summary = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = dateFromKey(dateKey);
    date.setDate(date.getDate() + offset);
    const key = localDateKey(date);
    const label = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
    plannerEvents.filter((entry) => entry.date === key).forEach((entry) => summary.push(`${label}: ${entry.startTime ? `${entry.startTime} ` : ''}${entry.title}`));
    plannerTasksForDate(key).filter((item) => item.dueDate === key).forEach((item) => summary.push(`${label}: ${item.name}${item.priority === 'high' ? ' (high priority)' : ''}${taskIsDoneOnDate(item, key) ? ' (checked in checklist)' : ''}`));
  }
  if (!summary.length) return days > 1 ? 'Nothing is on your planner for the next 7 days.' : 'Nothing is on your planner for that date.';
  return summary.slice(0, 12).join(' | ');
}
function assistantScheduleReply(message) {
  if (!assistantCanScanSchedule) return scheduleUrl ? 'I have a schedule uploaded, but schedule access is off. Turn on “Let the helper scan my uploaded schedule” and ask again.' : 'Upload a PDF schedule and allow schedule access so I can search it.';
  if (!scheduleUrl) return 'You have not uploaded a schedule yet. Add one in My schedule, then I can search its text.';
  if (!scheduleText) return 'I can see the uploaded schedule, but it has no selectable text to search. An image-only PDF needs a text-based copy or manual task entries.';
  const stopWords = new Set(['what', 'when', 'where', 'which', 'who', 'does', 'your', 'schedule', 'class', 'classes', 'period', 'lesson', 'timetable', 'today', 'tomorrow', 'have', 'with', 'from', 'for', 'the', 'and', 'are', 'is', 'was', 'were', 'do', 'did', 'my', 'on', 'at', 'in', 'me', 'i', 'to']);
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9:]+/g, ' ').trim();
  const queryWords = normalize(message).split(/\s+/).filter((word) => word.length > 1 && !stopWords.has(word));
  const lines = scheduleText.split(/[\n;|]+/).map((line) => line.trim()).filter(Boolean);
  let matches = lines.map((line) => {
    const lineWords = normalize(line).split(/\s+/);
    const score = queryWords.reduce((total, word) => total + (lineWords.some((lineWord) => lineWord === word || (word.length > 3 && lineWord.startsWith(word))) ? 1 : 0), 0);
    return { line, score };
  }).filter((match) => match.score > 0).sort((first, second) => second.score - first.score);
  if (!queryWords.length) {
    const timePattern = /\b\d{1,2}:\d{2}\s*(?:am|pm)?\b|\b\d{1,2}\s*(?:am|pm)\b/i;
    matches = lines.filter((line) => timePattern.test(line)).map((line) => ({ line, score: 1 }));
  }
  if (matches.length) return `From your uploaded schedule: ${matches.slice(0, 4).map((match) => match.line).join(' | ')}`;
  return 'I could not find a clear match in the schedule text. Try a class name, teacher name, room, or weekday.';
}
function assistantReply(message) {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return 'Ask me about your checklist, reminders, or uploaded schedule.';
  if (!account && /add|create|task|remind|prepare|list|schedule|ready|forget|finish|done|planner|event|due|deadline/.test(lower)) return 'Log in first so I can use your checklist and planner.';
  const eventMatch = normalized.match(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:add|create|plan|put|schedule|book)\s+(?:(?:a|an|the)\s+)?(?:new\s+)?(?:planner\s+|calendar\s+)?(?:event|appointment|exam|test|practice|meeting|concert|game|trip|birthday)\b(?:\s+(?:in|to)\s+(?:(?:my|your|the)\s+)?(?:school\s+)?(?:planner|calendar))?\s*:?\s*(.*)$/i)
    || normalized.match(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:add|create|put|schedule|book)\s+(?:this\s+)?(?:in|into|on|to)\s+(?:(?:my|your|the)\s+)?(?:school\s+)?(?:planner|calendar)\s+(?:(?:as|new)\s+)*(?:(?:a|an|the)\s+)*(?:event|appointment|exam|test|practice|meeting|concert|game|trip|birthday)\s*:?\s*(.*)$/i)
    || normalized.match(/^(?:i have|we have)\s+(?:a|an\s+)?(?:event|appointment|exam|test|practice|meeting|concert|game|trip|birthday)\s+(.+)$/i);
  if (eventMatch) {
    const rawEvent = eventMatch[1] || '';
    const startTime = assistantTime(rawEvent);
    const title = assistantTaskName(rawEvent.replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/i, ' ').replace(/\b(?:remind me|reminder)\b.*$/i, ' ').replace(/\b(?:in|to|on)\s+(?:(?:my|your|the)\s+)?(?:school\s+)?(?:planner|calendar)\b/gi, ' ').replace(/^(?:called|named)\s+/i, ' '));
    if (!title) return 'Tell me the event name, like “Add event: Science fair next Friday at 2 pm”.';
    const date = assistantDateKey(normalized) || selectedPlannerDate;
    const reminderMatch = lower.match(/\b(\d+)\s*(minute|min|hour|day)s?\s+before\b/);
    const reminderMinutes = /\bremind|reminder\b/.test(lower) ? (reminderMatch ? Number(reminderMatch[1]) * (reminderMatch[2].startsWith('hour') ? 60 : reminderMatch[2].startsWith('day') ? 1440 : 1) : 10) : 0;
    const existingEvent = plannerEvents.find((entry) => entry.title.toLowerCase() === title.toLowerCase() && entry.date === date);
    const details = { title, date, startTime, endTime: '', notes: '', reminderMinutes: startTime ? reminderMinutes : 0 };
    if (existingEvent) Object.assign(existingEvent, details);
    else plannerEvents.push({ id: Date.now(), ...details });
    selectedPlannerDate = date;
    plannerMonth = dateFromKey(date);
    plannerMonth.setDate(1);
    void savePlannerEvents();
    if (reminderMinutes && 'Notification' in window) {
      const enableEventNotifications = () => { startPlannerReminderCheck(); if (cloudSession && Notification.permission === 'granted') void registerPushSubscription().catch(() => {}); };
      if (Notification.permission !== 'granted') void Notification.requestPermission().then(enableEventNotifications);
      else enableEventNotifications();
    }
    startPlannerReminderCheck();
    renderPlanner();
    return `Added ${title} to your planner for ${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(dateFromKey(date))}${startTime ? ` at ${startTime}` : ''}${reminderMinutes && startTime ? ` with a reminder ${reminderMinutes} minutes before` : ''}.`;
  }
  const addMatch = normalized.match(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:add|create|put|track|remember)\s+(?:(?:a|the)\s+)?(?:task|item|homework|assignment|reminder)?\s*:?\s*(.+)$/i)
    || normalized.match(/^(?:please\s+)?(?:remind me to|remember to|set (?:a )?reminder(?: to)?|i need to|i have to)\s+(.+)$/i);
  if (addMatch) {
    const rawTask = addMatch[1].trim();
    const separatorIndex = normalized.search(/:(?!\d)/);
    const separatorPrefix = separatorIndex < 0 ? '' : normalized.slice(0, separatorIndex);
    const hasTaskSeparator = separatorIndex >= 0 && /\b(?:task|item|homework|assignment|reminder)\b/i.test(separatorPrefix);
    const taskDetails = hasTaskSeparator ? normalized.slice(separatorIndex + 1).trim() : rawTask;
    const reminderMatch = taskDetails.match(/\s+(?:at|for)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    const taskName = assistantTaskName(reminderMatch ? taskDetails.slice(0, reminderMatch.index) : taskDetails);
    if (!taskName) return 'Tell me what to add, like “Add task: Pack library book”.';
    const reminderTime = reminderMatch ? assistantTime(reminderMatch[0]) : '';
    if (reminderMatch && !reminderTime) return 'That reminder time does not look right. Try “at 6:30 pm”.';
    const recurring = /\bevery\b|\beach\b|\bweekdays?\b|\bweekends?\b|\bdaily\b/.test(lower);
    const dueDate = recurring && !/\b(due|deadline|by)\b/.test(lower) ? '' : assistantDateKey(normalized) || '';
    const days = recurring ? assistantDays(normalized) : dueDate ? [1, 2, 3, 4, 5] : assistantDays(normalized);
    items.push({ id: Date.now(), name: taskName, days, startDate: dueDate ? localDateKey() : '', dueDate, monthWeeks: [1, 2, 3, 4, 5, 6], priority: /\b(urgent|high priority|important)\b/.test(lower) ? 'high' : 'normal', notes: '', doneDays: [], reminderDays: reminderTime ? days : [], reminderTime });
    void saveItems();
    if (reminderTime && 'Notification' in window && Notification.permission !== 'granted') void Notification.requestPermission().then(() => startReminderCheck());
    startReminderCheck();
    render();
    const dayDescription = days.map(dayLabel).join(', ').replace(/, ([^,]*)$/, ' and $1');
    return `Added “${taskName}”${dueDate ? ` due ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dateFromKey(dueDate))}` : ` for ${dayDescription}`}${reminderTime ? ` with a ${reminderTime} reminder` : ''}.`;
  }
  if (/schedule|class|period|lesson|timetable/.test(lower)) return assistantScheduleReply(normalized);
  if (/\b(next week|next 7 days|this week|upcoming|coming up|planner|deadline|due|appointment|event|test|exam|homework|assignment)\b/.test(lower)) {
    const startDate = assistantDateKey(normalized) || localDateKey();
    const weekQuery = /\b(next week|next 7 days|this week|upcoming|coming up)\b/.test(lower);
    return assistantPlannerSummary(startDate, weekQuery ? 7 : 1);
  }
  const requestedDay = assistantDay(normalized);
  const visible = items.filter((item) => item.days.includes(requestedDay));
  if (/finish|done|complete|ready/.test(lower)) {
    const finished = visible.filter((item) => item.doneDays.includes(requestedDay));
    return finished.length ? `${finished.length} of ${visible.length} ${dayLabel(requestedDay)} task${visible.length === 1 ? '' : 's'} are marked ready.` : `Nothing is marked ready for ${dayLabel(requestedDay)} yet.`;
  }
  if (/forget|prepare|today|tomorrow|list|bring|pack|what do i need|what should i/.test(lower)) {
    const unfinished = visible.filter((item) => !item.doneDays.includes(requestedDay));
    if (!visible.length) return `You have no checklist items for ${dayLabel(requestedDay)}.`;
    return unfinished.length ? `For ${dayLabel(requestedDay)}, remember: ${unfinished.map((item) => item.name).join(', ')}.` : `Everything on your ${dayLabel(requestedDay)} list is marked ready.`;
  }
  if (/remind|notification|alarm/.test(lower)) return 'I can add a reminder to a checklist task, or make a timed planner event. Try “Add homework due Friday at 6 pm” or “Add event: Science fair next Friday at 2 pm, remind me 1 hour before”.';
  if (/help|can you|what can you|hello|hi\b/.test(lower)) return 'I can add homework with due dates and priorities, plan events, summarize your upcoming week, check checklist progress, and search your uploaded class schedule. Examples: “Add essay due October 12, high priority”, “Add event: Band concert Friday at 7 pm”, or “What is due next week?”';
  return 'I can organize due dates, checklist tasks, and events; summarize what is coming up; or search your uploaded class schedule. Try “Add homework due Friday” or “What is on my planner this week?”';
}
function openAssistant() {
  $('#assistant-permission').checked = assistantCanScanSchedule;
  $('#assistant-input').value = '';
  $('#assistant-response').textContent = 'Try “Add a task to bring my computer on the 16th of October”, “Put this in my planner as an event: Field trip Friday at 9 am”, or “What is due next week?”';
  $('#assistant-dialog').showModal();
  $('#assistant-input').focus();
}
const dayLabel = (index) => dayNames[index];
const taskDayLabel = (index) => index === 3 ? 'Wed' : index === 4 ? 'Thu' : dayNames[index];

function render() {
  resetExpiredChecks();
  const todayDate = dateFromKey(selectedChecklistDate);
  todayDate.setDate(todayDate.getDate() - todayDate.getDay() + selectedDay);
  selectedChecklistDate = localDateKey(todayDate);
  const checklistDate = selectedChecklistDate;
  const visible = items.filter((item) => taskOccursOnDate(item, checklistDate));
  $('#checklist-items').innerHTML = visible.map((item) => `<article class="check-item ${taskIsDoneOnDate(item, checklistDate) ? 'done' : ''}">
    <input class="check-box" type="checkbox" ${taskIsDoneOnDate(item, checklistDate) ? 'checked' : ''} data-id="${item.id}" aria-label="Mark ${item.name} ready" />
    <span class="item-name">${escapeHtml(item.name)}</span><span class="item-days">${item.days.map(dayLabel).join(' · ')}${item.dueDate ? ` · due ${escapeHtml(item.dueDate)}` : ''}${item.priority === 'high' ? ' · high priority' : ''}${item.reminderTime ? ` · notify ${item.reminderDays.map(dayLabel).join(', ')} at ${item.reminderTime}` : ''}</span>
    <button class="edit-item" data-edit="${item.id}" aria-label="Edit ${escapeHtml(item.name)} reminder">✎</button><button class="delete-item" data-delete="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button>
  </article>`).join('');
  $('#empty-state').classList.toggle('hidden', visible.length > 0);
  $('#empty-state h3').textContent = account ? 'Nothing planned for this day' : 'Log in to see your checklist';
  $('#empty-state p').textContent = account ? 'Add an item and choose the days you need it.' : 'Log in or sign up to create and save tasks.';
  const ready = visible.filter((item) => taskIsDoneOnDate(item, checklistDate)).length;
  $('#progress-label').textContent = `${ready} of ${visible.length} ready`;
  $('#progress-bar').style.width = visible.length ? `${ready / visible.length * 100}%` : '0%';
  $('#focus-title').textContent = visible.length && ready === visible.length ? 'You are all set for today.' : `Your ${dayLabel(selectedDay)} morning, made lighter.`;
  $('#date-label').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(todayDate);
  const completedDays = new Set(items.flatMap((item) => item.doneDays));
  $('#streak-number').textContent = completedDays.size;
  const checklistWeekStart = new Date(todayDate);
  checklistWeekStart.setDate(checklistWeekStart.getDate() - checklistWeekStart.getDay());
  $('#days').innerHTML = dayNames.map((name, index) => { const date = new Date(checklistWeekStart); date.setDate(date.getDate() + index); return `<button class="day-card ${selectedDay === index ? 'selected' : ''} ${date.getDay() === new Date().getDay() && localDateKey(date) === localDateKey() ? 'today' : ''}" data-day="${index}">${name}<strong>${items.filter((item) => taskOccursOnDate(item, localDateKey(date))).length}</strong></button>`; }).join('');
  renderPlanner();
}
function dateFromKey(value) { const [year, month, date] = value.split('-').map(Number); return new Date(year, month - 1, date); }
function monthWeekOf(date) { const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay(); return Math.floor((date.getDate() + firstDay - 1) / 7) + 1; }
function taskIsDoneOnDate(item, dateKey) {
  if (item.doneDates?.includes(dateKey)) return true;
  const date = dateFromKey(dateKey);
  return item.doneWeek === getWeekKey(date) && item.doneDays.includes(date.getDay());
}
function taskOccursOnDate(item, dateKey) {
  const date = dateFromKey(dateKey);
  const monthWeek = monthWeekOf(date);
  const weekSelected = (item.monthWeeks || [1, 2, 3, 4, 5, 6]).includes(monthWeek);
  const isDueDate = item.dueDate === dateKey;
  if (item.dueDate) {
    const startDate = item.startDate || item.dueDate;
    if (dateKey < startDate || dateKey > item.dueDate) return false;
    return isDueDate || (item.days.includes(date.getDay()) && weekSelected);
  }
  return item.days.includes(date.getDay()) && weekSelected;
}
function plannerTasksForDate(dateKey) {
  return items.filter((item) => taskOccursOnDate(item, dateKey));
}
function renderPlanner() {
  if (!$('#planner-calendar')) return;
  const visibleEvents = account ? plannerEvents : [];
  const year = plannerMonth.getFullYear();
  const month = plannerMonth.getMonth();
  const selectedDate = dateFromKey(selectedPlannerDate);
  const firstDate = new Date(year, month, 1);
  const weekStart = new Date(selectedDate);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const calendarStart = plannerMode === 'month' ? new Date(year, month, 1 - firstDate.getDay()) : plannerMode === 'week' ? weekStart : selectedDate;
  const visibleDateCount = plannerMode === 'month' ? 42 : plannerMode === 'week' ? 7 : 1;
  const labelOptions = plannerMode === 'month' ? { month: 'long', year: 'numeric' } : plannerMode === 'day' ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' };
  const periodEnd = new Date(calendarStart);
  periodEnd.setDate(periodEnd.getDate() + visibleDateCount - 1);
  const periodLabel = new Intl.DateTimeFormat('en-US', labelOptions).format(plannerMode === 'month' ? plannerMonth : calendarStart);
  $('#planner-month-label').textContent = plannerMode === 'week' ? `${periodLabel} – ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: periodEnd.getFullYear() !== calendarStart.getFullYear() ? 'numeric' : undefined }).format(periodEnd)}` : periodLabel;
  $('#planner-weekdays').classList.toggle('hidden', plannerMode === 'day');
  $('#planner-calendar').classList.toggle('day-mode', plannerMode === 'day');
  $('#planner-calendar').innerHTML = Array.from({ length: visibleDateCount }, (_, index) => {
    const date = new Date(calendarStart.getFullYear(), calendarStart.getMonth(), calendarStart.getDate() + index);
    const dateKey = localDateKey(date);
    const dateTasks = plannerTasksForDate(dateKey);
    const eventCount = visibleEvents.filter((entry) => entry.date === dateKey).length;
    const count = dateTasks.length + eventCount;
    const completedCount = dateTasks.filter((item) => taskIsDoneOnDate(item, dateKey)).length;
    const classes = ['planner-date', plannerMode === 'month' && date.getMonth() !== month ? 'outside-month' : '', dateKey === selectedPlannerDate ? 'selected' : '', dateKey === localDateKey() ? 'today' : ''].filter(Boolean).join(' ');
    return `<button class="${classes}" type="button" role="gridcell" data-planner-date="${dateKey}" aria-label="${escapeHtml(new Intl.DateTimeFormat('en-US', { dateStyle: 'full' }).format(date))}${count ? `, ${count} entries, ${completedCount} completed` : ''}"><span>${date.getDate()}</span>${count ? `<small>${count} item${count === 1 ? '' : 's'}${completedCount ? ` · ${completedCount} done` : ''}</small>` : ''}</button>`;
  }).join('');
  document.querySelectorAll('[data-planner-mode]').forEach((button) => {
    const active = button.dataset.plannerMode === plannerMode;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#planner-day-title').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(selectedDate);
  const tasks = plannerTasksForDate(selectedPlannerDate);
  const events = visibleEvents.filter((entry) => entry.date === selectedPlannerDate).sort((first, second) => (first.startTime || '').localeCompare(second.startTime || ''));
  const taskMarkup = tasks.map((item) => {
    const completed = taskIsDoneOnDate(item, selectedPlannerDate);
    return `<article class="planner-entry planner-task ${completed ? 'completed' : ''}"><div class="planner-entry-time">${completed ? 'DONE' : item.dueDate ? 'DUE' : 'TASK'}</div><div class="planner-entry-copy"><strong>${escapeHtml(item.name)}</strong><p>${item.dueDate ? `Due ${escapeHtml(item.dueDate)}` : 'Repeats on this weekday'}${item.priority === 'high' ? ' · High priority' : ''}</p>${completed ? '<small class="planner-completion">Completed in checklist</small>' : ''}${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}</div><button class="text-button" type="button" data-checklist-date="${selectedPlannerDate}">Open checklist</button></article>`;
  }).join('');
  const eventMarkup = events.map((entry) => `<article class="planner-entry planner-event"><div class="planner-entry-time">${entry.startTime ? escapeHtml(entry.startTime) : 'EVENT'}${entry.endTime ? `<small>${escapeHtml(entry.endTime)}</small>` : ''}</div><div class="planner-entry-copy"><strong>${escapeHtml(entry.title)}</strong>${entry.notes ? `<p>${escapeHtml(entry.notes)}</p>` : ''}</div><button class="edit-item" type="button" data-edit-event="${entry.id}" aria-label="Edit ${escapeHtml(entry.title)}">✎</button><button class="delete-item" type="button" data-delete-event="${entry.id}" aria-label="Delete ${escapeHtml(entry.title)}">×</button></article>`).join('');
  $('#planner-agenda-list').innerHTML = taskMarkup || eventMarkup ? `${eventMarkup}${taskMarkup}` : '<p class="planner-empty">Nothing planned for this day. Add an event or give a checklist task a due date.</p>';
  $('#planner-sync-note').classList.toggle('hidden', !cloudSession || plannerEventsCloudSync);
  if (account && !plannerReminderTimer && 'Notification' in window && Notification.permission === 'granted') startPlannerReminderCheck();
}
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
function setupDayPicker(selector, selectedDays = []) { $(selector).innerHTML = dayNames.map((name, index) => `<label class="day-choice ${index === 0 || index === 6 ? 'weekend-choice' : ''}"><input type="checkbox" value="${index}" aria-label="${name}" ${selectedDays.includes(index) ? 'checked' : ''}/><span>${taskDayLabel(index)}</span></label>`).join(''); }
function setupMonthWeekPicker(selectedWeeks = [1, 2, 3, 4, 5, 6]) { $('#month-week-picker').innerHTML = Array.from({ length: 6 }, (_, index) => { const week = index + 1; return `<label class="month-week-choice"><input type="checkbox" value="${week}" ${selectedWeeks.includes(week) ? 'checked' : ''}/><span>Week ${week}</span></label>`; }).join(''); }
function openFilePicker() { $('#schedule-input').click(); }

let editingItemId = null;
function openItemDialog(item = null) {
  const isEditing = Boolean(item?.id);
  editingItemId = isEditing ? item.id : null;
  setupDayPicker('#day-picker', item?.days || [1, 2, 3, 4, 5]);
  setupDayPicker('#reminder-day-picker', item?.reminderDays || item?.days || []);
  setupMonthWeekPicker(item?.monthWeeks || [1, 2, 3, 4, 5, 6]);
  $('#item-dialog-title').textContent = isEditing ? 'Edit task reminder' : 'Add to your list';
  $('#item-submit').textContent = isEditing ? 'Save changes' : 'Add item';
  $('#item-name').value = item?.name || '';
  $('#item-start-date').value = item?.startDate || localDateKey();
  $('#item-due-date').value = item?.dueDate || '';
  $('#item-priority').value = item?.priority || 'normal';
  $('#item-notes').value = item?.notes || '';
  $('#reminder-enabled').checked = Boolean(item?.reminderTime);
  $('#reminder-time').value = item?.reminderTime || '18:00';
  $('#item-dialog').showModal();
  $('#item-name').focus();
}
$('#open-add').addEventListener('click', () => { if (account) openItemDialog(); });
$('#open-assistant').addEventListener('click', openAssistant);
$('#planner-ask-helper').addEventListener('click', openAssistant);
$('#assistant-permission').addEventListener('change', (event) => { assistantCanScanSchedule = event.target.checked; localStorage.setItem(assistantPermissionKey, String(assistantCanScanSchedule)); $('#assistant-response').textContent = assistantCanScanSchedule ? 'Schedule access is on for this browser.' : 'Schedule access is off.'; });
document.querySelectorAll('.prompt-button').forEach((button) => button.addEventListener('click', () => { $('#assistant-input').value = button.dataset.prompt; $('#assistant-input').focus(); }));
['What is due next week?', 'Add homework: Finish science poster due Friday', 'Add event: Science fair Friday at 2 pm'].forEach((prompt) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'prompt-button';
  button.dataset.prompt = prompt;
  button.textContent = prompt.startsWith('What') ? 'Plan my week' : prompt.startsWith('Add homework') ? 'Add homework' : 'Add an event';
  button.addEventListener('click', () => { $('#assistant-input').value = prompt; $('#assistant-input').focus(); });
  $('.assistant-prompts').append(button);
});
$('#assistant-form').addEventListener('submit', (event) => { event.preventDefault(); $('#assistant-response').textContent = assistantReply($('#assistant-input').value); });
$('#open-notifications').addEventListener('click', () => { notifications = notifications.map((notification) => ({ ...notification, read: true })); saveNotifications(); renderNotifications(); $('#notifications-dialog').showModal(); });
$('#clear-notifications').addEventListener('click', () => { notifications = []; saveNotifications(); renderNotifications(); });
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; $('#install-app').classList.remove('hidden'); });
$('#install-app').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('#install-app').classList.add('hidden'); });
$('#item-close').addEventListener('click', () => $('#item-dialog').close());
$('#item-cancel').addEventListener('click', () => $('#item-dialog').close());
$('#item-start-date').addEventListener('input', () => $('#item-due-date').setCustomValidity(''));
$('#item-due-date').addEventListener('input', () => $('#item-due-date').setCustomValidity(''));
$('#item-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('#item-name').value.trim();
  const days = [...document.querySelectorAll('#day-picker input:checked')].map((input) => Number(input.value));
  const reminderDays = [...document.querySelectorAll('#reminder-day-picker input:checked')].map((input) => Number(input.value));
  const monthWeeks = [...document.querySelectorAll('#month-week-picker input:checked')].map((input) => Number(input.value));
  const startDate = $('#item-start-date').value;
  const dueDate = $('#item-due-date').value;
  if (dueDate && startDate && startDate > dueDate) { $('#item-due-date').setCustomValidity('The due date must be on or after the start date.'); $('#item-due-date').reportValidity(); return; }
  $('#item-due-date').setCustomValidity('');
  if (!name || !days.length || ($('#reminder-enabled').checked && !reminderDays.length)) return;
  const reminderTime = $('#reminder-enabled').checked ? $('#reminder-time').value : '';
  if (reminderTime && 'Notification' in window && Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') $('#reminder-enabled').checked = false;
  }
  const updatedReminder = $('#reminder-enabled').checked ? reminderTime : '';
  const updatedReminderDays = updatedReminder ? reminderDays : [];
  const details = { name, days, startDate: dueDate ? startDate : '', dueDate, monthWeeks: monthWeeks.length ? monthWeeks : [1, 2, 3, 4, 5, 6], priority: $('#item-priority').value, notes: $('#item-notes').value.trim(), reminderDays: updatedReminderDays, reminderTime: updatedReminder };
  const existingItem = items.find((item) => item.id === editingItemId);
  if (existingItem) Object.assign(existingItem, details);
  else items.push({ id: Date.now(), ...details, doneDays: [] });
  void saveItems();
  if (updatedReminder && account && Notification.permission === 'granted') void registerPushSubscription().catch(() => {});
  selectedDay = days.includes(selectedDay) ? selectedDay : days[0];
  $('#item-dialog').close();
  $('#item-form').reset();
  editingItemId = null;
  startReminderCheck();
  render();
});
$('#checklist-items').addEventListener('change', (event) => {
  if (!account) return;
  const item = items.find((entry) => entry.id === Number(event.target.dataset.id));
  if (!item) return;
  const dateKey = selectedChecklistDate;
  const date = dateFromKey(dateKey);
  const weekKey = getWeekKey(date);
  const day = date.getDay();
  item.doneDates = Array.isArray(item.doneDates) ? item.doneDates : [];
  if (event.target.checked) {
    item.doneDates = [...new Set([...item.doneDates, dateKey])];
    item.doneDays = item.doneWeek === weekKey ? [...new Set([...item.doneDays, day])] : [day];
    item.doneWeek = weekKey;
  } else {
    item.doneDates = item.doneDates.filter((completedDate) => completedDate !== dateKey);
    if (item.doneWeek === weekKey) item.doneDays = item.doneDays.filter((completedDay) => completedDay !== day);
    item.doneWeek = item.doneDays.length ? weekKey : null;
  }
  void saveItems();
  render();
});
$('#checklist-items').addEventListener('click', (event) => { if (!account) return; const editId = Number(event.target.dataset.edit); if (editId) { openItemDialog(items.find((item) => item.id === editId)); return; } const id = Number(event.target.dataset.delete); if (id) { items = items.filter((item) => item.id !== id); void saveItems(); render(); } });
$('#days').addEventListener('click', (event) => { const card = event.target.closest('[data-day]'); if (card) { selectedDay = Number(card.dataset.day); const weekStart = dateFromKey(selectedChecklistDate); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + selectedDay); selectedChecklistDate = localDateKey(weekStart); render(); } });
document.querySelectorAll('.nav-tab').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.nav-tab').forEach((tab) => tab.classList.remove('active')); document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active-panel')); button.classList.add('active'); $(`#${button.dataset.tab}`).classList.add('active-panel'); if (button.dataset.tab === 'planner') renderPlanner(); }));
function navigatePlanner(direction) {
  const selectedDate = dateFromKey(selectedPlannerDate);
  if (plannerMode === 'day') selectedDate.setDate(selectedDate.getDate() + direction);
  else if (plannerMode === 'week') selectedDate.setDate(selectedDate.getDate() + direction * 7);
  else {
    const targetMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + direction, 1);
    const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
    selectedDate.setFullYear(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(selectedDate.getDate(), lastDay));
  }
  selectedPlannerDate = localDateKey(selectedDate);
  plannerMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  renderPlanner();
}
$('#planner-previous').addEventListener('click', () => navigatePlanner(-1));
$('#planner-next').addEventListener('click', () => navigatePlanner(1));
document.querySelectorAll('[data-planner-mode]').forEach((button) => button.addEventListener('click', () => { plannerMode = button.dataset.plannerMode; const date = dateFromKey(selectedPlannerDate); plannerMonth = new Date(date.getFullYear(), date.getMonth(), 1); renderPlanner(); }));
$('#planner-today').addEventListener('click', () => { selectedPlannerDate = localDateKey(); plannerMonth = new Date(); plannerMonth.setDate(1); renderPlanner(); });
$('#planner-calendar').addEventListener('click', (event) => { const day = event.target.closest('[data-planner-date]'); if (day) { selectedPlannerDate = day.dataset.plannerDate; const selectedDate = dateFromKey(selectedPlannerDate); plannerMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1); renderPlanner(); } });
$('#planner-agenda-list').addEventListener('click', async (event) => {
  const checklistDate = event.target.closest('[data-checklist-date]')?.dataset.checklistDate;
  if (checklistDate) {
    selectedDay = dateFromKey(checklistDate).getDay();
    selectedChecklistDate = checklistDate;
    document.querySelector('.nav-tab[data-tab="checklist"]').click();
    render();
    return;
  }
  const editId = event.target.closest('[data-edit-event]')?.dataset.editEvent;
  if (editId) { openPlannerEvent(plannerEvents.find((entry) => String(entry.id) === editId)); return; }
  const deleteId = event.target.closest('[data-delete-event]')?.dataset.deleteEvent;
  if (deleteId) { plannerEvents = plannerEvents.filter((entry) => String(entry.id) !== deleteId); await savePlannerEvents(); renderPlanner(); }
});
$('#add-planner-event').addEventListener('click', () => openPlannerEvent());
$('#add-planner-event-day').addEventListener('click', () => openPlannerEvent());
$('#add-planner-task').addEventListener('click', () => {
  if (!account) { openAccountDialog('login'); return; }
  const dueDate = selectedPlannerDate;
  const day = dateFromKey(dueDate).getDay();
  selectedDay = day;
  selectedChecklistDate = dueDate;
  openItemDialog({ days: [1, 2, 3, 4, 5], startDate: localDateKey() <= dueDate ? localDateKey() : dueDate, dueDate, priority: 'normal' });
});
let editingPlannerEventId = null;
function openPlannerEvent(entry = null) {
  if (!account) { openAccountDialog('login'); return; }
  editingPlannerEventId = entry?.id || null;
  $('#planner-event-title').textContent = entry ? 'Edit event' : 'Add an event';
  $('#planner-event-name').value = entry?.title || '';
  $('#planner-event-date').value = entry?.date || selectedPlannerDate;
  $('#planner-event-start').value = entry?.startTime || '';
  $('#planner-event-end').value = entry?.endTime || '';
  $('#planner-event-notes').value = entry?.notes || '';
  $('#planner-event-reminder').value = String(entry?.reminderMinutes || 0);
  $('#planner-event-error').textContent = '';
  $('#planner-event-dialog').showModal();
  $('#planner-event-name').focus();
}
$('#planner-event-close').addEventListener('click', () => $('#planner-event-dialog').close());
$('#planner-event-cancel').addEventListener('click', () => $('#planner-event-dialog').close());
$('#planner-event-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const startTime = $('#planner-event-start').value;
  const endTime = $('#planner-event-end').value;
  if (startTime && endTime && endTime < startTime) { $('#planner-event-error').textContent = 'End time must be after the start time.'; return; }
  const reminderMinutes = Number($('#planner-event-reminder').value);
  if (reminderMinutes && 'Notification' in window && Notification.permission !== 'granted') await Notification.requestPermission();
  const details = { title: $('#planner-event-name').value.trim(), date: $('#planner-event-date').value, startTime, endTime, notes: $('#planner-event-notes').value.trim(), reminderMinutes };
  const existingEvent = plannerEvents.find((entry) => entry.id === editingPlannerEventId);
  if (existingEvent) Object.assign(existingEvent, details);
  else plannerEvents.push({ id: Date.now(), ...details });
  selectedPlannerDate = details.date;
  plannerMonth = dateFromKey(details.date);
  plannerMonth.setDate(1);
  await savePlannerEvents();
  if (reminderMinutes && cloudSession && Notification.permission === 'granted') void registerPushSubscription().catch(() => {});
  $('#planner-event-dialog').close();
  startPlannerReminderCheck();
  renderPlanner();
});
$('#upload-trigger').addEventListener('click', openFilePicker); $('#upload-trigger-secondary').addEventListener('click', openFilePicker); $('#replace-schedule').addEventListener('click', openFilePicker);
$('#schedule-input').addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file || file.type !== 'application/pdf') return; scheduleUrl = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); }); localStorage.setItem(scheduleKey, scheduleUrl); localStorage.removeItem(scheduleImageKey); void showSchedule(scheduleUrl); void saveCloudProfile(); });
async function showSchedule(source) {
  const image = localStorage.getItem(scheduleImageKey);
  const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument(source).promise;
  let firstPage;
  const extractedPages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    if (pageNumber === 1) firstPage = page;
    const textContent = await page.getTextContent();
    const rows = new Map();
    textContent.items.forEach((item) => {
      const text = item.str.trim();
      if (!text) return;
      const row = Math.round((item.transform?.[5] || 0) / 4);
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push({ x: item.transform?.[4] || 0, text });
    });
    const pageLines = [...rows.entries()].sort((first, second) => second[0] - first[0]).map(([, cells]) => cells.sort((first, second) => first.x - second.x).map((cell) => cell.text).join(' '));
    extractedPages.push(pageLines.join('\n'));
  }
  scheduleText = extractedPages.join('\n').replace(/[ \t]+/g, ' ').trim();
  localStorage.setItem(scheduleTextKey, scheduleText);
  if (image) {
    $('#schedule-image').src = image;
  } else {
    const viewport = firstPage.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await firstPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const renderedImage = canvas.toDataURL('image/png');
    localStorage.setItem(scheduleImageKey, renderedImage);
    $('#schedule-image').src = renderedImage;
  }
  $('#schedule-image').classList.remove('hidden'); $('#schedule-placeholder').classList.add('hidden'); $('#schedule-footer').classList.remove('hidden');
}
$('#open-schedule').addEventListener('click', () => { if (scheduleUrl) window.open(scheduleUrl, '_blank', 'noopener,noreferrer'); });
let accountMode = 'login';
function openAccountDialog(mode = 'login') { accountMode = mode; const signup = mode === 'signup'; $('#account-dialog-title').textContent = signup ? 'Create your account' : 'Log in to your account'; $('#account-submit').textContent = signup ? 'Sign up' : 'Log in'; $('#account-name-field').textContent = 'Username'; $('#account-name-input').placeholder = 'e.g. Alex'; $('#account-name-input').required = true; $('#account-switch').textContent = signup ? 'Already have an account? Log in' : 'New here? Create an account'; $('#remember-me-label').classList.toggle('hidden', signup); $('#remember-me').checked = false; $('#account-name-input').value = ''; $('#account-email').value = ''; $('#account-password').value = ''; $('#account-password').type = 'password'; $('#toggle-account-password').textContent = 'View password'; $('#toggle-account-password').setAttribute('aria-pressed', 'false'); $('#account-error').textContent = ''; $('#account-dialog').showModal(); $('#account-name-input').focus(); }
$('#remember-me').addEventListener('change', () => { if (!$('#remember-me').checked || accountMode !== 'login') { rememberedSession = null; localStorage.removeItem(rememberSessionKey); } });
$('#toggle-account-password').addEventListener('click', () => { const passwordInput = $('#account-password'); const showing = passwordInput.type === 'text'; passwordInput.type = showing ? 'password' : 'text'; $('#toggle-account-password').textContent = showing ? 'View password' : 'Hide password'; $('#toggle-account-password').setAttribute('aria-pressed', String(!showing)); });
$('#account-action').addEventListener('click', async () => {
  if (!account) { openAccountDialog('login'); return; }
  await saveItems();
  if (cloudSession) {
    await supabaseRequest('/auth/v1/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem(cloudSessionKey);
    cloudSession = null;
  }
  localStorage.removeItem(rememberSessionKey);
  clearInterval(reminderTimer);
  clearInterval(plannerReminderTimer);
  localStorage.removeItem(profileKey);
  account = null;
  profile = null;
  accountName = '';
  activeAccountKey = null;
  items = [];
  plannerEvents = [];
  render();
  updateAccountUI();
  openAccountDialog('login');
});
$('#account-switch').addEventListener('click', () => { const mode = accountMode === 'login' ? 'signup' : 'login'; $('#account-dialog').close(); openAccountDialog(mode); });
async function hashPassword(password) { const data = new TextEncoder().encode(password); const hash = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
$('#account-form').addEventListener('submit', async (event) => { event.preventDefault(); const username = $('#account-name-input').value.trim(); const email = $('#account-email').value.trim().toLowerCase(); const password = $('#account-password').value; $('#account-error').textContent = ''; try { const endpoint = accountMode === 'login' ? '/auth/v1/token?grant_type=password' : `/auth/v1/signup${appRedirectUrl ? `?redirect_to=${encodeURIComponent(appRedirectUrl)}` : ''}`; const authResponse = await supabaseRequest(endpoint, { method: 'POST', body: JSON.stringify(accountMode === 'login' ? { email, password } : { email, password, data: { username, name: username } }) }); if (!authResponse?.access_token) { $('#account-error').textContent = 'Confirmation email sent. Check your inbox to finish creating your account.'; $('#account-password').value = ''; return; } cloudSession = authResponse; localStorage.setItem(cloudSessionKey, JSON.stringify(cloudSession)); const cloudProfiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(authResponse.user.id)}&select=*`); const fallbackUsername = username || email.split('@')[0] || 'User'; const fallbackName = username || email.split('@')[0] || 'User'; const profilePayload = { id: authResponse.user.id, email: authResponse.user.email || email, username: fallbackUsername, name: fallbackName, items: normalizeItems(accounts[email]?.items || savedItems || []), notifications: [], schedule_url: scheduleUrl || null, schedule_image: localStorage.getItem(scheduleImageKey) || null }; if (!cloudProfiles.length) { await supabaseRequest('/rest/v1/profiles?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(profilePayload) }); } profile = (await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(authResponse.user.id)}&select=*`))[0] || profilePayload; if (accountMode === 'login' && profile.username.toLowerCase() !== (username || profile.username).toLowerCase()) { if (username) { profile.username = username; profile.name = username; await saveCloudProfile(); } } activeAccountKey = authResponse.user.id; items = normalizeItems(profile.items); scheduleUrl = profile.schedule_url || null; if (profile.schedule_image) localStorage.setItem(scheduleImageKey, profile.schedule_image); notifications = Array.isArray(profile.notifications) ? profile.notifications : []; await saveCloudProfile(); account = true; accountName = profile.name; $('#account-dialog').close(); $('#account-form').reset(); updateAccountUI(); startReminderCheck(); void registerPushSubscription().catch(() => {}); render(); renderNotifications(); } catch (error) { cloudSession = null; localStorage.removeItem(cloudSessionKey); $('#account-error').textContent = error.message; } });
$('#profile-settings').addEventListener('click', () => { $('#settings-name').value = profile.name; $('#settings-email').value = profile.email || ''; $('#profile-photo').value = ''; $('#current-password').value = ''; $('#new-password').value = ''; $('#settings-error').textContent = ''; $('#settings-dialog').showModal(); });
$('#settings-form').addEventListener('submit', async (event) => { event.preventDefault(); const newName = $('#settings-name').value.trim(); const newEmail = $('#settings-email').value.trim(); const photo = $('#profile-photo').files[0]; profile.name = newName; profile.username = newName; profile.email = newEmail; if (photo) profile.photo = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(photo); }); try { await saveCloudProfile(); accountName = profile.name; updateAccountUI(); startReminderCheck(); $('#settings-dialog').close(); } catch (error) { $('#settings-error').textContent = error.message; } });
function startReminderCheck() {
  clearInterval(reminderTimer);
  if (!account || !('Notification' in window) || Notification.permission !== 'granted') return;
  const checkReminders = () => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateKey = now.toLocaleDateString('en-CA');
    items.filter((item) => item.reminderDays.includes(now.getDay()) && item.reminderTime <= time && !taskIsDoneOnDate(item, dateKey)).forEach((item) => {
      const key = `${item.id}-${dateKey}-${item.reminderTime}`;
      if (notifications.some((notification) => notification.key === key)) return;
      notifications.unshift({ key, title: 'School Start', body: `Remember: ${item.name}`, time: now.toLocaleString(), read: false });
      saveNotifications();
      renderNotifications();
      new Notification('School Start', { body: `Remember: ${item.name}` });
    });
  };
  checkReminders();
  reminderTimer = setInterval(checkReminders, 60000);
}
function startPlannerReminderCheck() {
  clearInterval(plannerReminderTimer);
  if (!account || !('Notification' in window) || Notification.permission !== 'granted') return;
  const checkReminders = () => {
    const now = new Date();
    plannerEvents.filter((entry) => entry.startTime && entry.reminderMinutes > 0).forEach((entry) => {
      const eventStart = new Date(`${entry.date}T${entry.startTime}`);
      const reminderAt = new Date(eventStart.getTime() - entry.reminderMinutes * 60000);
      if (now < reminderAt || now >= eventStart) return;
      const key = `planner-${entry.id}-${entry.date}-${entry.startTime}`;
      if (notifications.some((notification) => notification.key === key)) return;
      notifications.unshift({ key, title: entry.title, body: `Starts at ${entry.startTime}${entry.notes ? ` · ${entry.notes}` : ''}`, time: now.toLocaleString(), read: false });
      saveNotifications();
      renderNotifications();
      new Notification(entry.title, { body: `Starts at ${entry.startTime}` });
    });
  };
  checkReminders();
  plannerReminderTimer = setInterval(checkReminders, 60000);
}
async function restoreAuthRedirect() { const hash = new URLSearchParams(window.location.hash.slice(1)); const accessToken = hash.get('access_token'); if (!accessToken) return; const refreshToken = hash.get('refresh_token'); const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` } }); if (!response.ok) return; cloudSession = { access_token: accessToken, refresh_token: refreshToken, user: await response.json() }; localStorage.setItem(cloudSessionKey, JSON.stringify(cloudSession)); window.history.replaceState({}, document.title, window.location.pathname + window.location.search); }
async function restoreCloudSession() { if (!cloudSession?.access_token || !cloudSession.user?.id || !rememberedSession?.remaining) return; try { const refreshedSession = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: cloudSession.refresh_token }) }); if (!refreshedSession?.access_token) throw new Error('Could not refresh your sign-in.'); const cloudProfiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(cloudSession.user.id)}&select=*`); if (!cloudProfiles.length) throw new Error('Profile not found.'); profile = cloudProfiles[0]; activeAccountKey = cloudSession.user.id; items = normalizeItems(profile.items); scheduleUrl = profile.schedule_url || null; if (profile.schedule_image) localStorage.setItem(scheduleImageKey, profile.schedule_image); notifications = Array.isArray(profile.notifications) ? profile.notifications : []; rememberedSession.remaining -= 1; rememberedSession.lastUsedAt = Date.now(); localStorage.setItem(rememberSessionKey, JSON.stringify(rememberedSession)); account = true; accountName = profile.name; localStorage.setItem(activeSessionKey, activeSessionId); startSessionHeartbeat(); startReminderCheck(); void registerPushSubscription().catch(() => {}); } catch (error) { cloudSession = null; rememberedSession = null; localStorage.removeItem(cloudSessionKey); localStorage.removeItem(rememberSessionKey); clearInterval(sessionHeartbeat); }
}
restoreAuthRedirect().finally(() => restoreCloudSession()).finally(() => { updateAccountUI(); if (!account) setTimeout(() => openAccountDialog('login'), 300); if (scheduleUrl) void showSchedule(scheduleUrl); render(); renderNotifications(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=18-remember-session');
