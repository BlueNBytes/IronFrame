import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { Octree } from 'three/addons/math/Octree.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { setupScene, camera, renderer, stats } from './core/sceneSetup.js';
import { playerCollider, playerVelocity, playerDirection, keyStates, initPlayerControls, updatePlayer, teleportPlayerIfOob, getPlayerPosition, getPlayerRotation } from './core/player.js';
import { worldOctree, spheres, initSpheres, updateSpheres } from './physics/physics.js';
import { loadCollisionWorld, visibilitySettings } from './utils/loader.js';
import { getSuitStats } from './core/Switch.js';
import { currentweapons, getActiveWeapon, isReloading } from './core/Weapon.js';
import { initializeMultiplayer, updateMultiplayer } from './core/multiplayer.js';
import { initializeDraggablePanels } from './utils/draggablePanels.js';
import { initEnemies, updateEnemies } from './core/Enemy.js';

const clock = new THREE.Clock();
const scene = setupScene(); // Get the scene from sceneSetup
initializeDraggablePanels();

const STEPS_PER_FRAME = 5;

// --- Initialization ---

initSpheres(scene); // Pass scene to sphere initialization
initPlayerControls(scene, camera, playerCollider, playerDirection, spheres);
initEnemies(scene, camera, worldOctree, playerCollider, playerVelocity, spheres); // M spawns a training enemy
initializeMultiplayer(scene, () => {
    const position = getPlayerPosition();
    return {
        position,
        yaw: getPlayerRotation(),
        suit: getSuitStats().suit
    };
});

// Helper function to save settings to localStorage
function saveSettings() {
    try {
        localStorage.setItem('visibilitySettings', JSON.stringify(visibilitySettings));
        console.log('Saved visibility settings to localStorage');
    } catch (error) {
        console.warn('Failed to save settings to localStorage:', error);
    }
}

// Load saved visibility settings from localStorage if available
try {
    const savedSettings = localStorage.getItem('visibilitySettings');
    if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        // Only apply saved settings that exist in our visibilitySettings object
        Object.keys(parsedSettings).forEach(key => {
            if (key in visibilitySettings) {
                visibilitySettings[key] = parsedSettings[key];
            }
        });
        console.log('Loaded visibility settings from localStorage');
    }
} catch (error) {
    console.warn('Failed to load settings from localStorage:', error);
}

// Set initial camera far plane from visibility settings
camera.far = visibilitySettings.cameraFar;
camera.updateProjectionMatrix();

// Load the world model and build Octree
loadCollisionWorld(scene, worldOctree, './assets/low_poly_industrial_zone.glb', renderer, camera) // Pass renderer and camera
    .then(() => {
        console.log('Collision world loaded and Octree built.');
        // Start animation loop only after the world is loaded
        renderer.setAnimationLoop(animate);
    })
    .catch(error => {
        console.error('Error loading collision world:', error);
    });


// --- Event Listeners ---

window.addEventListener('resize', onWindowResize);

// Add keyboard shortcuts for visibility toggles
window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'g' || event.key === 'G') {
        visibilitySettings.showGUI = !visibilitySettings.showGUI;
        visibilitySettings.showUI = visibilitySettings.showGUI;

        const uiWrapper = document.getElementById('ui-wrapper');
        if (uiWrapper) {
            uiWrapper.style.opacity = visibilitySettings.showUI ? '1' : '0';
            uiWrapper.style.pointerEvents = visibilitySettings.showUI ? 'auto' : 'none';
        }

        saveSettings();

        window.dispatchEvent(new CustomEvent('gui-visibility-toggle', {
            detail: { showGUI: visibilitySettings.showGUI }
        }));
    }
});

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Animation Loop ---

function animate() {
    const frameDelta = Math.min(0.05, clock.getDelta());
    const deltaTime = frameDelta / STEPS_PER_FRAME;

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        // Player controls are handled internally by player.js via event listeners
        updatePlayer(deltaTime, worldOctree);
        updateSpheres(deltaTime, worldOctree, spheres, playerCollider, playerVelocity); // Pass necessary state
        teleportPlayerIfOob(camera, playerCollider); // Pass necessary state
    }

    updateEnemies(frameDelta);
    updateMultiplayer(frameDelta);
    renderer.render(scene, camera);
    stats.update();
    updateCoordsHUD();
}

