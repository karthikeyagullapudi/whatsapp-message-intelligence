import { describe, expect, it } from 'vitest';
import {
  computeContentHash,
  getChatId,
  isFromGroup,
  mapMessage,
  shouldIgnore,
} from '../../src/modules/whatsapp/whatsapp.mapper.js';
import { GROUP_ID, ME, OTHER_GROUP_ID, RAVI, fakeMessage } from '../fixtures/waMessages.js';

describe('whatsapp.mapper', () => {
  it('maps a text message with sender, group and timestamp', () => {
    const msg = fakeMessage({ timestamp: 1790000000 });
    const doc = mapMessage(msg, { groupName: 'Site Ops' });

    expect(doc).toMatchObject({
      waMessageId: msg.id._serialized,
      groupId: GROUP_ID,
      groupName: 'Site Ops',
      senderId: RAVI,
      senderName: 'Ravi',
      type: 'text',
      body: 'Pump 3 at Block B is leaking',
      processing: { status: 'pending' },
    });
    expect(doc.timestamp.toISOString()).toBe(new Date(1790000000 * 1000).toISOString());
  });

  it('maps an image and keeps the caption as body', () => {
    const doc = mapMessage(fakeMessage({ type: 'image', body: 'crack in wall', hasMedia: true }));
    expect(doc.type).toBe('image');
    expect(doc.body).toBe('crack in wall');
    expect(doc.processing.status).toBe('pending');
  });

  it('stores unsupported types as skipped instead of dropping them', () => {
    const doc = mapMessage(fakeMessage({ type: 'ptt', body: '' }));
    expect(doc.type).toBe('unsupported');
    expect(doc.waType).toBe('ptt');
    expect(doc.processing).toMatchObject({ status: 'skipped', skipReason: 'unsupported_type' });
  });

  it('uses `to` as the chat for my own messages and falls back to `from` as sender', () => {
    const mine = fakeMessage({ fromMe: true });
    expect(getChatId(mine)).toBe(GROUP_ID);
    expect(mapMessage(mine).senderId).toBe(ME);
  });

  it('only accepts messages from the selected group', () => {
    expect(isFromGroup(fakeMessage(), GROUP_ID)).toBe(true);
    expect(isFromGroup(fakeMessage({ chatId: OTHER_GROUP_ID }), GROUP_ID)).toBe(false);
    expect(isFromGroup(fakeMessage(), null)).toBe(false);
  });

  it('ignores group system events', () => {
    expect(shouldIgnore(fakeMessage({ type: 'gp2' }))).toBe(true);
    expect(shouldIgnore(fakeMessage({ type: 'e2e_notification' }))).toBe(true);
    expect(shouldIgnore(fakeMessage())).toBe(false);
  });

  it('content hash ignores case/whitespace but depends on the sender', () => {
    const a = computeContentHash({ senderId: RAVI, type: 'text', body: 'Pump   3 LEAKING ' });
    const b = computeContentHash({ senderId: RAVI, type: 'text', body: 'pump 3 leaking' });
    const c = computeContentHash({ senderId: ME, type: 'text', body: 'pump 3 leaking' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(computeContentHash({ senderId: RAVI, type: 'text', body: '   ' })).toBeNull();
  });
});
