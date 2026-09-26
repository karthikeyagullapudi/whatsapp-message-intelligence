import { CRACKED_WALL, PIPE_LEAK } from './images.js';

// ~25 realistic messages for VITE_MOCK=1, covering every category and status,
// images, a failed row, duplicates and unsupported types.

export const GROUP = { id: '120363041882910044@g.us', name: 'Site Ops · Tower B' };

export const GROUPS = [
  { id: GROUP.id, name: GROUP.name, participants: 24 },
  { id: '120363022718840011@g.us', name: 'Procurement', participants: 9 },
  { id: '120363019937720022@g.us', name: 'Safety committee', participants: 14 },
  { id: '120363055510030033@g.us', name: 'Tower A · Finishing', participants: 31 },
  { id: '120363060041140044@g.us', name: 'Management', participants: 6 },
  { id: '120363071152250055@g.us', name: 'Family', participants: null },
];

const PEOPLE = {
  anil: ['919845012345@c.us', 'Anil Kumar'],
  priya: ['919900112233@c.us', 'Priya S'],
  suresh: ['919812398765@c.us', 'Suresh (Supervisor)'],
  store: ['919700088776@c.us', 'Store · Ravi'],
  kiran: ['919866554433@c.us', 'Kiran'],
  venkat: ['919848022338@c.us', 'Venkat'],
  me: ['919059500000@c.us', 'Site Office'],
};

let seq = 0;
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const oid = () => (0x6ab700000000 + ++seq).toString(16).padStart(24, '0');
const noEntities = () => ({ location: null, people: [], dates: [], resources: [] });

function ai(category, confidence, extra = {}) {
  const priority = extra.priority ?? (category === 'Incident' ? 'high' : category === 'Irrelevant' ? 'low' : 'medium');
  const reviewReasons = [];
  if (confidence < 0.75) reviewReasons.push('low_confidence');
  if (category === 'Incident' || category === 'Change Request') reviewReasons.push('high_impact_category');
  if (priority === 'high') reviewReasons.push('high_priority');
  if (extra.imageNoCaption) reviewReasons.push('image_without_caption');
  return {
    category,
    confidence,
    priority,
    actionRequired: extra.actionRequired ?? (category !== 'Irrelevant' && category !== 'Routine Update'),
    summary: extra.summary,
    entities: { ...noEntities(), ...extra.entities },
    reasoning: extra.reasoning ?? '',
    model: 'gemini-3.5-flash-lite',
    provider: 'gemini',
    promptVersion: 'v1',
    latencyMs: extra.latencyMs ?? 1800 + ((seq * 137) % 1500),
    repaired: false,
    warnings: [],
    validationErrors: extra.validationErrors ?? [],
    reviewReasons: extra.reviewReasons ?? reviewReasons,
    processedAt: new Date().toISOString(),
  };
}

function msg(who, minutes, body, { status, ai: result = null, review = null, type = 'text', media, processing = {}, ...rest } = {}) {
  const [senderId, senderName] = PEOPLE[who];
  const _id = oid();
  return {
    _id,
    waMessageId: `${GROUP.id}_3A${_id.slice(-10).toUpperCase()}`,
    groupId: GROUP.id,
    groupName: GROUP.name,
    senderId,
    senderName,
    fromMe: who === 'me',
    timestamp: minutesAgo(minutes),
    type,
    waType: type === 'text' ? 'chat' : type === 'image' ? 'image' : rest.waType,
    body,
    media,
    source: 'live',
    contentHash: null,
    duplicateOf: null,
    processing: { status, skipReason: null, attempts: status === 'pending' ? 0 : 1, lastError: null, nextRunAt: minutesAgo(minutes), ...processing },
    ai: result,
    review,
    createdAt: minutesAgo(minutes),
    updatedAt: minutesAgo(minutes),
    ...rest,
  };
}

