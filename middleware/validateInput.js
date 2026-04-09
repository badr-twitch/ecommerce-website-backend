const { param, query, body, validationResult } = require('express-validator');

/**
 * Middleware that checks express-validator results and returns 400 on failure.
 * Place after validation chains in the middleware array.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Données invalides',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

/** Validate :id param as UUID */
const validateId = [
  param('id')
    .isUUID()
    .withMessage('Identifiant invalide'),
  handleValidationErrors
];

/** Validate a named param as UUID (e.g. :productId, :userId) */
const validateParamId = (name) => [
  param(name)
    .isUUID()
    .withMessage(`Identifiant ${name} invalide`),
  handleValidationErrors
];

/** Validate pagination query params */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Page doit être entre 1 et 10000')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limite doit être entre 1 et 100')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0, max: 100000 })
    .withMessage('Offset invalide')
    .toInt(),
  handleValidationErrors
];

/** Validate date range query params (ISO8601) */
const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Date de début invalide (format ISO8601 requis)'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Date de fin invalide (format ISO8601 requis)'),
  handleValidationErrors
];

/** Validate and sanitize search query param */
const validateSearch = [
  query('search')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La recherche ne doit pas dépasser 200 caractères')
    .customSanitizer(value => escapeLikeWildcards(value)),
  handleValidationErrors
];

/**
 * Escape LIKE wildcard characters (%, _) to prevent
 * users from crafting queries that match everything.
 */
function escapeLikeWildcards(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[%_\\]/g, '\\$&');
}

/** Validate sort query param against a whitelist */
const validateSort = (allowed) => [
  query('sort')
    .optional()
    .isIn(allowed)
    .withMessage(`Tri invalide. Valeurs autorisées: ${allowed.join(', ')}`),
  handleValidationErrors
];

/** Validate numeric amount query params */
const validateAmountRange = [
  query('minAmount')
    .optional()
    .isFloat({ min: 0, max: 999999 })
    .withMessage('Montant minimum invalide')
    .toFloat(),
  query('maxAmount')
    .optional()
    .isFloat({ min: 0, max: 999999 })
    .withMessage('Montant maximum invalide')
    .toFloat(),
  handleValidationErrors
];

/** Validate status query param against a whitelist */
const validateStatus = (allowed) => [
  query('status')
    .optional()
    .isIn(allowed)
    .withMessage(`Statut invalide. Valeurs autorisées: ${allowed.join(', ')}`),
  handleValidationErrors
];

/** Validate rating query param */
const validateRating = [
  query('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Note doit être entre 1 et 5')
    .toInt(),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateId,
  validateParamId,
  validatePagination,
  validateDateRange,
  validateSearch,
  validateSort,
  validateAmountRange,
  validateStatus,
  validateRating,
  escapeLikeWildcards
};
