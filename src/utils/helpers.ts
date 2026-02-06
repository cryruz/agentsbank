import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
  return uuidv4();
}

export function generateAgentUsername(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

export function hashPassword(password: string): Promise<string> {
  // Will be implemented with bcrypt in auth service
  return Promise.resolve(password);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  // Will be implemented with bcrypt in auth service
  return Promise.resolve(password === hash);
}
