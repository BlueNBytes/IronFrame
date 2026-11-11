import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GRAVITY } from '../physics/physics.js';
import { visibilitySettings } from '../utils/loader.js';
import { getSuitStats } from './Switch.js';
import { currentweapons, getActiveWeapon, setActiveWeapon, switchNextWeapon, fireActiveWeapon, reloadActiveWeapon, isReloading } from './Weapon.js';
import { damageEnemiesInSphere } from './Enemy.js';

// --- Player State ---
const playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1, 0), 0.35);
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
const keyStates = {};

let playerOnFloor = false;
let mouseTime = 0;
let isRunning = false;

// Scene references
let _scene;
let _camera;
let _playerCollider;
let _playerDirection;
let _spheres;

// Third-person helpers
const cameraTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
const cameraUp = new THREE.Vector3(0, 1, 0);
const desiredForward = new THREE.Vector3();
const horizontalVelocity = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempVector = new THREE.Vector3();

let _cameraYaw = 0;
let _cameraPitch = 0.15;

// Character model
const playerGroup = new THREE.Group();
let playerModel = null;
let mixer = null;
let actions = {};
let currentAction = null;
let modelReady = false;
let currentModelHeight = 1.8;

// Sphere throwing state
let sphereIdx = 0;
let lastQuickMeleeTime = 0;

const MODEL_OFFSET = new THREE.Vector3(0, -1.0, 0); // Roughly align model feet with collider
const CAMERA_DISTANCE_THIRD = 6;
const CAMERA_HEIGHT_THIRD = 2.8;
const CAMERA_DISTANCE_FIRST = 0.2;
const CAMERA_HEIGHT_FIRST = 1.0;
const CAMERA_MIN_PITCH_THIRD = -Math.PI / 3;
const CAMERA_MAX_PITCH_THIRD = Math.PI / 4;
const CAMERA_MIN_PITCH_FIRST = -Math.PI / 2 + 0.1;
const CAMERA_MAX_PITCH_FIRST = Math.PI / 2 - 0.1;
const CAMERA_PITCH_THIRD = 0.18;
const CAMERA_PITCH_FIRST = 1;
const CAMERA_DISTANCE_THIRD_MIN = 2.5;
const CAMERA_DISTANCE_THIRD_MAX = 12;
const ANIMATION_FADE_DURATION = 0.35;

let thirdPersonDistance = CAMERA_DISTANCE_THIRD;

let viewMode = visibilitySettings.viewMode || 'third';

function isMovementInputActive() {
    return !!(
        keyStates['KeyW'] || keyStates['ArrowUp'] ||
        keyStates['KeyS'] || keyStates['ArrowDown'] ||
        keyStates['KeyA'] || keyStates['ArrowLeft'] ||
        keyStates['KeyD'] || keyStates['ArrowRight']
    );
}

function isWeaponInputActive() {
    return !!(
        keyStates['KeyR'] ||
        keyStates['KeyF'] ||
        keyStates['KeyT'] ||
        keyStates['Digit1'] ||
        keyStates['Digit2'] ||
        keyStates['Digit3']
    );
}

function getPitchLimits(mode = viewMode) {
    if (mode === 'first') {
        return { min: CAMERA_MIN_PITCH_FIRST, max: CAMERA_MAX_PITCH_FIRST };
    }
    return { min: CAMERA_MIN_PITCH_THIRD, max: CAMERA_MAX_PITCH_THIRD };
}

function clampCameraPitch() {
    const { min, max } = getPitchLimits();
    _cameraPitch = THREE.MathUtils.clamp(_cameraPitch, min, max);
}

