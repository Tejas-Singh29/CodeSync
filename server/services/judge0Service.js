const SUPPORTED_LANGUAGES = Object.freeze([
    'c',
    'cpp',
    'python',
    'java',
    'javascript',
]);

const LANGUAGE_ENV_KEYS = {
    c: 'JUDGE0_LANGUAGE_ID_C',
    cpp: 'JUDGE0_LANGUAGE_ID_CPP',
    python: 'JUDGE0_LANGUAGE_ID_PYTHON',
    java: 'JUDGE0_LANGUAGE_ID_JAVA',
    javascript: 'JUDGE0_LANGUAGE_ID_JAVASCRIPT',
};

const DEFAULT_LIMITS = Object.freeze({
    sourceCode: 256 * 1024,
    stdin: 64 * 1024,
    pollIntervalMs: 750,
    pollTimeoutMs: 30 * 1000,
    requestTimeoutMs: 10 * 1000,
});

// Verified against https://ce.judge0.com/languages/ on 2026-10-25.
// Environment variables override these values for another compatible host.
const PUBLIC_CE_DEFAULTS = Object.freeze({
    apiUrl: 'https://ce.judge0.com',
    submissionsPath: '/submissions/?base64_encoded=false&wait=false',
    submissionPath: '/submissions/{token}?base64_encoded=false',
    languageIds: { c: '103', cpp: '105', python: '92', java: '91', javascript: '97' },
});

function getConfig() {
    const apiUrl = process.env.JUDGE0_API_URL?.trim() || PUBLIC_CE_DEFAULTS.apiUrl;
    const isPublicCe = apiUrl.replace(/\/$/, '') === PUBLIC_CE_DEFAULTS.apiUrl;
    const submissionsPath = process.env.JUDGE0_SUBMISSIONS_PATH?.trim() || (isPublicCe ? PUBLIC_CE_DEFAULTS.submissionsPath : undefined);
    const submissionPath = process.env.JUDGE0_SUBMISSION_PATH?.trim() || (isPublicCe ? PUBLIC_CE_DEFAULTS.submissionPath : undefined);
    const languageIds = Object.fromEntries(
        Object.entries(LANGUAGE_ENV_KEYS).map(([language, envKey]) => [
            language,
            process.env[envKey]?.trim() || (isPublicCe ? PUBLIC_CE_DEFAULTS.languageIds[language] : undefined),
        ])
    );

    return {
        apiUrl: apiUrl?.replace(/\/$/, ''),
        submissionsPath,
        submissionPath,
        languageIds,
        apiKey: process.env.JUDGE0_API_KEY?.trim(),
        authHeader: process.env.JUDGE0_AUTH_HEADER?.trim() || 'X-Auth-Token',
        authScheme: process.env.JUDGE0_AUTH_SCHEME?.trim() || '',
        base64Encoded: process.env.JUDGE0_BASE64_ENCODED === 'true',
        limits: {
            sourceCode: Number(process.env.JUDGE0_SOURCE_LIMIT_BYTES) || DEFAULT_LIMITS.sourceCode,
            stdin: Number(process.env.JUDGE0_STDIN_LIMIT_BYTES) || DEFAULT_LIMITS.stdin,
            pollIntervalMs: Number(process.env.JUDGE0_POLL_INTERVAL_MS) || DEFAULT_LIMITS.pollIntervalMs,
            pollTimeoutMs: Number(process.env.JUDGE0_POLL_TIMEOUT_MS) || DEFAULT_LIMITS.pollTimeoutMs,
            requestTimeoutMs: Number(process.env.JUDGE0_REQUEST_TIMEOUT_MS) || DEFAULT_LIMITS.requestTimeoutMs,
        },
    };
}

function configurationError(config) {
    const missing = [];
    SUPPORTED_LANGUAGES.forEach((language) => {
        if (!config.languageIds[language] || !/^\d+$/.test(config.languageIds[language])) {
            missing.push(LANGUAGE_ENV_KEYS[language]);
        }
    });
    if (config.apiKey && !config.authHeader) missing.push('JUDGE0_AUTH_HEADER');
    return missing;
}

