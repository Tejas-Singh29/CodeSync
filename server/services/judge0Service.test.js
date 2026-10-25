const test = require('node:test');
const assert = require('node:assert/strict');
const { execute } = require('./judge0Service');

const originalFetch = global.fetch;
const originalPollInterval = process.env.JUDGE0_POLL_INTERVAL_MS;
const originalPollTimeout = process.env.JUDGE0_POLL_TIMEOUT_MS;

function response(status, body) {
    return new Response(JSON.stringify(body), { status });
}

test.afterEach(() => {
    global.fetch = originalFetch;
    if (originalPollInterval === undefined) delete process.env.JUDGE0_POLL_INTERVAL_MS;
    else process.env.JUDGE0_POLL_INTERVAL_MS = originalPollInterval;
    if (originalPollTimeout === undefined) delete process.env.JUDGE0_POLL_TIMEOUT_MS;
    else process.env.JUDGE0_POLL_TIMEOUT_MS = originalPollTimeout;
});

test('preserves output fields from a completed submission', async () => {
    process.env.JUDGE0_POLL_INTERVAL_MS = '1';
    global.fetch = async (url, options) => options.method === 'POST'
        ? response(201, { token: 'test-token' })
        : response(200, {
            status: { id: 6, description: 'Compilation Error' },
            stdout: 'stdout', stderr: 'stderr', compile_output: 'compiler output', message: 'message',
        });
    const result = await execute({ language: 'cpp', sourceCode: 'invalid', stdin: '' });
    assert.equal(result.status, 'Compilation Error');
    assert.equal(result.stdout, 'stdout');
    assert.equal(result.stderr, 'stderr');
    assert.equal(result.compileOutput, 'compiler output');
    assert.equal(result.message, 'message');
});

for (const [status, expectedStatus, expectedCode] of [[401, 503, 'JUDGE0_AUTHENTICATION'], [429, 429, 'JUDGE0_RATE_LIMIT'], [400, 400, 'JUDGE0_INVALID_REQUEST'], [500, 502, 'JUDGE0_UNAVAILABLE']]) {
    test(`classifies provider HTTP ${status}`, async () => {
        global.fetch = async () => response(status, { error: 'provider detail must not leak' });
        await assert.rejects(
            execute({ language: 'python', sourceCode: 'print(1)', stdin: '' }),
            (error) => error.status === expectedStatus && error.code === expectedCode && !error.message.includes('provider detail')
        );
    });
}

test('classifies network failures as provider outages', async () => {
    global.fetch = async () => { throw new Error('network detail'); };
    await assert.rejects(
        execute({ language: 'javascript', sourceCode: 'console.log(1)', stdin: '' }),
        (error) => error.status === 502 && error.message === 'Judge0 is unavailable.'
    );
});
