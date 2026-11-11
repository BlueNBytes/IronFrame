import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SUIT_CONFIGS } from './Switch.js';
import { setPlayerPosition } from './player.js';

const SEND_INTERVAL_MS = 66;
const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;
const remotes = new Map();
const loader = new GLTFLoader();

let scene;
let getLocalState;
let socket;
let sendAccumulator = 0;
let roomCode = '';
let lastMessage = '';

function makeNameTag(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    context.font = 'bold 42px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 8;
    context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    context.strokeText(name, canvas.width / 2, canvas.height / 2);
    context.fillStyle = '#ffffff';
    context.fillText(name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    }));
    sprite.scale.set(3.2, 0.6, 1);
    sprite.position.y = 4.5;
    return sprite;
}

class RemotePlayer {
    constructor(player) {
        this.id = player.id;
        this.name = player.name;
        this.suit = '';
        this.root = new THREE.Group();
        this.targetPosition = new THREE.Vector3();
        this.targetYaw = 0;
        this.nameTag = makeNameTag(this.name);
        this.root.add(this.nameTag);
        scene.add(this.root);
        this.setState(player.state, player.suit);
    }

    setState(state, suit) {
        if (state && state.position) {
            const { x, y, z } = state.position;
            if ([x, y, z].every(Number.isFinite)) {
                this.targetPosition.set(x, y, z);
            }
            if (Number.isFinite(state.yaw)) this.targetYaw = state.yaw;
        }

        if (suit && suit !== this.suit && SUIT_CONFIGS[suit]) {
            this.loadSuit(suit);
        }
    }

    loadSuit(suit) {
        this.suit = suit;
        const config = SUIT_CONFIGS[suit];
        loader.load(config.model, (gltf) => {
            if (!remotes.has(this.id) || this.suit !== suit) return;

            if (this.model) this.root.remove(this.model);
            this.model = gltf.scene;
            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            const rotation = config.modelRotation || { x: 0, y: 0, z: 0 };
            this.model.rotation.set(rotation.x, Math.PI + rotation.y, rotation.z);
            const size = new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3());
            if (size.y > 5) {
                const scale = 3.8 / size.y;
                this.model.scale.setScalar(scale);
            }
            this.root.add(this.model);
        }, undefined, (error) => {
            console.error(`Could not load remote pilot suit ${suit}:`, error);
        });
    }

    update(deltaTime) {
        this.root.position.lerp(this.targetPosition, Math.min(1, deltaTime * 12));
        this.root.rotation.y = THREE.MathUtils.damp(
            this.root.rotation.y,
            this.targetYaw,
            12,
            deltaTime
        );
    }

    dispose() {
        scene.remove(this.root);
        const geometries = new Set();
        const materials = new Set();
        this.root.traverse((object) => {
            if (object.geometry) geometries.add(object.geometry);
            if (object.material) {
                for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                    materials.add(material);
                }
            }
        });
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
    }
}

function getElement(id) {
    return document.getElementById(id);
}

function setStatus(text, connected = false) {
    const status = getElement('multiplayer-status');
    if (status) {
        status.textContent = text;
        status.classList.toggle('connected', connected);
    }
}

function setMessage(text) {
    const message = getElement('multiplayer-message');
    if (message) message.textContent = text;
}

function updateRoomUI(count = remotes.size + 1) {
    const roomInfo = getElement('multiplayer-room-info');
    const roomLabel = getElement('multiplayer-room-code');
    const playerCount = getElement('multiplayer-player-count');
    const connected = socket && socket.readyState === WebSocket.OPEN;
    if (roomInfo) roomInfo.hidden = !connected;
    if (roomLabel) roomLabel.textContent = roomCode;
    if (playerCount) playerCount.textContent = `${count} / 8 pilots`;

    const active = connected || (socket && socket.readyState === WebSocket.CONNECTING);
    ['multiplayer-create', 'multiplayer-join'].forEach((id) => {
        const button = getElement(id);
        if (button) button.disabled = active;
    });
    const leave = getElement('multiplayer-leave');
    if (leave) leave.hidden = !connected;
}

function removeRemote(id) {
    const remote = remotes.get(id);
    if (!remote) return;
    remote.dispose();
    remotes.delete(id);
    updateRoomUI();
}

function addRemote(player) {
    if (!player || typeof player.id !== 'string' || player.id === localPlayerId) return;
    const existing = remotes.get(player.id);
    if (existing) {
        existing.setState(player.state, player.suit);
        return;
    }
    remotes.set(player.id, new RemotePlayer(player));
    updateRoomUI();
}