// --- Input Handling ---
function initPlayerControls(scene, camera, collider, direction, spheres) {
    _scene = scene;
    _camera = camera;
    _playerCollider = collider;
    _playerDirection = direction;
    _spheres = spheres;

    loadCharacter();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const container = document.getElementById('container');
    if (container) {
        container.addEventListener('mousedown', () => {
            document.body.requestPointerLock();
            mouseTime = performance.now();
        });
    }

    document.addEventListener('mouseup', () => {
        if (document.pointerLockElement !== null) throwBall();
    });

    document.body.addEventListener('mousemove', (event) => {
        if (document.pointerLockElement === document.body) {
            _cameraYaw -= event.movementX / 500;
            _cameraPitch -= event.movementY / 500;
            clampCameraPitch();
        }
    });

    window.addEventListener('wheel', (event) => {
        if (viewMode !== 'third') return;
        const zoomDelta = event.deltaY * 0.0025;
        if (zoomDelta !== 0) {
            thirdPersonDistance = THREE.MathUtils.clamp(
                thirdPersonDistance + zoomDelta,
                CAMERA_DISTANCE_THIRD_MIN,
                CAMERA_DISTANCE_THIRD_MAX
            );
            event.preventDefault();
        }
    }, { passive: false });

    window.addEventListener('player-view-change', (event) => {
        setViewMode(event.detail, { persist: true });
    });

    window.addEventListener('playersuit-changed', (event) => {
        const suitKey = event.detail?.suit;
        const suitInfo = getSuitStats();
        if (suitInfo && suitInfo.config && suitInfo.config.model) {
            if (suitInfo.config.model !== loadedModelPath) {
                loadCharacter(suitInfo.config.model);
            }
        }
    });

    setViewMode(viewMode, { immediate: true });
}

function toggleViewMode() {
    setViewMode(viewMode === 'third' ? 'first' : 'third', { persist: true });
}

function setViewMode(mode, options = {}) {
    viewMode = mode === 'first' ? 'first' : 'third';
    visibilitySettings.viewMode = viewMode;
    _cameraPitch = viewMode === 'third' ? CAMERA_PITCH_THIRD : CAMERA_PITCH_FIRST;
    clampCameraPitch();
    if (viewMode === 'third') {
        thirdPersonDistance = THREE.MathUtils.clamp(
            thirdPersonDistance,
            CAMERA_DISTANCE_THIRD_MIN,
            CAMERA_DISTANCE_THIRD_MAX
        );
    }
    if (modelReady) {
        playerGroup.visible = viewMode === 'third';
    }

    if (options.persist) {
        persistViewMode();
    }
}

function persistViewMode() {
    try {
        localStorage.setItem('visibilitySettings', JSON.stringify(visibilitySettings));
    } catch (error) {
        console.warn('Failed to persist view mode:', error);
    }
}

function onKeyDown(event) {
    if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    keyStates[event.code] = true;

    if (event.code === 'KeyV' && !event.repeat) {
        toggleViewMode();
    } else if (event.code === 'KeyR' && !event.repeat) {
        reloadActiveWeapon();
    } else if (event.code === 'KeyF' && !event.repeat) {
        fireWeapon(true); // Melee strike
    } else if (event.code === 'KeyT' && !event.repeat) {
        switchNextWeapon();
    } else if (event.code === 'Digit1' && !event.repeat) {
        setActiveWeapon(0); // Beam Saber
    } else if (event.code === 'Digit2' && !event.repeat) {
        setActiveWeapon(1); // Energy Gun
    } else if (event.code === 'Digit3' && !event.repeat) {
        setActiveWeapon(2); // Light Bazooka
    }
}

function onKeyUp(event) {
    keyStates[event.code] = false;
}

// --- Animation Helpers ---
let loadedModelPath = '';

/**
 * Robustly slices a subclip out of a source AnimationClip, linearly interpolating
 * all tracks (with normalized quaternion interpolation for rotations) so that no tracks
 * are lost due to sparse keyframing.
 */