export function buildFixtures() {
  seq = 0;
  const list = [
    // ---- needs review ----
    msg('anil', 3, 'Pump 3 at Block B is leaking since 9 AM, water spreading in the basement. @Ravi please check asap', {
      status: 'needs_review',
      ai: ai('Incident', 0.96, {
        summary: 'Pump 3 at Block B leaking since 9 AM, basement flooding; Ravi asked to check.',
        entities: { location: 'Block B basement', people: ['Ravi'], dates: ['2026-09-25T09:00'], resources: [{ name: 'Pump 3', quantity: null, unit: null }] },
        reasoning: 'Reports an active equipment failure causing flooding.',
      }),
    }),
    msg('suresh', 11, '', {
      status: 'needs_review',
      type: 'image',
      media: { path: 'mock-crack.svg', mimetype: 'image/svg+xml', size: 48211, sha256: 'mock', mockUrl: CRACKED_WALL },
      ai: ai('Incident', 0.58, {
        priority: 'medium',
        imageNoCaption: true,
        summary: 'Photo shows a diagonal crack running down a plastered wall.',
        reasoning: 'Image shows structural damage, but there is no caption saying where or how serious.',
      }),
    }),
    msg('priya', 26, "Can we move tomorrow's slab pour to Monday? Rain forecast is heavy.", {
      status: 'needs_review',
      ai: ai('Change Request', 0.93, {
        summary: 'Asks to move the slab pour from tomorrow to Monday because of heavy rain.',
        entities: { dates: ['2026-09-26', '2026-09-28'] },
        reasoning: 'Requests changing the schedule of planned work.',
      }),
    }),
    msg('venkat', 44, 'Rebar inka raaledu, site lo work aagipoindi. Supplier ki call cheyyandi', {
      status: 'needs_review',
      ai: ai('Incident', 0.84, {
        summary: 'Rebar not delivered and work at site has stopped; asks someone to call the supplier.',
        entities: { location: 'site', resources: [{ name: 'rebar', quantity: null, unit: null }] },
        reasoning: 'Telugu/English: missing material has stopped work, so Incident rather than Resource Update.',
      }),
    }),
    msg('kiran', 67, 'Same issue as yesterday on 4th floor', {
      status: 'needs_review',
      ai: ai('Incident', 0.41, {
        priority: 'medium',
        summary: 'Reports that yesterday’s issue on the 4th floor has happened again.',
        entities: { location: '4th floor' },
        reasoning: 'Refers to an earlier problem without saying what it is; little context.',
      }),
    }),
    msg('store', 95, 'Cement 40 bags came. Sand only 10 bags left, order today', {
      status: 'needs_review',
      ai: ai('Resource Update', 0.71, {
        summary: '40 bags of cement delivered; sand down to 10 bags and needs ordering today.',
        entities: { location: 'store', resources: [{ name: 'cement', quantity: 40, unit: 'bags' }, { name: 'sand', quantity: 10, unit: 'bags' }] },
        reasoning: 'Delivery and low stock; urgency of the sand order makes it borderline.',
      }),
    }),
    msg('anil', 130, 'Client wants lobby tiles changed from grey to beige marble. Update the BOQ please.', {
      status: 'needs_review',
      ai: ai('Change Request', 0.95, {
        summary: 'Client wants lobby tiles changed from grey to beige marble; BOQ to be updated.',
        entities: { location: 'lobby', resources: [{ name: 'tiles', quantity: null, unit: null }] },
        reasoning: 'Asks to change the design/scope.',
      }),
    }),

    // ---- auto approved ----
    msg('suresh', 18, 'Morning update: 2nd floor shuttering done. 18 labour present today.', {
      status: 'auto_approved',
      ai: ai('Routine Update', 0.97, { summary: '2nd floor shuttering completed; 18 labourers on site.', entities: { location: '2nd floor' } }),
    }),
    msg('kiran', 35, 'Who has the store room keys on Sunday?', {
      status: 'auto_approved',
      ai: ai('Question', 0.96, { priority: 'low', summary: 'Asks who holds the store room keys on Sunday.', entities: { location: 'store room', dates: ['2026-09-27'] } }),
    }),
    msg('store', 52, 'Received 2 tonnes TMT steel from Vizag supplier', {
      status: 'auto_approved',
      ai: ai('Resource Update', 0.96, { priority: 'low', actionRequired: false, summary: 'Received 2 tonnes of TMT steel from the Vizag supplier.', entities: { resources: [{ name: 'TMT steel', quantity: 2, unit: 'tonnes' }] } }),
    }),
    msg('venkat', 80, 'Good morning all', {
      status: 'auto_approved',
      ai: ai('Irrelevant', 0.99, { summary: 'Greeting.' }),
    }),
    msg('priya', 150, 'Waterproofing on terrace completed as planned, photos in drive', {
      status: 'auto_approved',
      ai: ai('Routine Update', 0.95, { summary: 'Terrace waterproofing completed as planned.', entities: { location: 'terrace' } }),
    }),
    msg('anil', 190, 'Is the vendor payment for tiles cleared?', {
      status: 'auto_approved',
      ai: ai('Question', 0.94, { priority: 'low', summary: 'Asks whether the tile vendor payment has been cleared.' }),
    }),
    msg('me', 230, 'Site inspection by client on Friday 11 AM. Keep the lobby area clean.', {
      status: 'auto_approved',
      type: 'image',
      media: { path: 'mock-pipe.svg', mimetype: 'image/svg+xml', size: 51022, sha256: 'mock2', mockUrl: PIPE_LEAK },
      ai: ai('Routine Update', 0.88, { summary: 'Client site inspection on Friday at 11 AM; lobby to be cleaned.', entities: { location: 'lobby', dates: ['2026-09-26T11:00'] } }),
    }),

    // ---- approved (reviewed) ----
    msg('suresh', 260, 'Generator died again. Great.', {
      status: 'approved',
      ai: ai('Irrelevant', 0.62, { summary: 'Sarcastic comment.' }),
      review: {
        category: 'Incident', summary: 'Generator has failed again.', priority: 'high', actionRequired: true,
        entities: { ...noEntities(), resources: [{ name: 'generator', quantity: null, unit: null }] },
        notes: 'Sarcasm, but a real failure', reviewedBy: 'Karthikeya', reviewedAt: minutesAgo(250), changedFields: ['category', 'summary', 'priority', 'actionRequired', 'entities'],
      },
    }),
    msg('kiran', 300, 'Can we swap Ramesh and Kiran shifts this week?', {
      status: 'approved',
      ai: ai('Change Request', 0.95, { summary: 'Asks to swap Ramesh and Kiran’s shifts this week.', entities: { people: ['Ramesh', 'Kiran'] } }),
      review: {
        category: 'Change Request', summary: 'Asks to swap Ramesh and Kiran’s shifts this week.', priority: 'medium', actionRequired: true,
        entities: { ...noEntities(), people: ['Ramesh', 'Kiran'] }, notes: '', reviewedBy: 'Karthikeya', reviewedAt: minutesAgo(290), changedFields: [],
      },
    }),
    msg('priya', 340, 'Lift in Tower A stuck between 3rd and 4th floor, 2 people inside. Technician called.', {
      status: 'approved',
      ai: ai('Incident', 0.99, { summary: 'Lift stuck in Tower A with 2 people inside; technician called.', entities: { location: 'Tower A' } }),
      review: {
        category: 'Incident', summary: 'Lift stuck in Tower A with 2 people inside; technician called.', priority: 'high', actionRequired: true,
        entities: { ...noEntities(), location: 'Tower A' }, notes: 'Resolved 14:10', reviewedBy: 'Priya', reviewedAt: minutesAgo(330), changedFields: [],
      },
    }),

    // ---- pending / processing ----
    msg('anil', 1, 'JCB will be at site from tomorrow for 3 days', { status: 'processing', processing: { lockedAt: minutesAgo(0) } }),
    msg('store', 2, 'Paint delivery: 40 L primer, 60 L emulsion', { status: 'pending' }),
    msg('venkat', 5, 'Meeting tomorrow at site office or head office?', { status: 'pending', processing: { attempts: 1, lastError: 'AI request timed out after 30000ms' } }),

    // ---- failed ----
    msg('suresh', 400, 'Scaffolding at east side needs re-checking before the pour', {
      status: 'failed',
      processing: { attempts: 3, lastError: 'AI API error 503: The model is overloaded. Please try again later.' },
    }),
    msg('kiran', 470, 'Crane operator absent 2 days, lifting on hold', {
      status: 'failed',
      processing: { attempts: 1, lastError: 'AI API error 400: Request contains an invalid argument.' },
    }),

    // ---- skipped ----
    msg('venkat', 45, 'Rebar inka raaledu, site lo work aagipoindi. Supplier ki call cheyyandi', {
      status: 'skipped',
      processing: { skipReason: 'duplicate' },
    }),
    msg('me', 120, '', { status: 'skipped', type: 'unsupported', waType: 'video', processing: { skipReason: 'unsupported_type' } }),
    msg('anil', 205, '', { status: 'skipped', type: 'unsupported', waType: 'ptt', processing: { skipReason: 'unsupported_type' } }),
  ];
  // duplicate points at the earlier original
  const original = list.find((m) => m.body.startsWith('Rebar') && m.processing.status === 'needs_review');
  list.find((m) => m.processing.skipReason === 'duplicate').duplicateOf = original._id;
  return list;
}

// New messages that arrive while the mock is running.
export const INCOMING = [
  ['priya', 'Tower crane inspection certificate expires on 30 Sep, need renewal', 'Resource Update', 0.72],
  ['anil', 'Water tanker didn’t come, curing stopped since morning', 'Incident', 0.95],
  ['suresh', 'Plastering 5th floor east wing finished today', 'Routine Update', 0.97],
  ['kiran', 'Rebar spacing for staircase slab 150 or 200?', 'Question', 0.93],
  ['venkat', 'Happy birthday Suresh anna', 'Irrelevant', 0.99],
  ['store', 'Please postpone Saturday pour to Wednesday, pump not available', 'Change Request', 0.91],
];

export { msg, ai };
