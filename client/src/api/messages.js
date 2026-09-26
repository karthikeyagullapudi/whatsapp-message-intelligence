import { http, isMock } from './http.js';

const qs = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();

export const messagesApi = {
  list: (params = {}) => http(`/messages?${qs(params)}`),
  stats: (params = {}) => http(`/messages/stats?${qs(params)}`),
  get: (id) => http(`/messages/${id}`),
  review: (id, body, options) => http(`/messages/${id}/review`, { method: 'PATCH', body, ...options }),
  retry: (id) => http(`/messages/${id}/retry`, { method: 'POST' }),
  // Mock fixtures carry their image inline; the real server streams it.
  mediaUrl: (message) => (isMock ? message.media?.mockUrl : `/api/messages/${message._id}/media`),
};
