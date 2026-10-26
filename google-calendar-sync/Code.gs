const KARA_SYNC = {
  projectId: "kara-masaze",
  timeZone: "Europe/Bratislava",
  collection: "rezervacie",
  propertyPrefix: "karaBooking:",
  pollMinutes: 15
};

/**
 * Synchronizes upcoming Firestore bookings with the default calendar of the
 * Google account that owns this script. Run once manually to authorize and
 * check access, then install the periodic trigger.
 */
function syncKaraBookings() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.log("Sync already running; skipping this trigger.");
    return;
  }

  try {
    const today = Utilities.formatDate(new Date(), KARA_SYNC.timeZone, "yyyy-MM-dd");
    const now = new Date();
    const bookings = readUpcomingBookings_(today);
    const calendar = CalendarApp.getDefaultCalendar();
    if (!calendar) throw new Error("The script owner has no default Google Calendar.");

    const properties = PropertiesService.getScriptProperties();
    const stored = properties.getProperties();
    const activeIds = new Set(bookings.map(booking => booking.id));
    let created = 0;
    let updated = 0;
    let removed = 0;
    let skippedPast = 0;

    bookings.forEach(booking => {
      const times = bookingTimes_(booking);
      const propertyKey = KARA_SYNC.propertyPrefix + booking.id;
      const saved = parseSavedEvent_(stored[propertyKey]);

      // Do not create calendar entries for appointments that have already started.
      // If we previously synced today's booking, leave its event intact as history.
      if (times.start <= now) {
        skippedPast += 1;
        return;
      }

      const content = eventContent_(booking, times);
      let event = saved ? getEventSafely_(saved.eventId) : null;

      if (!event) {
        event = calendar.createEvent(content.title, times.start, times.end, {
          description: content.description
        });
        event.setTag("karaBookingId", booking.id);
        event.setVisibility(CalendarApp.Visibility.PRIVATE);
        created += 1;
      } else if (saved.signature !== content.signature) {
        event.setTitle(content.title);
        event.setTime(times.start, times.end);
        event.setDescription(content.description);
        event.setVisibility(CalendarApp.Visibility.PRIVATE);
        updated += 1;
      }

      properties.setProperty(propertyKey, JSON.stringify({
        eventId: event.getId(),
        date: booking.datum,
        signature: content.signature
      }));
    });

    // A missing future booking means it was cancelled. Remove its managed event.
    // Entries from earlier dates are kept in Calendar as appointment history.
    Object.keys(stored).forEach(key => {
      if (!key.startsWith(KARA_SYNC.propertyPrefix)) return;
      const bookingId = key.slice(KARA_SYNC.propertyPrefix.length);
      const saved = parseSavedEvent_(stored[key]);
      if (!saved) {
        properties.deleteProperty(key);
        return;
      }

      if (saved.date < today) {
        properties.deleteProperty(key);
        return;
      }

      if (!activeIds.has(bookingId)) {
        const event = getEventSafely_(saved.eventId);
        if (event) event.deleteEvent();
        properties.deleteProperty(key);
        removed += 1;
      }
    });

    console.log(JSON.stringify({created, updated, removed, skippedPast}));
  } finally {
    lock.releaseLock();
  }
}

/** Installs one 15-minute trigger. Run after a successful manual sync. */
function installKaraCalendarTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(trigger =>
    trigger.getHandlerFunction() === "syncKaraBookings"
  );
  if (existing.length === 0) {
    ScriptApp.newTrigger("syncKaraBookings")
      .timeBased()
      .everyMinutes(KARA_SYNC.pollMinutes)
      .create();
  }
  console.log("Calendar sync trigger is installed.");
}

/** Removes the recurring trigger without deleting any calendar events. */
function removeKaraCalendarTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "syncKaraBookings") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  console.log("Calendar sync trigger removed.");
}

function readUpcomingBookings_(today) {
  const parent = "projects/" + KARA_SYNC.projectId + "/databases/(default)/documents";
  const url = "https://firestore.googleapis.com/v1/" + parent + ":runQuery";
  const body = {
    structuredQuery: {
      from: [{collectionId: KARA_SYNC.collection}],
      where: {
        fieldFilter: {
          field: {fieldPath: "datum"},
          op: "GREATER_THAN_OR_EQUAL",
          value: {stringValue: today}
        }
      }
    }
  };
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {Authorization: "Bearer " + ScriptApp.getOAuthToken()},
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error("Firestore read failed (" + status + "): " + text.slice(0, 500));
  }

  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error("Unexpected Firestore query response.");
  return rows.filter(row => row.document).map(row => {
    const document = row.document;
    const id = document.name.split("/").pop();
    const fields = {};
    Object.keys(document.fields || {}).forEach(key => {
      fields[key] = firestoreValue_(document.fields[key]);
    });
    return Object.assign(fields, {id});
  });
}

function firestoreValue_(value) {
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (value.arrayValue) return (value.arrayValue.values || []).map(firestoreValue_);
  if (value.mapValue) {
    const result = {};
    Object.keys(value.mapValue.fields || {}).forEach(key => {
      result[key] = firestoreValue_(value.mapValue.fields[key]);
    });
    return result;
  }
  return null;
}

function bookingTimes_(booking) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(booking.datum || ""))) {
    throw new Error("Invalid booking date for " + booking.id);
  }
  const time = String(booking.cas || "").match(/^(\d{2}):(\d{2})$/);
  const duration = Number(booking.trvanieRezervacie);
  const pause = Number(booking.prestavka || 0);
  if (!time || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(pause) || pause < 0) {
    throw new Error("Invalid booking time or duration for " + booking.id);
  }

  const [year, month, day] = booking.datum.split("-").map(Number);
  const start = new Date(year, month - 1, day, Number(time[1]), Number(time[2]), 0, 0);
  const end = new Date(start.getTime() + (duration + pause) * 60000);
  return {start, end, duration, pause};
}

function eventContent_(booking, times) {
  const addons = Array.isArray(booking.doplnky) && booking.doplnky.length
    ? booking.doplnky.join(", ")
    : "Žiadne";
  const title = (booking.masaz || "Masáž") + " — " + (booking.meno || "Klient");
  const description = [
    "Rezervácia z webu KARA Masáže",
    "Klient: " + (booking.meno || "neuvedené"),
    "Telefón: " + (booking.telefon || "neuvedený"),
    "Masáž: " + (booking.masaz || "neuvedená"),
    "Doplnkové služby: " + addons,
    "Cena: " + (Number.isFinite(Number(booking.cenaSpolu)) ? Number(booking.cenaSpolu) + " €" : "neuvedená"),
    "Trvanie masáže: " + times.duration + " min",
    "Čas v kalendári zahŕňa aj prestávku: " + times.pause + " min"
  ].join("\n");
  const signature = JSON.stringify({
    title,
    description,
    start: times.start.toISOString(),
    end: times.end.toISOString()
  });
  return {title, description, signature};
}

function parseSavedEvent_(value) {
  if (!value) return null;
  try {
    const saved = JSON.parse(value);
    return saved.eventId && saved.date ? saved : null;
  } catch (error) {
    return null;
  }
}

function getEventSafely_(eventId) {
  try {
    return CalendarApp.getEventById(eventId);
  } catch (error) {
    return null;
  }
}
