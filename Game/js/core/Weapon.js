/**
 * Weapon.js - Weapon arsenal and ammo management
 */

const reloadtime = 10; // Global/heavy bazooka reload reference

const beamsaber = {
    id: 'beamsaber',
    name: 'Beam Saber',
    type: 'melee',
    icon: '⚔️',
    color: '#ff4bd8',
    damage: 60,
    ammo: Infinity,
    maxAmmo: Infinity,
    reloadTime: 0,
    impulse: 40,
    fireRate: 0.35, // Cooldown in seconds
    lastFireTime: -9999,
    description: 'High-energy plasma blade for close-quarters kinetic strikes'
};

const EnergyGun = {
    id: 'EnergyGun',
    name: 'Energy Gun',
    type: 'ranged',
    icon: '⚡',
    color: '#70e1ff',
    damage: 25,
    ammo: 25,
    maxAmmo: 25,
    reloadTime: 2.2,
    impulse: 30,
    fireRate: 0.2,
    speed: 75,
    lastFireTime: -9999,
    description: 'Rapid-fire pulse blaster with concentrated thermal energy'
};

const LightBazooka = {
    id: 'LightBazooka',
    name: 'Light Bazooka',
    type: 'heavy',
    icon: '💥',
    color: '#ff8a2b',
    damage: 100,
    ammo: 5,
    maxAmmo: 5,
    reloadTime: reloadtime, // 10s reload time
    impulse: 65,
    fireRate: 1.0,
    speed: 40,
    lastFireTime: -9999,
    description: 'Heavy explosive artillery shell with massive kinetic displacement'
};

const defaultWeapons = [beamsaber, EnergyGun, LightBazooka];
const weaponById = new Map(defaultWeapons.map(weapon => [weapon.id, weapon]));

function getSavedWeapons() {
    try {
        const saved = JSON.parse(localStorage.getItem('ironframe_game_loadout') || 'null');
        if (!saved) return defaultWeapons;
        if (!Array.isArray(saved.weapons) || saved.weapons.length !== defaultWeapons.length ||
            !saved.weapons.every(id => weaponById.has(id)) || new Set(saved.weapons).size !== defaultWeapons.length) {
            console.warn('Saved weapon loadout is invalid; using the default weapon order.');
            return defaultWeapons;
        }
        return saved.weapons.map(id => weaponById.get(id));
    } catch (error) {
        console.warn('Could not read saved weapon loadout; using the default weapon order:', error);
        return defaultWeapons;
    }
}

const currentweapons = getSavedWeapons();

let activeWeaponIndex = 0;
let reloading = false;
let reloadTimer = null;

function getActiveWeapon() {
    return currentweapons[activeWeaponIndex];
}

function setActiveWeapon(indexOrId) {
    if (reloading) {
        clearTimeout(reloadTimer);
        reloading = false;
        reloadTimer = null;
    }

    if (typeof indexOrId === 'number') {
        if (indexOrId >= 0 && indexOrId < currentweapons.length) {
            activeWeaponIndex = indexOrId;
        }
    } else if (typeof indexOrId === 'string') {
        const foundIdx = currentweapons.findIndex(w => w.id === indexOrId || w.name.toLowerCase() === indexOrId.toLowerCase());
        if (foundIdx !== -1) {
            activeWeaponIndex = foundIdx;
        }
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('weapon-changed', {
            detail: { weapon: getActiveWeapon(), index: activeWeaponIndex }
        }));
    }

    return getActiveWeapon();
}

function switchNextWeapon() {
    return setActiveWeapon((activeWeaponIndex + 1) % currentweapons.length);
}

function switchPrevWeapon() {
    return setActiveWeapon((activeWeaponIndex - 1 + currentweapons.length) % currentweapons.length);
}

function fireActiveWeapon() {
    const weapon = getActiveWeapon();
    const now = performance.now() / 1000;

    if (reloading) {
        return { success: false, reason: 'reloading', weapon };
    }

    if (now - (weapon.lastFireTime || -9999) < weapon.fireRate) {
        return { success: false, reason: 'cooldown', weapon };
    }

    if (weapon.ammo <= 0) {
        return { success: false, reason: 'out_of_ammo', weapon };
    }

    if (weapon.ammo !== Infinity) {
        weapon.ammo--;
    }

    weapon.lastFireTime = now;

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('weapon-fired', {
            detail: { weapon, ammo: weapon.ammo }
        }));
    }

    return {
        success: true,
        weapon,
        ammo: weapon.ammo,
        impulse: weapon.impulse,
        speed: weapon.speed || 50,
        color: weapon.color,
        type: weapon.type
    };
}

function reloadActiveWeapon(onComplete) {
    const weapon = getActiveWeapon();

    if (weapon.ammo === weapon.maxAmmo || weapon.ammo === Infinity || reloading) {
        return false;
    }

    reloading = true;
    const duration = (weapon.reloadTime || reloadtime) * 1000;

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('weapon-reload-start', {
            detail: { weapon, duration }
        }));
    }

    if (reloadTimer) clearTimeout(reloadTimer);

    reloadTimer = setTimeout(() => {
        weapon.ammo = weapon.maxAmmo;
        reloading = false;
        reloadTimer = null;

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('weapon-reload-complete', {
                detail: { weapon, ammo: weapon.ammo }
            }));
        }

        if (onComplete) onComplete(weapon);
    }, duration);

    return true;
}

function isReloading() {
    return reloading;
}

export {
    currentweapons,
    reloadtime,
    beamsaber,
    EnergyGun,
    LightBazooka,
    getActiveWeapon,
    setActiveWeapon,
    switchNextWeapon,
    switchPrevWeapon,
    fireActiveWeapon,
    reloadActiveWeapon,
    isReloading
};
