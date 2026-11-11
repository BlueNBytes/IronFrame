(function () {
    const buildKey = 'ironframe_game_loadout';
    const frames = {
        RX68: {
            name: 'RX-68 VANGUARD',
            role: 'Heavy Defender',
            shields: 85,
            health: 50,
            mobility: 20,
            model: 'Game/assets/Player.glb'
        },
        ALYSNES: {
            name: 'ALYSNES STRIKER',
            role: 'High-Speed Scout',
            shields: 10,
            health: 30,
            mobility: 30,
            model: 'Game/assets/alysnes.glb'
        },
        NOVAX: {
            name: 'NOVAX OVERDRIVE',
            role: 'Assault Frame',
            shields: 95,
            health: 20,
            mobility: 40,
            model: 'Game/assets/Mech1.glb'
        },
        FrostFrame: {
            name: 'FROSTFRAME',
            role: 'Medium Attacker',
            shields: 40,
            health: 40,
            mobility: 40,
            model: 'Game/assets/FrostFrame.glb'
        },
        BlackBirdFrame: {
            name: 'BLACKBIRD',
            role: 'Light Attacker',
            shields: 35,
            health: 45,
            mobility: 40,
            model: 'Game/assets/BlackBird.glb'
        }
    };
    const weapons = [
        { id: 'beamsaber', name: 'Beam Saber', type: 'Melee', damage: 60, ammo: '∞' },
        { id: 'EnergyGun', name: 'Energy Gun', type: 'Ranged', damage: 25, ammo: '25' },
        { id: 'LightBazooka', name: 'Light Bazooka', type: 'Heavy', damage: 100, ammo: '5' }
    ];
    const defaultWeapons = weapons.map(weapon => weapon.id);
    const frameAliases = { bastion: 'RX68', vesper: 'ALYSNES', wisp: 'NOVAX' };

    function readBuild() {
        try {
            const build = JSON.parse(localStorage.getItem(buildKey) || 'null');
            if (build && frames[build.suit] && Array.isArray(build.weapons) &&
                build.weapons.length === weapons.length &&
                build.weapons.every(id => weapons.some(weapon => weapon.id === id)) &&
                new Set(build.weapons).size === weapons.length) {
                return build;
            }
        } catch (error) {
            console.warn('Could not read the saved game loadout:', error);
        }
        return null;
    }

    function init(frameName) {
        const root = document.querySelector('[data-rythm-root]');
        if (!root) {
            console.error('Mech builder root was not found.');
            return;
        }

        const initialFrame = frameAliases[String(frameName).toLowerCase()] || frameName;
        const savedBuild = readBuild();
        const state = {
            suit: frames[initialFrame] ? initialFrame : (savedBuild ? savedBuild.suit : 'RX68'),
            weapons: savedBuild ? savedBuild.weapons.slice() : defaultWeapons.slice()
        };

        root.innerHTML = `
            <section class="builder-preview hud-frame" aria-label="Selected game frame">
                <div class="frame-id">
                    <b data-frame-name></b><span data-frame-class></span>
                </div>
                <div class="builder-visual">
                    <div class="game-frame-display">
                        <div class="frame-scan"></div>
                        <div class="frame-status">GAME ASSET LINKED</div>
                        <div class="frame-core">IF</div>
                        <div class="frame-model" data-frame-model></div>
                    </div>
                </div>
                <div class="stat-sheet">
                    <div class="spec-row"><span>Shields</span><b data-stat="shields"></b></div>
                    <div class="spec-bar"><i data-bar="shields"></i></div>
                    <div class="spec-row"><span>Health</span><b data-stat="health"></b></div>
                    <div class="spec-bar"><i data-bar="health"></i></div>
                    <div class="spec-row"><span>Mobility</span><b data-stat="mobility"></b></div>
                    <div class="spec-bar"><i data-bar="mobility"></i></div>
                </div>
            </section>
            <section class="controls-panel hud-frame" aria-label="Game loadout configuration">
                <div class="control-row">
                    <label class="label" for="game-frame">Combat frame</label>
                    <select class="rythm-select" id="game-frame" data-frame-select></select>
                </div>
                <div class="weapon-slots">
                    ${weapons.map((weapon, index) => `
                        <div class="control-row weapon-row">
                            <label class="label" for="weapon-slot-${index + 1}">
                                Game slot ${index + 1} <span class="current" data-weapon-info="${index}"></span>
                            </label>
                            <select class="rythm-select" id="weapon-slot-${index + 1}" data-weapon-slot="${index}"></select>
                        </div>
                    `).join('')}
                </div>
                <div class="weapon-reference">
                    ${weapons.map(weapon => `
                        <div><b>${weapon.name}</b><span>${weapon.type} · ${weapon.damage} DMG · ${weapon.ammo} ammo</span></div>
                    `).join('')}
                </div>
                <div class="builder-actions">
                    <button class="btn btn-primary" type="button" data-rythm-save>Save Loadout</button>
                    <button class="btn btn-ghost" type="button" data-rythm-reset>Reset Loadout</button>
                    <a class="btn btn-primary" href="../../../Game/index.html">Deploy to Game →</a>
                </div>
                <div class="build-status" data-build-status aria-live="polite"></div>
            </section>
        `;

        const frameSelect = root.querySelector('[data-frame-select]');
        frameSelect.innerHTML = Object.entries(frames).map(([id, frame]) =>
            `<option value="${id}">${frame.name}</option>`
        ).join('');
        frameSelect.value = state.suit;

        const slots = [...root.querySelectorAll('[data-weapon-slot]')];
        slots.forEach((select, index) => {
            select.innerHTML = weapons.map(weapon =>
                `<option value="${weapon.id}">${weapon.name}</option>`
            ).join('');
            select.value = state.weapons[index];
            select.addEventListener('change', () => {
                const usedByAnotherSlot = slots.some(other => other !== select && other.value === select.value);
                if (usedByAnotherSlot) {
                    root.querySelector('[data-build-status]').textContent = 'Each game weapon can only be equipped once.';
                    select.value = state.weapons[index];
                    return;
                }
                state.weapons[index] = select.value;
                updateWeaponInfo();
            });
        });

        function updateWeaponInfo() {
            slots.forEach((select, index) => {
                const weapon = weapons.find(item => item.id === select.value);
                root.querySelector(`[data-weapon-info="${index}"]`).textContent =
                    `${weapon.type} · ${weapon.damage} damage · ${weapon.ammo} ammo`;
            });
        }

        function renderFrame() {
            const frame = frames[state.suit];
            root.querySelector('[data-frame-name]').textContent = frame.name;
            root.querySelector('[data-frame-class]').textContent = frame.role;
            root.querySelector('[data-frame-model]').textContent = frame.model;
            ['shields', 'health', 'mobility'].forEach(stat => {
                root.querySelector(`[data-stat="${stat}"]`).textContent = frame[stat];
                root.querySelector(`[data-bar="${stat}"]`).style.width = `${frame[stat]}%`;
            });
        }

        frameSelect.addEventListener('change', () => {
            state.suit = frameSelect.value;
            renderFrame();
        });

        root.querySelector('[data-rythm-save]').addEventListener('click', () => {
            const build = { suit: state.suit, weapons: state.weapons.slice() };
            try {
                localStorage.setItem(buildKey, JSON.stringify(build));
                localStorage.setItem('selectedSuit', state.suit);
                root.querySelector('[data-build-status]').textContent =
                    `${frames[state.suit].name} and weapon slots saved.`;
            } catch (error) {
                console.error('Could not save the game loadout:', error);
                root.querySelector('[data-build-status]').textContent = 'Could not save loadout. Check browser storage settings.';
            }
        });

        root.querySelector('[data-rythm-reset]').addEventListener('click', () => {
            state.suit = initialFrame in frames ? initialFrame : 'RX68';
            state.weapons = defaultWeapons.slice();
            frameSelect.value = state.suit;
            slots.forEach((select, index) => { select.value = state.weapons[index]; });
            root.querySelector('[data-build-status]').textContent = 'Default frame and weapons restored. Save to apply in game.';
            updateWeaponInfo();
            renderFrame();
        });

        updateWeaponInfo();
        renderFrame();
    }

    window.Rythm = { init };
})();
