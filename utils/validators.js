const Joi = require('joi');

const cohortSchema = Joi.object({
    topic: Joi.string().required(),
    phaseLockingValue: Joi.number().min(0).max(1).required(),
    groupBandpower: Joi.number().min(0).optional(),
});

module.exports = { cohortSchema };