function sliceClip(sourceClip, name, startTime, endTime) {
    const duration = Math.max(0.01, endTime - startTime);
    const newTracks = [];

    sourceClip.tracks.forEach(track => {
        const valueSize = track.getValueSize();
        const times = track.times;
        const values = track.values;
        if (!times || times.length === 0) return;

        const isQuaternion = valueSize === 4;

        // Sample value at targetTime
        const sampleValue = (targetTime) => {
            if (targetTime <= times[0]) {
                return values.slice(0, valueSize);
            }
            if (targetTime >= times[times.length - 1]) {
                const lastIdx = (times.length - 1) * valueSize;
                return values.slice(lastIdx, lastIdx + valueSize);
            }
            let i = 0;
            while (i < times.length - 1 && times[i + 1] < targetTime) {
                i++;
            }
            const t0 = times[i];
            const t1 = times[i + 1];
            const alpha = t1 > t0 ? (targetTime - t0) / (t1 - t0) : 0;
            const idx0 = i * valueSize;
            const idx1 = (i + 1) * valueSize;
            const res = new Float32Array(valueSize);

            if (isQuaternion) {
                const dot = values[idx0] * values[idx1] +
                            values[idx0 + 1] * values[idx1 + 1] +
                            values[idx0 + 2] * values[idx1 + 2] +
                            values[idx0 + 3] * values[idx1 + 3];
                const sign = dot < 0 ? -1 : 1;
                for (let k = 0; k < 4; k++) {
                    res[k] = values[idx0 + k] + alpha * (values[idx1 + k] * sign - values[idx0 + k]);
                }
                const len = Math.hypot(res[0], res[1], res[2], res[3]) || 1;
                res[0] /= len; res[1] /= len; res[2] /= len; res[3] /= len;
            } else {
                for (let k = 0; k < valueSize; k++) {
                    res[k] = values[idx0 + k] + alpha * (values[idx1 + k] - values[idx0 + k]);
                }
            }
            return res;
        };

        const slicedTimes = [];
        const slicedValues = [];

        // Add start keyframe at t = 0
        slicedTimes.push(0);
        const startVal = sampleValue(startTime);
        for (let k = 0; k < valueSize; k++) slicedValues.push(startVal[k]);

        // Add intermediate keyframes
        for (let j = 0; j < times.length; j++) {
            const t = times[j];
            if (t > startTime + 0.0001 && t < endTime - 0.0001) {
                slicedTimes.push(t - startTime);
                const idx = j * valueSize;
                for (let k = 0; k < valueSize; k++) {
                    slicedValues.push(values[idx + k]);
                }
            }
        }

        // Add end keyframe at t = duration
        slicedTimes.push(duration);
        const endVal = sampleValue(endTime);
        for (let k = 0; k < valueSize; k++) slicedValues.push(endVal[k]);

        // Construct new track of the same type
        const TrackConstructor = track.constructor;
        const newTrack = new TrackConstructor(
            track.name,
            new Float32Array(slicedTimes),
            new Float32Array(slicedValues)
        );
        newTracks.push(newTrack);
    });

    return new THREE.AnimationClip(name, duration, newTracks);
}

/**
 * Discovers and configures animation actions from the loaded model's animations array.
 * Supports discrete clips (e.g. Idle, Walk, Run, TPose) and composite timelines (e.g. Pelter|Action).
 */
function setupAnimationActions(animations, mixer) {
    if (!animations || animations.length === 0) {
        console.warn('No animations found in GLTF model.');
        return {};
    }

    console.log('Available animations in model:', animations.map(a => `${a.name} (${a.duration.toFixed(2)}s)`));

    const findClip = (pattern) => animations.find(a => pattern.test(a.name));

    let idleClip = findClip(/^idle/i) || findClip(/idle/i);
    let walkClip = findClip(/^walk/i) || findClip(/walk/i);
    let runClip = findClip(/^run/i) || findClip(/run/i) || findClip(/sprint/i);
    let fireClip = findClip(/fire|shoot|attack|shot|slash|cannon/i);
    let jumpClip = findClip(/jump/i);

    // If separate named clips exist (like Vanguard Player.glb)
    if (idleClip || walkClip || runClip) {
        if (!idleClip) idleClip = walkClip || runClip;
        if (!walkClip) walkClip = idleClip || runClip;
        if (!runClip) runClip = walkClip;
    } else if (animations.length >= 2) {
        // Multi-clip models with generic names (e.g. MSA_Anim_1 and MSA_Anim_3 in alysnes.glb)
        const sorted = [...animations].sort((a, b) => b.duration - a.duration);
        walkClip = sorted[0];
        runClip = sorted[0];
        idleClip = sorted[1];
        fireClip = sorted[0];
    } else {
        // Composite clip (like Pelter|Action)
        const mainClip = findClip(/pelter|action/i) || animations[0];
        console.log(`Processing composite animation clip "${mainClip.name}" (${mainClip.duration.toFixed(2)}s)...`);

        if (mainClip.duration >= 14.0) {
            // Pelter Artillery Mech gait period:
            // Walk cycle: from 1.6667s to 3.3333s (duration 1.6667s) is a perfectly seamless gait loop
            walkClip = sliceClip(mainClip, 'Walk', 1.6667, 3.3333);
            runClip = sliceClip(mainClip, 'Run', 1.6667, 3.3333);
            // Idle: from 6.0s to 12.0s is a steady combat stance
            idleClip = sliceClip(mainClip, 'Idle', 6.0, 12.0);
            // Fire: from 15.0s to 17.5s is the cannon & flak recoil burst
            fireClip = sliceClip(mainClip, 'Fire', 15.0, 17.5);
        } else if (mainClip.duration >= 4.0) {
            idleClip = sliceClip(mainClip, 'Idle', 0, mainClip.duration * 0.4);
            walkClip = sliceClip(mainClip, 'Walk', mainClip.duration * 0.4, mainClip.duration);
            runClip = walkClip;
        } else {
            walkClip = mainClip;
            runClip = mainClip;
            idleClip = sliceClip(mainClip, 'Idle', 0, Math.min(1.0, mainClip.duration));
        }
    }

    const createdActions = {};
    if (idleClip) createdActions.Idle = mixer.clipAction(idleClip);
    if (walkClip) createdActions.Walk = mixer.clipAction(walkClip);
    if (runClip) {
        createdActions.Run = mixer.clipAction(runClip);
        if (runClip === walkClip) {
            createdActions.Run.setEffectiveTimeScale(1.6);
        }
    }
    if (fireClip) {
        createdActions.Fire = mixer.clipAction(fireClip);
        createdActions.Fire.setLoop(THREE.LoopOnce);
        createdActions.Fire.clampWhenFinished = false;
    }
    if (jumpClip) {
        createdActions.Jump = mixer.clipAction(jumpClip);
        createdActions.Jump.setLoop(THREE.LoopOnce);
    }

    Object.values(createdActions).forEach(action => {
        if (action) {
            action.enabled = true;
            action.setEffectiveWeight(0);
        }
    });

    console.log('Successfully configured animation actions:', Object.keys(createdActions));
    return createdActions;
}

