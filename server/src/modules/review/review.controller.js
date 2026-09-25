export function createReviewController(service) {
  return {
    async approve(req, res) {
      res.json(await service.approve(req.valid.params.id, req.valid.body));
    },
  };
}
