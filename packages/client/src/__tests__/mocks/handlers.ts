import { adminHandlers } from './adminHandlers.js';
import { authHandlers } from './authHandlers.js';
import { entryHandlers } from './entryHandlers.js';
import { mockAdminUser, mockUser } from './fixtures.js';
import { inviteHandlers } from './inviteHandlers.js';
import { mediaHandlers } from './mediaHandlers.js';
import { notificationHandlers } from './notificationHandlers.js';
import { tripHandlers } from './tripHandlers.js';
import { userHandlers } from './userHandlers.js';

export { mockAdminUser, mockUser };

export const handlers = [
  ...authHandlers,
  ...tripHandlers,
  ...inviteHandlers,
  ...adminHandlers,
  ...entryHandlers,
  ...mediaHandlers,
  ...notificationHandlers,
  ...userHandlers,
];
