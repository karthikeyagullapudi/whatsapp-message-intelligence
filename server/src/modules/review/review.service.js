import { isDeepStrictEqual } from 'node:util';
import { AppError } from '../../utils/AppError.js';
import { EDITABLE_FIELDS } from './review.schema.js';

// A reviewer can approve anything the AI has finished with (including results it
// failed on, by classifying them by hand) and can re-edit already approved ones.
export const REVIEWABLE_STATUSES = ['needs_review', 'auto_approved', 'approved', 'failed'];

// Which fields did the human change compared to the AI? Stored for auditing and
// to measure AI accuracy later (e.g. "category changed in 12% of reviews").
export function diffFields(ai, input) {
  return EDITABLE_FIELDS.filter((field) => !isDeepStrictEqual(ai?.[field] ?? null, input[field] ?? null));
}

export function createReviewService({ repository, emit = () => {} }) {
  return {
    async approve(id, input) {
      const message = await repository.findById(id);
      if (!message) throw AppError.notFound('Message not found');
      if (!REVIEWABLE_STATUSES.includes(message.processing.status)) {
        throw AppError.conflict(`Message cannot be reviewed while it is '${message.processing.status}'`);
      }

      const review = {
        category: input.category,
        summary: input.summary,
        priority: input.priority,
        actionRequired: input.category === 'Irrelevant' ? false : input.actionRequired,
        entities: input.entities,
        notes: input.notes,
        reviewedBy: input.reviewedBy,
        reviewedAt: new Date(),
        changedFields: diffFields(message.ai, input),
      };

      // The `ai` block is never touched: original AI answer and human answer stay side by side.
      const updated = await repository.updateIfStatus(id, REVIEWABLE_STATUSES, {
        $set: { review, 'processing.status': 'approved' },
      });
      if (!updated) throw AppError.conflict('Message changed while you were reviewing it, reload and try again');

      emit('message:updated', updated);
      return updated;
    },
  };
}
