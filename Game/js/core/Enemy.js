/**
 * Enemy.js - Simple hostile mech.
 *
 *  - Press M to spawn an enemy in front of the player (max MAX_ENEMIES alive).
 *  - It chases the player, strafes, shoots slow (dodgeable) energy bolts and
 *    swings a melee attack when you get close.
 *  - It can be damaged by the Beam Saber, Energy Gun, Light Bazooka and the F
 *    quick melee, and is destroyed when its health reaches 0.
 *  - It damages the player's shields first, then Health (see Switch.js stats).
 *    If the player's Health hits 0 the suit is restored and respawned.
 */
import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { GRAVITY } from '../physics/physics.js';
import { stats } from './Switch.js';

// --- Tuning ---
const CFG = {
    maxEnemies: 5,
    health: 200,

    colliderRadius: 0.8,
    colliderHeight: 2.2,      // distance between capsule start and end
    hitRadius: 1.1,           // generous radius used for damage checks
    walkAccel: 22,
    strafeAccel: 12,
    turnSpeed: 4.0,           // rad / s

    meleeRange: 4.2,
    meleeWindup: 0.4,
    meleeCooldown: 1.4,
    meleeDamage: 18,

    shotWindup: 0.45,
    shotCooldown: 1.8,
    projectileSpeed: 30,
    projectileDamage: 7,
    projectileLife: 4,
    projectileRadius: 0.3,

    playerHitRadius: 1.1,     // the player's mech model is much taller than its collider
    playerHitExtraHeight: 1.8,

    shieldRegenDelay: 5000,   // ms without damage before shields recharge
    shieldRegenRate: 10,      // shields / second
    respawnInvulnMs: 2500
};

const UP = new THREE.Vector3(0, 1, 0);

// --- Module state ---
let _scene = null;
let _camera = null;
let _octree = null;
let _playerCollider = null;
let _playerVelocity = null;
let _spheres = null;

const enemies = [];
const projectiles = [];
const effects = [];

let nextEnemyId = 1;
let invulnUntil = 0;
let lastDamageTime = -99999;
let shieldAcc = 0;

// --- Scratch objects ---
const _seg = new THREE.Line3();
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();
const _flat = new THREE.Vector3();
const _dir = new THREE.Vector3();

// --- Shared geometry / materials ---
let GEO = null;
let DEBRIS_MATS = null;

function ensureShared() {
    if (GEO) return;
    GEO = {
        box: new THREE.BoxGeometry(1, 1, 1),
        sphere: new THREE.SphereGeometry(1, 16, 12),
        projectile: new THREE.IcosahedronGeometry(CFG.projectileRadius, 1)
    };
    DEBRIS_MATS = [
        new THREE.MeshStandardMaterial({ color: 0x9b2226, metalness: 0.4, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.4, roughness: 0.6 }),
        new THREE.MeshBasicMaterial({ color: 0xff8a2b })
    ];
}

// =====================================================================
//  UI helpers (toast + damage flash)
// =====================================================================
function toast(message, color = '#ff5577') {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('enemy-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'enemy-toast';
        el.style.cssText = 'position:fixed;top:62px;left:50%;transform:translateX(-50%);padding:6px 16px;border-radius:4px;font-size:13px;font-weight:bold;letter-spacing:1px;z-index:1000;pointer-events:none;transition:opacity 0.3s;background:rgba(10,15,25,0.85);border:1px solid currentColor;';
        document.body.appendChild(el);
    }
    el.style.color = color;
    el.style.textShadow = `0 0 8px ${color}`;
    el.textContent = message;
    el.style.opacity = '1';
    if (el._timer) clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 1500);
}

function flashDamage() {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('damage-flash');
    if (!el) {
        el = document.createElement('div');
        el.id = 'damage-flash';
        el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:900;opacity:0;box-shadow:inset 0 0 120px 30px rgba(255,0,0,0.65);';
        document.body.appendChild(el);
    }
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetWidth; // force reflow so the fade restarts
    el.style.transition = 'opacity 0.4s';
    el.style.opacity = '0';
}

function notifyPlayerChanged() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('player-damaged', { detail: { stats: { ...stats } } }));
    }
}

