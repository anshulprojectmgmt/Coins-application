import type { ConnectOptions } from 'mongoose';

interface MongoEnvironment {
  MONGODB_URI?: string;
  MONGODB_USERNAME?: string;
  MONGODB_PASSWORD?: string;
  MONGODB_AUTH_SOURCE?: string;
}

// Credentials passed as driver options are literal strings, so special characters
// in a password never need to be manually percent-encoded into a URI.
export function mongoConnectionConfig(environment: MongoEnvironment) {
  const uri = environment.MONGODB_URI?.trim();
  if (!uri) throw new Error('Set MONGODB_URI to a MongoDB replica set (MongoDB Atlas is supported).');
  const options: ConnectOptions = { serverSelectionTimeoutMS: 10000 };
  if (environment.MONGODB_USERNAME || environment.MONGODB_PASSWORD) {
    if (!environment.MONGODB_USERNAME || !environment.MONGODB_PASSWORD) {
      throw new Error('Set both MONGODB_USERNAME and MONGODB_PASSWORD. Enter the password literally, without URL encoding.');
    }
    options.auth = { username: environment.MONGODB_USERNAME, password: environment.MONGODB_PASSWORD };
    // Atlas database users authenticate in admin even when their role is scoped
    // to just the application's database.
    options.authSource = environment.MONGODB_AUTH_SOURCE || 'admin';
  }
  return { uri, options };
}
