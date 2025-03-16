const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate and verify JWT tokens.
 * Extracts lifeId and attaches it to the request object.
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token required' });
    }

    const token = authHeader.split(' ')[1]; // Extract token after 'Bearer'

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.lifeId = decoded.lifeId; // Attach lifeId from token payload
        next(); // Proceed to the next middleware/handler
    } catch (err) {
        console.error('Token verification failed:', err.message);
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

module.exports = authenticateToken;