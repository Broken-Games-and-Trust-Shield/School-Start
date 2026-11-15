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
const classKeyStorageKey = () => `ready-set-school-class-key:${cloudSession?.user?.id || activeAccountKey || 'local'}`;
const chatStorageKey = () => `ready-set-school-ai-chat:${cloudSession?.user?.id || activeAccountKey || 'local'}`;
function cachedPlannerEvents() {
  const accountEvents = accounts[cloudSession?.user?.email?.toLowerCase()]?.plannerEvents;
  const storedEvents = JSON.parse(localStorage.getItem(plannerEventsStorageKey()) || '[]');
  const legacyEvents = JSON.parse(localStorage.getItem(plannerEventsKey) || '[]');
  return [storedEvents, accountEvents, legacyEvents].find((events) => Array.isArray(events) && events.length) || [];
}
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
const normalizeItems = (list) => (Array.isArray(list) ? list : []).map((item, index) => ({ ...item, doneDays: Array.isArray(item.doneDays) ? item.doneDays : [], doneDates: Array.isArray(item.doneDates) ? item.doneDates : [], doneWeek: item.doneWeek || null, reminderDays: Array.isArray(item.reminderDays) ? item.reminderDays : (item.reminderTime ? item.days : []), reminderTime: item.reminderTime || '', startDate: item.startDate || '', dueDate: item.dueDate || '', monthWeeks: Array.isArray(item.monthWeeks) && item.monthWeeks.length ? item.monthWeeks : [1, 2, 3, 4, 5, 6], priority: ['high', 'normal', 'low'].includes(item.priority) ? item.priority : 'normal', sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : index, manualOrder: item.manualOrder === true, notes: item.notes || '' }));
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
let classKeyCloudSync = false;
const $ = (selector) => document.querySelector(selector);
let account = null;
let accountName = '';
let activeAccountKey = null;
let scheduleUrl = localStorage.getItem(scheduleKey);
let scheduleText = localStorage.getItem(scheduleTextKey) || '';
let scheduleRows = [];
let profile = null;
let reminderTimer;
let plannerReminderTimer;
let deferredInstallPrompt = null;
let notifications = JSON.parse(localStorage.getItem(notificationKey) || '[]');
let assistantCanScanSchedule = localStorage.getItem(assistantPermissionKey) === 'true';
let cloudSession = JSON.parse(localStorage.getItem(cloudSessionKey) || 'null');
let classKey = normalizeClassKey(JSON.parse(localStorage.getItem(classKeyStorageKey()) || '[]'));
let chatMessages = normalizeChatMessages(JSON.parse(localStorage.getItem(chatStorageKey()) || '[]'));
let rememberedSession = JSON.parse(localStorage.getItem(rememberSessionKey) || 'null');
let activeSessionId = localStorage.getItem(activeSessionKey) || crypto.randomUUID();
let sessionHeartbeat;
function resetExpiredChecks() {
  let changed = false;
  items.forEach((item) => {
    if (item.doneDays.length && item.doneWeek) {
      const weekStart = dateFromKey(item.doneWeek);
      const existingDates = Array.isArray(item.doneDates) ? item.doneDates : [];
      const completedDates = new Set([
        ...existingDates,
        ...item.doneDays.map((day) => {
          const completedDate = new Date(weekStart);
          completedDate.setDate(completedDate.getDate() + (day + 6) % 7);
          return localDateKey(completedDate);
        })
      ]);
      if (completedDates.size !== existingDates.length) {
        item.doneDates = [...completedDates];
        changed = true;
      }
    }
    if (item.doneDays.length && item.doneWeek !== currentWeekKey) {
      item.doneDays = [];
      item.doneWeek = null;
      changed = true;
    }
  });
  if (changed) void saveItems();
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
  let result = responseText ? JSON.parse(responseText) : null;
  if ((path.startsWith('/auth/v1/token') || path.startsWith('/auth/v1/signup')) && !result?.access_token) {
    result = result?.session?.access_token ? result.session : result?.data?.session?.access_token ? result.data.session : result?.data?.access_token ? result.data : result;
  }
  if (path.startsWith('/rest/v1/profiles?') && Array.isArray(result) && result[0]) {
    plannerEventsCloudSync = Object.prototype.hasOwnProperty.call(result[0], 'planner_events');
    const cloudEvents = result[0].planner_events;
    plannerEvents = Array.isArray(cloudEvents) && cloudEvents.length ? cloudEvents : cachedPlannerEvents();
    localStorage.setItem(plannerEventsStorageKey(), JSON.stringify(plannerEvents));
    classKeyCloudSync = Object.prototype.hasOwnProperty.call(result[0], 'class_key');
    const savedClassKey = JSON.parse(localStorage.getItem(classKeyStorageKey()) || localStorage.getItem('ready-set-school-class-key:local') || '[]');
    classKey = Array.isArray(result[0].class_key) && result[0].class_key.length ? result[0].class_key : savedClassKey;
    localStorage.setItem(classKeyStorageKey(), JSON.stringify(classKey));
    chatMessages = normalizeChatMessages(JSON.parse(localStorage.getItem(chatStorageKey()) || '[]'));
    if (classKeyCloudSync) renderClassKey();
    renderChat();
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
  if (classKeyCloudSync) profileData.class_key = classKey;
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
async function saveClassKey() {
  localStorage.setItem(classKeyStorageKey(), JSON.stringify(classKey));
  if (profile) profile.class_key = classKey;
  if (cloudSession && classKeyCloudSync) {
    await saveCloudProfile();
    return;
  }
  if (!activeAccountKey) return;
  accounts[activeAccountKey] = { ...accounts[activeAccountKey], ...profile, items: normalizeItems(items), plannerEvents, class_key: classKey };
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
  const quotedName = rawTask.match(/\b(?:called|named)\s+(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’)/i);
  if (quotedName) return (quotedName[1] || quotedName[2] || quotedName[3] || quotedName[4]).trim();
  const dateTerms = /\b(?:due|by|on|for|every|each|this|next)?\s*(?:today|tom+or+ow|yesterday|sundays?|suns?|mondays?|mons?|tuesdays?|tue?s?|wednesdays?|weds?|thursdays?|thurs?|fridays?|fris?|saturdays?|sats?|weekdays?|weekends?|daily)\b/gi;
  const monthTerms = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/gi;
  const ordinalMonthTerms = /\b(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:,?\s+\d{4})?\b/gi;
  return rawTask.replace(dateTerms, ' ').replace(monthTerms, ' ').replace(ordinalMonthTerms, ' ').replace(/\b(?:due|by|deadline|urgent|least important|not important|important|most important|top priority|high(?:est)?[- ]priority|low(?:est)?[- ]priority|normal priority|medium[- ]priority|priority\s*[:=-]?\s*(?:high|low|normal|medium|one|two|three|1|2|3)|p[123])\b/gi, ' ').replace(/\s+\b(?:and|or)\b(?=\s*(?:[?.!,;:]|$))/gi, ' ').replace(/\b(?:on|at|in|by|for|due|to)\b\s*(?=[:;,]|$)/gi, ' ').replace(/[?.!,;:]+$/, '').replace(/[\s,]+$/, '').replace(/^\s*(?:on|at|in|by|for|due|to)\b\s*/i, ' ').replace(/^[\s,:-]+/, '').replace(/\s+[,;:]/g, ' ').replace(/\b(?:on|at|in|by|for|due|to)\b\s*$/i, '').replace(/^(?:called|named)\s+/i, '').replace(/^to\s+/i, '').replace(/\s{2,}/g, ' ').trim().replace(/^(["'“‘])(.+)[”’"']$/, '$2');
}
function assistantPriority(message) {
  const lower = message.toLowerCase();
  if (/\b(?:lowest priority|low[- ]priority|least important|not important|priority\s*[:=-]?\s*(?:low|three|3)|p3)\b/.test(lower)) return 'low';
  if (/\b(?:urgent|important|highest priority|high[- ]priority|top priority|most important|priority\s*[:=-]?\s*(?:high|one|1)|p1)\b/.test(lower)) return 'high';
  if (/\b(?:normal priority|medium[- ]priority|priority\s*[:=-]?\s*(?:normal|medium|two|2)|p2)\b/.test(lower)) return 'normal';
  return null;
}
function assistantSupplyTaskName(supply, course) {
  const details = supply.trim().replace(/[.!?]+$/, '').replace(/^(?:(?:please\s+)?(?:i\s+(?:need|want|have)\s+to\s+|(?:need|bring|pack|take|remember(?:\s+to)?)\s+))+/i, '').trim();
  const normalizedDetails = details.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const normalizedCourse = course.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `Bring ${details || 'class supplies'}${normalizedCourse && !normalizedDetails.includes(normalizedCourse) ? ` for ${course}` : ''}`;
}
function assistantDateKey(message) {
  const lower = message.toLowerCase();
  const now = new Date();
  if (/\btoday\b/.test(lower)) return localDateKey(now);
  if (/\btom+or+ow\b/.test(lower)) return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const iso = message.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = dateFromKey(iso[0]);
    return date.getFullYear() === Number(iso[1]) && date.getMonth() === Number(iso[2]) - 1 && date.getDate() === Number(iso[3]) ? iso[0] : null;
  }
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
function assistantSortMode(message) {
  const lower = message.toLowerCase();
  if (/\b(?:reverse alphabet(?:ical(?:ly)?)?|z\s+to\s+a|alphabetical descending)\b/.test(lower)) return 'alphabetical-descending';
  if (/\b(?:alphabet(?:ical(?:ly)?)?|a\s+to\s+z)\b/.test(lower)) return 'alphabetical';
  if (/\b(?:largest\s+to\s+smallest|highest\s+number\s+first|numeric(?:al)?\s+descending)\b/.test(lower)) return 'numeric-descending';
  if (/\b(?:numeric(?:al(?:ly)?)?|number(?:ed)?\s+order|(?:by|in)\s+(?:task\s+)?numbers?|smallest\s+to\s+largest)\b/.test(lower)) return 'numeric';
  if (/\b(?:lowest|low|least)\s+(?:priority|important)\s+(?:first|to\s+high)\b|\blow(?:est)?\s+priority\s+first\b|\blow(?:est)?\s+to\s+(?:high|highest)\b|\bpriority\s+ascending\b/.test(lower)) return 'priority-ascending';
  if (/\b(?:latest|furthest|farthest|newest)\s+(?:to\s+(?:oldest|earliest)|first)\b|\bdescending\s+(?:by\s+)?(?:due date|date|deadline)\b|\boldest first\b/.test(lower)) return 'date-descending';
  if (/\b(?:by|in)\s+(?:due date|date|deadline|chronological)\b|\bearliest\s+first\b|\bascending\s+(?:by\s+)?(?:due date|date|deadline)\b|\bsoonest(?:\s+to\s+latest)?\b/.test(lower)) return 'date';
  return 'priority';
}
function assistantPlannerSummary(dateKey, days = 1, options = {}) {
  const start = dateFromKey(dateKey);
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  const startKey = localDateKey(start);
  const endKey = localDateKey(end);
  const entries = [];
  items.forEach((item) => {
    let taskDate = '';
    if (options.dueOnly) {
      if (item.dueDate >= startKey && item.dueDate <= endKey) taskDate = item.dueDate;
    } else {
      for (let offset = 0; offset < days; offset += 1) {
        const date = new Date(start);
        date.setDate(date.getDate() + offset);
        const key = localDateKey(date);
        const done = taskIsDoneOnDate(item, key);
        if (taskOccursOnDate(item, key) && !(options.onlyIncomplete && done) && !(options.onlyCompleted && !done)) {
          taskDate = key;
          break;
        }
      }
    }
    if (!taskDate) return;
    const done = taskIsDoneOnDate(item, taskDate);
    if (options.onlyIncomplete && done || options.onlyCompleted && !done) return;
    entries.push({
      type: 'task',
      name: item.name,
      date: taskDate,
      time: '',
      priority: item.priority || 'normal',
      done,
      sortOrder: item.sortOrder
    });
  });
  if (!options.onlyTasks) plannerEvents.filter((entry) => entry.date >= startKey && entry.date <= endKey).forEach((entry) => {
    entries.push({ type: 'event', name: entry.title, date: entry.date, time: entry.startTime || '', priority: 'normal', done: false });
  });
  if (!entries.length) {
    if (options.onlyIncomplete) return days > 1 ? 'You’re all caught up—no unfinished tasks in that time period.' : 'You’re all caught up—no unfinished tasks for that date.';
    if (options.onlyCompleted) return 'No completed tasks found for that time period.';
    return days > 1 ? 'Nothing is planned for that time period.' : 'Nothing is on your planner for that date.';
  }

  const priorityValue = (entry) => ({ high: 3, normal: 2, low: 1 }[entry.priority] || 2);
  const nameCompare = (first, second) => first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: 'base' });
  const sortMode = options.sortMode || 'priority';
  entries.sort((first, second) => {
    if (sortMode === 'alphabetical') return nameCompare(first, second);
    if (sortMode === 'alphabetical-descending') return -nameCompare(first, second);
    if (sortMode === 'numeric' || sortMode === 'numeric-descending') {
      const firstNumber = first.name.match(/\d+/);
      const secondNumber = second.name.match(/\d+/);
      if (!firstNumber && secondNumber) return 1;
      if (firstNumber && !secondNumber) return -1;
      if (firstNumber && secondNumber) {
        const direction = sortMode === 'numeric' ? 1 : -1;
        const numberOrder = direction * (Number(firstNumber[0]) - Number(secondNumber[0]));
        if (numberOrder) return numberOrder;
      }
      return nameCompare(first, second);
    }
    if (sortMode === 'manual' && first.type === 'task' && second.type === 'task') return (first.sortOrder || 0) - (second.sortOrder || 0);
    if (sortMode === 'priority' || sortMode === 'priority-ascending') {
      const priorityOrder = sortMode === 'priority' ? priorityValue(second) - priorityValue(first) : priorityValue(first) - priorityValue(second);
      if (priorityOrder) return priorityOrder;
    }
    if (first.done !== second.done && (sortMode === 'priority' || sortMode === 'priority-ascending')) return Number(first.done) - Number(second.done);
    const dateOrder = first.date.localeCompare(second.date) || first.time.localeCompare(second.time);
    if (sortMode === 'date-descending') return -dateOrder || nameCompare(first, second);
    return dateOrder || Number(first.done) - Number(second.done) || nameCompare(first, second);
  });
  const list = entries.slice(0, 30).map((entry, index) => {
    const date = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(dateFromKey(entry.date));
    const details = [entry.type, entry.priority !== 'normal' ? `${entry.priority} priority` : '', entry.done ? 'completed' : ''].filter(Boolean).join(' · ');
    return `${index + 1}. ${date}${entry.time ? ` at ${entry.time}` : ''} — ${entry.name} (${details})`;
  });
  const heading = sortMode === 'alphabetical' ? 'Alphabetical order' : sortMode === 'alphabetical-descending' ? 'Reverse alphabetical order' : sortMode === 'numeric' ? 'Number order' : sortMode === 'numeric-descending' ? 'Largest number first' : sortMode === 'priority-ascending' ? 'Lowest priority first' : sortMode === 'date-descending' ? 'Latest first' : sortMode === 'date' ? 'Due date order' : 'Highest priority first, then soonest';
  return `${heading}:\n${list.join('\n')}${entries.length > 30 ? `\n…and ${entries.length - 30} more.` : ''}`;
}
async function assistantScheduleReply(message) {
  if (!assistantCanScanSchedule) return scheduleUrl ? 'I have a schedule uploaded, but schedule access is off. Turn on “Let the helper scan my uploaded schedule” and ask again.' : 'Upload a PDF schedule and allow schedule access so I can search it.';
  if (!scheduleUrl) return 'You have not uploaded a schedule yet. Add one in My schedule, then I can search its text.';
  if (!scheduleText) return 'I can see the uploaded schedule, but it has no selectable text to search. An image-only PDF needs a text-based copy or manual task entries.';
  const dateKey = assistantDateKey(message);
  if (dateKey) {
    const courses = classesOnScheduleDate(dateKey);
    if (courses.length) {
      const entries = classKey.filter((entry) => courses.some((course) => course.toLowerCase() === entry.course.toLowerCase()));
      const added = await addClassPrepTasks(entries, dateKey);
      const prep = added.length ? ` I added ${added.map((name) => `“${name}”`).join(', ')} to your checklist.` : entries.length && !account ? ' Log in to add these supplies to your checklist.' : '';
      return `Your schedule shows ${courses.join(', ')} on ${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(dateFromKey(dateKey))}.${prep}`;
    }
  }
  const stopWords = new Set(['what', 'when', 'where', 'which', 'who', 'does', 'your', 'schedule', 'class', 'classes', 'period', 'lesson', 'timetable', 'today', 'tomorrow', 'have', 'with', 'from', 'for', 'the', 'and', 'are', 'is', 'was', 'were', 'do', 'did', 'my', 'on', 'at', 'in', 'me', 'i', 'to', 'please', 'tell', 'show', 'find', 'look', 'search', 'about', 'there', 'any', 'can', 'could', 'would', 'like']);
  const normalize = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9:]+/g, ' ').trim();
  const queryWords = [...new Set(normalize(message).split(/\s+/).filter((word) => word.length > 1 && !stopWords.has(word)).map((word) => word.replace(/ies$/, 'y').replace(/s$/, '')))];
  const lines = [...new Set(scheduleText.split(/[\n;|]+/).map((line) => line.trim()).filter(Boolean))];
  let matches = lines.map((line) => {
    const lineWords = normalize(line).split(/\s+/);
    const matchedWords = queryWords.filter((word) => lineWords.some((lineWord) => lineWord.replace(/ies$/, 'y').replace(/s$/, '') === word || (word.length > 3 && lineWord.startsWith(word))));
    const phraseMatch = queryWords.length > 1 && normalize(line).includes(normalize(message).replace(/\b(?:what|when|where|which|who|does|your|schedule|class|classes|period|lesson|timetable|today|tomorrow|have|with|from|for|the|and|are|is|was|were|do|did|my|on|at|in|me|i|to|please|tell|show|find|look|search|about|there|any|can|could|would|like)\b/g, ' ').replace(/\s+/g, ' ').trim());
    const score = matchedWords.length * 2 + (matchedWords.length === queryWords.length && queryWords.length ? 3 : 0) + (phraseMatch ? 4 : 0);
    return { line, score, matched: matchedWords.length };
  }).filter((match) => match.score > 0).sort((first, second) => second.score - first.score);
  if (!queryWords.length) {
    const timePattern = /\b\d{1,2}:\d{2}\s*(?:am|pm)?\b|\b\d{1,2}\s*(?:am|pm)\b/i;
    matches = lines.filter((line) => timePattern.test(line)).map((line) => ({ line, score: 1 }));
  }
  if (matches.length) return `From your uploaded schedule, the closest match${matches.length === 1 ? ' is' : 'es are'}:\n${matches.slice(0, 4).map((match, index) => `${index + 1}. ${match.line}`).join('\n')}`;
  return 'I could not find a clear match in the schedule text. Try a class name, teacher name, room, or weekday.';
}
function classesOnScheduleDate(dateKey) {
  if (!assistantCanScanSchedule || !scheduleText) return [];
  const dayAliases = [/\b(?:sunday|sun)\b/i, /\b(?:monday|mon)\b/i, /\b(?:tuesday|tue|tues)\b/i, /\b(?:wednesday|wed)\b/i, /\b(?:thursday|thu|thur|thurs)\b/i, /\b(?:friday|fri)\b/i, /\b(?:saturday|sat)\b/i];
  const targetDay = dateFromKey(dateKey).getDay();
  const matches = new Set();
  const dayIndexForText = (text) => dayAliases.findIndex((pattern) => pattern.test(text));
  scheduleRows.forEach((row, rowIndex) => {
    const headers = row.flatMap((cell) => {
      const dayIndex = dayIndexForText(cell.text);
      return dayIndex < 0 ? [] : [{ dayIndex, x: cell.x }];
    }).sort((first, second) => first.x - second.x);
    if (headers.length < 2) return;
    const targetHeaderIndex = headers.findIndex((header) => header.dayIndex === targetDay);
    if (targetHeaderIndex < 0) return;
    const targetHeader = headers[targetHeaderIndex];
    const leftBoundary = targetHeaderIndex ? (headers[targetHeaderIndex - 1].x + targetHeader.x) / 2 : -Infinity;
    const rightBoundary = targetHeaderIndex < headers.length - 1 ? (targetHeader.x + headers[targetHeaderIndex + 1].x) / 2 : Infinity;
    for (let nextRowIndex = rowIndex + 1; nextRowIndex < scheduleRows.length; nextRowIndex += 1) {
      const nextRow = scheduleRows[nextRowIndex];
      const nextHeaders = nextRow.filter((cell) => dayIndexForText(cell.text) >= 0);
      if (nextHeaders.length > 1) break;
      const columnText = nextRow.filter((cell) => cell.x > leftBoundary && cell.x <= rightBoundary).map((cell) => cell.text).join(' ');
      classKey.forEach((entry) => {
        if (entry.course && new RegExp(`\\b${entry.course.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(columnText)) matches.add(entry.course);
      });
    }
  });
  scheduleText.split(/[\n;|]+/).forEach((line) => {
    const daysInLine = dayAliases.flatMap((pattern, index) => pattern.test(line) ? [index] : []);
    if (daysInLine.length !== 1 || daysInLine[0] !== targetDay) return;
    classKey.forEach((entry) => {
      if (entry.course && new RegExp(`\\b${entry.course.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line)) matches.add(entry.course);
    });
  });
  return [...matches];
}
function classKeyMatchesMessage(message) {
  return classKey.filter((entry) => entry.course && new RegExp(`\\b${entry.course.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(message));
}
async function addClassPrepTasks(entries, dateKey) {
  if (!account || !entries.length) return [];
  const day = dateFromKey(dateKey).getDay();
  const added = [];
  const addedItems = [];
  entries.forEach((entry) => entry.supplies.forEach((supply) => {
    const name = assistantSupplyTaskName(supply, entry.course);
    if (items.some((item) => item.name.toLowerCase() === name.toLowerCase() && (item.dueDate === dateKey || (!item.dueDate && taskOccursOnDate(item, dateKey))))) return;
    const item = { id: Date.now() + items.length, name, days: [day], startDate: dateKey, dueDate: dateKey, monthWeeks: [1, 2, 3, 4, 5, 6], priority: 'normal', sortOrder: Math.max(-1, ...items.map((task) => task.sortOrder || 0)) + 1, manualOrder: items.some((task) => task.manualOrder), notes: 'Added from your class Key.', doneDays: [], reminderDays: [], reminderTime: '' };
    items.push(item);
    addedItems.push(item);
    added.push(name);
  }));
  if (added.length) {
    selectedDay = day;
    selectedChecklistDate = dateKey;
    render();
    try {
      await saveItems();
    } catch (error) {
      items = items.filter((item) => !addedItems.includes(item));
      render();
      throw error;
    }
  }
  return added;
}
function assistantConversationReply(message) {
  const lower = message.toLowerCase().trim().replace(/[.!?]+$/, '');
  if (/^(?:hi|hello|hey|good morning|good afternoon|good evening)(?: there)?$/.test(lower)) return 'Hi! What can I help you with today? I can also help organize your tasks and plan your week.';
  if (/^(?:thanks|thank you|thx)(?: so much)?$/.test(lower)) return 'You’re welcome! Want help with anything else?';
  if (/^(?:how are you|how are you doing)$/.test(lower)) return 'I’m ready to help you plan. How is your day going?';
  if (/^(?:who are you|what are you|what is your name|what’s your name)$/.test(lower)) return 'I’m School Start, your on-device school planning chatbot. I can organize your saved tasks, help with your schedule, and answer a few simple questions.';
  if (/^(?:what can you do|help|how can you help me)$/.test(lower)) return 'I can sort tasks by priority, due date, name, or number; make a numbered plan for your week; add tasks and events; check your checklist; and search an uploaded schedule when you allow access.';
  if (/\b(?:what day is it|what is the date|what's the date|what is today's date|what day is today)\b/.test(lower)) {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
  }
  const mathMatch = lower.match(/^(?:(?:what is|what's|calculate|compute)\s+)?(-?\d+(?:\.\d+)?)\s*([+\-*/×÷])\s*(-?\d+(?:\.\d+)?)[?!. ]*$/);
  if (mathMatch) {
    const first = Number(mathMatch[1]);
    const second = Number(mathMatch[3]);
    const operations = { '+': first + second, '-': first - second, '*': first * second, '×': first * second, '/': first / second, '÷': first / second };
    const result = operations[mathMatch[2]];
    return Number.isFinite(result) ? `${first} ${mathMatch[2]} ${second} = ${Number(result.toPrecision(10))}.` : 'I can’t divide by zero.';
  }
  return null;
}
function assistantTaskMatches(query, dateKey = '') {
  const taskName = assistantTaskName(query).replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  const normalizedQuery = taskName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const queryWords = [...new Set(normalizedQuery.split(/\s+/).filter((word) => word.length > 1))];
  if (!queryWords.length) return [];
  const candidates = items.filter((item) => !dateKey || taskOccursOnDate(item, dateKey)).map((item) => {
    const normalizedName = item.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const nameWords = normalizedName.split(/\s+/);
    const overlap = queryWords.filter((word) => nameWords.some((nameWord) => nameWord === word || (word.length >= 4 && nameWord.startsWith(word))));
    const score = overlap.length / queryWords.length;
    return { item, score, exact: normalizedName === normalizedQuery };
  }).filter((match) => match.exact || match.score >= 0.6).sort((first, second) => Number(second.exact) - Number(first.exact) || second.score - first.score);
  if (!candidates.length) return [];
  if (candidates.length > 1 && candidates[0].exact === candidates[1].exact && candidates[0].score === candidates[1].score) return candidates.filter((candidate) => candidate.exact === candidates[0].exact && candidate.score === candidates[0].score).map((candidate) => candidate.item);
  return [candidates[0].item];
}
async function assistantSetTaskCompletion(task, dateKey, completed) {
  const wasComplete = taskIsDoneOnDate(task, dateKey);
  if (wasComplete === completed) {
    return completed ? `“${task.name}” is already checked off for ${new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(dateFromKey(dateKey))}.` : `“${task.name}” is already on your list of tasks to finish for that date.`;
  }
  task.doneDates = Array.isArray(task.doneDates) ? task.doneDates : [];
  task.doneDates = completed ? [...new Set([...task.doneDates, dateKey])] : task.doneDates.filter((date) => date !== dateKey);
  try {
    await saveItems();
  } catch (error) {
    task.doneDates = completed ? task.doneDates.filter((date) => date !== dateKey) : [...task.doneDates, dateKey];
    throw error;
  }
  render();
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(dateFromKey(dateKey));
  return completed ? `Checked off “${task.name}” for ${date}.` : `Marked “${task.name}” as not completed for ${date}.`;
}
async function assistantReply(message) {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return 'Ask me about your checklist, reminders, or uploaded schedule.';
  const conversationReply = assistantConversationReply(normalized);
  if (conversationReply) return conversationReply;
  if (!account && /add|create|task|remind|prepare|list|schedule|ready|forget|finish|done|planner|event|due|deadline/.test(lower)) return 'Log in first so I can use your checklist and planner.';
  const completionMatch = normalized.match(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(check(?:\s+off)?|mark|complete|finish|tick(?:\s+off)?|uncheck|reopen)\s+(?:(?:the|my)\s+)?(?:task\s+)?(.+?)(?:\s+as\s+(?:not\s+done|incomplete|unfinished))?(?:\s+(?:as\s+)?(?:done|complete(?:d)?|finished))?[.!?]*$/i);
  if (completionMatch) {
    if (!account) return 'Log in first so I can update your checklist.';
    const undo = /^(?:uncheck|reopen)$/i.test(completionMatch[1]) || /\bas\s+(?:not\s+done|incomplete|unfinished)\b/i.test(normalized);
    const dateKey = assistantDateKey(normalized) || selectedChecklistDate;
    const matches = assistantTaskMatches(completionMatch[2], dateKey);
    if (!matches.length) return `I couldn’t find a task matching “${assistantTaskName(completionMatch[2])}” for ${new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(dateFromKey(dateKey))}. Try the task’s name or choose its scheduled day.`;
    if (matches.length > 1) return `I found more than one matching task: ${matches.map((item) => `“${item.name}”`).join(', ')}. Please include more of the task name.`;
    return assistantSetTaskCompletion(matches[0], dateKey, !undo);
  }
  if (/\b(bring|pack|prepare|supplies|what do i need|what should i bring|what do i bring)\b/.test(lower)) {
    const dateKey = assistantDateKey(normalized) || localDateKey();
    const explicitClasses = classKeyMatchesMessage(normalized);
    const courseNames = explicitClasses.length ? explicitClasses.map((entry) => entry.course) : classesOnScheduleDate(dateKey);
    const entries = classKey.filter((entry) => courseNames.some((course) => course.toLowerCase() === entry.course.toLowerCase()));
    if (!entries.length) {
      return assistantCanScanSchedule && scheduleText
        ? `I couldn't match a class on your schedule for ${dayLabel(dateFromKey(dateKey).getDay())}. Add the class and its supplies to your Key, or tell me the class name.`
        : 'I need a class name or an uploaded schedule with access enabled, plus the supplies saved in your class Key. For example, “Math: pencil and notebook.”';
    }
    if (!account) return 'Log in first so I can add your class supplies to the checklist.';
    const added = await addClassPrepTasks(entries, dateKey);
    const supplies = entries.flatMap((entry) => entry.supplies.map((supply) => `${supply} for ${entry.course}`));
    const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(dateFromKey(dateKey));
    return added.length
      ? `I found ${entries.map((entry) => entry.course).join(' and ')} for ${dateLabel}. I added ${added.map((name) => `“${name}”`).join(', ')} to your checklist.`
      : `Your checklist already has everything from your Key for ${dateLabel}: ${supplies.join(', ')}.`;
  }
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
    await savePlannerEvents();
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
    const priority = assistantPriority(lower) || 'normal';
    const task = { id: Date.now() + items.length, name: taskName, days, startDate: dueDate ? localDateKey() : '', dueDate, monthWeeks: [1, 2, 3, 4, 5, 6], priority, sortOrder: Math.max(-1, ...items.map((item) => item.sortOrder || 0)) + 1, manualOrder: items.some((item) => item.manualOrder), notes: '', doneDays: [], reminderDays: reminderTime ? days : [], reminderTime };
    items.push(task);
    try {
      await saveItems();
    } catch (error) {
      items = items.filter((item) => item !== task);
      throw error;
    }
    if (reminderTime && 'Notification' in window && Notification.permission !== 'granted') void Notification.requestPermission().then(() => startReminderCheck());
    startReminderCheck();
    render();
    const dayDescription = days.map(dayLabel).join(', ').replace(/, ([^,]*)$/, ' and $1');
    return `Added “${taskName}”${dueDate ? ` due ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dateFromKey(dueDate))}` : ` for ${dayDescription}`}${reminderTime ? ` with a ${reminderTime} reminder` : ''}.`;
  }
  if (/schedule|class|period|lesson|timetable/.test(lower)) return assistantScheduleReply(normalized);
  const explicitSort = /\b(?:sort|order|rank|prioriti[sz]e|organize|organise|alphabetically|numeric(?:ally)?|number order|first|high priority|low priority|highest priority|lowest priority|high to low|low to high|reverse alphabetical|z to a|largest to smallest|highest number first|descending)\b/.test(lower);
  const taskListQuery = /\b(?:tasks?|checklist|to-dos?|what i have left|what's left|whats left|what remains|unfinished|incomplete|not completed|not finished|unchecked)\b/.test(lower);
  const sortTasksIntent = taskListQuery && /\b(?:sort|reorder|organize|organise|arrange|order)\b/.test(lower);
  if (sortTasksIntent) {
    if (!account) return 'Log in first so I can sort your saved tasks.';
    const sortMode = assistantSortMode(normalized);
    await saveTaskOrder(sortMode);
    const label = sortMode === 'alphabetical' ? 'alphabetically' : sortMode === 'alphabetical-descending' ? 'in reverse alphabetical order' : sortMode === 'numeric' ? 'by task number, lowest first' : sortMode === 'numeric-descending' ? 'by task number, highest first' : sortMode === 'date-descending' ? 'by due date, latest first' : sortMode === 'date' ? 'by due date, soonest first' : sortMode === 'priority-ascending' ? 'by priority, lowest first' : 'by priority, highest first';
    return `Sorted your tasks ${label}. This order is saved; you can still hold and drag tasks to rearrange them.`;
  }
  const onlyIncomplete = taskListQuery && /\b(?:left|remaining|unfinished|incomplete|not done|not completed|not finished|unchecked|still need to|to complete)\b/.test(lower);
  const onlyCompleted = taskListQuery && /\b(?:completed|finished|already done)\b/.test(lower);
  if (explicitSort || taskListQuery || /\b(next week|next 7 days|this week|upcoming|coming up|week|planner|deadline|due|appointment|event|test|exam|homework|assignment)\b/.test(lower)) {
    let startDate = assistantDateKey(normalized) || localDateKey();
    const nextWeekQuery = /\bnext week\b/.test(lower);
    const thisWeekQuery = /\bthis week\b/.test(lower);
    if (nextWeekQuery) {
      const nextMonday = dateFromKey(localDateKey());
      const offset = (8 - nextMonday.getDay()) % 7 || 7;
      nextMonday.setDate(nextMonday.getDate() + offset);
      startDate = localDateKey(nextMonday);
    }
    const weekQuery = /\b(?:week|next 7 days|upcoming|coming up)\b/.test(lower);
    const explicitDate = Boolean(assistantDateKey(normalized)) && !nextWeekQuery && !thisWeekQuery;
    const days = nextWeekQuery || /\b(next 7 days|upcoming|coming up)\b/.test(lower) ? 7 : thisWeekQuery ? 7 - new Date().getDay() : explicitDate ? 1 : weekQuery || explicitSort || taskListQuery ? 7 : 1;
    const dueOnly = /\b(?:due|deadline)\b/.test(lower) && !explicitSort;
    const sortMode = explicitSort ? assistantSortMode(normalized) : items.some((item) => item.manualOrder) ? 'manual' : 'priority';
    return assistantPlannerSummary(startDate, days, { dueOnly, onlyIncomplete, onlyCompleted, onlyTasks: onlyIncomplete || onlyCompleted, sortMode });
  }
  const requestedDateKey = assistantDateKey(normalized) || (() => {
    const requestedDate = new Date();
    requestedDate.setDate(requestedDate.getDate() - requestedDate.getDay() + assistantDay(normalized));
    return localDateKey(requestedDate);
  })();
  const requestedDay = dateFromKey(requestedDateKey).getDay();
  const visible = items.filter((item) => taskOccursOnDate(item, requestedDateKey));
  if (/finish|done|complete|ready/.test(lower)) {
    const finished = visible.filter((item) => taskIsDoneOnDate(item, requestedDateKey));
    return finished.length ? `${finished.length} of ${visible.length} ${dayLabel(requestedDay)} task${visible.length === 1 ? '' : 's'} are marked ready.` : `Nothing is marked ready for ${dayLabel(requestedDay)} yet.`;
  }
  if (/forget|prepare|today|tomorrow|list|bring|pack|what do i need|what should i/.test(lower)) {
    const unfinished = visible.filter((item) => !taskIsDoneOnDate(item, requestedDateKey));
    if (!visible.length) return `You have no checklist items for ${dayLabel(requestedDay)}.`;
    return unfinished.length ? `For ${dayLabel(requestedDay)}, remember: ${unfinished.map((item) => item.name).join(', ')}.` : `Everything on your ${dayLabel(requestedDay)} list is marked ready.`;
  }
  if (/remind|notification|alarm/.test(lower)) return 'I can add a reminder to a checklist task, or make a timed planner event. Try “Add homework due Friday at 6 pm” or “Add event: Science fair next Friday at 2 pm, remind me 1 hour before”.';
  if (/what|why|how|when|where|who/.test(lower)) return 'I’m an on-device planner, not a general web-connected AI, so I may not know facts outside your saved information. I can answer simple questions, do basic arithmetic, and help with your tasks, schedule, and school week.';
  return 'I can help with everyday chat, basic arithmetic, due dates, checklist tasks, and events; organize a numbered plan by priority, date, name, or number; or search your uploaded schedule. Try “What should I do first this week?”';
}
function normalizeClassKey(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry && typeof entry.course === 'string').map((entry) => ({
    course: entry.course.trim(),
    supplies: (Array.isArray(entry.supplies) ? entry.supplies : []).filter((supply) => typeof supply === 'string').map((supply) => supply.trim()).filter(Boolean)
  })).filter((entry) => entry.course && entry.supplies.length);
}
function normalizeChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((message) => message && ['assistant', 'user'].includes(message.role) && typeof message.content === 'string').slice(-60);
}
function renderClassKey() {
  classKey = normalizeClassKey(classKey);
  $('#class-key-list').innerHTML = classKey.length ? classKey.map((entry, index) => `<article class="class-key-entry"><div><strong>${escapeHtml(entry.course)}</strong><p>${entry.supplies.map(escapeHtml).join(', ')}</p></div><div class="class-key-actions"><button class="text-button" type="button" data-edit-key="${index}">Edit</button><button class="delete-item" type="button" data-delete-key="${index}" aria-label="Remove ${escapeHtml(entry.course)} from class Key">×</button></div></article>`).join('') : '<p class="class-key-empty">Your Key is empty. Add a class and its supplies to get started.</p>';
  const status = $('#class-key-status');
  if (status) {
    status.textContent = cloudSession && !classKeyCloudSync ? 'Your class Key is saved on this browser and won’t sync to your other devices.' : '';
  }
}
function renderChat() {
  const visibleMessages = chatMessages.length ? chatMessages : [{ role: 'assistant', content: 'Hi! I can help you plan your school week, search your schedule, add checklist tasks, and create planner events. Add your classes and supplies to the Key, then ask what to bring tomorrow.' }];
  $('#chat-messages').innerHTML = visibleMessages.map((message) => `<article class="chat-message ${message.role === 'user' ? 'chat-user' : 'chat-assistant'}"><span>${message.role === 'user' ? 'You' : 'School Start AI'}</span><p>${escapeHtml(message.content)}</p></article>`).join('');
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
}
function appendChatMessage(role, content) {
  chatMessages = normalizeChatMessages([...chatMessages, { role, content }]);
  localStorage.setItem(chatStorageKey(), JSON.stringify(chatMessages));
  renderChat();
}
async function prepareTomorrowFromSchedule() {
  if (!account || !assistantCanScanSchedule || !scheduleText) return [];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateKey = localDateKey(tomorrow);
  const courseNames = classesOnScheduleDate(dateKey);
  const entries = classKey.filter((entry) => courseNames.some((course) => course.toLowerCase() === entry.course.toLowerCase()));
  return addClassPrepTasks(entries, dateKey);
}
function openAssistant() {
  document.querySelector('.nav-tab[data-tab="chat"]').click();
  $('#assistant-permission').checked = assistantCanScanSchedule;
  $('#chat-input').focus();
}
function announcePrepTasks(added) {
  if (added.length) appendChatMessage('assistant', `I checked your schedule and class Key. For tomorrow, I added ${added.map((name) => `“${name}”`).join(', ')} to your checklist.`);
}
async function renderChatSection() {
  renderChat();
  renderClassKey();
  try {
    announcePrepTasks(await prepareTomorrowFromSchedule());
  } catch (error) {
    appendChatMessage('assistant', `I found supplies for tomorrow but couldn't save them to your checklist: ${error.message}`);
  }
}
const dayLabel = (index) => dayNames[index];
const taskDayLabel = (index) => index === 3 ? 'Wed' : index === 4 ? 'Thu' : dayNames[index];

