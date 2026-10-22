import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface User {
  id: string;
  name: string;
  email: string;
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

/** Same shape as the client's CalendarEvent. */
export interface CalendarEvent extends EventInput {
  id: number;
  /** The last day a repeating event happens. Missing means it repeats forever. */
  endDate?: string;
  /** Days a repeating event is skipped, because that day was deleted or changed on its own. */
  excludedDates?: string[];
}

const config = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'calendar',
};

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
    passwordHash VARCHAR(255) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token CHAR(64) PRIMARY KEY,
    userId CHAR(36) NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  // "repeat" is a reserved word in MySQL, so the column is repeatRule.
  `CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    startTime TIME NOT NULL,
    endTime TIME NOT NULL,
    repeatRule ENUM('none', 'daily', 'weekly', 'monthly') NOT NULL,
    endDate DATE NULL,
    excludedDates JSON NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    INDEX (userId, date)
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
}

export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function addUser(name: string, email: string, password: string): Promise<User | null> {
  const user: User = { id: randomUUID(), name, email: normalizeEmail(email) };
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
    'SELECT id, name, email, passwordHash FROM users WHERE email = ?',
    [normalizeEmail(email)],
  );
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
    return null;
  }
  return { id: row.id, name: row.name, email: row.email };
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await db().execute('INSERT INTO sessions (token, userId) VALUES (?, ?)', [token, userId]);
  return token;
}

export async function getUserByToken(token: string): Promise<User | null> {
  const [rows] = await db().execute<RowDataPacket[]>(
    'SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.userId WHERE sessions.token = ?',
    [token],
  );
  const row = rows[0];
  return row ? { id: row.id, name: row.name, email: row.email } : null;
}

export async function deleteSession(token: string): Promise<void> {
  await db().execute('DELETE FROM sessions WHERE token = ?', [token]);
}

const eventColumns = 'id, title, date, startTime, endTime, repeatRule, endDate, excludedDates';

function toEvent(row: RowDataPacket): CalendarEvent {
  const event: CalendarEvent = {
    id: row.id,
    title: row.title,
    date: row.date,
    // TIME columns come back as "HH:mm:ss".
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    repeat: row.repeatRule,
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
    `INSERT INTO events (userId, title, date, startTime, endTime, repeatRule, endDate, excludedDates)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      input.title,
      input.date,
      input.startTime,
      input.endTime,
      input.repeat,
      endDate,
      JSON.stringify(excludedDates),
    ],
  );
  return result.insertId;
}

/** Every event of the user's that happens on the given day ("YYYY-MM-DD"), including repeats. */
export async function getEventsForDay(userId: string, date: string): Promise<CalendarEvent[]> {
  const [rows] = await db().execute<RowDataPacket[]>(
    `SELECT ${eventColumns} FROM events
     WHERE userId = ?
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
  return { id, ...input };
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
      `SELECT ${eventColumns} FROM events WHERE id = ? AND userId = ? FOR UPDATE`,
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
      await connection.execute('UPDATE events SET excludedDates = ? WHERE id = ?', [
        JSON.stringify([...excludedDates, occurrenceDate]),
        event.id,
      ]);
      await insertEvent(connection, userId, { ...input, repeat: 'none' });
    } else if (occurrenceDate === event.date) {
      // Changing from the very first day changes the whole series.
      await connection.execute(
        'UPDATE events SET title = ?, date = ?, startTime = ?, endTime = ?, repeatRule = ? WHERE id = ?',
        [input.title, input.date, input.startTime, input.endTime, input.repeat, event.id],
      );
    } else {
      await connection.execute('UPDATE events SET endDate = ?, excludedDates = ? WHERE id = ?', [
        addDays(occurrenceDate, -1),
        JSON.stringify(excludedDates.filter((date) => date < occurrenceDate)),
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
      await connection.execute('UPDATE events SET excludedDates = ? WHERE id = ?', [
        JSON.stringify([...(event.excludedDates ?? []), occurrenceDate]),
        event.id,
      ]);
    } else if (occurrenceDate === event.date) {
      // Deleting from the very first day deletes the whole series.
      await connection.execute('DELETE FROM events WHERE id = ?', [event.id]);
    } else {
      await connection.execute('UPDATE events SET endDate = ? WHERE id = ?', [
        addDays(occurrenceDate, -1),
        event.id,
      ]);
    }
  });
}