// =====================================================================
//  Player damage / respawn
// =====================================================================
function getPlayerHitSegment() {
    _seg.start.copy(_playerCollider.start);
    _seg.end.copy(_playerCollider.end);
    _seg.end.y += CFG.playerHitExtraHeight;
    return _seg;
}

function getPlayerCenter(target) {
    const seg = getPlayerHitSegment();
    return target.addVectors(seg.start, seg.end).multiplyScalar(0.5);
}

function damagePlayer(amount) {
    const now = performance.now();
    if (now < invulnUntil || stats.Health <= 0) return;

    lastDamageTime = now;
    shieldAcc = 0;

    let remaining = amount;
    if (stats.shields > 0) {
        const absorbed = Math.min(stats.shields, remaining);
        stats.shields -= absorbed;
        remaining -= absorbed;
    }
    if (remaining > 0) {
        stats.Health = Math.max(0, stats.Health - remaining);
    }

    flashDamage();
    notifyPlayerChanged();

    if (stats.Health <= 0) killPlayer();
}

function killPlayer() {
    toast('SUIT DESTROYED - REDEPLOYING', '#ff3344');

    // Clear incoming fire
    for (let i = projectiles.length - 1; i >= 0; i--) removeProjectile(i);

    // Restore the suit and put the player back at the spawn point
    stats.Health = stats.maxHealth;
    stats.shields = stats.maxShields;
    _playerCollider.start.set(0, 0.35, 0);
    _playerCollider.end.set(0, 1, 0);
    _playerVelocity.set(0, 0, 0);
    invulnUntil = performance.now() + CFG.respawnInvulnMs;
    notifyPlayerChanged();
}

function updateShieldRegen(dt) {
    if (stats.Health <= 0 || stats.shields >= stats.maxShields) return;
    if (performance.now() - lastDamageTime < CFG.shieldRegenDelay) return;

    shieldAcc += dt * CFG.shieldRegenRate;
    if (shieldAcc >= 1) {
        const whole = Math.floor(shieldAcc);
        shieldAcc -= whole;
        stats.shields = Math.min(stats.maxShields, stats.shields + whole);
        notifyPlayerChanged();
    }
}

// =====================================================================
//  Enemy model (built from primitives - no asset download needed)
// =====================================================================
function addBox(parent, mat, w, h, d, x, y, z) {
    const m = new THREE.Mesh(GEO.box, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

function buildModel(mats) {
    const root = new THREE.Group();   // placed at the feet, yawed to face the player
    const body = new THREE.Group();   // tilts when dying
    root.add(body);

    // Legs (pivot at hip so they can swing)
    const legL = new THREE.Group();
    legL.position.set(-0.6, 1.5, 0);
    body.add(legL);
    addBox(legL, mats.dark, 0.7, 1.5, 0.8, 0, -0.75, 0);
    addBox(legL, mats.body, 0.85, 0.3, 1.25, 0, -1.35, 0.2);

    const legR = new THREE.Group();
    legR.position.set(0.6, 1.5, 0);
    body.add(legR);
    addBox(legR, mats.dark, 0.7, 1.5, 0.8, 0, -0.75, 0);
    addBox(legR, mats.body, 0.85, 0.3, 1.25, 0, -1.35, 0.2);

    // Pelvis, torso, head
    addBox(body, mats.dark, 1.9, 0.5, 1.1, 0, 1.7, 0);
    addBox(body, mats.body, 2.1, 1.3, 1.4, 0, 2.55, 0);
    addBox(body, mats.dark, 1.4, 0.7, 0.2, 0, 2.6, 0.75);
    addBox(body, mats.body, 0.9, 0.7, 0.9, 0, 3.5, 0.05);
    const eye = addBox(body, mats.eye, 0.7, 0.16, 0.1, 0, 3.52, 0.52);
    eye.castShadow = false;

    // Left arm (melee swing)
    const armL = new THREE.Group();
    armL.position.set(-1.4, 2.95, 0);
    body.add(armL);
    addBox(armL, mats.body, 0.6, 1.4, 0.6, 0, -0.65, 0);
    addBox(armL, mats.dark, 0.75, 0.55, 0.75, 0, -1.5, 0.1);

    // Right arm with cannon
    const gun = new THREE.Group();
    gun.position.set(1.4, 2.95, 0);
    body.add(gun);
    addBox(gun, mats.body, 0.6, 1.2, 0.6, 0, -0.55, 0);
    addBox(gun, mats.dark, 0.4, 0.4, 1.8, 0, -1.0, 0.9);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, -1.0, 1.85);
    gun.add(muzzle);
    gun.rotation.x = -0.35;

    return { root, body, parts: { legL, legR, armL, gun, eye, muzzle } };
}

function buildHealthBar(root) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 16;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, fog: false, toneMapped: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.6, 0.32, 1);
    sprite.position.set(0, 4.5, 0);
    sprite.renderOrder = 10;
    root.add(sprite);
    return { canvas, ctx: canvas.getContext('2d'), tex, mat, sprite };
}