// --- Character Loading ---
function loadCharacter(targetModelPath) {
    const suitInfo = getSuitStats();
    const primaryPath = targetModelPath || suitInfo?.config?.model || './assets/Player.glb';
    const fallbackPath = primaryPath === './assets/Player.glb' ? './assets/Mech1.glb' : './assets/Player.glb';
    const cdnFallback = 'https://threejs.org/examples/models/gltf/Soldier.glb';

    const loader = new GLTFLoader();

    function onGltfLoaded(gltf, loadedFromPath) {
        // Clean up previous model and mixer if reloading
        if (playerModel) {
            playerGroup.remove(playerModel);
            if (mixer) {
                mixer.stopAllAction();
                mixer.uncacheRoot(playerModel);
            }
        }

        playerModel = gltf.scene;
        playerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Apply orientation: Y = Math.PI for forward-facing, plus any per-suit overrides
        const suitConfig = getSuitStats()?.config;
        const rot = suitConfig?.modelRotation ?? { x: 0, y: 0, z: 0 };
        playerModel.rotation.set(rot.x, Math.PI + rot.y, rot.z);

        // Auto-scale dynamically so any mech or character scales proportionally
        const box = new THREE.Box3().setFromObject(playerModel);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 5.0) {
            // Target height for combat mecha frames is ~3.8 meters
            const targetHeight = 3.8;
            const dynamicScale = targetHeight / size.y;
            playerModel.scale.set(dynamicScale, dynamicScale, dynamicScale);
            thirdPersonDistance = 8.0;
        } else {
            playerModel.scale.set(1.0, 1.0, 1.0);
            thirdPersonDistance = CAMERA_DISTANCE_THIRD;
        }

        playerModel.updateMatrixWorld(true);
        const finalBox = new THREE.Box3().setFromObject(playerModel);
        currentModelHeight = Math.max(1.5, finalBox.max.y - finalBox.min.y);

        playerGroup.add(playerModel);
        playerGroup.visible = viewMode === 'third';
        if (!_scene.children.includes(playerGroup)) {
            _scene.add(playerGroup);
        }

        mixer = new THREE.AnimationMixer(playerModel);
        actions = setupAnimationActions(gltf.animations, mixer);

        mixer.addEventListener('finished', (e) => {
            if (actions.Fire && e.action === actions.Fire) {
                const nextName = isMovementInputActive() ? (isRunning ? 'Run' : 'Walk') : 'Idle';
                const target = actions[nextName];
                if (target) {
                    target.enabled = true;
                    target.setEffectiveWeight(1);
                    target.play();
                    actions.Fire.crossFadeTo(target, 0.2, true);
                    currentAction = nextName;
                }
            }
        });

        currentAction = null;
        setAction('Idle');
        modelReady = true;
        loadedModelPath = loadedFromPath;
        setViewMode(viewMode, { immediate: true });
        console.log(`Character loaded successfully from ${loadedFromPath}`);
    }

    loader.load(
        primaryPath,
        (gltf) => onGltfLoaded(gltf, primaryPath),
        undefined,
        (err1) => {
            console.warn(`Failed to load ${primaryPath}, trying fallback ${fallbackPath}...`, err1);
            loader.load(
                fallbackPath,
                (gltf) => onGltfLoaded(gltf, fallbackPath),
                undefined,
                (err2) => {
                    console.warn(`Failed to load ${fallbackPath}, trying CDN ${cdnFallback}...`, err2);
                    loader.load(
                        cdnFallback,
                        (gltf) => onGltfLoaded(gltf, cdnFallback),
                        undefined,
                        (err3) => {
                            console.error('All character model loading attempts failed:', err3);
                        }
                    );
                }
            );
        }
    );
}

