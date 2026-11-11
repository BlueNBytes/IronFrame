/**
 * Switch.js - Mobility Suit Selection and Stats Management
 */

// Available suit identifiers
const RX68 = 'RX68';
const ALYSNES = 'ALYSNES';
const NOVAX = 'NOVAX';
const FrostFrame = 'FrostFrame';
const BlackBirdFrame = 'BlackBirdFrame';

const SUIT_CONFIGS = {
    [RX68]: {
        id: RX68,
        name: 'RX-68 Vanguard',
        role: 'Heavy Defender',
        shields: 85,
        Mobility: 20,
        Health: 50,
        color: '#66d8d1',
        description: 'Balanced frontline combat frame with reinforced shielding and durable plating.',
        model: './assets/Player.glb',
        // modelRotation: X/Y/Z offsets applied to the loaded model (radians).
        // Y is always set to Math.PI automatically for forward-facing; adjust X to tilt, Z to roll.
        modelRotation: { x: 0, y: 5 * 135, z: 0 }
    },
    [BlackBirdFrame]: {
        id: BlackBirdFrame,
        name: 'BlackBird',
        role: 'Light Attacker',
        shields: 35,
        Mobility: 40,
        Health: 45,
        color: '#a78bfa',
        description: 'Light frontline combat frame    with reinforced shielding and durable plating.',
        model: './assets/BlackBird.glb',
        // modelRotation: X/Y/Z offsets applied to the loaded model (radians).
        // Y is always set to Math.PI automatically for forward-facing; adjust X to tilt, Z to roll.
        modelRotation: { x: 0, y: 5 * Math.PI / 180, z: 0 }
    },
    [FrostFrame]: {
        id: FrostFrame,
        name: 'FrostFrame',
        role: 'Medium Attacker',
        shields: 40,
        Mobility: 40,
        Health: 40,
        color: '#7dd3fc',
        description: 'Light frontline combat frame    with reinforced shielding and durable plating.',
        model: './assets/FrostFrame.glb',
        // modelRotation: X/Y/Z offsets applied to the loaded model (radians).
        // Y is always set to Math.PI automatically for forward-facing; adjust X to tilt, Z to roll.
        modelRotation: { x: 0, y: 5 * Math.PI / 180, z: 0 }
    },
    [ALYSNES]: {
        id: ALYSNES,
        name: 'ALYSNES Striker',
        role: 'High-Speed Scout',
        shields: 10,
        Mobility: 30,
        Health: 30,
        color: '#ffb82e',
        description: 'Lightweight agility chassis engineered for rapid flanking and evasive combat.',
        model: './assets/alysnes.glb',
        modelRotation: { x: 0, y: 0, z: 0 }
    },
    [NOVAX]: {
        id: NOVAX,
        name: 'NOVAX Overdrive',
        role: 'Assault Frame',
        shields: 95,
        Mobility: 40,
        Health: 20,
        color: '#ff6b35',
        description: 'Experimental high-output suit with overdrive boosters and maximum shield capacity.',
        model: './assets/Mech1.glb',
        modelRotation: { x: 0, y: 0, z: 0 }
    }
};

const availablesuits = [RX68, ALYSNES, NOVAX, FrostFrame, BlackBirdFrame];
const abailablesuits = availablesuits; // Backward-compatibility alias

// Persistent player suit state
let savedSuit = null;
try {
    if (typeof localStorage !== 'undefined') {
        savedSuit = localStorage.getItem('selectedSuit');
    }
} catch (e) {
    console.warn('Could not read selectedSuit from localStorage:', e);
}

let playersuit = (savedSuit && SUIT_CONFIGS[savedSuit]) ? savedSuit : RX68;

// Active stats object (Shields, Mobility, Health)
const stats = {
    shields: 85,
    Mobility: 20,
    Health: 50,
    maxShields: 85,
    maxHealth: 50
};

function applySuitStats(suitKey) {
    const config = SUIT_CONFIGS[suitKey] || SUIT_CONFIGS[RX68];
    stats.shields = config.shields;
    stats.Mobility = config.Mobility;
    stats.Health = config.Health;
    stats.maxShields = config.shields;
    stats.maxHealth = config.Health;
}

// Initial application
applySuitStats(playersuit);

function selectSuit(suitKey) {
    if (!SUIT_CONFIGS[suitKey]) {
        console.warn(`Suit ${suitKey} not found, defaulting to ${RX68}`);
        suitKey = RX68;
    }
    playersuit = suitKey;
    applySuitStats(playersuit);

    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('selectedSuit', playersuit);
        }
    } catch (e) {
        console.warn('Could not save selectedSuit to localStorage:', e);
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('playersuit-changed', {
            detail: { suit: playersuit, stats: { ...stats } }
        }));
    }

    return stats;
}

function getSuitStats() {
    return {
        suit: playersuit,
        config: SUIT_CONFIGS[playersuit],
        stats: { ...stats }
    };
}

// --- UI Renderer for Select.html ---
function renderSuitSelector() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('MobilitysuitSelect');
    if (!container) return;

    container.innerHTML = `
        <div class="suit-grid">
            ${availablesuits.map(key => {
        const suit = SUIT_CONFIGS[key];
        const isSelected = key === playersuit;
        return `
                    <div class="suit-card ${isSelected ? 'active' : ''}" data-suit="${key}">
                        <div class="suit-header">
                            <span class="suit-badge" style="color: ${suit.color}; border-color: ${suit.color}">
                                ${suit.role} &bull; COMBAT FRAME
                            </span>
                            <h2 class="suit-title" style="color: ${suit.color}">${suit.name}</h2>
                        </div>
                        <p class="suit-desc">${suit.description}</p>
                        <div class="stat-bars">
                            <div class="stat-row">
                                <span class="stat-label">Shields</span>
                                <div class="bar-track">
                                    <div class="bar-fill shields" style="width: ${suit.shields}%;"></div>
                                </div>
                                <span class="stat-val">${suit.shields}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Mobility</span>
                                <div class="bar-track">
                                    <div class="bar-fill mobility" style="width: ${(suit.Mobility / 50) * 100}%;"></div>
                                </div>
                                <span class="stat-val">${suit.Mobility}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Health</span>
                                <div class="bar-track">
                                    <div class="bar-fill health" style="width: ${(suit.Health / 50) * 100}%;"></div>
                                </div>
                                <span class="stat-val">${suit.Health}</span>
                            </div>
                        </div>
                        <button class="select-btn ${isSelected ? 'selected' : ''}" data-select="${key}">
                            ${isSelected ? 'EQUIPPED' : 'EQUIP SUIT'}
                        </button>
                    </div>
                `;
    }).join('')}
        </div>
        <div class="action-footer">
            <a href="index.html" class="launch-btn">LAUNCH GAME &rarr;</a>
        </div>
    `;

    // Bind click events
    container.querySelectorAll('.suit-card, .select-btn').forEach(elem => {
        elem.addEventListener('click', (e) => {
            const suitKey = elem.getAttribute('data-suit') || elem.getAttribute('data-select');
            if (suitKey) {
                selectSuit(suitKey);
                renderSuitSelector();
            }
        });
    });
}

// Auto-render if on selection page
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderSuitSelector);
    } else {
        renderSuitSelector();
    }
}

export {
    playersuit,
    availablesuits,
    abailablesuits,
    stats,
    SUIT_CONFIGS,
    RX68,
    ALYSNES,
    NOVAX,
    selectSuit,
    getSuitStats,
    renderSuitSelector
};