function drawHealthBar(e) {
    const { ctx, canvas, tex } = e.bar;
    const w = canvas.width;
    const h = canvas.height;
    const frac = Math.max(0, e.health / e.maxHealth);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = frac > 0.5 ? '#3ddc84' : frac > 0.25 ? '#ffb020' : '#ff3b3b';
    ctx.fillRect(2, 2, (w - 4) * frac, h - 4);
    tex.needsUpdate = true;
}

// =====================================================================
//  Spawning
// =====================================================================
function findSpawnFoot() {
    const r = _playerCollider.radius;
    const playerFoot = new THREE.Vector3(_playerCollider.start.x, _playerCollider.start.y - r, _playerCollider.start.z);

    const fwd = new THREE.Vector3();
    _camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();

    const eyePos = playerFoot.clone();
    eyePos.y += 1.5;

    const distances = [16, 12, 20, 8];
    const angles = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, Math.PI];

    for (const dist of distances) {
        for (const angle of angles) {
            const dir = fwd.clone().applyAxisAngle(UP, angle);
            const target = playerFoot.clone().addScaledVector(dir, dist);

            // Is there a wall between the player and this spot?
            const los = _octree.rayIntersect(new THREE.Ray(eyePos, dir));
            if (los && los.distance < dist + 1.5) continue;

            // Find the ground below the spot
            const downRay = new THREE.Ray(new THREE.Vector3(target.x, playerFoot.y + 5, target.z), new THREE.Vector3(0, -1, 0));
            const ground = _octree.rayIntersect(downRay);
            if (!ground || ground.distance > 14) continue;

            const foot = ground.position.clone();

            // Is there room for the enemy's body?
            const probe = new Capsule(
                new THREE.Vector3(foot.x, foot.y + CFG.colliderRadius + 0.1, foot.z),
                new THREE.Vector3(foot.x, foot.y + CFG.colliderRadius + CFG.colliderHeight + 0.1, foot.z),
                CFG.colliderRadius
            );
            const overlap = _octree.capsuleIntersect(probe);
            if (overlap && overlap.depth > 0.05) continue;

            return foot;
        }
    }

    // Fallback: drop it in from above, a short way in front of the player
    return playerFoot.clone().addScaledVector(fwd, 10).add(new THREE.Vector3(0, 4, 0));
}

function spawnEnemy() {
    if (!_scene || !_octree || !_playerCollider) return null;
    if (enemies.length >= CFG.maxEnemies) {
        toast(`MAX ${CFG.maxEnemies} ENEMIES`, '#ffaa00');
        return null;
    }
    ensureShared();

    const foot = findSpawnFoot();

    const mats = {
        body: new THREE.MeshStandardMaterial({ color: 0x9b2226, metalness: 0.5, roughness: 0.5 }),
        dark: new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.6, roughness: 0.5 }),
        eye: new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff3300, emissiveIntensity: 1.5 })
    };
    const model = buildModel(mats);
    const bar = buildHealthBar(model.root);

    const r = CFG.colliderRadius;
    const collider = new Capsule(
        new THREE.Vector3(foot.x, foot.y + r + 0.05, foot.z),
        new THREE.Vector3(foot.x, foot.y + r + 0.05 + CFG.colliderHeight, foot.z),
        r
    );

    const e = {
        id: nextEnemyId++,
        root: model.root,
        body: model.body,
        parts: model.parts,
        mats,
        bar,
        collider,
        velocity: new THREE.Vector3(),
        onFloor: false,
        health: CFG.health,
        maxHealth: CFG.health,
        state: 'alive',
        dyingTime: 0,
        yaw: 0,
        // AI
        holdDist: 8 + Math.random() * 5,
        holdTimer: 4 + Math.random() * 3,
        strafeDir: Math.random() < 0.5 ? -1 : 1,
        strafeTimer: 1 + Math.random() * 2,
        shotTimer: 1.2 + Math.random(),
        meleeTimer: 0,
        windup: 0,
        meleeWind: 0,
        stuckTime: 0,
        stun: 0,
        hitFlash: 0,
        recoil: 0,
        walkPhase: 0
    };

    // Face the player from the start
    _getFlatToPlayer(e, _flat);
    e.yaw = Math.atan2(_flat.x, _flat.z);
    e.root.rotation.y = e.yaw;
    e.root.position.set(foot.x, foot.y, foot.z);

    drawHealthBar(e);
    _scene.add(e.root);
    enemies.push(e);

    toast('ENEMY SPAWNED', '#ff5577');
    return e;
}

