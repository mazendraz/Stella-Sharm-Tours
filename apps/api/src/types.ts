import type { IncomingMessage } from 'node:http';
export type Principal = {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'manager' | 'editor' | 'sales';
  sessionId: string;
  reauthAt: Date | null;
};
export type ApiEnv = {
  Bindings: { incoming?: IncomingMessage; remoteAddress?: string };
  Variables: { principal: Principal; revisionIds: string[] };
};
