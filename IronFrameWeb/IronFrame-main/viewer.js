// viewer.js
window.addEventListener('DOMContentLoaded', () => {
    // 1. Target the UI frame container in your hero section
    const container = document.querySelector('.hero-schema');
    if (!container) {
        console.error('3D Viewer: .hero-schema container not found.');
        return;
    }

    // Determine initial dimensions from container style or defaults
    const getWidth = () => container.clientWidth || 400;
    const getHeight = () => container.clientHeight || 400;

    // 2. Setup Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e14); // Dark HUD-style backdrop

    // 3. Setup Camera
    const camera = new THREE.PerspectiveCamera(45, getWidth() / getHeight(), 0.1, 100);
    camera.position.set(6, 6, 8);

    // 4. Setup Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(getWidth(), getHeight());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Append 3D Canvas into the HUD container
    container.appendChild(renderer.domElement);

    // 5. Orbit Controls Setup
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2.5, 0); // Focus on the center of the mech
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Prevent camera from going under the floor
    controls.update();

    // 6. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(8, 12, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Soft cyan rim light for mecha aesthetic
    const rimLight = new THREE.DirectionalLight(0x7fd1ff, 0.4);
    rimLight.position.set(-8, 5, -8);
    scene.add(rimLight);

    // Tech Grid Floor
    const grid = new THREE.GridHelper(20, 20, 0x4a90c4, 0x1e293b);
    grid.position.y = 0;
    scene.add(grid);

    // 7. Instantiate Mech
    let bastionInstance = null;
    if (window.MechBuilders && typeof window.MechBuilders.bastion === 'function') {
        bastionInstance = window.MechBuilders.bastion(THREE);
        scene.add(bastionInstance.root);
    } else {
        console.warn('3D Viewer: window.MechBuilders.bastion function not found.');
    }

    // 8. Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // 9. Container Resize Observer (handles window resizing and dynamic UI layout changes)
    const resizeObserver = new ResizeObserver(() => {
        const width = getWidth();
        const height = getHeight();
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });

    resizeObserver.observe(container);
});