import React, { useEffect, useRef, useState } from 'react';
import AIResponse from './AIResponse';

const actionLabels = {
    explain: 'Explain Code',
    debug: 'Find Bugs',
    review: 'Review Code',
};

function apiBase() {
    return (process.env.REACT_APP_BACKEND_URL || window.location.origin).replace(/\/$/, '');
}

const AIAssistant = ({ onClose, getEditorSnapshot }) => {
    const [question, setQuestion] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeAction, setActiveAction] = useState(null);
    const [error, setError] = useState('');
    const mountedRef = useRef(true);
    const requestControllerRef = useRef(null);

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
            if (requestControllerRef.current) {
                requestControllerRef.current.abort();
                requestControllerRef.current = null;
            }
        };
    }, []);

    async function run(action, submittedQuestion = question) {
        if (loading || !mountedRef.current) return;
        const snapshot = getEditorSnapshot();
        if (!snapshot.code.trim()) {
            setError('Add some code in the editor before using AI.');
            return;
        }
        if (action === 'chat' && !submittedQuestion.trim()) {
            setError('Ask a question before sending it to AI.');
            return;
        }
        setLoading(true);
        setActiveAction(action);
        setError('');
        const controller = new AbortController();
        requestControllerRef.current = controller;
        try {
            const response = await fetch(`${apiBase()}/api/ai/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    code: snapshot.code,
                    selectedCode: snapshot.selectedCode,
                    cursor: snapshot.cursor,
                    language: snapshot.language,
                    question: submittedQuestion.trim(),
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'AI request failed. Please try again.');
            if (!mountedRef.current || controller.signal.aborted) return;
            setMessages((previous) => [...previous, {
                action,
                question: submittedQuestion.trim(),
                response: payload.response,
                selected: Boolean(snapshot.selectedCode),
            }]);
            if (action === 'chat') setQuestion('');
        } catch (requestError) {
            if (requestError.name === 'AbortError' || !mountedRef.current) return;
            setError(requestError.message || 'AI request failed. Please try again.');
        } finally {
            if (requestControllerRef.current === controller) {
                requestControllerRef.current = null;
            }
            if (!mountedRef.current) return;
            setLoading(false);
            setActiveAction(null);
        }
    }

    function submit(event) {
        event.preventDefault();
        run('chat');
    }

    return (
        <aside className="aiAssistant" aria-label="AI Assistant">
            <div className="aiHeader">
                <div>
                    <h2>AI Assistant</h2>
                    <span className="aiStatus">{loading ? 'Analyzing snapshot…' : 'Ready when you are'}</span>
                </div>
                <button className="aiClose" onClick={onClose} aria-label="Close AI Assistant">×</button>
            </div>
            <div className="aiBody">
                {messages.length === 0 && !error && (
                    <div className="aiIntro">
                        Ask a question or run a focused analysis on the current editor snapshot.
                    </div>
                )}
                {messages.map((message, index) => (
                    <section className="aiMessage" key={`${message.action}-${index}`}>
                        <div className="aiMessageTitle">{message.action === 'chat' ? 'You asked' : actionLabels[message.action]}</div>
                        {message.question && <div className="aiQuestion">{message.question}</div>}
                        <div className="aiSnapshot">Based on {message.selected ? 'selected code' : 'editor'} snapshot</div>
                        <AIResponse>{message.response}</AIResponse>
                    </section>
                ))}
                {loading && <div className="aiLoading">Analyzing code…</div>}
                {error && <div className="aiError" role="alert">{error}</div>}
            </div>
            <div className="aiComposer">
                <form onSubmit={submit}>
                    <textarea
                        value={question}
                        onChange={(event) => setQuestion(event.target.value)}
                        placeholder="Ask about your code…"
                        rows="3"
                        disabled={loading}
                        aria-label="Ask AI a question"
                    />
                    <button className="btn aiSend" type="submit" disabled={loading || !question.trim()}>
                        {loading && activeAction === 'chat' ? 'Sending…' : 'Ask AI'}
                    </button>
                </form>
                <div className="aiActions">
                    {Object.entries(actionLabels).map(([action, label]) => (
                        <button key={action} className="aiAction" onClick={() => run(action)} disabled={loading}>
                            {loading && activeAction === action ? 'Analyzing…' : label}
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    );
};

export default AIAssistant;
