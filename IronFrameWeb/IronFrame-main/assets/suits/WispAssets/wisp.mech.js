/* =========================================================
   WISP-R — Recon Frame 3D asset
   Slender, lightweight mobile suit. Very high mobility, low
   armor, moderate firepower. Tall sensor antenna, wide
   thruster wings.
   Exposes window.MechBuilders.wisp(THREE)
   ========================================================= */
(function () {
    'use strict';

    function build(THREE) {
        const mats = {
            hull: new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.3, metalness: 0.25 }),
            accent: new THREE.MeshStandardMaterial({ color: 0x7fd1ff, roughness: 0.3, metalness: 0.4 }),
            cockpit: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.2 }),
            joint: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.55, metalness: 0.4 }),
            sensor: new THREE.MeshStandardMaterial({ color: 0xffb627, roughness: 0.25, metalness: 0.5, emissive: 0x442200, emissiveIntensity: 0.4 }),
            wing: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.5 })
        };

        function mesh(geo, mat) {
            const m = new THREE.Mesh(geo, mat);
            m.castShadow = true;
            m.receiveShadow = true;
            return m;
        }

        const root = new THREE.Group();
        root.position.y = 1;

        // Slim pelvis
        const pelvis = mesh(new THREE.BoxGeometry(0.9, 0.6, 0.7), mats.hull);
        pelvis.position.y = 1.5;
        root.add(pelvis);

        // Narrow torso
        const torso = mesh(new THREE.BoxGeometry(1.3, 1.4, 0.85), mats.accent);
        torso.position.y = 2.65;
        root.add(torso);

        // Cockpit hatch
        const hatch = mesh(new THREE.BoxGeometry(0.6, 0.7, 0.95), mats.cockpit);
        hatch.position.y = 2.6;
        root.add(hatch);

        // Slim head
        const head = mesh(new THREE.BoxGeometry(0.6, 0.7, 0.65), mats.hull);
        head.position.y = 3.65;
        root.add(head);

        // Visor
        const visor = mesh(new THREE.BoxGeometry(0.5, 0.1, 0.08), mats.sensor);
        visor.position.set(0, 3.68, 0.34);
        root.add(visor);

        // Tall recon sensor antenna
        const antenna = mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.6, 6), mats.sensor);
        antenna.position.set(0, 4.6, 0.05);
        root.add(antenna);
        const antennaTip = mesh(new THREE.SphereGeometry(0.09, 8, 8), mats.sensor);
        antennaTip.position.set(0, 5.4, 0.05);
        root.add(antennaTip);

        // Wide backpack thruster wings (mobility)
        [-1, 1].forEach(function (side) {
            const wing = mesh(new THREE.BoxGeometry(1.6, 0.12, 0.7), mats.wing);
            wing.position.set(side * 1.15, 2.75, -0.7);
            wing.rotation.z = side * -0.15;
            root.add(wing);

            const thruster = mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 10), mats.accent);
            thruster.rotation.x = Math.PI / 2;
            thruster.position.set(side * 1.7, 2.75, -0.9);
            root.add(thruster);
        });

        // Thin arms
        const lArm = mesh(new THREE.BoxGeometry(0.42, 1.9, 0.42), mats.joint);
        lArm.position.set(-0.95, 2.55, 0);
        root.add(lArm);

        const lPauldron = mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), mats.hull);
        lPauldron.position.set(-0.98, 3.15, 0);
        root.add(lPauldron);

        // Right arm (weapon arm)
        const rightArmGroup = new THREE.Group();
        rightArmGroup.position.set(0.95, 3.0, 0);

        const rPauldron = mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), mats.hull);
        rightArmGroup.add(rPauldron);

        const rArm = mesh(new THREE.BoxGeometry(0.4, 0.4, 2.1), mats.joint);
        rArm.position.set(0, -0.45, 0.85);
        rightArmGroup.add(rArm);

        const gun = mesh(new THREE.BoxGeometry(0.3, 0.32, 2.4), mats.joint);
        gun.position.set(0, -0.45, 1.7);
        rightArmGroup.add(gun);

        root.add(rightArmGroup);

        // Slender legs
        const lLeg = mesh(new THREE.BoxGeometry(0.5, 2.6, 0.55), mats.hull);
        lLeg.position.set(-0.38, 0.25, 0);
        root.add(lLeg);

        const rLeg = mesh(new THREE.BoxGeometry(0.5, 2.6, 0.55), mats.hull);
        rLeg.position.set(0.38, 0.25, 0);
        root.add(rLeg);

        return {
            root: root,
            rightArmGroup: rightArmGroup,
            gunMuzzleLocal: new THREE.Vector3(0, -0.45, 2.85),
            cockpitLocal: new THREE.Vector3(0, 3.6, 0.1)
        };
    }

    window.MechBuilders = window.MechBuilders || {};
    window.MechBuilders.wisp = build;
})();
