import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { mongoConnectionConfig } from '../src/server/mongo-config.ts';

test('driver receives literal special characters in a separate password', async () => {
  const password = 'test@password:#/?% with spaces';
  const config = mongoConnectionConfig({ MONGODB_URI: 'mongodb://localhost:27017/habitheroaj', MONGODB_USERNAME: 'habitheroaj_app', MONGODB_PASSWORD: password });
  const client = new mongoose.mongo.MongoClient(config.uri, config.options);
  assert.equal(client.options.credentials?.username, 'habitheroaj_app');
  assert.equal(client.options.credentials?.password, password);
  assert.equal(client.options.credentials?.source, 'admin');
  assert.equal(client.options.dbName, 'habitheroaj');
  await client.close();
});

test('existing URI credentials remain supported and outer whitespace is removed', async () => {
  const config = mongoConnectionConfig({ MONGODB_URI: '  mongodb://example:fake%40password@localhost:27017/app?authSource=admin\n' });
  const client = new mongoose.mongo.MongoClient(config.uri, config.options);
  assert.equal(client.options.credentials?.password, 'fake@password');
  assert.equal(client.options.dbName, 'app');
  await client.close();
});

test('incomplete separate credentials fail without exposing the provided password', () => {
  assert.throws(() => mongoConnectionConfig({ MONGODB_URI: 'mongodb://localhost/app', MONGODB_USERNAME: 'example' }), /Set both MONGODB_USERNAME and MONGODB_PASSWORD/);
  try {
    mongoConnectionConfig({ MONGODB_URI: 'mongodb://localhost/app', MONGODB_PASSWORD: 'private-test-password' });
    assert.fail('Expected configuration rejection');
  } catch (error) { assert.ok(!(error as Error).message.includes('private-test-password')); }
});
