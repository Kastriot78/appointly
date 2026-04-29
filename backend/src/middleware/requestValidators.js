function isBlank(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

function requireJsonBody(req, res, next) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ message: "Request body must be a JSON object." });
  }
  return next();
}

function requireFields(fields) {
  return function validateRequiredFields(req, res, next) {
    for (const field of fields) {
      if (isBlank(req.body?.[field])) {
        return res.status(400).json({ message: `${field} is required.` });
      }
    }
    return next();
  };
}

function requireAtLeastOneField(fields, label = "One required field is missing.") {
  return function validateAtLeastOneField(req, res, next) {
    const hasAny = fields.some((field) => !isBlank(req.body?.[field]));
    if (!hasAny) {
      return res.status(400).json({ message: label });
    }
    return next();
  };
}

function requireEnumField(field, allowedValues) {
  return function validateEnumField(req, res, next) {
    const value = req.body?.[field];
    if (isBlank(value)) return next();
    if (!allowedValues.includes(value)) {
      return res.status(400).json({
        message: `${field} must be one of: ${allowedValues.join(", ")}`,
      });
    }
    return next();
  };
}

module.exports = {
  requireJsonBody,
  requireFields,
  requireAtLeastOneField,
  requireEnumField,
};
