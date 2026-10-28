const express = require('express');
require('dotenv').config();
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ACTIONS = require('./src/Actions');
const aiRouter = require('./server/routes/ai');
const executeRouter = require('./server/routes/execute');
const { SUPPORTED_LANGUAGES } = require('./server/services/judge0Service');

const server = http.createServer(app);
const io = new Server(server);

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;

    if (requestOrigin === frontendOrigin) {
        res.setHeader('Access-Control-Allow-Origin', frontendOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
    }

    if (req.method === 'OPTIONS' && requestOrigin === frontendOrigin) {
        return res.sendStatus(204);
    }

    return next();
});

app.use(express.json({ limit: '1mb' }));
app.use((error, req, res, next) => {
    if (error?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
    if (error?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body is too large.' });
    }
    return next(error);
});
app.use('/api/ai', aiRouter);
app.use('/api/execute', executeRouter);
app.use(express.static('build'));
app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const userSocketMap = {};
const roomLanguageMap = new Map();
app.locals.getRoomLanguage = (roomId) => roomLanguageMap.get(roomId);
app.locals.isRoomMember = (roomId, socketId) => {
    if (typeof roomId !== 'string' || typeof socketId !== 'string') return false;
    const memberSocket = io.sockets.sockets.get(socketId);
    return Boolean(memberSocket?.rooms.has(roomId));
};
function getAllConnectedClients(roomId) {
    // Map
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
            };
        }
    );
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        if (typeof roomId !== 'string' || !roomId.trim()) return;
        if (!roomLanguageMap.has(roomId)) roomLanguageMap.set(roomId, 'cpp');
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
                language: roomLanguageMap.get(roomId),
            });
        });
    });

    socket.on(ACTIONS.LANGUAGE_CHANGE, ({ roomId, language }) => {
        if (!socket.rooms.has(roomId) || !SUPPORTED_LANGUAGES.includes(language)) return;
        roomLanguageMap.set(roomId, language);
        io.to(roomId).emit(ACTIONS.LANGUAGE_UPDATE, { language });
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
            if (roomId !== socket.id && io.sockets.adapter.rooms.get(roomId)?.size <= 1) roomLanguageMap.delete(roomId);
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
