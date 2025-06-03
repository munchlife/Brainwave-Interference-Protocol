// middleware/verifyLifeId.js
const { LifeAccount } = require('../dataModels/associations.js');

const verifyLifeId = async (req, res, next) => {
    let lifeIdToVerify;

    // Determine where to get the lifeId from based on the request method
    if (req.method === 'GET' || req.method === 'DELETE') {
        // For GET or DELETE requests, lifeId is in req.params
        lifeIdToVerify = req.params.lifeId;
        console.log('verifyLifeId: Getting lifeId from params:', lifeIdToVerify);
    } else {
        // For POST, PUT, etc., lifeId is in req.body
        lifeIdToVerify = req.body.lifeId;
        console.log('verifyLifeId: Getting lifeId from body:', lifeIdToVerify);
    }

    if (!lifeIdToVerify) {
        console.error('Missing lifeId in request (body or params) for path:', req.path);
        return res.status(400).json({ error: 'lifeId is required in request body or URL parameters.' });
    }

    try {
        const parsedLifeId = parseInt(lifeIdToVerify, 10);

        if (isNaN(parsedLifeId)) {
            console.error('Invalid lifeId format:', lifeIdToVerify);
            return res.status(400).json({ error: 'lifeId must be a valid integer.' });
        }

        // `req.lifeId` is set by `authenticateToken` middleware
        if (!req.lifeId) {
            console.error('Missing req.lifeId (from token) in verifyLifeId for path:', req.path);
            return res.status(403).json({ error: 'Invalid token: missing lifeId.' });
        }

        if (parsedLifeId !== req.lifeId) {
            console.error('Token lifeId mismatch:', {
                requestedLifeId: parsedLifeId,
                tokenLifeId: req.lifeId,
                path: req.path
            });
            return res.status(403).json({ error: 'Forbidden: Token does not match requested lifeId.' });
        }

        const life = await LifeAccount.findOne({ where: { lifeId: parsedLifeId } });
        if (!life) {
            console.error('No LifeAccount found for lifeId:', parsedLifeId);
            return res.status(404).json({ error: 'Life record not found.' });
        }

        console.log('LifeAccount verified successfully:', { lifeId: life.lifeId, email: life.email });
        req.life = life; // Attach the full life record to the request
        next();
    } catch (err) {
        console.error('Error verifying Life record:', err.message, err.stack);
        return res.status(500).json({ error: 'Server error during life ID verification.' });
    }
};

module.exports = verifyLifeId;