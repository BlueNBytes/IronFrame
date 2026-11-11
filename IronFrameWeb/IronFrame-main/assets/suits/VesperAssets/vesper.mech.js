/* =========================================================
   VESPER-A — Assault Frame 3D asset
   Sleek, medium-weight mobile suit. High mobility, moderate
   armor, strong firepower. Twin thrusters, single V-fin.
   Exposes window.MechBuilders.vesper(THREE)
   ========================================================= */
(function () {
    'use strict';

    function build(THREE) {
        const mats = {
            hull: new THREE.MeshStandardMaterial({ color: 0xe7edf2, roughness: 0.35, metalness: 0.25 }),
            accent: new THREE.MeshStandardMaterial({ color: 0x4a90c4, roughness: 0.4, metalness: 0.3 }),
            cockpit: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.2 }),
            joint: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.4 }),
            vfin: new THREE.MeshStandardMaterial({ color: 0xffb627, roughness: 0.3, metalness: 0.5, emissive: 0x442200, emissiveIntensity: 0.3 }),
            thruster: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.3, metalness: 0.6, emissive: 0x0a1a5c, emissiveIntensity: 0.4 })
        };

        function mesh(geo, mat) {
            const m = new THREE.Mesh(geo, mat);
            m.castShadow = true;
            m.receiveShadow = true;
            return m;
        }

        const root = new THREE.Group();
        root.position.y = 1;

        // Pelvis
        const pelvis = mesh(new THREE.BoxGeometry(1.2, 0.8, 1), mats.hull);
        pelvis.position.y = 1.4;
        root.add(pelvis);

        // Torso
        const torso = mesh(new THREE.BoxGeometry(1.8, 1.5, 1.2), mats.accent);
        torso.position.y = 2.6;
        root.add(torso);

        // Cockpit hatch
        const hatch = mesh(new THREE.BoxGeometry(0.8, 0.8, 1.3), mats.cockpit);
        hatch.position.y = 2.5;
        root.add(hatch);

        // Head
        const head = mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mats.hull);
        head.position.y = 3.6;
        root.add(head);

        // Camera-facing visor slit (so first-person eye height reads correctly)
        const visor = mesh(new THREE.BoxGeometry(0.7, 0.15, 0.1), mats.thruster);
        visor.position.set(0, 3.65, 0.46);
        root.add(visor);

        // V-Fin
        const vFin = mesh(new THREE.ConeGeometry(0.1, 1.2, 4), mats.vfin);
        vFin.position.set(0, 4, 0.5);
        vFin.rotation.x = Math.PI / 4;
        vFin.rotation.z = Math.PI / 2;
        root.add(vFin);

        // Backpack twin thrusters
        [-0.5, 0.5].forEach(function (x) {
            const thruster = mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.1, 12), mats.thruster);
            thruster.rotation.x = Math.PI / 2;
            thruster.position.set(x, 2.6, -0.9);
            root.add(thruster);
        });

        // Left arm
        const lArm = mesh(new THREE.BoxGeometry(0.6, 2, 0.6), mats.joint);
        lArm.position.set(-1.3, 2.5, 0);
        root.add(lArm);

        const lPauldron = mesh(new THREE.BoxGeometry(1, 1, 1), mats.hull);
        lPauldron.position.set(-1.4, 3.2, 0);
        root.add(lPauldron);

        // Right arm (weapon arm)
        const rightArmGroup = new THREE.Group();
        rightArmGroup.position.set(1.3, 3, 0);

        const rPauldron = mesh(new THREE.BoxGeometry(1, 1, 1), mats.hull);
        rightArmGroup.add(rPauldron);

        const rArm = mesh(new THREE.BoxGeometry(0.6, 0.6, 2.5), mats.joint);
        rArm.position.set(0, -0.5, 1);
        rightArmGroup.add(rArm);

        const gun = mesh(new THREE.BoxGeometry(0.4, 0.5, 3), mats.joint);
        gun.position.set(0, -0.5, 2);
        rightArmGroup.add(gun);

        root.add(rightArmGroup);

        // Legs
        const lLeg = mesh(new THREE.BoxGeometry(0.7, 2.5, 0.8), mats.hull);
        lLeg.position.set(-0.5, 0.2, 0);
        root.add(lLeg);

        const rLeg = mesh(new THREE.BoxGeometry(0.7, 2.5, 0.8), mats.hull);
        rLeg.position.set(0.5, 0.2, 0);
        root.add(rLeg);

        return {
            root: root,
            rightArmGroup: rightArmGroup,
            gunMuzzleLocal: new THREE.Vector3(0, -0.5, 3.5),
            cockpitLocal: new THREE.Vector3(0, 3.55, 0.15)
        };
    }

    window.MechBuilders = window.MechBuilders || {};
    window.MechBuilders.vesper = build;
})();