function triggerAttackAnimation() {
    if (!actions || !actions.Fire) return;
    const fireAction = actions.Fire;
    fireAction.reset();
    fireAction.setLoop(THREE.LoopOnce);
    fireAction.clampWhenFinished = false;
    fireAction.enabled = true;
    fireAction.setEffectiveWeight(1);
    fireAction.play();

    if (currentAction && actions[currentAction] && actions[currentAction] !== fireAction) {
        actions[currentAction].crossFadeTo(fireAction, 0.1, true);
    }
}

function setAction(name) {
    if (!actions || !actions[name]) return;
    if (currentAction === name) return;

    const previousName = currentAction;
    const previous = previousName ? actions[previousName] : null;
    const nextAction = actions[name];

    currentAction = name;

    const suitInfo = getSuitStats();
    const mobilityFactor = (suitInfo?.stats?.Mobility || 20) / 20;
    const baseSpeed = name === 'Run' ? 1.5 : 1.0;
    nextAction.setEffectiveTimeScale(baseSpeed * mobilityFactor);

    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1);
    nextAction.play();

    if (previous && previous !== nextAction) {
        if (previousName !== 'Idle' && name !== 'Idle') {
            const prevDuration = previous.getClip().duration || 1;
            const nextDuration = nextAction.getClip().duration || prevDuration;
            nextAction.time = (previous.time || 0) * (nextDuration / prevDuration);
        } else {
            nextAction.reset();
        }

        previous.crossFadeTo(nextAction, ANIMATION_FADE_DURATION, true);
    } else {
        nextAction.reset();
        nextAction.fadeIn(ANIMATION_FADE_DURATION);
    }
}

// --- Weapon Feedback & Ball Throwing ---
const tempLaunchBox = new THREE.Box3();
const tempLaunchCenter = new THREE.Vector3();
const tempLaunchSize = new THREE.Vector3();

/**
 * Dynamically computes the bullet launch origin at the TOP of whatever 3D model
 * is currently equipped and loaded, without hardcoding any model-specific offsets.
 */
function getBulletLaunchOrigin(aimDirection) {
    if (modelReady && playerModel) {
        playerModel.updateWorldMatrix(true, false);
        tempLaunchBox.setFromObject(playerModel);

        tempLaunchBox.getCenter(tempLaunchCenter);
        tempLaunchSize.set(
            tempLaunchBox.max.x - tempLaunchBox.min.x,
            tempLaunchBox.max.y - tempLaunchBox.min.y,
            tempLaunchBox.max.z - tempLaunchBox.min.z
        );

        // Exact top of the currently active 3D model in world space
        const topY = tempLaunchBox.max.y;

        // Dynamic forward clearance based on model depth/width
        const modelRadius = Math.max(tempLaunchSize.x, tempLaunchSize.z) * 0.45;
        const forwardClearance = Math.max(0.6, modelRadius);

        // Position launch origin at the top center of the model, offset forward along aim direction
        const origin = new THREE.Vector3(tempLaunchCenter.x, topY, tempLaunchCenter.z);
        origin.addScaledVector(aimDirection, forwardClearance);

        return origin;
    }

    // Dynamic fallback when model is not yet loaded
    const fallback = _playerCollider.end.clone();
    fallback.y += _playerCollider.radius;
    fallback.addScaledVector(aimDirection, _playerCollider.radius * 2);
    return fallback;
}

