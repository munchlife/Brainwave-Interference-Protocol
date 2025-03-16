const LifeAccount = require('../dataModels/lifeAccount.js');

/**
 * Middleware to check if the token's lifeId matches the requested lifeId.
 */
const verifyLifeId = async (req, res, next) => {
    const { lifeId } = req.params;

    try {
        const life = await LifeAccount.findByPk(lifeId);
        if (!life || life.id !== req.lifeId) {
            return res.status(403).json({ error: 'Forbidden: Token does not match Life record' });
        }
        req.life = life; // Attach the life record to the request
        next();
    } catch (err) {
        console.error('Error verifying Life record:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

module.exports = verifyLifeId;