// =====================================================================
//  Damage dealing (called from player.js)
// =====================================================================
function distanceToEnemy(e, point) {
    _seg.start.copy(e.collider.start);
    _seg.end.copy(e.collider.end);
    _seg.closestPointToPoint(point, true, _tmpC);
    return _tmpC.distanceTo(point);
}

function damageEnemy(e, amount, direction, knockback = 0) {
    if (e.state !== 'alive' || amount <= 0) return;

    e.health -= amount;
    e.hitFlash = 0.12;
    e.stun = Math.max(e.stun, knockback > 10 ? 0.45 : 0.12);

    if (direction && knockback) {
        _tmpA.copy(direction);
        _tmpA.y = 0;
        if (_tmpA.lengthSq() > 1e-6) {
            _tmpA.normalize();
            e.velocity.x += _tmpA.x * knockback;
            e.velocity.z += _tmpA.z * knockback;
            e.velocity.y += knockback * 0.25;
        }
    }

    if (e.health <= 0) {
        e.health = 0;
        drawHealthBar(e);
        killEnemy(e);
    } else {
        drawHealthBar(e);
    }
}

/**
 * Damages every living enemy whose body is within `radius` of `center`.
 * Used by melee attacks. Returns the number of enemies hit.
 */
function damageEnemiesInSphere(center, radius, damage, direction = null, knockback = 0) {
    let hits = 0;
    for (const e of enemies) {
        if (e.state !== 'alive') continue;
        if (distanceToEnemy(e, center) <= radius + CFG.hitRadius * 0.5) {
            damageEnemy(e, damage, direction, knockback);
            hits++;
        }
    }
    return hits;
}

function killEnemy(e) {
    e.state = 'dying';
    e.dyingTime = 0;
    e.windup = 0;
    e.meleeWind = 0;
    e.bar.sprite.visible = false;
    toast('ENEMY DESTROYED', '#3ddc84');
}

// =====================================================================
//  Effects
// =====================================================================
function addFireball(position, maxScale, duration, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    const mesh = new THREE.Mesh(GEO.sphere, mat);
    mesh.position.copy(position);
    _scene.add(mesh);
    let t = 0;
    effects.push({
        update(dt) {
            t += dt;
            const p = Math.min(1, t / duration);
            mesh.scale.setScalar(maxScale * (0.2 + 0.8 * p));
            mat.opacity = 0.9 * (1 - p);
            return p < 1;
        },
        dispose() {
            _scene.remove(mesh);
            mat.dispose();
        }
    });
}

function addDebris(position, groundY) {
    const mesh = new THREE.Mesh(GEO.box, DEBRIS_MATS[Math.floor(Math.random() * DEBRIS_MATS.length)]);
    const size = 0.25 + Math.random() * 0.55;
    mesh.scale.set(size, size * (0.5 + Math.random()), size);
    mesh.position.copy(position);
    mesh.castShadow = true;
    _scene.add(mesh);

    const vel = new THREE.Vector3((Math.random() - 0.5) * 14, 6 + Math.random() * 10, (Math.random() - 0.5) * 14);
    const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    const life = 1.0 + Math.random() * 0.8;
    let t = 0;
    effects.push({
        update(dt) {
            t += dt;
            vel.y -= 25 * dt;
            mesh.position.addScaledVector(vel, dt);
            mesh.rotation.x += spin.x * dt;
            mesh.rotation.y += spin.y * dt;
            if (mesh.position.y < groundY + size * 0.3) {
                mesh.position.y = groundY + size * 0.3;
                vel.y *= -0.3;
                vel.x *= 0.7;
                vel.z *= 0.7;
            }
            const remain = 1 - t / life;
            if (remain < 0.3) mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 6));
            return t < life;
        },
        dispose() {
            _scene.remove(mesh);
        }
    });
}

