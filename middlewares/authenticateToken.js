// File: middlewares/authenticateToken.js

const jwt = require('jsonwebtoken');
const { LifeAccount } = require('../dataModels/associations.js');

const authenticateToken = async (req, res, next) => {
    try {

        const authHeader = req.headers.authorization;
        console.log('authenticateToken called:', {
            path: req.path,
            hasAuthHeader: !!authHeader
        });

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error('No valid auth header found:', { authHeader });
            return res.status(401).json({ error: 'Authorization token required' });
        }

        const token = authHeader.split(' ')[1];

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            console.log('Token decoded successfully:', {
                lifeId: decoded.lifeId,
                email: decoded.email,
                lifeIdType: typeof decoded.lifeId
            });
        } catch (err) {
            console.error('Token verification failed:', err.message);
            return res.status(403).json({ error: 'Invalid token' });
        }

        // Set email and lifeId from token
        req.email = decoded.email || null;
        req.lifeId = decoded.lifeId || null;

        console.log('After setting from token:', {
            reqEmail: req.email,
            reqLifeId: req.lifeId,
            reqLifeIdType: typeof req.lifeId
        });

        // If lifeId is missing but email is present, retrieve it from the database
        if ((!req.lifeId || req.lifeId === undefined || req.lifeId === null) && req.email) {
            console.log('lifeId missing, attempting to resolve from email:', req.email);
            try {
                const life = await LifeAccount.findOne({ where: { email: req.email } });
                if (!life) {
                    console.error('No LifeAccount found for email in middleware:', req.email);
                    return res.status(403).json({ error: 'Invalid token: no user found' });
                }
                req.lifeId = life.lifeId;
                console.log('Middleware: resolved lifeId from email:', {
                    email: req.email,
                    lifeId: req.lifeId,
                    lifeIdType: typeof req.lifeId
                });
            } catch (dbErr) {
                console.error('Database error in middleware:', dbErr.message);
                return res.status(500).json({ error: 'Database error during authentication' });
            }
        }

        // Final validation before proceeding
        if (!req.lifeId || req.lifeId === undefined || req.lifeId === null) {
            console.error('Final middleware check - lifeId still undefined:', {
                reqLifeId: req.lifeId,
                reqEmail: req.email,
                decodedLifeId: decoded.lifeId
            });
            return res.status(403).json({ error: 'Unable to authenticate user' });
        }

        console.log('Middleware complete - proceeding with:', {
            lifeId: req.lifeId,
            email: req.email
        });

        next();
    } catch (error) {
        console.error('Authentication error:', error.message, error.stack);
        return res.status(500).json({ error: 'Authentication failed' });
    }
};

module.exports = authenticateToken;