function getModelMidpoint() {
    if (modelReady && playerModel) {
        playerModel.updateWorldMatrix(true, false);
        tempLaunchBox.setFromObject(playerModel);
        tempLaunchBox.getCenter(tempLaunchCenter);
        return tempLaunchCenter.clone();
    }
    return _playerCollider.end.clone();
}

function showWeaponFeedback(message, color = '#00ffcc') {
    if (typeof document === 'undefined') return;
    let banner = document.getElementById('weapon-toast');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'weapon-toast';
        banner.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:8px 18px;border-radius:4px;font-size:14px;font-weight:bold;letter-spacing:1px;z-index:1000;pointer-events:none;transition:opacity 0.3s;background:rgba(10,15,25,0.85);border:1px solid currentColor;';
        document.body.appendChild(banner);
    }
    banner.style.color = color;
    banner.style.textShadow = `0 0 8px ${color}`;
    banner.textContent = message;
    banner.style.opacity = '1';
    if (banner._timer) clearTimeout(banner._timer);
    banner._timer = setTimeout(() => {
        banner.style.opacity = '0';
    }, 1200);
}

function throwBall() {
    fireWeapon(false);
}

function fireWeapon(isQuickMelee = false) {
    if (!_spheres || _spheres.length === 0) return;

    triggerAttackAnimation();

    if (isQuickMelee) {
        const aimDirection = getForwardVector();
        const midPoint = getModelMidpoint();
        const forwardPoint = midPoint.addScaledVector(aimDirection, 2.5);
        const nowMs = performance.now();
        if (nowMs - lastQuickMeleeTime > 400) {
            lastQuickMeleeTime = nowMs;
            damageEnemiesInSphere(forwardPoint, 3.6, 40, aimDirection, 25);
        }
        _spheres.forEach(s => {
            const dist = s.collider.center.distanceTo(forwardPoint);
            if (dist < 4.5) {
                s.velocity.addScaledVector(aimDirection, 45);
                s.velocity.y += 12;
            }
        });
        showWeaponFeedback('⚔️ BEAM SABER MELEE STRIKE!', '#00ffcc');
        return;
    }

    const fireResult = fireActiveWeapon();
    if (!fireResult.success) {
        if (fireResult.reason === 'out_of_ammo') {
            showWeaponFeedback(`⚠️ ${fireResult.weapon.name}: OUT OF AMMO (PRESS R)`, '#ff4444');
        } else if (fireResult.reason === 'reloading') {
            showWeaponFeedback(`⏳ RELOADING ${fireResult.weapon.name}...`, '#ffaa00');
        }
        return;
    }

    if (fireResult.type === 'melee') {
        const aimDirection = getForwardVector();
        const midPoint = getModelMidpoint();
        const forwardPoint = midPoint.addScaledVector(aimDirection, 3.0);
        damageEnemiesInSphere(forwardPoint, 4.0, fireResult.weapon.damage, aimDirection, 30);
        _spheres.forEach(s => {
            const dist = s.collider.center.distanceTo(forwardPoint);
            if (dist < 5.0) {
                s.velocity.addScaledVector(aimDirection, 50);
                s.velocity.y += 14;
            }
        });
        showWeaponFeedback('⚔️ BEAM SABER SLASH!', '#00ffcc');
        return;
    }

    const sphere = _spheres[sphereIdx];
    const aimDirection = getForwardVector();
    const cameraAim = new THREE.Vector3();
    _camera.getWorldDirection(cameraAim);

    // Dynamically calculate launch origin from the TOP of whatever model is active
    const launchOrigin = getBulletLaunchOrigin(aimDirection);
    sphere.collider.center.copy(launchOrigin);

    // Trajectory aims towards the reticle focus point in the distance
    const targetPoint = _camera.position.clone().addScaledVector(cameraAim, 100);
    const bulletTrajectory = targetPoint.sub(launchOrigin).normalize();

    const baseSpeed = fireResult.speed || fireResult.impulse || 50;
    const chargeDuration = Math.min(1000, performance.now() - mouseTime);
    const chargeSpeed = (chargeDuration / 1000) * 15;
    const totalSpeed = baseSpeed + chargeSpeed;

    sphere.velocity.copy(bulletTrajectory).multiplyScalar(totalSpeed);
    sphere.velocity.addScaledVector(playerVelocity, 1.2);

    // Tag the projectile so enemies can take damage from it
    sphere.projectile = true;   // physics.js removes it on ground impact
    sphere.damage = fireResult.weapon.damage;
    sphere.knockback = fireResult.type === 'heavy' ? 18 : 5;
    sphere.damageUntil = performance.now() + 2500;

    if (sphere.mesh) {
        sphere.mesh.position.copy(launchOrigin);
        if (sphere.mesh.material) {
            sphere.mesh.material.color.set(fireResult.color);
        }
    }

    sphereIdx = (sphereIdx + 1) % _spheres.length;
    showWeaponFeedback(`${fireResult.weapon.icon} ${fireResult.weapon.name.toUpperCase()} [${fireResult.ammo}/${fireResult.weapon.maxAmmo}]`, fireResult.color);
}

