const { GoogleGenAI } = require('@google/genai');

const DEFAULT_MODEL = 'gemini-3.7-flash';
const REQUEST_TIMEOUT_MS = 45000;

function providerError(error) {
    const status = error?.status || error?.response?.status;
    const message = String(error?.message || '').toLowerCase();
    const statusText = String(status || '').toLowerCase();

    if (status === 429 || statusText.includes('resource_exhausted') || message.includes('resource_exhausted') || message.includes('quota')) {
        return { status: 429, message: 'Gemini free-tier limit reached. Please try again later.' };
    }
    if (status === 401 || status === 403 || message.includes('api key') || message.includes('authentication')) {
        return { status: 502, message: 'Gemini authentication failed. Check the server API key.' };
    }
    if (error?.name === 'AbortError' || message.includes('timeout')) {
        return { status: 504, message: 'Gemini took too long to respond. Please try again.' };
    }
    return { status: 502, message: 'Gemini is temporarily unavailable. Please try again.' };
}

function buildPrompt({ action, language, code, selectedCode, question, cursor }) {
    const task = {
        chat: 'Answer the user as a focused coding assistant. Explain reasoning clearly and keep recommendations practical.',
        explain: 'Explain the supplied code concisely and structurally. Cover behavior, important logic, functions/classes, data flow, algorithm, complexity, and limitations when relevant.',
        debug: 'Find bugs and potential issues. Distinguish confirmed issues from potential issues. For each issue include a location only when it can be inferred, why it matters, and a suggested fix. Never invent line numbers.',
        review: 'Perform a pragmatic software-engineering code review covering correctness, readability, maintainability, performance, security, best practices, and recommendations. Do not manufacture issues.',
    }[action];

    return [
        'You are a professional AI coding assistant inside a real-time collaborative editor.',
        task,
        'Respond in Markdown with useful headings and code fences where appropriate. Never claim to have executed the code. Never modify or rewrite the shared editor automatically.',
        `Programming language: ${language}`,
        cursor ? `Cursor position at request time: line ${cursor.line + 1}, column ${cursor.ch + 1}` : 'Cursor position: unavailable',
        `Current code snapshot:\n${code}`,
        selectedCode ? `Selected code (additional context):\n${selectedCode}` : 'Selected code: none',
        question ? `User request:\n${question}` : 'User request: perform the requested analysis.',
    ].join('\n\n');
}

async function analyze(request) {
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const startedAt = Date.now();
    console.info('[AI] request started', { action: request.action, model });

    if (!process.env.GEMINI_API_KEY) {
        const error = new Error('AI service is not configured. Add the Gemini API key to the server environment.');
        error.publicStatus = 503;
        error.publicMessage = error.message;
        console.error('[AI] request failed', {
            action: request.action,
            model,
            durationMs: Date.now() - startedAt,
            status: error.publicStatus,
        });
        throw error;
    }

    const prompt = buildPrompt(request);

    try {
        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
                timeout: REQUEST_TIMEOUT_MS,
                retryOptions: { attempts: 1 },
            },
        });
        const response = await ai.interactions.create({
            model,
            input: prompt,
            generation_config: { max_output_tokens: 2048 },
        });
        const text = response?.output_text;
        if (!text || typeof text !== 'string') {
            const error = new Error('Gemini returned an empty response.');
            error.publicStatus = 502;
            error.publicMessage = 'Gemini returned an empty response. Please try again.';
            throw error;
        }
        console.info('[AI] request completed', {
            action: request.action,
            model,
            durationMs: Date.now() - startedAt,
        });
        return text;
    } catch (error) {
        if (error.publicMessage) {
            console.error('[AI] request failed', {
                action: request.action,
                model,
                durationMs: Date.now() - startedAt,
                status: error.publicStatus || 502,
            });
            throw error;
        }
        const mapped = providerError(error);
        console.error('[AI] request failed', {
            action: request.action,
            model,
            durationMs: Date.now() - startedAt,
            status: mapped.status,
        });
        const safeError = new Error(mapped.message);
        safeError.publicStatus = mapped.status;
        safeError.publicMessage = mapped.message;
        throw safeError;
    }
}

module.exports = { analyze, DEFAULT_MODEL };
