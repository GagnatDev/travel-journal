import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';

import { User } from '../models/User.model.js';
import { Trip } from '../models/Trip.model.js';
import { hashPassword } from '../services/auth.service.js';
import {
  createTrip,
  getTripById,
  listTripsForUser,
  updateTrip,
  updateTripStatus,
  assertTripCreator,
  isValidStatusTransition,
  deleteTrip,
} from '../services/trip.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-trip-service';

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function makeUser(email: string, appRole: 'admin' | 'creator' | 'follower' = 'creator') {
  return User.create({
    email,
    passwordHash: await hashPassword('password'),
    displayName: email.split('@')[0],
    appRole,
  });
}

describe('isValidStatusTransition', () => {
  it('allows planned → active', () => {
    expect(isValidStatusTransition('planned', 'active')).toBe(true);
  });

  it('allows active → completed', () => {
    expect(isValidStatusTransition('active', 'completed')).toBe(true);
  });

  it('allows completed → active (re-open)', () => {
    expect(isValidStatusTransition('completed', 'active')).toBe(true);
  });

  it('rejects planned → completed', () => {
    expect(isValidStatusTransition('planned', 'completed')).toBe(false);
  });

  it('rejects completed → planned', () => {
    expect(isValidStatusTransition('completed', 'planned')).toBe(false);
  });

  it('rejects active → planned', () => {
    expect(isValidStatusTransition('active', 'planned')).toBe(false);
  });
});

describe('createTrip', () => {
  it('inserts creator into members with tripRole creator and createdBy matches', async () => {
    const user = await makeUser('creator@test.com');
    const userId = String(user._id);

    const trip = await createTrip({ name: 'Test Trip' }, userId);

    expect(trip.createdBy).toBe(userId);
    expect(trip.members).toHaveLength(1);
    expect(trip.members[0]!.userId).toBe(userId);
    expect(trip.members[0]!.tripRole).toBe('creator');
    expect(trip.status).toBe('planned');
  });

  it('stores trimmed description and omits when blank', async () => {
    const user = await makeUser('creator@test.com');
    const userId = String(user._id);

    const withDesc = await createTrip({ name: 'T', description: '  Alps  ' }, userId);
    expect(withDesc.description).toBe('Alps');

    const noDesc = await createTrip({ name: 'T2', description: '   ' }, userId);
    expect(noDesc.description).toBeUndefined();
  });
});

describe('updateTrip', () => {
  it('updates and clears description', async () => {
    const user = await makeUser('creator@test.com');
    const userId = String(user._id);
    const trip = await createTrip({ name: 'T', description: 'Original' }, userId);

    const updated = await updateTrip(trip.id, { description: '  Next  ' }, userId);
    expect(updated.description).toBe('Next');

    const cleared = await updateTrip(trip.id, { description: '  ' }, userId);
    expect(cleared.description).toBeUndefined();

    const raw = await Trip.findById(trip.id).lean();
    expect(raw?.description).toBeUndefined();
  });
});

describe('listTripsForUser', () => {
  it('returns only trips where the user appears in members', async () => {
    const user1 = await makeUser('user1@test.com');
    const user2 = await makeUser('user2@test.com');

    await createTrip({ name: 'User1 Trip' }, String(user1._id));
    await createTrip({ name: 'User2 Trip' }, String(user2._id));

    const trips = await listTripsForUser(String(user1._id));
    expect(trips).toHaveLength(1);
    expect(trips[0]!.name).toBe('User1 Trip');
  });
});

describe('updateTripStatus', () => {
  it('rejects invalid status transition with 400', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await createTrip({ name: 'Trip' }, String(user._id));

    await expect(
      updateTripStatus(trip.id, 'completed', String(user._id)),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_TRANSITION' });
  });

  it('updates to a valid next status', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await createTrip({ name: 'Trip' }, String(user._id));

    const updated = await updateTripStatus(trip.id, 'active', String(user._id));
    expect(updated.status).toBe('active');
  });
});

describe('assertTripCreator', () => {
  it('throws 403 when called with a non-creator userId', async () => {
    const creator = await makeUser('creator@test.com');
    const other = await makeUser('other@test.com', 'follower');
    const trip = await createTrip({ name: 'Trip' }, String(creator._id));

    expect(() => assertTripCreator(trip, String(other._id))).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('does not throw for the creator', async () => {
    const creator = await makeUser('creator@test.com');
    const trip = await createTrip({ name: 'Trip' }, String(creator._id));

    expect(() => assertTripCreator(trip, String(creator._id))).not.toThrow();
  });
});

describe('deleteTrip', () => {
  it('throws 409 for a planned trip when requester is not admin', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await createTrip({ name: 'Trip' }, String(user._id));

    await expect(deleteTrip(trip.id, String(user._id), 'creator')).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
  });

  it('throws 409 for an active trip when requester is not admin', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await createTrip({ name: 'Trip' }, String(user._id));
    const active = await updateTripStatus(trip.id, 'active', String(user._id));

    await expect(deleteTrip(active.id, String(user._id), 'creator')).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
  });

  it('allows deletion of a completed trip by the creator', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await createTrip({ name: 'Trip' }, String(user._id));
    await updateTripStatus(trip.id, 'active', String(user._id));
    await updateTripStatus(trip.id, 'completed', String(user._id));

    await expect(deleteTrip(trip.id, String(user._id), 'creator')).resolves.toBeUndefined();

    const found = await getTripById(trip.id);
    expect(found).toBeNull();
  });

  it('allows admin to delete any trip regardless of status', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const trip = await createTrip({ name: 'Trip' }, String(admin._id));

    await expect(deleteTrip(trip.id, String(admin._id), 'admin')).resolves.toBeUndefined();
  });

  it('allows admin to delete an active trip', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const trip = await createTrip({ name: 'Trip' }, String(admin._id));
    const active = await updateTripStatus(trip.id, 'active', String(admin._id));

    await expect(deleteTrip(active.id, String(admin._id), 'admin')).resolves.toBeUndefined();

    const found = await getTripById(active.id);
    expect(found).toBeNull();
  });
});
