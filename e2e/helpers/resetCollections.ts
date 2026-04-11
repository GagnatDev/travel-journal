import mongoose from 'mongoose';

const MONGODB_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-e2e';

export async function resetCollections(...names: string[]): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGODB_URI);
  }

  await Promise.all(
    names.map((name) =>
      mongoose.connection.collection(name).deleteMany({}),
    ),
  );
}
