// Controllers only translate HTTP ⇄ service calls. No business logic here.
// Express 5 forwards rejected promises to the error handler automatically,
// so there is no try/catch or asyncHandler wrapper.
export function createWhatsAppController(service) {
  return {
    status(_req, res) {
      res.json(service.getStatus());
    },

    async groups(_req, res) {
      res.json({ groups: await service.listGroups() });
    },

    async selectGroup(req, res) {
      const group = await service.selectGroup(req.valid.body.groupId);
      res.json({ selectedGroup: group });
    },

    async logout(_req, res) {
      res.json(await service.logout());
    },
  };
}