function explodeEnemy(e) {
    const center = _tmpA.copy(e.collider.start);
    center.y += 0.8;
    const groundY = e.root.position.y;

    addFireball(center, 3.5, 0.45, 0xff9a2e);
    addFireball(center, 2.0, 0.3, 0xffffff);
    for (let i = 0; i < 16; i++) {
        _tmpB.copy(center);
        _tmpB.x += (Math.random() - 0.5) * 1.5;
        _tmpB.y += Math.random() * 1.5;
        _tmpB.z += (Math.random() - 0.5) * 1.5;
        addDebris(_tmpB, groundY);
    }
}

function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
        if (!effects[i].update(dt)) {
            effects[i].dispose();
            effects.splice(i, 1);
        }
    }
}

// =====================================================================
//  Enemy projectiles
// =====================================================================
function fireShot(e) {
    e.root.updateMatrixWorld(true);
    e.parts.muzzle.getWorldPosition(_tmpA);
    const origin = _tmpA.clone();

    getPlayerCenter(_tmpB);
    const dir = _tmpB.sub(origin).normalize();

    const mat = new THREE.MeshBasicMaterial({ color: 0xff6622 });
    const mesh = new THREE.Mesh(GEO.projectile, mat);
    mesh.position.copy(origin);
    _scene.add(mesh);

    projectiles.push({
        mesh,
        mat,
        velocity: dir.multiplyScalar(CFG.projectileSpeed),
        life: CFG.projectileLife,
        sphere: new THREE.Sphere(origin.clone(), CFG.projectileRadius)
    });

    e.recoil = 1;
}

function removeProjectile(index) {
    const p = projectiles[index];
    _scene.remove(p.mesh);
    p.mat.dispose();
    projectiles.splice(index, 1);
}

function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        if (!p) continue;   // list may have been cleared by a player respawn mid-loop
        p.life -= dt;
        p.sphere.center.addScaledVector(p.velocity, dt);
        p.mesh.position.copy(p.sphere.center);

        if (p.life <= 0) {
            removeProjectile(i);
            continue;
        }

        // Hit the world?
        if (_octree.sphereIntersect(p.sphere)) {
            addFireball(p.sphere.center, 0.9, 0.2, 0xff8833);
            removeProjectile(i);
            continue;
        }

        // Hit the player?
        const seg = getPlayerHitSegment();
        seg.closestPointToPoint(p.sphere.center, true, _tmpC);
        if (_tmpC.distanceTo(p.sphere.center) < CFG.playerHitRadius + CFG.projectileRadius) {
            const hitPos = p.sphere.center.clone();
            removeProjectile(i);   // remove first: damagePlayer() may clear the whole list on death
            damagePlayer(CFG.projectileDamage);
            addFireball(hitPos, 1.0, 0.2, 0xff4422);
        }
    }
}

// =====================================================================
//  Enemy AI + physics
// =====================================================================
function _getFlatToPlayer(e, out) {
    getPlayerCenter(_tmpC);
    out.set(_tmpC.x - e.collider.start.x, 0, _tmpC.z - e.collider.start.z);
    return out;
}

function stepPhysics(e, dt) {
    let damping = Math.exp(-4 * dt) - 1;
    if (!e.onFloor) {
        e.velocity.y -= GRAVITY * dt;
        damping *= 0.1;
    }
    e.velocity.addScaledVector(e.velocity, damping);
}

function resolveWorld(e, dt) {
    e.collider.translate(_tmpA.copy(e.velocity).multiplyScalar(dt));

    const result = _octree.capsuleIntersect(e.collider);
    e.onFloor = false;
    if (result) {
        e.onFloor = result.normal.y > 0;
        if (!e.onFloor) {
            e.velocity.addScaledVector(result.normal, -result.normal.dot(e.velocity));
        }
        if (result.depth >= 1e-10) {
            e.collider.translate(result.normal.multiplyScalar(result.depth));
        }
    }
}

