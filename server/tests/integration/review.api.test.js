import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app.js';
import { Message } from '../../src/modules/messages/message.model.js';
import { messageRepository } from '../../src/modules/messages/message.repository.js';
import { createMessageService } from '../../src/modules/messages/message.service.js';
import { createReviewService } from '../../src/modules/review/review.service.js';
import { validIncident } from '../fixtures/aiOutputs.js';

let mongo;
let app;

const correction = {
  category: 'Resource Update',
  summary: 'Pump 3 needs a replacement seal.',
  priority: 'medium',
  actionRequired: true,
  entities: { location: 'Block B', people: ['Ravi'], dates: ['2026-09-25T09:00'], resources: [] },
  notes: 'Not a leak, just a spare part request',
  reviewedBy: 'Karthikeya',
};

function createMessage(overrides = {}) {
  return Message.create({
    waMessageId: `m-${Math.random()}`,
    groupId: 'g@g.us',
    senderId: 's@c.us',
    timestamp: new Date(),
    type: 'text',
    body: 'Pump 3 at Block B is leaking',
    processing: { status: 'needs_review' },
    ai: { ...validIncident, entities: { ...validIncident.entities, people: ['Ravi'] }, reviewReasons: ['high_impact_category'] },
    ...overrides,
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp({
    messageService: createMessageService({ repository: messageRepository, mediaStorage: {} }),
    reviewService: createReviewService({ repository: messageRepository }),
  });
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(() => Message.deleteMany({}));

describe('PATCH /api/messages/:id/review', () => {
  it('saves the correction, approves, records changed fields and keeps the original AI result', async () => {
    const msg = await createMessage();
    const res = await request(app).patch(`/api/messages/${msg._id}/review`).send(correction);

    expect(res.status).toBe(200);
    expect(res.body.processing.status).toBe('approved');
    expect(res.body.review).toMatchObject({ category: 'Resource Update', reviewedBy: 'Karthikeya' });
    expect(res.body.review.changedFields).toEqual(['category', 'summary', 'priority']);
    expect(res.body.ai.category).toBe('Incident'); // AI answer preserved for audit
    expect(res.body.body).toBe('Pump 3 at Block B is leaking'); // original untouched
  });

  it('rejects an invalid category with 400 and field details', async () => {
    const msg = await createMessage();
    const res = await request(app)
      .patch(`/api/messages/${msg._id}/review`)
      .send({ ...correction, category: 'Emergency' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('body.category');
  });

  it('rejects unknown fields such as trying to overwrite the ai block', async () => {
    const msg = await createMessage();
    const res = await request(app).patch(`/api/messages/${msg._id}/review`).send({ ...correction, ai: {} });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a bad id, 404 for an unknown id, 409 for a message not classified yet', async () => {
    expect((await request(app).patch('/api/messages/abc/review').send(correction)).status).toBe(400);
    const unknown = new mongoose.Types.ObjectId();
    expect((await request(app).patch(`/api/messages/${unknown}/review`).send(correction)).status).toBe(404);
    const pending = await createMessage({ processing: { status: 'pending' }, ai: null });
    expect((await request(app).patch(`/api/messages/${pending._id}/review`).send(correction)).status).toBe(409);
  });
});

describe('GET /api/messages and retry', () => {
  it('filters by the final category (review overrides AI) and by status', async () => {
    await createMessage(); // AI: Incident, not reviewed
    await createMessage({ processing: { status: 'approved' }, review: { category: 'Question' } }); // AI said Incident

    const incidents = await request(app).get('/api/messages?category=Incident');
    expect(incidents.body.total).toBe(1);
    const questions = await request(app).get('/api/messages?category=Question&status=approved');
    expect(questions.body.total).toBe(1);
    expect((await request(app).get('/api/messages?status=nope')).status).toBe(400);
  });

  it('only returns and counts messages of the requested group (e.g. after switching account)', async () => {
    await createMessage({ groupId: 'old@g.us' });
    await createMessage({ groupId: 'new@g.us', processing: { status: 'pending' }, ai: null });

    const list = await request(app).get('/api/messages?groupId=new@g.us');
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].groupId).toBe('new@g.us');

    const stats = await request(app).get('/api/messages/stats?groupId=new@g.us');
    expect(stats.body).toEqual({ pending: 1 });

    expect((await request(app).get('/api/messages?groupId=not-a-group')).status).toBe(400);
  });

  it('retry puts a failed message back in the queue with fresh attempts', async () => {
    const msg = await createMessage({ processing: { status: 'failed', attempts: 3, lastError: 'timeout' }, ai: null });
    const res = await request(app).post(`/api/messages/${msg._id}/retry`);
    expect(res.status).toBe(200);
    expect(res.body.processing).toMatchObject({ status: 'pending', attempts: 0, lastError: null });
  });
});