// --- Player Movement & Collision ---
function playerCollisions(worldOctree) {
    const result = worldOctree.capsuleIntersect(_playerCollider);
    playerOnFloor = false;

    if (result) {
        playerOnFloor = result.normal.y > 0;

        if (!playerOnFloor) {
            playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
        }

        if (result.depth >= 1e-10) {
            _playerCollider.translate(result.normal.multiplyScalar(result.depth));
        }
    }
}

function updatePlayer(deltaTime, worldOctree) {
    if (!_camera) return;

    updateCameraTarget();

    let damping = Math.exp(-4 * deltaTime) - 1;

    if (!playerOnFloor) {
        playerVelocity.y -= GRAVITY * deltaTime;
        damping *= 0.1;
    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    controls(deltaTime);

    const deltaPosition = tempVector.copy(playerVelocity).multiplyScalar(deltaTime);
    _playerCollider.translate(deltaPosition);

    playerCollisions(worldOctree);

    alignCharacterWithCollider();
    updateCameraFollow(deltaTime);
    updateAnimations(deltaTime);
}

function updateCameraTarget() {
    if (modelReady && playerModel) {
        cameraTarget.copy(playerGroup.position);
        cameraTarget.y += currentModelHeight * 0.55;
    } else {
        cameraTarget.copy(_playerCollider.end);
        cameraTarget.y += 0.2;
    }
}

function alignCharacterWithCollider() {
    if (!modelReady) return;

    const colliderBase = tempVector.copy(_playerCollider.start);
    colliderBase.y -= playerCollider.radius;

    playerGroup.position.lerp(colliderBase, 0.25);

    horizontalVelocity.copy(playerVelocity);
    horizontalVelocity.y = 0;

    if (horizontalVelocity.lengthSq() > 0.01) {
        desiredForward.copy(horizontalVelocity).normalize();
        tempQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), desiredForward);
        playerGroup.quaternion.slerp(tempQuaternion, 0.2);
    }
}

function updateCameraFollow(deltaTime) {
    const isThirdPerson = viewMode === 'third';
    const targetHeight = isThirdPerson ? CAMERA_HEIGHT_THIRD : CAMERA_HEIGHT_FIRST;
    const targetDistance = isThirdPerson ? thirdPersonDistance : CAMERA_DISTANCE_FIRST;

    clampCameraPitch();

    cameraOffset.set(0, targetHeight, targetDistance);
    const offsetEuler = new THREE.Euler(_cameraPitch, _cameraYaw, 0, 'YXZ');
    cameraOffset.applyEuler(offsetEuler);

    const desiredCameraPos = cameraTarget.clone().add(cameraOffset);
    _camera.position.lerp(desiredCameraPos, THREE.MathUtils.clamp(deltaTime * 8, 0, 1));
    _camera.lookAt(cameraTarget);
    _camera.up.copy(cameraUp);

    if (!isThirdPerson && modelReady) {
        playerGroup.visible = false;
    } else if (modelReady) {
        playerGroup.visible = true;
    }
}