function updateAlive(e, dt) {
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.recoil = Math.max(0, e.recoil - dt * 4);

    const flat = _getFlatToPlayer(e, _flat);
    const dist = flat.length();
    const dir = _dir.copy(flat);
    if (dist > 1e-4) dir.multiplyScalar(1 / dist); else dir.set(0, 0, 1);

    // --- Turn toward the player ---
    const targetYaw = Math.atan2(dir.x, dir.z);
    let diff = ((targetYaw - e.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const maxTurn = CFG.turnSpeed * dt;
    e.yaw += THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);

    // --- Re-roll behaviour timers ---
    e.holdTimer -= dt;
    if (e.holdTimer <= 0) {
        e.holdTimer = 4 + Math.random() * 4;
        e.holdDist = 3 + Math.random() * 11;      // sometimes rushes in to melee, sometimes hangs back
    }
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) {
        e.strafeTimer = 1.5 + Math.random() * 2.5;
        e.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }

    // --- Movement intent ---
    let intent = 0;
    const busy = e.windup > 0 || e.meleeWind > 0;
    if (e.stun <= 0 && !busy) {
        const stopDist = Math.max(e.holdDist, CFG.meleeRange * 0.85);
        if (dist > stopDist) {
            e.velocity.addScaledVector(dir, CFG.walkAccel * dt);
            intent = 1;
        } else if (dist > CFG.meleeRange) {
            // Circle-strafe at mid range
            _tmpA.set(dir.z, 0, -dir.x).multiplyScalar(e.strafeDir);
            e.velocity.addScaledVector(_tmpA, CFG.strafeAccel * dt);
            intent = 1;
        }
    }

    // --- Hop over small obstacles if stuck ---
    const horizSpeed = Math.hypot(e.velocity.x, e.velocity.z);
    if (intent && e.onFloor && horizSpeed < 1.0) {
        e.stuckTime += dt;
        if (e.stuckTime > 0.6) {
            e.velocity.y = 13;
            e.stuckTime = 0;
        }
    } else {
        e.stuckTime = 0;
    }

    // --- Attacks ---
    e.shotTimer -= dt;
    e.meleeTimer -= dt;

    if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) {
            fireShot(e);
            e.shotTimer = CFG.shotCooldown + Math.random() * 0.6;
        }
    } else if (e.meleeWind > 0) {
        e.meleeWind -= dt;
        if (e.meleeWind <= 0) {
            // Strike lands only if the player is still close
            const d = _getFlatToPlayer(e, _tmpB).length();
            const dy = Math.abs(_playerCollider.start.y - e.collider.start.y);
            if (d < CFG.meleeRange + 1.0 && dy < 3.5) {
                damagePlayer(CFG.meleeDamage);
                _playerVelocity.x += dir.x * 14;
                _playerVelocity.z += dir.z * 14;
                _playerVelocity.y += 6;
            }
            e.meleeTimer = CFG.meleeCooldown;
        }
    } else if (e.stun <= 0) {
        if (dist < CFG.meleeRange && e.meleeTimer <= 0) {
            e.meleeWind = CFG.meleeWindup;
        } else if (dist > 5 && dist < 70 && e.shotTimer <= 0) {
            e.windup = CFG.shotWindup;
        }
    }

    // --- Physics ---
    stepPhysics(e, dt);
    resolveWorld(e, dt);

    // --- Animation ---
    const speed = Math.hypot(e.velocity.x, e.velocity.z);
    e.walkPhase += speed * dt * 1.4;
    const swing = Math.sin(e.walkPhase) * 0.6 * Math.min(1, speed / 4);
    e.parts.legL.rotation.x = swing;
    e.parts.legR.rotation.x = -swing;

    // Cannon: raise during windup, kick back on recoil
    const gunTarget = e.windup > 0 ? -1.3 : -0.35;
    e.parts.gun.rotation.x += (gunTarget - e.parts.gun.rotation.x) * Math.min(1, dt * 12);
    e.parts.gun.rotation.x += e.recoil * 0.02;

    // Melee arm swing
    if (e.meleeWind > 0) {
        const p = 1 - e.meleeWind / CFG.meleeWindup;
        e.parts.armL.rotation.x = -p * 2.4;
    } else {
        e.parts.armL.rotation.x *= Math.max(0, 1 - dt * 10);
    }

    // Eye glows brighter when about to attack
    e.mats.eye.emissiveIntensity = (e.windup > 0 || e.meleeWind > 0) ? 5 : 1.5;

    // Hit flash
    if (e.hitFlash > 0) {
        e.mats.body.emissive.setHex(0xffffff);
        e.mats.body.emissiveIntensity = 0.8;
    } else {
        e.mats.body.emissive.setHex(0x000000);
    }
}

