import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import appConfig from '../config.js';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type Role = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly';
export const repeatRules: RepeatRule[] = ['none', 'daily', 'weekly', 'monthly'];

/** Which days a change to a repeating event applies to. */
export type RepeatScope = 'only-this' | 'this-and-future';
export const repeatScopes: RepeatScope[] = ['only-this', 'this-and-future'];

/** The details the user fills in for an event. Dates are "YYYY-MM-DD", times are "HH:mm". */
export interface EventInput {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  repeat: RepeatRule;
}

/** Same shape as the client's CalendarEvent, minus the fields that only matter on a device. */
export interface CalendarEvent extends EventInput {
  id: number;
  /** The last day a repeating event happens. Missing means it repeats forever. */
  endDate?: string;
  /** Days a repeating event is skipped, because that day was deleted or changed on its own. */
  excludedDates?: string[];
  /** The id every device knows the event by. The numeric id is only this database's. */
  clientId: string;
  /** When the event last changed, in ms. The newer copy wins when two devices change it. */
  updatedAt: number;
  /** Deleted events are kept as markers so other devices find out about the delete. */
  deleted: boolean;
}

/** An event as a device sends and receives it when syncing. */
export type SyncedEvent = Omit<CalendarEvent, 'id'>;

const config = appConfig.db.connection;

let pool: Pool | undefined;

function db(): Pool {
  if (!pool) {
    throw new Error('database not initialized');
  }
  return pool;
}

const tableStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    passwordHash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') NOT NULL DEFAULT 'user'
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token CHAR(64) PRIMARY KEY,
    userId CHAR(36) NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  // "repeat" is a reserved word in MySQL, so the column is repeatRule.
  // changedAt is the server's clock, so devices can ask for "everything since" without trusting
  // their own clocks. updatedAt is the device's clock and only decides which change wins.
  `CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId CHAR(36) NOT NULL,
    clientId CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    startTime TIME NOT NULL,
    endTime TIME NOT NULL,
    repeatRule ENUM('none', 'daily', 'weekly', 'monthly') NOT NULL,
    endDate DATE NULL,
    excludedDates JSON NOT NULL,
    updatedAt BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT FALSE,
    changedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (userId, clientId),
    INDEX (userId, date),
    INDEX (userId, changedAt)
  )`,
  // One row per device that gets reminders as push messages. The reminder choice and time zone
  // are the device's: event times have no zone, so the server needs one to know when "7:30" is.
  `CREATE TABLE IF NOT EXISTS pushSubscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId CHAR(36) NOT NULL,
    endpoint VARCHAR(767) NOT NULL UNIQUE,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    minutesBefore INT NOT NULL,
    timeZone VARCHAR(64) NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  // Reminders already sent, so none is sent twice. reminderKey is "clientId|date|startTime",
  // so moving an event gets a new reminder.
  `CREATE TABLE IF NOT EXISTS pushRemindersSent (
    subscriptionId INT NOT NULL,
    reminderKey VARCHAR(100) NOT NULL,
    sentOn DATE NOT NULL,
    PRIMARY KEY (subscriptionId, reminderKey),
    INDEX (sentOn),
    FOREIGN KEY (subscriptionId) REFERENCES pushSubscriptions(id) ON DELETE CASCADE
  )`,
];

/** Creates the database and tables if they don't exist yet, then opens the connection pool. */
export async function initializeDatabase(): Promise<void> {
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection(serverConfig);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  } finally {
    await connection.end();
  }

  // dateStrings keeps DATE columns as "YYYY-MM-DD" instead of turning them into JS Dates.
  pool = mysql.createPool({ ...config, dateStrings: true });
  for (const statement of tableStatements) {
    await pool.query(statement);
  }
  await promoteAdmin(pool);
}

/** Makes the user whose email is configured as adminEmail an admin, if they have registered. */
async function promoteAdmin(connection: Pool): Promise<void> {
  const adminEmail: string | undefined = appConfig.adminEmail;
  if (adminEmail) {
    await connection.execute(`UPDATE users SET role = 'admin' WHERE email = ?`, [normalizeEmail(adminEmail)]);
  }
}

export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function addUser(name: string, email: string, password: string): Promise<User | null> {
  const user: User = { id: randomUUID(), name, email: normalizeEmail(email), role: 'user' };
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await db().execute('INSERT INTO users (id, name, email, passwordHash) VALUES (?, ?, ?, ?)', [
      user.id,
      user.name,
      user.email,
      passwordHash,
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      return null;
    }
    throw error;
  }
  return user;
}

export async function verifyUser(email: string, password: string): Promise<User | null> {
  const [rows] = await db().execute<RowDataPacket[]>(
    'SELECT id, name, email, role, passwordHash FROM users WHERE email = ?',
    [normalizeEmail(email)],
  );
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
    return null;
  }
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await db().execute('INSERT INTO sessions (token, userId) VALUES (?, ?)', [token, userId]);
  return token;
}

export async function getUserByToken(token: string): Promise<User | null> {
  const [rows] = await db().execute<RowDataPacket[]>(
    'SELECT users.id, users.name, users.email, users.role FROM sessions JOIN users ON users.id = sessions.userId WHERE sessions.token = ?',
    [token],
  );
  const row = rows[0];
  return row ? { id: row.id, name: row.name, email: row.email, role: row.role } : null;
}

/** Every registered user, by name. */
export async function getUsers(): Promise<Pick<User, 'id' | 'name' | 'email'>[]> {
  const [rows] = await db().execute<RowDataPacket[]>('SELECT id, name, email FROM users ORDER BY name, email');
  return rows.map((row) => ({ id: row.id, name: row.name, email: row.email }));
}

export async function deleteSession(token: string): Promise<void> {
  await db().execute('DELETE FROM sessions WHERE token = ?', [token]);
}

/** Signs the user out everywhere except the session with `keepToken`. */
export async function deleteOtherSessions(userId: string, keepToken: string): Promise<void> {
  await db().execute('DELETE FROM sessions WHERE userId = ? AND token <> ?', [userId, keepToken]);
}

/** Whether `password` is the user's current password. */
export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const [rows] = await db().execute<RowDataPacket[]>('SELECT passwordHash FROM users WHERE id = ?', [userId]);
  const row = rows[0];
  return Boolean(row) && (await bcrypt.compare(password, row.passwordHash));
}

export interface UserChanges {
  name?: string;
  email?: string;
  password?: string;
}

/** Saves the fields given and returns the updated user, or null if the new email is already taken. */
export async function updateUser(userId: string, changes: UserChanges): Promise<User | null> {
  const assignments: string[] = [];
  const values: string[] = [];
  if (changes.name !== undefined) {
    assignments.push('name = ?');
    values.push(changes.name);
  }
  if (changes.email !== undefined) {
    assignments.push('email = ?');
    values.push(normalizeEmail(changes.email));
  }
  if (changes.password !== undefined) {
    assignments.push('passwordHash = ?');
    values.push(await bcrypt.hash(changes.password, 10));
  }

  if (assignments.length > 0) {
    try {
      await db().execute(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, [...values, userId]);
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        return null;
      }
      throw error;
    }
  }

  const [rows] = await db().execute<RowDataPacket[]>('SELECT id, name, email, role FROM users WHERE id = ?', [
    userId,
  ]);
  const row = rows[0];
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

const eventColumns =
  'id, clientId, title, date, startTime, endTime, repeatRule, endDate, excludedDates, updatedAt, deleted';

function toEvent(row: RowDataPacket): CalendarEvent {
  const event: CalendarEvent = {
    id: row.id,
    title: row.title,
    date: row.date,
    // TIME columns come back as "HH:mm:ss".
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    repeat: row.repeatRule,
    clientId: row.clientId,
    // BIGINT can come back as a string; ms timestamps always fit in a JS number.
    updatedAt: Number(row.updatedAt),
    // BOOLEAN is TINYINT(1) in MySQL, so it comes back as 0 or 1.
    deleted: Boolean(row.deleted),
  };
  if (row.endDate) {
    event.endDate = row.endDate;
  }
  if (row.excludedDates.length > 0) {
    event.excludedDates = row.excludedDates;
  }
  return event;
}

/** Returns "YYYY-MM-DD" moved by `amount` days. */
function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

async function insertEvent(
  connection: Pool | PoolConnection,
  userId: string,
  input: EventInput,
  endDate: string | null = null,
  excludedDates: string[] = [],
): Promise<number> {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO events (userId, clientId, title, date, startTime, endTime, repeatRule, endDate, excludedDates, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      randomUUID(),
      input.title,
      input.date,
      input.startTime,
      input.endTime,
      input.repeat,
      endDate,
      JSON.stringify(excludedDates),
      Date.now(),
    ],
  );
  return result.insertId;
}

/** Every event of the user's that happens on the given day ("YYYY-MM-DD"), including repeats. */
export async function getEventsForDay(userId: string, date: string): Promise<CalendarEvent[]> {
  const [rows] = await db().execute<RowDataPacket[]>(
    `SELECT ${eventColumns} FROM events
     WHERE userId = ?
       AND deleted = FALSE
       AND date <= ?
       AND (endDate IS NULL OR endDate >= ?)
       AND NOT JSON_CONTAINS(excludedDates, JSON_QUOTE(?))
       AND (
         (repeatRule = 'none' AND date = ?)
         OR repeatRule = 'daily'
         OR (repeatRule = 'weekly' AND DAYOFWEEK(date) = DAYOFWEEK(?))
         OR (repeatRule = 'monthly' AND DAYOFMONTH(date) = DAYOFMONTH(?))
       )
     ORDER BY startTime, id`,
    [userId, date, date, date, date, date, date],
  );
  return rows.map(toEvent);
}

export async function createEvent(userId: string, input: EventInput): Promise<CalendarEvent> {
  const id = await insertEvent(db(), userId, input);
  const [rows] = await db().execute<RowDataPacket[]>(`SELECT ${eventColumns} FROM events WHERE id = ?`, [id]);
  return toEvent(rows[0]);
}

/**
 * Runs `work` in a transaction on the user's event, locked so concurrent changes can't interleave.
 * Returns false if the user has no event with that id.
 */
async function withEvent(
  userId: string,
  eventId: number,
  work: (connection: PoolConnection, event: CalendarEvent) => Promise<void>,
): Promise<boolean> {
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT ${eventColumns} FROM events WHERE id = ? AND userId = ? AND deleted = FALSE FOR UPDATE`,
      [eventId, userId],
    );
    if (rows.length === 0) {
      await connection.rollback();
      return false;
    }
    await work(connection, toEvent(rows[0]));
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Saves changes to the event on `occurrenceDate` (the day the user opened it from).
 *
 * - "only-this": the series skips that day, and the changed day is saved as its own event.
 * - "this-and-future": the series stops the day before, and a new series with the
 *   changes starts that day. Earlier days keep their old details.
 *
 * An event that doesn't repeat only happens on one day, so "this-and-future" simply updates it.
 * Returns false if the user has no event with that id.
 */