function updateCoordsHUD() {

}

// --- Initial Setup ---
// HUD Management
function updateHUD() {
    const suitData = getSuitStats();
    const suitNameEl = document.getElementById('hud-suit-name');
    const shieldBarEl = document.getElementById('hud-shield-bar');
    const shieldValEl = document.getElementById('hud-shield-val');
    const healthBarEl = document.getElementById('hud-health-bar');
    const healthValEl = document.getElementById('hud-health-val');

    if (suitNameEl && suitData && suitData.config) {
        suitNameEl.textContent = suitData.config.name;
        suitNameEl.style.color = suitData.config.color;
    }

    if (shieldBarEl && suitData && suitData.stats) {
        const pct = Math.round((suitData.stats.shields / (suitData.stats.maxShields || 100)) * 100);
        shieldBarEl.style.width = `${pct}%`;
        if (shieldValEl) shieldValEl.textContent = suitData.stats.shields;
    }

    if (healthBarEl && suitData && suitData.stats) {
        const pct = Math.round((suitData.stats.Health / (suitData.stats.maxHealth || 100)) * 100);
        healthBarEl.style.width = `${pct}%`;
        if (healthValEl) healthValEl.textContent = suitData.stats.Health;
    }

    const weaponHudEl = document.getElementById('weapon-cards');
    if (weaponHudEl) {
        const activeWeapon = getActiveWeapon();
        const reloading = isReloading();

        weaponHudEl.innerHTML = currentweapons.map((w, idx) => {
            const isActive = w.id === activeWeapon.id;
            const ammoDisplay = w.ammo === Infinity ? '∞' : `${w.ammo} / ${w.maxAmmo}`;
            const statusText = (isActive && reloading) ? 'RELOADING...' : ammoDisplay;

            return `
                <div class="hud-weapon-card ${isActive ? 'active' : ''}" style="${isActive ? `border-color: ${w.color}; box-shadow: 0 0 10px ${w.color}44;` : ''}">
                    <span class="hud-weapon-key">[${idx + 1}]</span>
                    <span class="hud-weapon-icon">${w.icon}</span>
                    <div class="hud-weapon-info">
                        <span class="hud-weapon-name" style="${isActive ? `color: ${w.color};` : ''}">${w.name}</span>
                        <span class="hud-weapon-ammo ${reloading && isActive ? 'reloading-text' : ''}">${statusText}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Listen for game state updates
window.addEventListener('playersuit-changed', updateHUD);
window.addEventListener('player-damaged', updateHUD);
window.addEventListener('weapon-changed', updateHUD);
window.addEventListener('weapon-fired', updateHUD);
window.addEventListener('weapon-reload-start', updateHUD);
window.addEventListener('weapon-reload-complete', updateHUD);

// Initial HUD render
updateHUD();

// Append renderer to the container
const container = document.getElementById('container');
if (container) {
    container.appendChild(renderer.domElement);
} else {
    console.error("Container element 'container' not found.");
}

// Append stats to the stats container
const statsContainer = document.getElementById('stats-container');
if (statsContainer) {
    statsContainer.appendChild(stats.domElement);
} else {
    console.error("Stats container element 'stats-container' not found.");
}

// Set UI wrapper visibility based on settings
const uiWrapper = document.getElementById('ui-wrapper');
if (uiWrapper) {
    // Add showUI property to visibilitySettings if it doesn't exist
    if (typeof visibilitySettings.showUI === 'undefined') {
        visibilitySettings.showUI = true; // Default to visible
    }

    // Apply the visibility setting
    uiWrapper.style.opacity = visibilitySettings.showUI ? '1' : '0';
    uiWrapper.style.pointerEvents = visibilitySettings.showUI ? 'auto' : 'none';
} else {
    console.error("UI wrapper element 'ui-wrapper' not found.");
}