function updateDying(e, dt) {
    e.dyingTime += dt;

    stepPhysics(e, dt);
    resolveWorld(e, dt);

    // Stumble forward and flicker red/white
    const p = Math.min(1, e.dyingTime / 0.6);
    e.body.rotation.x = p * 0.5;
    e.mats.body.emissive.setHex(Math.floor(e.dyingTime * 20) % 2 ? 0xff2200 : 0xffffff);
    e.mats.body.emissiveIntensity = 0.9;
    e.mats.eye.emissiveIntensity = 0;

    if (e.dyingTime >= 0.6) {
        explodeEnemy(e);
        removeEnemy(e);
    }
}

function syncVisual(e) {
    e.root.position.set(e.collider.start.x, e.collider.start.y - e.collider.radius - 0.05, e.collider.start.z);
    e.root.rotation.y = e.yaw;
}

function removeEnemy(e) {
    const i = enemies.indexOf(e);
    if (i !== -1) enemies.splice(i, 1);
    _scene.remove(e.root);
    e.mats.body.dispose();
    e.mats.dark.dispose();
    e.mats.eye.dispose();
    e.bar.tex.dispose();
    e.bar.mat.dispose();
}

function separateEnemies() {
    for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
            const a = enemies[i];
            const b = enemies[j];
            const dx = b.collider.start.x - a.collider.start.x;
            const dz = b.collider.start.z - a.collider.start.z;
            const d = Math.hypot(dx, dz);
            const minD = CFG.colliderRadius * 2.6;
            if (d < minD && d > 1e-4) {
                const push = (minD - d) * 0.5;
                const nx = dx / d;
                const nz = dz / d;
                a.collider.translate(_tmpA.set(-nx * push, 0, -nz * push));
                b.collider.translate(_tmpA.set(nx * push, 0, nz * push));
            }
        }
    }
}

function updateSphereHits() {
    if (!_spheres || enemies.length === 0) return;
    const now = performance.now();
    for (const s of _spheres) {
        if (!(s.damage > 0) || now > s.damageUntil) continue;
        for (const e of enemies) {
            if (e.state !== 'alive') continue;
            if (distanceToEnemy(e, s.collider.center) < CFG.hitRadius + s.collider.radius) {
                _tmpB.copy(s.velocity);
                damageEnemy(e, s.damage, _tmpB, s.knockback || 0);
                s.damage = 0;                       // each shot only hurts once
                s.velocity.multiplyScalar(-0.25);   // bounce off the armour
                break;
            }
        }
    }
}

// =====================================================================
//  Public API
// =====================================================================
function initEnemies(scene, camera, worldOctree, playerCollider, playerVelocity, spheres) {
    _scene = scene;
    _camera = camera;
    _octree = worldOctree;
    _playerCollider = playerCollider;
    _playerVelocity = playerVelocity;
    _spheres = spheres;
    ensureShared();

    document.addEventListener('keydown', (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; // don't spawn while typing a callsign
        if (event.code === 'KeyM' && !event.repeat) spawnEnemy();
    });
}

function updateEnemies(dt) {
    if (!_scene) return;

    updateSphereHits();

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.collider.end.y < -40) {      // fell out of the world
            removeEnemy(e);
            continue;
        }
        if (e.state === 'alive') updateAlive(e, dt);
        else updateDying(e, dt);
        if (enemies.includes(e)) syncVisual(e);
    }

    separateEnemies();
    updateProjectiles(dt);
    updateEffects(dt);
    updateShieldRegen(dt);
}

function getEnemyCount() {
    return enemies.length;
}

export {
    initEnemies,
    updateEnemies,
    spawnEnemy,
    damageEnemiesInSphere,
    getEnemyCount
};