export async function updateEvent(
  userId: string,
  eventId: number,
  occurrenceDate: string,
  input: EventInput,
  scope: RepeatScope,
): Promise<boolean> {
  return withEvent(userId, eventId, async (connection, event) => {
    const excludedDates = event.excludedDates ?? [];

    if (scope === 'only-this') {
      await connection.execute('UPDATE events SET excludedDates = ?, updatedAt = ? WHERE id = ?', [
        JSON.stringify([...excludedDates, occurrenceDate]),
        Date.now(),
        event.id,
      ]);
      await insertEvent(connection, userId, { ...input, repeat: 'none' });
    } else if (occurrenceDate === event.date) {
      // Changing from the very first day changes the whole series.
      await connection.execute(
        'UPDATE events SET title = ?, date = ?, startTime = ?, endTime = ?, repeatRule = ?, updatedAt = ? WHERE id = ?',
        [input.title, input.date, input.startTime, input.endTime, input.repeat, Date.now(), event.id],
      );
    } else {
      await connection.execute('UPDATE events SET endDate = ?, excludedDates = ?, updatedAt = ? WHERE id = ?', [
        addDays(occurrenceDate, -1),
        JSON.stringify(excludedDates.filter((date) => date < occurrenceDate)),
        Date.now(),
        event.id,
      ]);
      await insertEvent(
        connection,
        userId,
        input,
        event.endDate ?? null,
        excludedDates.filter((date) => date >= occurrenceDate),
      );
    }
  });
}

/**
 * Deletes the event on `occurrenceDate`. For a repeating event, "only-this" skips that
 * day and "this-and-future" ends the series the day before. Earlier days are kept.
 * Returns false if the user has no event with that id.
 */
export async function deleteEvent(
  userId: string,
  eventId: number,
  occurrenceDate: string,
  scope: RepeatScope,
): Promise<boolean> {
  return withEvent(userId, eventId, async (connection, event) => {
    if (scope === 'only-this') {
      await connection.execute('UPDATE events SET excludedDates = ?, updatedAt = ? WHERE id = ?', [
        JSON.stringify([...(event.excludedDates ?? []), occurrenceDate]),
        Date.now(),
        event.id,
      ]);
    } else if (occurrenceDate === event.date) {
      // Deleting from the very first day deletes the whole series. The row stays as a marker
      // so other devices find out about the delete when they sync.
      await connection.execute('UPDATE events SET deleted = TRUE, updatedAt = ? WHERE id = ?', [
        Date.now(),
        event.id,
      ]);
    } else {
      await connection.execute('UPDATE events SET endDate = ?, updatedAt = ? WHERE id = ?', [
        addDays(occurrenceDate, -1),
        Date.now(),
        event.id,
      ]);
    }
  });
}

/** What a sync sends back: the user's events that changed since the device last synced. */
export interface SyncResult {
  events: SyncedEvent[];
  /** Pass this as `since` next time. Null while the user has no events. */
  cursor: string | null;
}

