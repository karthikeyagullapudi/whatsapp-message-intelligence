export function createMessageController(service) {
  return {
    async list(req, res) {
      res.json(await service.list(req.valid?.query ?? {}));
    },

    async stats(_req, res) {
      res.json(await service.stats());
    },

    async get(req, res) {
      res.json(await service.get(req.valid.params.id));
    },

    async media(req, res) {
      const { filePath, mimetype } = await service.getMediaFile(req.valid.params.id);
      res.type(mimetype).set('Cache-Control', 'private, max-age=86400').sendFile(filePath);
    },

    async retry(req, res) {
      res.json(await service.retry(req.valid.params.id));
    },
  };
}