function getHeaders(config) {
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey && config.authHeader) {
        headers[config.authHeader] = config.authScheme
            ? `${config.authScheme} ${config.apiKey}`
            : config.apiKey;
    }
    return headers;
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function readProviderResponse(response) {
    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        body = {};
    }
    return { response, body };
}

function decode(value, enabled) {
    if (typeof value !== 'string') return value || '';
    if (!enabled) return value;
    try {
        return Buffer.from(value, 'base64').toString('utf8');
    } catch {
        return value;
    }
}

function resultFrom(body, config) {
    return {
        status: body.status?.description || 'Completed',
        statusId: body.status?.id,
        stdout: decode(body.stdout, config.base64Encoded),
        stderr: decode(body.stderr, config.base64Encoded),
        compileOutput: decode(body.compile_output, config.base64Encoded),
        message: decode(body.message, config.base64Encoded),
        time: body.time,
        memory: body.memory,
    };
}

function providerError(message, status = 502, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function responseError(response, action) {
    if (response.status === 401 || response.status === 403) {
        return providerError(
            'Judge0 authentication failed. Check the server authentication settings.',
            503,
            'JUDGE0_AUTHENTICATION'
        );
    }
    if (response.status === 400) return providerError(`Judge0 rejected the ${action}.`, 400, 'JUDGE0_INVALID_REQUEST');
    if (response.status === 429) return providerError('Judge0 rate limit reached. Please try again later.', 429, 'JUDGE0_RATE_LIMIT');
    return providerError('Judge0 is unavailable.', 502, 'JUDGE0_UNAVAILABLE');
}

async function execute({ language, sourceCode, stdin }) {
    const config = getConfig();
    const missing = configurationError(config);
    if (missing.length) {
        throw providerError(`Judge0 is not configured. Set: ${missing.join(', ')}.`, 503);
    }
    const languageId = config.languageIds[language];
    const payload = {
        source_code: config.base64Encoded ? Buffer.from(sourceCode).toString('base64') : sourceCode,
        stdin: config.base64Encoded ? Buffer.from(stdin).toString('base64') : stdin,
        language_id: Number(languageId),
        cpu_time_limit: 5,
        memory_limit: 128000,
    };
    const headers = getHeaders(config);
    const create = await fetchWithTimeout(
        `${config.apiUrl}${config.submissionsPath}`,
        { method: 'POST', headers, body: JSON.stringify(payload) },
        config.limits.requestTimeoutMs
    ).catch((error) => {
        throw providerError(error.name === 'AbortError' ? 'Judge0 request timed out.' : 'Judge0 is unavailable.', 502);
    });
    const created = await readProviderResponse(create);
    if (!create.ok) throw responseError(create, 'submission');
    const token = created.body.token;
    if (!token || typeof token !== 'string') throw providerError('Judge0 returned an invalid submission response.');

    const deadline = Date.now() + config.limits.pollTimeoutMs;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, config.limits.pollIntervalMs));
        const poll = await fetchWithTimeout(
            `${config.apiUrl}${config.submissionPath.replace(/\{token\}/g, encodeURIComponent(token))}`,
            { method: 'GET', headers },
            config.limits.requestTimeoutMs
        ).catch((error) => {
            throw providerError(error.name === 'AbortError' ? 'Judge0 polling timed out.' : 'Judge0 is unavailable.', 502);
        });
        const result = await readProviderResponse(poll);
        if (!poll.ok) throw responseError(poll, 'result request');
        const statusId = result.body.status?.id;
        if (statusId && statusId > 2) return resultFrom(result.body, config);
    }
    throw providerError('Judge0 execution timed out while waiting for a result.', 504);
}

module.exports = {
    DEFAULT_LIMITS,
    SUPPORTED_LANGUAGES,
    execute,
    getConfig,
    responseError,
};
