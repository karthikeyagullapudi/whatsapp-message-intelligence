import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Message } from '../../src/modules/messages/message.model.js';
import { messageRepository } from '../../src/modules/messages/message.repository.js';
import { createMediaStorage } from '../../src/modules/messages/media.storage.js';
import { createMessageListener } from '../../src/modules/whatsapp/whatsapp.listener.js';
import { GROUP_ID, OTHER_GROUP_ID, PNG_BASE64, fakeMessage } from '../fixtures/waMessages.js';

const silentLogger = { info() {}, warn() {}, error() {} };
const group = { id: GROUP_ID, name: 'Site Ops' };
let mongo;
let mediaDir;
let listener;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Message.syncIndexes(); // make sure the unique index exists before racing inserts
  mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-media-'));
  listener = createMessageListener({
    repository: messageRepository,
    mediaStorage: createMediaStorage({ dir: mediaDir }),
    logger: silentLogger,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  await fs.rm(mediaDir, { recursive: true, force: true });
});

beforeEach(() => Message.deleteMany({}));

describe('message dedupe', () => {
  it('saves the same waMessageId only once, even when delivered concurrently', async () => {
    const msg = fakeMessage();
    const results = await Promise.all([
      listener.handle(msg, { group }),
      listener.handle(msg, { group }),
      listener.handle(msg, { group }),
    ]);

    expect(await Message.countDocuments()).toBe(1);
    expect(results.filter((r) => r === 'inserted')).toHaveLength(1);
    expect(await listener.handle(msg, { group, source: 'backfill' })).toBe('duplicate');
  });

  it('marks the same text from the same sender within 10 minutes as a soft duplicate', async () => {
    const first = fakeMessage({ body: 'Need 40 bags of cement', timestamp: 1790000000 });
    const again = fakeMessage({ body: '  need 40 BAGS of cement', timestamp: 1790000000 + 120 });
    const later = fakeMessage({ body: 'Need 40 bags of cement', timestamp: 1790000000 + 3600 });

    expect(await listener.handle(first, { group })).toBe('inserted');
    expect(await listener.handle(again, { group })).toBe('soft_duplicate');
    expect(await listener.handle(later, { group })).toBe('inserted'); // outside the window

    const original = await Message.findOne({ waMessageId: first.id._serialized });
    const dup = await Message.findOne({ waMessageId: again.id._serialized });
    expect(dup.duplicateOf.toString()).toBe(original._id.toString());
    expect(dup.processing).toMatchObject({ status: 'skipped', skipReason: 'duplicate' });
  });

  it('ignores messages from other chats', async () => {
    expect(await listener.handle(fakeMessage({ chatId: OTHER_GROUP_ID }), { group })).toBe('ignored');
    expect(await Message.countDocuments()).toBe(0);
  });

  it('stores images on disk by content hash and keeps the message if download fails', async () => {
    const ok = fakeMessage({
      type: 'image',
      body: 'crack',
      downloadMedia: async () => ({ data: PNG_BASE64, mimetype: 'image/png' }),
    });
    const broken = fakeMessage({
      type: 'image',
      body: 'second photo',
      downloadMedia: async () => {
        throw new Error('network down');
      },
    });

    await listener.handle(ok, { group });
    await listener.handle(broken, { group });

    const saved = await Message.findOne({ waMessageId: ok.id._serialized }).lean();
    expect(saved.media).toMatchObject({ mimetype: 'image/png', size: Buffer.from(PNG_BASE64, 'base64').length });
    expect(saved.media.path).toBe(`${saved.media.sha256}.png`);
    await expect(fs.access(path.join(mediaDir, saved.media.path))).resolves.toBeUndefined();

    const failed = await Message.findOne({ waMessageId: broken.id._serialized }).lean();
    expect(failed.media.error).toBe('network down');
    expect(failed.processing.status).toBe('pending'); // caption can still be classified
  });
});
