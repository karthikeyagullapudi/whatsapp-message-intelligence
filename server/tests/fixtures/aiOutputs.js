export const validIncident = {
  category: 'Incident',
  confidence: 0.92,
  summary: 'Pump 3 at Block B is leaking.',
  priority: 'high',
  actionRequired: true,
  entities: { location: 'Block B', people: ['@Ravi'], dates: ['2026-09-25T09:00'], resources: [] },
  reasoning: 'Equipment failure.',
};

export const validRoutine = {
  category: 'Routine Update',
  confidence: 0.95,
  summary: 'Slab shuttering completed.',
  priority: 'low',
  actionRequired: false,
  entities: { location: null, people: [], dates: [], resources: [] },
  reasoning: 'Progress report.',
};