function render() {
  resetExpiredChecks();
  const todayDate = dateFromKey(selectedChecklistDate);
  todayDate.setDate(todayDate.getDate() - todayDate.getDay() + selectedDay);
  selectedChecklistDate = localDateKey(todayDate);
  const checklistDate = selectedChecklistDate;
  const visible = orderedTasks(items.filter((item) => taskOccursOnDate(item, checklistDate)));
  if ($('#task-order-status')) {
    $('#task-order-status').textContent = !account
      ? 'Log in to organize your tasks'
      : items.some((item) => item.manualOrder)
          ? 'Custom order · hold and drag a task to reorder'
          : 'High priority first · hold and drag a task to reorder';
  }
  $('#checklist-items').innerHTML = visible.map((item) => `<article class="check-item ${taskIsDoneOnDate(item, checklistDate) ? 'done' : ''} ${account ? 'reorderable' : ''}" data-task-id="${item.id}">
    <input class="check-box" type="checkbox" ${taskIsDoneOnDate(item, checklistDate) ? 'checked' : ''} data-id="${item.id}" aria-label="Mark ${item.name} ready" />
    ${account ? `<button class="task-drag-handle" type="button" data-drag-task="${item.id}" aria-label="Drag ${escapeHtml(item.name)} to reorder, or use arrow keys" title="Hold and drag this task to reorder">⠿</button>` : ''}<span class="item-name">${escapeHtml(item.name)}</span><span class="item-days">${item.days.map(dayLabel).join(' · ')}${item.dueDate ? ` · due ${escapeHtml(item.dueDate)}` : ''}${item.priority === 'high' ? ' · high priority' : item.priority === 'low' ? ' · low priority' : ''}${item.reminderTime ? ` · notify ${item.reminderDays.map(dayLabel).join(', ')} at ${item.reminderTime}` : ''}</span>
    <button class="text-button task-view-button" type="button" data-view-task="${item.id}" aria-label="View ${escapeHtml(item.name)} task">View</button><button class="edit-item" data-edit="${item.id}" aria-label="Edit ${escapeHtml(item.name)} reminder">✎</button><button class="delete-item" data-delete="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button>
  </article>`).join('');
  $('#empty-state').classList.toggle('hidden', visible.length > 0);
  $('#empty-state h3').textContent = account ? 'Nothing planned for this day' : 'Log in to see your checklist';
  $('#empty-state p').textContent = account ? 'Add an item and choose the days you need it.' : 'Log in or sign up to create and save tasks.';
  const ready = visible.filter((item) => taskIsDoneOnDate(item, checklistDate)).length;
  $('#progress-label').textContent = `${ready} of ${visible.length} ready`;
  $('#progress-bar').style.width = visible.length ? `${ready / visible.length * 100}%` : '0%';
  $('#focus-title').textContent = visible.length && ready === visible.length ? 'You are all set for today.' : `Your ${dayLabel(selectedDay)} morning, made lighter.`;
  $('#date-label').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(todayDate);
  $('#streak-number').textContent = currentStreak();
  const checklistWeekStart = new Date(todayDate);
  checklistWeekStart.setDate(checklistWeekStart.getDate() - checklistWeekStart.getDay());
  $('#days').innerHTML = dayNames.map((name, index) => { const date = new Date(checklistWeekStart); date.setDate(date.getDate() + index); return `<button class="day-card ${selectedDay === index ? 'selected' : ''} ${date.getDay() === new Date().getDay() && localDateKey(date) === localDateKey() ? 'today' : ''}" data-day="${index}">${name}<strong>${items.filter((item) => taskOccursOnDate(item, localDateKey(date))).length}</strong></button>`; }).join('');
  renderPlanner();
}
function dateFromKey(value) { const [year, month, date] = value.split('-').map(Number); return new Date(year, month - 1, date); }
function currentStreak(todayDate = new Date()) {
  const startDate = new Date(todayDate);
  if (!allTasksCompletedOnDate(localDateKey(startDate))) startDate.setDate(startDate.getDate() - 1);
  let streak = 0;
  while (allTasksCompletedOnDate(localDateKey(startDate))) {
    streak += 1;
    startDate.setDate(startDate.getDate() - 1);
  }
  return streak;
}
function allTasksCompletedOnDate(dateKey) {
  const dateTasks = items.filter((item) => taskOccursOnDate(item, dateKey));
  return dateTasks.length > 0 && dateTasks.every((item) => taskIsDoneOnDate(item, dateKey));
}
function monthWeekOf(date) { const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay(); return Math.floor((date.getDate() + firstDay - 1) / 7) + 1; }
function taskIsDoneOnDate(item, dateKey) {
  return item.doneDates?.includes(dateKey) || false;
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
function taskPriorityValue(item) {
  return ({ high: 3, normal: 2, low: 1 })[item.priority] || 2;
}
function compareTaskOrder(first, second, mode = 'priority') {
  const nameOrder = first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: 'base' });
  const dateOrder = (first.dueDate || '9999-12-31').localeCompare(second.dueDate || '9999-12-31');
  if (mode === 'alphabetical') return nameOrder || dateOrder;
  if (mode === 'alphabetical-descending') return -nameOrder || dateOrder;
  if (mode === 'numeric' || mode === 'numeric-descending') {
    const firstNumber = first.name.match(/\d+/);
    const secondNumber = second.name.match(/\d+/);
    if (!firstNumber && secondNumber) return 1;
    if (firstNumber && !secondNumber) return -1;
    if (firstNumber && secondNumber) {
      const direction = mode === 'numeric' ? 1 : -1;
      const order = direction * (Number(firstNumber[0]) - Number(secondNumber[0]));
      if (order) return order;
    }
    return nameOrder || dateOrder;
  }
  if (mode === 'date-descending') return -dateOrder || nameOrder;
  if (mode === 'priority-ascending') return taskPriorityValue(first) - taskPriorityValue(second) || dateOrder || nameOrder;
  if (mode === 'manual') return first.sortOrder - second.sortOrder || nameOrder;
  return taskPriorityValue(second) - taskPriorityValue(first) || dateOrder || first.sortOrder - second.sortOrder || nameOrder;
}
function orderedTasks(list = items) {
  const mode = list.some((item) => item.manualOrder) ? 'manual' : 'priority';
  return [...list].sort((first, second) => compareTaskOrder(first, second, mode));
}
async function saveTaskOrder(mode) {
  const previous = [...items];
  const previousState = new Map(previous.map((item) => [String(item.id), { sortOrder: item.sortOrder, manualOrder: item.manualOrder }]));
  const ordered = [...items].sort((first, second) => compareTaskOrder(first, second, mode));
  ordered.forEach((item, index) => {
    item.sortOrder = index;
    item.manualOrder = true;
  });
  items = ordered;
  try {
    await saveItems();
  } catch (error) {
    items = previous;
    previous.forEach((item) => Object.assign(item, previousState.get(String(item.id))));
    render();
    throw error;
  }
  render();
}
async function reorderTask(taskId, targetId, after = false) {
  if (String(taskId) === String(targetId)) return false;
  const previous = [...items];
  const previousState = new Map(previous.map((item) => [String(item.id), { sortOrder: item.sortOrder, manualOrder: item.manualOrder }]));
  const ordered = orderedTasks();
  const sourceIndex = ordered.findIndex((item) => String(item.id) === String(taskId));
  const targetIndex = ordered.findIndex((item) => String(item.id) === String(targetId));
  if (sourceIndex < 0 || targetIndex < 0) return false;
  const [moved] = ordered.splice(sourceIndex, 1);
  const adjustedTarget = ordered.findIndex((item) => String(item.id) === String(targetId));
  ordered.splice(adjustedTarget + (after ? 1 : 0), 0, moved);
  ordered.forEach((item, index) => {
    item.sortOrder = index;
    item.manualOrder = true;
  });
  items = ordered;
  render();
  try {
    await saveItems();
  } catch (error) {
    items = previous;
    previous.forEach((item) => Object.assign(item, previousState.get(String(item.id))));
    render();
    throw error;
  }
  return true;
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
    const countSummary = [dateTasks.length ? `${dateTasks.length} task${dateTasks.length === 1 ? '' : 's'}` : '', eventCount ? `${eventCount} event${eventCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    const accessibleCountSummary = [dateTasks.length ? `${dateTasks.length} task${dateTasks.length === 1 ? '' : 's'}` : '', eventCount ? `${eventCount} event${eventCount === 1 ? '' : 's'}` : '', completedCount ? `${completedCount} completed` : ''].filter(Boolean).join(', ');
    return `<button class="${classes}" type="button" role="gridcell" data-planner-date="${dateKey}" aria-label="${escapeHtml(new Intl.DateTimeFormat('en-US', { dateStyle: 'full' }).format(date))}${count ? `, ${accessibleCountSummary}` : ''}"><span>${date.getDate()}</span>${count ? `<small>${countSummary}${completedCount ? ` · ${completedCount} done` : ''}</small>` : ''}</button>`;
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
    return `<article class="planner-entry planner-task ${completed ? 'completed' : ''}"><div class="planner-entry-time">${completed ? 'DONE' : item.dueDate ? 'DUE' : 'TASK'}</div><div class="planner-entry-copy"><strong>${escapeHtml(item.name)}</strong><p>${item.dueDate ? `Due ${escapeHtml(item.dueDate)}` : 'Repeats on this weekday'}${item.priority === 'high' ? ' · High priority' : ''}</p>${completed ? '<small class="planner-completion">Completed in checklist</small>' : ''}${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}</div><button class="text-button" type="button" data-view-task="${item.id}" aria-label="View ${escapeHtml(item.name)} task">View task</button><button class="text-button" type="button" data-checklist-date="${selectedPlannerDate}">Open checklist</button></article>`;
  }).join('');
  const eventMarkup = events.map((entry) => `<article class="planner-entry planner-event"><div class="planner-entry-time">${entry.startTime ? escapeHtml(entry.startTime) : 'EVENT'}${entry.endTime ? `<small>${escapeHtml(entry.endTime)}</small>` : ''}</div><div class="planner-entry-copy"><strong>${escapeHtml(entry.title)}</strong>${entry.notes ? `<p>${escapeHtml(entry.notes)}</p>` : ''}</div><button class="text-button" type="button" data-view-event="${entry.id}" aria-label="View ${escapeHtml(entry.title)} event">View</button><button class="edit-item" type="button" data-edit-event="${entry.id}" aria-label="Edit ${escapeHtml(entry.title)}">✎</button><button class="delete-item" type="button" data-delete-event="${entry.id}" aria-label="Delete ${escapeHtml(entry.title)}">×</button></article>`).join('');
  $('#planner-agenda-list').innerHTML = taskMarkup || eventMarkup ? `${eventMarkup}${taskMarkup}` : '<p class="planner-empty">Nothing planned for this day. Add an event or give a checklist task a due date.</p>';
  $('#planner-sync-note').classList.toggle('hidden', !cloudSession || plannerEventsCloudSync);
  if (account && !plannerReminderTimer && 'Notification' in window && Notification.permission === 'granted') startPlannerReminderCheck();
}
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
function openTaskView(item) {
  if (!item) return;
  const formatDate = (dateKey) => dateKey ? new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(dateFromKey(dateKey)) : 'Not set';
  $('#task-view-name').textContent = item.name;
  $('#task-view-start').textContent = formatDate(item.startDate);
  $('#task-view-due').textContent = formatDate(item.dueDate);
  $('#task-view-days').textContent = `${(item.days || []).map(dayLabel).join(', ') || 'No days selected'}${item.monthWeeks?.length && item.monthWeeks.length < 6 ? ` · Weeks ${item.monthWeeks.join(', ')}` : ''}`;
  $('#task-view-priority').textContent = `${item.priority || 'normal'}`.replace(/^./, (letter) => letter.toUpperCase());
  $('#task-view-reminder').textContent = item.reminderTime ? `${item.reminderTime}${item.reminderDays?.length ? ` · ${item.reminderDays.map(dayLabel).join(', ')}` : ''}` : 'None';
  $('#task-view-notes').textContent = item.notes || 'No description added.';
  $('#task-view-dialog').showModal();
  $('#task-view-close').focus();
}
function openPlannerEventView(entry) {
  if (!entry) return;
  const reminderMinutes = Number(entry.reminderMinutes) || 0;
  const reminderLabels = { 10: '10 minutes before', 30: '30 minutes before', 60: '1 hour before', 1440: '1 day before' };
  $('#event-view-name').textContent = entry.title;
  $('#event-view-date').textContent = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(dateFromKey(entry.date));
  $('#event-view-time').textContent = [entry.startTime, entry.endTime].filter(Boolean).join(' – ') || 'Not set';
  $('#event-view-reminder').textContent = reminderMinutes ? reminderLabels[reminderMinutes] || `${reminderMinutes} minutes before` : 'None';
  $('#event-view-notes').textContent = entry.notes || 'No description added.';
  $('#event-view-dialog').showModal();
  $('#event-view-close').focus();
}
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
$('#assistant-permission').checked = assistantCanScanSchedule;
$('#assistant-permission').addEventListener('change', (event) => {
  assistantCanScanSchedule = event.target.checked;
  localStorage.setItem(assistantPermissionKey, String(assistantCanScanSchedule));
  appendChatMessage('assistant', assistantCanScanSchedule ? 'Schedule access is on. I can now search the text from your uploaded schedule.' : 'Schedule access is off. I will not search your uploaded schedule.');
  if (assistantCanScanSchedule) openAssistant();
});
document.querySelectorAll('.chat-prompts .prompt-button').forEach((button) => button.addEventListener('click', () => { $('#chat-input').value = button.dataset.prompt; $('#chat-input').focus(); }));
$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('#chat-input').value.trim();
  if (!message) return;
  appendChatMessage('user', message);
  $('#chat-input').value = '';
  const sendButton = $('#chat-form button[type="submit"]');
  sendButton.disabled = true;
  try {
    appendChatMessage('assistant', await assistantReply(message));
  } catch (error) {
    appendChatMessage('assistant', `I couldn't save that change: ${error.message}`);
  } finally {
    sendButton.disabled = false;
  }
});
let editingClassKeyCourse = null;
$('#class-key-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const course = $('#class-key-course').value.trim();
  const supplies = [...new Set($('#class-key-supplies').value.split(/,|;|\n|\band\b/i).map((supply) => supply.trim().replace(/[.]+$/, '')).filter(Boolean))];
  if (!course || !supplies.length) return;
  const existing = classKey.find((entry) => entry.course.toLowerCase() === (editingClassKeyCourse || course).toLowerCase());
  if (existing) {
    existing.course = course;
    existing.supplies = supplies;
  } else {
    classKey.push({ course, supplies });
  }
  editingClassKeyCourse = null;
  $('#class-key-form').reset();
  $('#class-key-submit').textContent = 'Add to my Key';
  renderClassKey();
  try {
    await saveClassKey();
    $('#class-key-status').textContent = cloudSession && !classKeyCloudSync ? 'Your class Key is saved on this browser and won’t sync to your other devices.' : 'Your class Key is saved.';
  } catch (error) {
    $('#class-key-status').textContent = `Saved on this browser, but could not sync: ${error.message}`;
  }
});
$('#class-key-list').addEventListener('click', async (event) => {
  const editIndex = Number(event.target.closest('[data-edit-key]')?.dataset.editKey);
  if (Number.isInteger(editIndex) && classKey[editIndex]) {
    editingClassKeyCourse = classKey[editIndex].course;
    $('#class-key-course').value = classKey[editIndex].course;
    $('#class-key-supplies').value = classKey[editIndex].supplies.join(', ');
    $('#class-key-submit').textContent = 'Save changes';
    $('#class-key-course').focus();
    return;
  }
  const deleteIndex = Number(event.target.closest('[data-delete-key]')?.dataset.deleteKey);
  if (!Number.isInteger(deleteIndex) || !classKey[deleteIndex]) return;
  classKey.splice(deleteIndex, 1);
  if (editingClassKeyCourse && !classKey.some((entry) => entry.course === editingClassKeyCourse)) editingClassKeyCourse = null;
  renderClassKey();
  try {
    await saveClassKey();
    $('#class-key-status').textContent = cloudSession && !classKeyCloudSync ? 'Your class Key is saved on this browser and won’t sync to your other devices.' : 'Your class Key is saved.';
  } catch (error) {
    $('#class-key-status').textContent = `Saved on this browser, but could not sync: ${error.message}`;
  }
});
$('#open-notifications').addEventListener('click', () => { notifications = notifications.map((notification) => ({ ...notification, read: true })); saveNotifications(); renderNotifications(); $('#notifications-dialog').showModal(); });
$('#clear-notifications').addEventListener('click', () => { notifications = []; saveNotifications(); renderNotifications(); });
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; $('#install-app').classList.remove('hidden'); });
$('#install-app').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('#install-app').classList.add('hidden'); });
$('#item-close').addEventListener('click', () => $('#item-dialog').close());
$('#item-cancel').addEventListener('click', () => $('#item-dialog').close());
$('#task-view-close').addEventListener('click', () => $('#task-view-dialog').close());
$('#task-view-done').addEventListener('click', () => $('#task-view-dialog').close());
$('#event-view-close').addEventListener('click', () => $('#event-view-dialog').close());
$('#event-view-done').addEventListener('click', () => $('#event-view-dialog').close());
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
  item.doneDates = Array.isArray(item.doneDates) ? item.doneDates : [];
  if (event.target.checked) {
    item.doneDates = [...new Set([...item.doneDates, dateKey])];
  } else {
    item.doneDates = item.doneDates.filter((completedDate) => completedDate !== dateKey);
  }
  item.doneDays = [];
  item.doneWeek = null;
  void saveItems();
  render();
});
let reorderHoldTimer = null;
let reorderPointer = null;
const checklistItemsElement = $('#checklist-items');
checklistItemsElement.addEventListener('pointerdown', (event) => {
  const taskRow = event.target.closest('.check-item');
  const handle = event.target.closest('[data-drag-task]');
  const isMouseRowDrag = event.pointerType === 'mouse' && taskRow && !event.target.closest('button,input,textarea,select,a,[contenteditable="true"]');
  if (!account || !taskRow || event.button > 0 || (!handle && !isMouseRowDrag)) return;
  reorderPointer = { id: taskRow.dataset.taskId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, handle: handle || taskRow, taskRow, targetId: null, after: false, dragging: false };
  const beginDrag = () => {
    if (!reorderPointer || reorderPointer.pointerId !== event.pointerId) return;
    reorderPointer.dragging = true;
    taskRow.classList.add('dragging');
    document.body.classList.add('task-reordering');
    taskRow.setPointerCapture(event.pointerId);
  };
  if (event.pointerType === 'mouse') {
    beginDrag();
    return;
  }
  reorderHoldTimer = setTimeout(() => {
    beginDrag();
  }, 350);
});
checklistItemsElement.addEventListener('pointermove', (event) => {
  if (!reorderPointer || reorderPointer.pointerId !== event.pointerId) return;
  if (!reorderPointer.dragging) {
    if (Math.hypot(event.clientX - reorderPointer.startX, event.clientY - reorderPointer.startY) > 9) {
      clearTimeout(reorderHoldTimer);
      reorderPointer = null;
    }
    return;
  }
  event.preventDefault();
  checklistItemsElement.querySelectorAll('.drop-before,.drop-after').forEach((row) => row.classList.remove('drop-before', 'drop-after'));
  const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest('.check-item');
  if (!targetRow || targetRow === reorderPointer.taskRow) {
    reorderPointer.targetId = null;
    return;
  }
  const bounds = targetRow.getBoundingClientRect();
  reorderPointer.targetId = targetRow.dataset.taskId;
  reorderPointer.after = event.clientY >= bounds.top + bounds.height / 2;
  targetRow.classList.add(reorderPointer.after ? 'drop-after' : 'drop-before');
});
async function finishTaskReorder(event) {
  if (!reorderPointer || reorderPointer.pointerId !== event.pointerId) return;
  clearTimeout(reorderHoldTimer);
  const state = reorderPointer;
  reorderPointer = null;
  document.body.classList.remove('task-reordering');
  checklistItemsElement.querySelectorAll('.dragging,.drop-before,.drop-after').forEach((row) => row.classList.remove('dragging', 'drop-before', 'drop-after'));
  if (event.type === 'pointercancel') return;
  if (!state.dragging) return;
  if (!state.targetId) return;
  try {
    await reorderTask(state.id, state.targetId, state.after);
    $('#task-order-status').textContent = 'Custom order saved · hold and drag a task to reorder';
  } catch (error) {
    $('#task-order-status').textContent = `Could not save your task order: ${error.message}`;
  }
}
checklistItemsElement.addEventListener('pointerup', (event) => { void finishTaskReorder(event); });
checklistItemsElement.addEventListener('pointercancel', (event) => { void finishTaskReorder(event); });
checklistItemsElement.addEventListener('keydown', (event) => {
  const handle = event.target.closest('[data-drag-task]');
  if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const visible = orderedTasks(items.filter((item) => taskOccursOnDate(item, selectedChecklistDate)));
  const index = visible.findIndex((item) => String(item.id) === handle.dataset.dragTask);
  const target = visible[index + (event.key === 'ArrowUp' ? -1 : 1)];
  if (target) void reorderTask(handle.dataset.dragTask, target.id, event.key === 'ArrowDown').catch((error) => { $('#task-order-status').textContent = `Could not save your task order: ${error.message}`; });
});
checklistItemsElement.addEventListener('click', (event) => {
  const viewId = Number(event.target.closest('[data-view-task]')?.dataset.viewTask);
  if (viewId) { openTaskView(items.find((item) => Number(item.id) === viewId)); return; }
  if (!account) return;
  const editId = Number(event.target.closest('[data-edit]')?.dataset.edit);
  if (editId) { openItemDialog(items.find((item) => Number(item.id) === editId)); return; }
  const id = Number(event.target.closest('[data-delete]')?.dataset.delete);
  if (id) { items = items.filter((item) => Number(item.id) !== id); void saveItems(); render(); }
});
$('#days').addEventListener('click', (event) => { const card = event.target.closest('[data-day]'); if (card) { selectedDay = Number(card.dataset.day); const weekStart = dateFromKey(selectedChecklistDate); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + selectedDay); selectedChecklistDate = localDateKey(weekStart); render(); } });
document.querySelectorAll('.nav-tab').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.nav-tab').forEach((tab) => tab.classList.remove('active')); document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active-panel')); button.classList.add('active'); $(`#${button.dataset.tab}`).classList.add('active-panel'); if (button.dataset.tab === 'planner') renderPlanner(); if (button.dataset.tab === 'chat') renderChatSection(); }));
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
  const viewId = Number(event.target.closest('[data-view-task]')?.dataset.viewTask);
  if (viewId) { openTaskView(items.find((item) => Number(item.id) === viewId)); return; }
  const checklistDate = event.target.closest('[data-checklist-date]')?.dataset.checklistDate;
  if (checklistDate) {
    selectedDay = dateFromKey(checklistDate).getDay();
    selectedChecklistDate = checklistDate;
    document.querySelector('.nav-tab[data-tab="checklist"]').click();
    render();
    return;
  }
  const viewEventId = event.target.closest('[data-view-event]')?.dataset.viewEvent;
  if (viewEventId) { openPlannerEventView(plannerEvents.find((entry) => String(entry.id) === viewEventId)); return; }
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
  scheduleRows = [];
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
    const pageRows = [...rows.entries()].sort((first, second) => second[0] - first[0]).map(([, cells]) => cells.sort((first, second) => first.x - second.x).map((cell) => ({ x: cell.x, text: cell.text })));
    scheduleRows.push(...pageRows);
    const pageLines = pageRows.map((cells) => cells.map((cell) => cell.text).join(' '));
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
function openAccountDialog(mode = 'login') { const signup = mode === 'signup'; $('#account-form').dataset.mode = mode; $('#account-dialog-title').textContent = signup ? 'Create your account' : 'Log in to your account'; $('#account-submit').textContent = signup ? 'Sign up' : 'Log in'; $('#account-name-field').textContent = 'Username'; $('#account-name-input').placeholder = 'e.g. Alex'; $('#account-name-input').required = signup; $('#account-switch').textContent = signup ? 'Already have an account? Log in' : 'New here? Create an account'; $('#remember-me-label').classList.toggle('hidden', signup); $('#remember-me').checked = false; $('#account-name-input').value = ''; $('#account-email').value = ''; $('#account-password').value = ''; $('#account-password').type = 'password'; $('#toggle-account-password').textContent = 'View password'; $('#toggle-account-password').setAttribute('aria-pressed', 'false'); $('#account-error').textContent = ''; $('#account-dialog').showModal(); (signup ? $('#account-name-input') : $('#account-email')).focus(); }
$('#remember-me').addEventListener('change', () => { if (!$('#remember-me').checked || $('#account-form').dataset.mode !== 'login') { rememberedSession = null; localStorage.removeItem(rememberSessionKey); } });
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
  classKey = [];
  chatMessages = [];
  classKeyCloudSync = false;
  plannerEventsCloudSync = true;
  renderClassKey();
  renderChat();
  render();
  updateAccountUI();
  openAccountDialog('login');
});
$('#account-switch').addEventListener('click', () => { const mode = $('#account-form').dataset.mode === 'login' ? 'signup' : 'login'; $('#account-dialog').close(); openAccountDialog(mode); });
async function hashPassword(password) { const data = new TextEncoder().encode(password); const hash = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
$('#account-form').addEventListener('submit', async (event) => { event.preventDefault(); const mode = $('#account-form').dataset.mode || 'login'; const signup = mode === 'signup'; const username = $('#account-name-input').value.trim(); const email = $('#account-email').value.trim().toLowerCase(); const password = $('#account-password').value; $('#account-error').textContent = ''; try { const endpoint = signup ? `/auth/v1/signup${appRedirectUrl ? `?redirect_to=${encodeURIComponent(appRedirectUrl)}` : ''}` : '/auth/v1/token?grant_type=password'; const authResponse = await supabaseRequest(endpoint, { method: 'POST', body: JSON.stringify(signup ? { email, password, data: { username, name: username } } : { email, password }) }); if (!authResponse?.access_token) { const responseFields = authResponse && typeof authResponse === 'object' ? Object.keys(authResponse).join(', ') : 'none'; $('#account-error').textContent = signup ? 'No sign-in session was returned. If this email already has an account, switch to Log in. Otherwise, check whether email confirmation is required.' : `Supabase returned a successful response without a sign-in token (response fields: ${responseFields}). This is not a credentials error; check Supabase Auth logs or try again.`; $('#account-password').value = ''; return; } cloudSession = authResponse; localStorage.setItem(cloudSessionKey, JSON.stringify(cloudSession)); const cloudProfiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(authResponse.user.id)}&select=*`); const fallbackUsername = username || email.split('@')[0] || 'User'; const fallbackName = username || email.split('@')[0] || 'User'; const profilePayload = { id: authResponse.user.id, email: authResponse.user.email || email, username: fallbackUsername, name: fallbackName, items: normalizeItems(accounts[email]?.items || savedItems || []), notifications: [], schedule_url: scheduleUrl || null, schedule_image: localStorage.getItem(scheduleImageKey) || null }; if (!cloudProfiles.length) { await supabaseRequest('/rest/v1/profiles?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(profilePayload) }); } profile = (await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(authResponse.user.id)}&select=*`))[0] || profilePayload; if (!signup && profile.username.toLowerCase() !== (username || profile.username).toLowerCase()) { if (username) { profile.username = username; profile.name = username; await saveCloudProfile(); } } activeAccountKey = authResponse.user.id; items = normalizeItems(profile.items); scheduleUrl = profile.schedule_url || null; if (profile.schedule_image) localStorage.setItem(scheduleImageKey, profile.schedule_image); notifications = Array.isArray(profile.notifications) ? profile.notifications : []; await saveCloudProfile(); account = true; accountName = profile.name; $('#account-dialog').close(); $('#account-form').reset(); updateAccountUI(); startReminderCheck(); void registerPushSubscription().catch(() => {}); render(); renderNotifications(); } catch (error) { cloudSession = null; localStorage.removeItem(cloudSessionKey); $('#account-error').textContent = error.message; } });
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=25-ai-planner-key');