let localPlayerId = '';

function clearRemotes() {
    for (const id of remotes.keys()) removeRemote(id);
}

function handleMessage(event) {
    let message;
    try {
        message = JSON.parse(event.data);
    } catch (error) {
        console.error('Received invalid multiplayer server message:', error);
        setMessage('Received invalid data from the game server.');
        return;
    }

    switch (message.type) {
        case 'room-joined':
            localPlayerId = message.id;
            roomCode = message.room;
            if (message.spawn) setPlayerPosition(message.spawn);
            (message.players || []).forEach(addRemote);
            setStatus('Connected', true);
            setMessage('Room ready. Share the code with your friends.');
            updateRoomUI((message.players || []).length + 1);
            break;
        case 'player-joined':
            addRemote(message.player);
            setMessage(`${message.player.name} joined the room.`);
            break;
        case 'state':
            remotes.get(message.id)?.setState(message.state, message.suit);
            break;
        case 'player-left':
            removeRemote(message.id);
            break;
        case 'error':
            lastMessage = message.message || 'The game server rejected the request.';
            setMessage(lastMessage);
            break;
        default:
            console.warn('Ignoring unknown multiplayer message:', message.type);
    }
}

function connect(createRoom) {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    const nameInput = getElement('multiplayer-name');
    const roomInput = getElement('multiplayer-room');
    const name = (nameInput?.value || '').trim().slice(0, 20) || 'Pilot';
    const requestedRoom = (roomInput?.value || '').trim().toUpperCase();
    if (!createRoom && !ROOM_CODE_PATTERN.test(requestedRoom)) {
        setMessage('Enter a valid room code (4-8 letters or numbers).');
        return;
    }

    let url;
    try {
        url = new URL('/multiplayer', window.location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    } catch (error) {
        console.error('Could not construct multiplayer server URL:', error);
        setMessage('Could not configure the multiplayer connection.');
        return;
    }

    lastMessage = '';
    roomCode = '';
    setStatus('Connecting...');
    setMessage('Connecting to the game server...');
    socket = new WebSocket(url);
    updateRoomUI();

    socket.addEventListener('open', () => {
        const state = getLocalState();
        socket.send(JSON.stringify({
            type: 'join',
            create: createRoom,
            room: createRoom ? '' : requestedRoom,
            name,
            suit: state.suit
        }));
    });
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('error', (error) => {
        console.error('Multiplayer connection error:', error);
        setMessage('Unable to connect. Check that the game server is running.');
    });
    socket.addEventListener('close', () => {
        socket = null;
        localPlayerId = '';
        roomCode = '';
        clearRemotes();
        setStatus('Offline');
        setMessage(lastMessage || 'Disconnected from the game server.');
        updateRoomUI();
    });
}

function leaveRoom() {
    if (socket) {
        socket.close(1000, 'Left room');
    }
}

function initializeMultiplayer(gameScene, localStateProvider) {
    scene = gameScene;
    getLocalState = localStateProvider;

    try {
        const savedName = localStorage.getItem('multiplayerName');
        if (savedName && getElement('multiplayer-name')) {
            getElement('multiplayer-name').value = savedName;
        }
    } catch (error) {
        console.warn('Could not read multiplayer callsign:', error);
    }

    getElement('multiplayer-create')?.addEventListener('click', () => {
        try {
            localStorage.setItem('multiplayerName', getElement('multiplayer-name').value.trim());
        } catch (error) {
            console.warn('Could not save multiplayer callsign:', error);
        }
        connect(true);
    });
    getElement('multiplayer-join')?.addEventListener('click', () => {
        try {
            localStorage.setItem('multiplayerName', getElement('multiplayer-name').value.trim());
        } catch (error) {
            console.warn('Could not save multiplayer callsign:', error);
        }
        connect(false);
    });
    getElement('multiplayer-leave')?.addEventListener('click', leaveRoom);
    getElement('multiplayer-room')?.addEventListener('input', (event) => {
        event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    });

}

function updateMultiplayer(deltaTime) {
    for (const remote of remotes.values()) remote.update(deltaTime);
    if (!socket || socket.readyState !== WebSocket.OPEN || !localPlayerId) return;

    sendAccumulator += deltaTime * 1000;
    if (sendAccumulator < SEND_INTERVAL_MS) return;
    sendAccumulator = 0;

    const state = getLocalState();
    socket.send(JSON.stringify({ type: 'state', state }));
}

export { initializeMultiplayer, updateMultiplayer };
