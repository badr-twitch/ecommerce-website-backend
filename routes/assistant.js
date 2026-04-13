const express = require('express');
const { body, validationResult } = require('express-validator');
const { publicLimiter } = require('../middleware/rateLimiter');
const assistantService = require('../services/assistantService');
const logger = require('../services/logger');

const router = express.Router();

// POST /api/assistant/chat
// Public (no auth) so guests can use the shopping assistant, but heavily rate-limited.
// Body: { messages: [{ role: 'user'|'assistant', content: string }, ...] }
router.post(
  '/chat',
  publicLimiter,
  [
    body('messages').isArray({ min: 1, max: 30 }).withMessage('Format de conversation invalide'),
    body('messages.*.role').isIn(['user', 'assistant']).withMessage('Rôle de message invalide'),
    body('messages.*.content').isString().isLength({ min: 1, max: 2000 }).withMessage('Message vide ou trop long'),
    body('context').optional().isObject().withMessage('Contexte invalide'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Requête invalide', details: errors.array() });
    }

    try {
      const { messages, context } = req.body;
      const { reply, configured, error } = await assistantService.chat({ messages, context });
      return res.json({
        success: true,
        data: {
          reply,
          configured: !!configured,
          degraded: !!error,
        },
      });
    } catch (err) {
      logger.error('Assistant chat failed', { error: err.message });
      return res.status(500).json({
        success: false,
        error: "L'assistant est momentanément indisponible. Réessayez plus tard ou contactez-nous via /contact.",
      });
    }
  }
);

// GET /api/assistant/health — lightweight status for ops / frontend gating.
// Returns { configured, topics[] } — topics is the set of knowledge-guide
// sections actually filled in, used by the widget to choose which suggestion
// chips to offer (so users never see a chip the guide can't answer).
router.get('/health', publicLimiter, (req, res) => {
  const state = assistantService.getAssistantState();
  res.json({
    success: true,
    data: state,
  });
});

module.exports = router;
