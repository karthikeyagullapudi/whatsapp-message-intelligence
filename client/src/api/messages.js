import { http } from './http.js';

const qs = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();

export const messagesApi = {
  list: (params = {}) => http(`/messages?${qs(params)}`),
  stats: () => http('/messages/stats'),
  get: (id) => http(`/messages/${id}`),
  review: (id, body) => http(`/messages/${id}/review`, { method: 'PATCH', body }),
  retry: (id) => http(`/messages/${id}/retry`, { method: 'POST' }),
  mediaUrl: (id) => `/api/messages/${id}/media`,
};