function updateAnimations(deltaTime) {
    if (!modelReady || !mixer) return;

    mixer.update(deltaTime);

    // If attack/fire animation is actively executing, let it play through
    if (actions.Fire && actions.Fire.isRunning() && actions.Fire.getEffectiveWeight() > 0.4) {
        return;
    }

    if (!playerOnFloor) {
        if (actions.Jump) {
            setAction('Jump');
        }
        return;
    }

    const moving = isMovementInputActive();

    if (!moving) {
        setAction('Idle');
        return;
    }

    setAction(isRunning ? 'Run' : 'Walk');
}

function getForwardVector() {
    _camera.getWorldDirection(_playerDirection);
    _playerDirection.y = 0;
    _playerDirection.normalize();
    return _playerDirection;
}

function getSideVector() {
    _camera.getWorldDirection(_playerDirection);
    _playerDirection.y = 0;
    _playerDirection.normalize();
    _playerDirection.cross(_camera.up);
    return _playerDirection;
}

function controls(deltaTime) {
    const runKey = keyStates['ShiftLeft'] || keyStates['ShiftRight'];
    const suitInfo = getSuitStats();
    const mobilityFactor = (suitInfo.stats.Mobility || 20) / 20; // 20 base = 1.0x, 30 = 1.5x, 40 = 2.0x
    const walkSpeed = (playerOnFloor ? 18 : 6) * mobilityFactor;
    const runSpeed = (playerOnFloor ? 32 : 12) * mobilityFactor;
    const movementActive = isMovementInputActive();
    isRunning = !!(runKey && movementActive);

    const speedDelta = deltaTime * (isRunning ? runSpeed : walkSpeed);

    if (keyStates['KeyW'] || keyStates['ArrowUp']) {
        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
    }
    if (keyStates['KeyS'] || keyStates['ArrowDown']) {
        playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
    }
    if (keyStates['KeyA'] || keyStates['ArrowLeft']) {
        playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
    }
    if (keyStates['KeyD'] || keyStates['ArrowRight']) {
        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));
    }

    if (playerOnFloor && (keyStates['Space'] || keyStates['KeyX'])) {
        playerVelocity.y = 15;
        setAction('Idle');
    }
}



// --- Teleport ---
function teleportPlayerIfOob() {
    if (!_playerCollider || !_camera) return;

    if (_playerCollider.end.y <= -25) {
        console.log('Player fell out of bounds, teleporting...');
        _playerCollider.start.set(0, 0.35, 0);
        _playerCollider.end.set(0, 1, 0);
        _playerCollider.radius = 0.35;
        playerVelocity.set(0, 0, 0);
        _cameraYaw = 0;
        _cameraPitch = 0.15;
        alignCharacterWithCollider();
        updateCameraTarget();
        updateCameraFollow(0);
    }
}

// --- Coordinate Export ---

/**
 * Returns the player's current world-space position as a plain object.
 * Uses the bottom of the capsule collider (foot level) as the reference point.
 */
function getPlayerPosition() {
    // playerCollider.start = bottom sphere center; subtract radius to get foot position
    return {
        x: _playerCollider ? _playerCollider.start.x : 0,
        y: _playerCollider ? (_playerCollider.start.y - playerCollider.radius) : 0,
        z: _playerCollider ? _playerCollider.start.z : 0,
    };
}

/**
 * Returns position as a THREE.Vector3 (top of capsule = head/gun level).
 */
function getPlayerPositionTop() {
    return _playerCollider ? _playerCollider.end.clone() : new THREE.Vector3();
}

function getPlayerRotation() {
    return playerGroup.rotation.y;
}

function setPlayerPosition(position) {
    if (!_playerCollider || !position) return;
    const x = Number(position.x);
    const y = Number(position.y);
    const z = Number(position.z);
    if (![x, y, z].every(Number.isFinite)) return;

    _playerCollider.start.set(x, y + _playerCollider.radius, z);
    _playerCollider.end.set(x, y + 1, z);
    playerVelocity.set(0, 0, 0);
    alignCharacterWithCollider();
    updateCameraTarget();
    updateCameraFollow(0);
}

// --- Export ---
export {
    playerCollider,
    playerVelocity,
    playerDirection,
    keyStates,
    initPlayerControls,
    updatePlayer,
    teleportPlayerIfOob,
    fireWeapon,
    showWeaponFeedback,
    loadCharacter,
    triggerAttackAnimation,
    getPlayerPosition,
    getPlayerPositionTop,
    getPlayerRotation,
    setPlayerPosition
};
