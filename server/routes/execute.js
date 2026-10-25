const express = require('express');
const { execute, SUPPORTED_LANGUAGES, getConfig } = require('../services/judge0Service');

const router = express.Router();
const requestWindowMs = 60 * 1000;
const maxRequestsPerWindow = Number(process.env.EXECUTION_RATE_LIMIT) || 10;
const requests = new Map();

function rateLimit(req, res, next) {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const current = requests.get(key);
    if (!current || now - current.startedAt >= requestWindowMs) {
        requests.set(key, { startedAt: now, count: 1 });
        return next();
    }
    if (current.count >= maxRequestsPerWindow) {
        return res.status(429).json({ error: 'Too many execution requests. Please try again later.' });
    }
    current.count += 1;
    return next();
}

router.post('/', rateLimit, async (req, res) => {
    const { roomId, socketId, language, sourceCode, stdin = '' } = req.body || {};
    if (!req.app.locals.isRoomMember?.(roomId, socketId)) {
        return res.status(403).json({ error: 'You are not a member of this room.' });
    }
    const roomLanguage = req.app.locals.getRoomLanguage?.(roomId);
    if (!roomLanguage) return res.status(403).json({ error: 'Room is not active.' });
    if (language !== roomLanguage || !SUPPORTED_LANGUAGES.includes(roomLanguage)) {
        return res.status(409).json({ error: 'The room language changed. Refresh and try again.' });
    }
    const config = getConfig();
    if (typeof sourceCode !== 'string' || sourceCode.length > config.limits.sourceCode) {
        return res.status(400).json({ error: 'Source code is required and is too large.' });
    }
    if (typeof stdin !== 'string' || stdin.length > config.limits.stdin) {
        return res.status(400).json({ error: 'Standard input must be text within the allowed size.' });
    }
    try {
        const result = await execute({ language, sourceCode, stdin });
        return res.json(result);
    } catch (error) {
        const status = [400, 429, 502, 503, 504].includes(error.status) ? error.status : 502;
        return res.status(status).json({ error: error.message || 'Code execution failed.' });
    }
});

module.exports = router;
