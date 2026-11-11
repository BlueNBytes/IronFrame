/* =========================================================
   BASTION-K — Heavy Support Frame 3D asset
   Bulky, high-armor mobile suit. Low mobility, heavy armor,
   moderate firepower. Armored dome head, shoulder pods,
   shield-generator backpack.
   Exposes window.MechBuilders.bastion(THREE)
   ========================================================= */
(function () {
    'use strict';

    function build(THREE) {
        const mats = {
            hull: new THREE.MeshStandardMaterial({ color: 0xc7d3dc, roughness: 0.5, metalness: 0.3 }),
            accent: new THREE.MeshStandardMaterial({ color: 0xffb627, roughness: 0.45, metalness: 0.35 }),
            cockpit: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.2 }),
            joint: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.4 }),
            dome: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.5 }),
            shield: new THREE.MeshStandardMaterial({ color: 0x7fd1ff, roughness: 0.25, metalness: 0.6, emissive: 0x0a2a3a, emissiveIntensity: 0.35 })
        };

        function mesh(geo, mat) {
            const m = new THREE.Mesh(geo, mat);
            m.castShadow = true;
            m.receiveShadow = true;
            return m;
        }

        const root = new THREE.Group();
        root.position.y = 1;

        // Wide pelvis
        const pelvis = mesh(new THREE.BoxGeometry(1.6, 0.9, 1.3), mats.hull);
        pelvis.position.y = 1.3;
        root.add(pelvis);

        // Broad torso
        const torso = mesh(new THREE.BoxGeometry(2.4, 1.8, 1.6), mats.accent);
        torso.position.y = 2.6;
        root.add(torso);

        // Cockpit hatch
        const hatch = mesh(new THREE.BoxGeometry(0.9, 0.9, 1.6), mats.cockpit);
        hatch.position.y = 2.55;
        root.add(hatch);

        // Armored dome head (rounded, low-profile)
        const head = mesh(new THREE.SphereGeometry(0.65, 12, 10), mats.dome);
        head.scale.set(1, 0.85, 1);
        head.position.y = 3.85;
        root.add(head);

        // Visor band
        const visor = mesh(new THREE.BoxGeometry(0.8, 0.14, 0.15), mats.shield);
        visor.position.set(0, 3.85, 0.58);
        root.add(visor);

        // Shoulder missile pods
        [-1.55, 1.55].forEach(function (x) {
            const pod = mesh(new THREE.BoxGeometry(1, 1.2, 1.4), mats.hull);
            pod.position.set(x, 3.2, -0.1);
            root.add(pod);

            for (let i = 0; i < 2; i++) {
                const tube = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.6, 8), mats.joint);
                tube.rotation.x = Math.PI / 2;
                tube.position.set(x + (i === 0 ? -0.25 : 0.25), 3.2, -0.85);
                root.add(tube);
            }
        });

        // Backpack shield generator
        const shieldGen = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 16), mats.shield);
        shieldGen.rotation.x = Math.PI / 2;
        shieldGen.position.set(0, 2.7, -1.05);
        root.add(shieldGen);

        // Left arm (heavy)
        const lArm = mesh(new THREE.BoxGeometry(0.8, 2.1, 0.8), mats.joint);
        lArm.position.set(-1.7, 2.35, 0);
        root.add(lArm);

        const lPauldron = mesh(new THREE.BoxGeometry(1.2, 1.1, 1.2), mats.hull);
        lPauldron.position.set(-1.75, 3.25, 0);
        root.add(lPauldron);

        // Right arm (weapon arm)
        const rightArmGroup = new THREE.Group();
        rightArmGroup.position.set(1.7, 3.1, 0);

        const rPauldron = mesh(new THREE.BoxGeometry(1.2, 1.1, 1.2), mats.hull);
        rightArmGroup.add(rPauldron);

        const rArm = mesh(new THREE.BoxGeometry(0.75, 0.75, 2.4), mats.joint);
        rArm.position.set(0, -0.55, 1);
        rightArmGroup.add(rArm);

        const gun = mesh(new THREE.BoxGeometry(0.55, 0.65, 3.4), mats.joint);
        gun.position.set(0, -0.55, 2.3);
        rightArmGroup.add(gun);

        root.add(rightArmGroup);

        // Thick legs
        const lLeg = mesh(new THREE.BoxGeometry(0.9, 2.3, 1), mats.hull);
        lLeg.position.set(-0.65, 0.15, 0);
        root.add(lLeg);

        const rLeg = mesh(new THREE.BoxGeometry(0.9, 2.3, 1), mats.hull);
        rLeg.position.set(0.65, 0.15, 0);
        root.add(rLeg);

        return {
            root: root,
            rightArmGroup: rightArmGroup,
            gunMuzzleLocal: new THREE.Vector3(0, -0.55, 4),
            cockpitLocal: new THREE.Vector3(0, 3.75, 0.2)
        };
    }

    window.MechBuilders = window.MechBuilders || {};
    window.MechBuilders.bastion = build;
})();
