import { http } from './http.js';

export const whatsappApi = {
  status: () => http('/whatsapp/status'),
  groups: () => http('/whatsapp/groups'),
  selectGroup: (groupId) => http('/whatsapp/group', { method: 'PUT', body: { groupId } }),
  logout: () => http('/whatsapp/logout', { method: 'POST' }),
};
