import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';

export interface User {
  id: string;
  name: string;
  email: string;
}

interface StoredUser extends User {
  passwordHash: string;
}

// In-memory storage. Everything is lost when the server restarts.
const usersByEmail = new Map<string, StoredUser>();
const sessions = new Map<string, string>(); // token -> user id

function toPublicUser({ id, name, email }: StoredUser): User {
  return { id, name, email };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function addUser(name: string, email: string, password: string): Promise<User | null> {
  const key = normalizeEmail(email);
  if (usersByEmail.has(key)) {
    return null;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user: StoredUser = { id: randomUUID(), name, email: key, passwordHash };
  usersByEmail.set(key, user);
  return toPublicUser(user);
}

export async function verifyUser(email: string, password: string): Promise<User | null> {
  const user = usersByEmail.get(normalizeEmail(email));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return null;
  }
  return toPublicUser(user);
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, userId);
  return token;
}

export function getUserByToken(token: string): User | null {
  const userId = sessions.get(token);
  if (!userId) {
    return null;
  }
  for (const user of usersByEmail.values()) {
    if (user.id === userId) {
      return toPublicUser(user);
    }
  }
  return null;
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}
