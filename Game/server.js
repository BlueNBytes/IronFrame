import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS_PER_ROOM = 8;
const SUITS = new Set(['RX68', 'ALYSNES', 'NOVAX', 'FrostFrame', 'BlackBirdFrame']);
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
};

const rooms = new Map();
const httpServer = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
        return;
    }

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch (error) {
        response.writeHead(400).end('Invalid URL');
        return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = path.resolve(ROOT, relativePath);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
    }

    try {
        const content = await readFile(filePath);
        response.writeHead(200, {
            'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Content-Length': content.length,
            'X-Content-Type-Options': 'nosniff'
        });
        response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') {
            response.writeHead(404).end('Not found');
            return;
        }
        console.error('Failed to serve game file:', error);
        response.writeHead(500).end('Internal server error');
    }
});

const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 4096
});

httpServer.on('upgrade', (request, socket, head) => {
    let pathname;
    try {
        pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
        socket.destroy();
        return;
    }

    if (pathname !== '/multiplayer') {
        socket.destroy();
        return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request);
    });
});

function send(webSocket, message) {
    if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify(message));
    }
}

function sendError(webSocket, message) {
    send(webSocket, { type: 'error', message });
    webSocket.close(1008, message.slice(0, 100));
}

function createRoomCode() {
    let code;
    do {
        code = randomBytes(3).toString('hex').toUpperCase();
    } while (rooms.has(code));
    return code;
}

function getSpawnPosition(playerIndex) {
    if (playerIndex === 0) return { x: 0, y: 0, z: 0 };
    const angle = (playerIndex - 1) * (Math.PI * 2 / (MAX_PLAYERS_PER_ROOM - 1));
    return {
        x: Math.round(Math.cos(angle) * 3 * 100) / 100,
        y: 0,
        z: Math.round(Math.sin(angle) * 3 * 100) / 100
    };
}

function broadcast(room, message, except) {
    const serialized = JSON.stringify(message);
    for (const client of room.players.values()) {
        if (client !== except && client.readyState === WebSocket.OPEN) {
            client.send(serialized);
        }
    }
}

function leaveRoom(webSocket) {
    const room = webSocket.room;
    if (!room) return;

    room.players.delete(webSocket.player.id);
    broadcast(room, { type: 'player-left', id: webSocket.player.id });
    if (room.players.size === 0) rooms.delete(room.code);
    webSocket.room = null;
    webSocket.player = null;
}

function joinRoom(webSocket, message) {
    if (webSocket.room) {
        sendError(webSocket, 'You are already in a room.');
        return;
    }
    const name = typeof message.name === 'string' ? message.name.trim().slice(0, 20) : '';
    const suit = SUITS.has(message.suit) ? message.suit : 'RX68';
    const create = message.create === true;
    if (!name) {
        sendError(webSocket, 'Enter a callsign before joining.');
        return;
    }

    let code;
    let room;
    if (create) {
        code = createRoomCode();
        room = { code, players: new Map() };
        rooms.set(code, room);
    } else {
        code = typeof message.room === 'string' ? message.room.toUpperCase() : '';
        if (!/^[A-Z0-9]{4,8}$/.test(code)) {
            sendError(webSocket, 'Room codes must be 4-8 letters or numbers.');
            return;
        }
        room = rooms.get(code);
        if (!room) {
            sendError(webSocket, 'That room does not exist. Ask the host to create a room first.');
            return;
        }
    }

    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
        sendError(webSocket, 'That room is full (maximum 8 pilots).');
        return;
    }

    const player = {
        id: randomUUID(),
        name,
        suit,
        state: {
            position: getSpawnPosition(room.players.size),
            yaw: 0
        }
    };
    webSocket.room = room;
    webSocket.player = player;
    room.players.set(player.id, webSocket);

    send(webSocket, {
        type: 'room-joined',
        id: player.id,
        room: room.code,
        spawn: player.state.position,
        players: Array.from(room.players.values())
            .filter((client) => client !== webSocket)
            .map((client) => client.player)
    });
    broadcast(room, { type: 'player-joined', player }, webSocket);
}

function updatePlayerState(webSocket, message) {
    if (!webSocket.room || !webSocket.player || !message.state || typeof message.state !== 'object') return;

    const position = message.state.position;
    const yaw = message.state.yaw;
    if (!position || !['x', 'y', 'z'].every((axis) => (
        Number.isFinite(position[axis]) && Math.abs(position[axis]) <= 10000
    )) || !Number.isFinite(yaw) || Math.abs(yaw) > 10000) {
        sendError(webSocket, 'Invalid player state received.');
        return;
    }

    webSocket.player.state = {
        position: { x: position.x, y: position.y, z: position.z },
        yaw
    };
    if (SUITS.has(message.state.suit)) webSocket.player.suit = message.state.suit;
    broadcast(webSocket.room, {
        type: 'state',
        id: webSocket.player.id,
        state: webSocket.player.state,
        suit: webSocket.player.suit
    }, webSocket);
}

webSocketServer.on('connection', (webSocket) => {
    webSocket.on('message', (rawMessage) => {
        let message;
        try {
            message = JSON.parse(rawMessage.toString());
        } catch (error) {
            sendError(webSocket, 'Invalid message format.');
            return;
        }
        if (!message || typeof message !== 'object') {
            sendError(webSocket, 'Invalid message format.');
            return;
        }

        if (message.type === 'join') {
            joinRoom(webSocket, message);
        } else if (message.type === 'state') {
            updatePlayerState(webSocket, message);
        }
    });

    webSocket.on('close', () => leaveRoom(webSocket));
    webSocket.on('error', (error) => console.error('WebSocket client error:', error.message));
});

const heartbeat = setInterval(() => {
    for (const client of webSocketServer.clients) {
        if (client.isAlive === false) {
            client.terminate();
            continue;
        }
        client.isAlive = false;
        client.ping();
    }
}, 30000);

webSocketServer.on('connection', (client) => {
    client.isAlive = true;
    client.on('pong', () => {
        client.isAlive = true;
    });
});

webSocketServer.on('close', () => clearInterval(heartbeat));

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Mecha game server running on http://localhost:${PORT}`);
});