/**
 * Saves the device's changed events, then returns every event of the user's that changed after
 * `since` (a cursor from an earlier sync), or all of them when `since` is null.
 *
 * Events are matched by clientId, so sending the same events again changes nothing. When an
 * event already exists, the copy with the newer updatedAt wins.
 */
export async function syncEvents(userId: string, events: SyncedEvent[], since: string | null): Promise<SyncResult> {
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    for (const event of events) {
      // Each column only takes the incoming value when the incoming copy is newer.
      // updatedAt is assigned last because MySQL applies these assignments left to right.
      await connection.execute(
        `INSERT INTO events
           (userId, clientId, title, date, startTime, endTime, repeatRule, endDate, excludedDates, updatedAt, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) AS incoming
         ON DUPLICATE KEY UPDATE
           title = IF(incoming.updatedAt > events.updatedAt, incoming.title, events.title),
           date = IF(incoming.updatedAt > events.updatedAt, incoming.date, events.date),
           startTime = IF(incoming.updatedAt > events.updatedAt, incoming.startTime, events.startTime),
           endTime = IF(incoming.updatedAt > events.updatedAt, incoming.endTime, events.endTime),
           repeatRule = IF(incoming.updatedAt > events.updatedAt, incoming.repeatRule, events.repeatRule),
           endDate = IF(incoming.updatedAt > events.updatedAt, incoming.endDate, events.endDate),
           excludedDates = IF(incoming.updatedAt > events.updatedAt, incoming.excludedDates, events.excludedDates),
           deleted = IF(incoming.updatedAt > events.updatedAt, incoming.deleted, events.deleted),
           updatedAt = GREATEST(incoming.updatedAt, events.updatedAt)`,
        [
          userId,
          event.clientId,
          event.title,
          event.date,
          event.startTime,
          event.endTime,
          event.repeat,
          event.endDate ?? null,
          JSON.stringify(event.excludedDates ?? []),
          event.updatedAt,
          event.deleted,
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [rows] = await db().execute<RowDataPacket[]>(
    `SELECT ${eventColumns}, changedAt FROM events
     WHERE userId = ? AND (? IS NULL OR changedAt > ?)
     ORDER BY changedAt`,
    [userId, since, since],
  );
  const changed = rows.map((row) => {
    const { id, ...event } = toEvent(row);
    return event;
  });
  // The newest change returned is where the next sync picks up.
  const cursor = rows.length > 0 ? rows[rows.length - 1].changedAt : since;
  return { events: changed, cursor };
}

/** A device's push subscription, as the browser's PushSubscription.toJSON() gives it. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushSubscriptionRow extends PushSubscriptionInput {
  id: number;
  userId: string;
  minutesBefore: number;
  timeZone: string;
}

/** Saves the device's subscription, or updates it if the device registered before. */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
  minutesBefore: number,
  timeZone: string,
): Promise<void> {
  await db().execute(
    `INSERT INTO pushSubscriptions (userId, endpoint, p256dh, auth, minutesBefore, timeZone)
     VALUES (?, ?, ?, ?, ?, ?) AS incoming
     ON DUPLICATE KEY UPDATE
       userId = incoming.userId,
       p256dh = incoming.p256dh,
       auth = incoming.auth,
       minutesBefore = incoming.minutesBefore,
       timeZone = incoming.timeZone`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, minutesBefore, timeZone],
  );
}

/** Removes a device's subscription. Pass null as the user when the push service says it's gone. */
export async function deletePushSubscription(userId: string | null, endpoint: string): Promise<void> {
  await db().execute('DELETE FROM pushSubscriptions WHERE endpoint = ? AND (? IS NULL OR userId = ?)', [
    endpoint,
    userId,
    userId,
  ]);
}

export async function getPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  const [rows] = await db().execute<RowDataPacket[]>(
    'SELECT id, userId, endpoint, p256dh, auth, minutesBefore, timeZone FROM pushSubscriptions',
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    minutesBefore: row.minutesBefore,
    timeZone: row.timeZone,
  }));
}

/**
 * Marks a reminder as sent to the device. Returns false if it already was, so it isn't sent again,
 * even when more than one server is running.
 */
export async function claimReminder(subscriptionId: number, reminderKey: string, date: string): Promise<boolean> {
  const [result] = await db().execute<ResultSetHeader>(
    'INSERT IGNORE INTO pushRemindersSent (subscriptionId, reminderKey, sentOn) VALUES (?, ?, ?)',
    [subscriptionId, reminderKey, date],
  );
  return result.affectedRows > 0;
}

/** Forgets reminders for days before `beforeDate`, which can't come up again. */
export async function forgetOldReminders(beforeDate: string): Promise<void> {
  await db().execute('DELETE FROM pushRemindersSent WHERE sentOn < ?', [beforeDate]);
}
