const express = require('express');
const { analyze } = require('../services/aiService');

const router = express.Router();
const MAX_CODE_CHARS = 40000;
const MAX_QUESTION_CHARS = 3000;
const MAX_LANGUAGE_CHARS = 80;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestLog = new Map();
const actions = new Set(['chat', 'explain', 'debug', 'review']);

function cleanString(value, max) {
    return typeof value === 'string' && value.length <= max ? value : null;
}

function rateLimit(ip) {
    const now = Date.now();
    const recent = (requestLog.get(ip) || []).filter((time) => now - time < WINDOW_MS);
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
        requestLog.set(ip, recent);
        return false;
    }
    recent.push(now);
    requestLog.set(ip, recent);
    return true;
}

router.post('/:action', async (req, res) => {
    const { action } = req.params;
    if (!actions.has(action)) {
        return res.status(404).json({ error: 'Unsupported AI operation.' });
    }
    if (!rateLimit(req.ip || 'unknown')) {
        return res.status(429).json({ error: 'Too many AI requests. Please wait a few minutes.' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const code = cleanString(body.code, MAX_CODE_CHARS);
    const selectedCode = body.selectedCode === undefined ? '' : cleanString(body.selectedCode, MAX_CODE_CHARS);
    const language = body.language === undefined ? 'JavaScript' : cleanString(body.language, MAX_LANGUAGE_CHARS);
    const question = body.question === undefined ? '' : cleanString(body.question, MAX_QUESTION_CHARS);
    const cursor = body.cursor && Number.isInteger(body.cursor.line) && Number.isInteger(body.cursor.ch)
        ? { line: body.cursor.line, ch: body.cursor.ch }
        : null;

    if (code === null || !code.trim()) {
        return res.status(400).json({ error: code === null ? 'Code is too large or invalid.' : 'Add some code before using AI.' });
    }
    if (selectedCode === null || language === null || question === null) {
        return res.status(400).json({ error: 'One or more AI inputs are invalid or too large.' });
    }
    if (action === 'chat' && !question.trim()) {
        return res.status(400).json({ error: 'Ask a question before sending it to AI.' });
    }

    try {
        const response = await analyze({ action, code, selectedCode, language, question, cursor });
        return res.json({ response });
    } catch (error) {
        console.error('AI request failed:', error.publicMessage || 'provider error');
        return res.status(error.publicStatus || 502).json({ error: error.publicMessage || 'AI request failed. Please try again.' });
    }
});

module.exports = router;
