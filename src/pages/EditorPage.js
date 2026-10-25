import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import Editor from '../components/Editor';
import AIAssistant from '../components/AIAssistant';
import { initSocket } from '../socket';
import {
    useLocation,
    useNavigate,
    Navigate,
    useParams,
} from 'react-router-dom';

export function getOutputSections(output) {
    const sections = [];
    const seen = new Set();
    const add = (label, value) => {
        if (typeof value !== 'string' || !value || seen.has(value)) return;
        seen.add(value);
        sections.push({ label, value });
    };
    add('Standard output', output?.stdout);
    add('Standard error', output?.stderr);
    add('Compilation output', output?.compileOutput);
    add('Message', output?.message);
    return sections;
}

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const editorRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const [clients, setClients] = useState([]);
    const [aiOpen, setAiOpen] = useState(false);
    const [language, setLanguage] = useState(null);
    const [stdin, setStdin] = useState('');
    const [output, setOutput] = useState(null);
    const [running, setRunning] = useState(false);
    const outputSections = getOutputSections(output);

    useEffect(() => {
        const init = async () => {
            socketRef.current = await initSocket();
            socketRef.current.on('connect_error', (err) => handleErrors(err));
            socketRef.current.on('connect_failed', (err) => handleErrors(err));

            function handleErrors(e) {
                console.log('socket error', e);
                toast.error('Socket connection failed, try again later.');
                reactNavigator('/');
            }

            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
            });

            // Listening for joined event
            socketRef.current.on(
                ACTIONS.JOINED,
                ({ clients, username, socketId, language: roomLanguage }) => {
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                        console.log(`${username} joined`);
                    }
                    setClients(clients);
                    setLanguage(roomLanguage);
                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current,
                        socketId,
                    });
                }
            );

            socketRef.current.on(ACTIONS.LANGUAGE_UPDATE, ({ language: roomLanguage }) => {
                setLanguage(roomLanguage);
                toast('Room language changed. Existing code was not changed.');
            });

            // Listening for disconnected
            socketRef.current.on(
                ACTIONS.DISCONNECTED,
                ({ socketId, username }) => {
                    toast.success(`${username} left the room.`);
                    setClients((prev) => {
                        return prev.filter(
                            (client) => client.socketId !== socketId
                        );
                    });
                }
            );
        };
        init();
        return () => {
            socketRef.current.disconnect();
            socketRef.current.off(ACTIONS.JOINED);
            socketRef.current.off(ACTIONS.DISCONNECTED);
            socketRef.current.off(ACTIONS.LANGUAGE_UPDATE);
        };
    }, []);

    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID has been copied to your clipboard');
        } catch (err) {
            toast.error('Could not copy the Room ID');
            console.error(err);
        }
    }

    function leaveRoom() {
        reactNavigator('/');
    }

    function changeLanguage(event) {
        socketRef.current?.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: event.target.value });
    }

    async function runCode() {
        if (!language || running) return;
        setRunning(true); setOutput({ loading: true });
        try {
            const response = await fetch(`${process.env.REACT_APP_BACKEND_URL || ''}/api/execute`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId, socketId: socketRef.current?.id, language, sourceCode: editorRef.current?.getValue() || '', stdin }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Code execution failed.');
            setOutput(result);
        } catch (error) { setOutput({ error: error.message }); }
        finally { setRunning(false); }
    }

    if (!location.state) {
        return <Navigate to="/" />;
    }

    return (
        <div className={`mainWrap${aiOpen ? ' aiOpen' : ''}`}>
            <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <img
                            className="logoImage"
                            src="/code-sync.png"
                            alt="logo"
                        />
                    </div>
                    <h3>Connected</h3>
                    <div className="clientsList">
                        {clients.map((client) => (
                            <Client
                                key={client.socketId}
                                username={client.username}
                            />
                        ))}
                    </div>
                </div>
                <button className="btn copyBtn" onClick={copyRoomId}>
                    Copy ROOM ID
                </button>
                <button className="btn leaveBtn" onClick={leaveRoom}>
                    Leave
                </button>
                <button className="btn aiToggle" onClick={() => setAiOpen((open) => !open)}>
                    {aiOpen ? 'Hide AI' : 'Open AI Assistant'}
                </button>
            </div>
            <div className="editorWrap">
                <div className="executionControls">
                    <label>Language{' '}
                        <select value={language || ''} onChange={changeLanguage} disabled={!language}>
                            <option value="" disabled>Synchronizing…</option><option value="c">C</option><option value="cpp">C++</option>
                            <option value="python">Python 3</option><option value="java">Java</option><option value="javascript">JavaScript (Node.js)</option>
                        </select>
                    </label>
                    <button className="btn runBtn" onClick={runCode} disabled={!language || running}>{running ? 'Running…' : 'Run Code'}</button>
                    <textarea className="stdinBox" value={stdin} onChange={(event) => setStdin(event.target.value)} placeholder="Standard input (optional)" />
                    <div className="outputPanel" aria-live="polite">
                        {output?.loading && 'Submitting to Judge0…'}
                        {output?.error && <span className="executionError">{output.error}</span>}
                        {output && !output.loading && !output.error && <>
                            <strong>{output.status}</strong>
                            {outputSections.length ? outputSections.map(({ label, value }) => (
                                <section key={label} className="outputSection">
                                    <strong>{label}</strong>
                                    <pre>{value}</pre>
                                </section>
                            )) : <pre>(no output)</pre>}
                        </>}
                    </div>
                </div>
                <Editor
                    socketRef={socketRef}
                    roomId={roomId}
                    language={language}
                    onCodeChange={(code) => {
                        codeRef.current = code;
                    }}
                    onEditorReady={(editor) => {
                        editorRef.current = editor;
                    }}
                />
            </div>
            {aiOpen && (
                <AIAssistant
                    onClose={() => setAiOpen(false)}
                    getEditorSnapshot={() => ({
                        code: editorRef.current ? editorRef.current.getValue() : (codeRef.current || ''),
                        selectedCode: editorRef.current?.getSelection() || '',
                        cursor: editorRef.current?.getCursor() || null,
                        language: language || 'C++',
                    })}
                />
            )}
        </div>
    );
};

export default EditorPage;
