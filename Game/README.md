# 3D Game Template Ultimate

An opinionated Three.js starter project for building a first/third-person physics-driven playground. The template focuses on modular architecture, animated Mixamo characters, collision-ready environments, and developer-friendly tooling so you can iterate quickly on new mechanics.

## Table of Contents
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Local Development](#local-development)
- [Gameplay Controls](#gameplay-controls)
  - [Keyboard & Mouse](#keyboard--mouse)
  - [GUI Controls](#gui-controls)
- [Systems Overview](#systems-overview)
  - [Scene Setup](#scene-setup)
  - [Player Controller](#player-controller)
  - [Physics & Collisions](#physics--collisions)
  - [Asset Loading & UI](#asset-loading--ui)
- [Animation Pipeline](#animation-pipeline)
- [Configuration & Persistence](#configuration--persistence)
- [Assets](#assets)
- [Extending the Template](#extending-the-template)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Key Features
- **Hybrid First/Third-Person Controller** – Toggle views (key `V` or GUI). Third-person supports scroll-wheel zoom; first-person keeps tight framing.
- **Mixamo Character Animation** – Smooth Idle/Walk/Run blending, synchronized transitions, and running detection tied to input state.
- **Physics Playground** – Capsule-based player collider, 100 interactive spheres with gravitational physics, and robust octree collision detection.
- **GLTF Environment Loading** – Streams a collision-ready GLB scene, applies PBR tweaks, and constructs a world octree on the fly.
- **Developer UX** – Dedicated GUI panel for view mode, visibility toggles, fog, model scale, far plane, etc., persisted via `localStorage`.
- **Movable panels** – Drag the HUD panels and lil-gui settings window by their headers; panel positions persist in `localStorage`.
- **Responsive UI & Loading Screen** – Animated splash screen with progress meter, minimal overlay for stats/info, and hotkeys to hide UI or GUI.

## Technology Stack
- [Three.js 0.163.0](https://threejs.org/) – WebGL renderer and math/geometry utilities (via import maps from CDN).
- [three/addons](https://threejs.org/docs/#manual/en/introduction/Addons) – GLTFLoader, Octree, Capsule, Stats, lil-gui, etc.
- [stats.js](https://github.com/mrdoob/stats.js/) – Frame timing overlay.
- [lil-gui](https://lil-gui.georgealways.com/) – Runtime inspector and controls.
- [Vite-compatible bundling optional] – The template is module-native; no build step required for local development.

## Project Structure
```
├── assets/
│   ├── low_poly_industrial_zone.glb      # Default collision world
│   └── uploads_files_4359726_city+2.glb  # Alternate environment
├── css/
│   └── style.css                         # Global styles + loading screen
├── js/
│   ├── core/
│   │   ├── player.js        # Player controller, animations, camera logic
│   │   └── sceneSetup.js    # Scene, camera, renderer, lights, stats
│   ├── physics/
│   │   └── physics.js       # Sphere physics, octree world, gravity
│   ├── utils/
│   │   └── loader.js        # GLTF loading, GUI setup, persistence
│   └── main.js              # Application entry point / game loop
├── server.js                # Static file and multiplayer room server
├── package.json             # Server dependency and start script
├── index.html               # Primary app shell (loading screen + scripts)
├── initial.html             # Alternate programmatic environment demo
├── source.html              # Upstream reference implementation
└── README.md                # You are here
```

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+ and npm.
- A modern browser with WebGL 2 (Chrome, Edge, Firefox, etc.).

### Installation
```bash
# clone the repository
git clone https://github.com/<your-account>/3D-Game-Template-Ultimate.git
cd 3D-Game-Template-Ultimate
```

### Local Development
Because the project loads modules and assets, run it from an HTTP server (file URLs trigger CORS). Install the server dependency and start the game server:

```bash
npm install
npm start
```
Then open [http://localhost:3000](http://localhost:3000). This server hosts the game and its multiplayer WebSocket endpoint.

> **Tip:** If you see `Cross origin requests are only supported for protocol schemes...`, you are opening the file directly instead of over HTTP.

### Multiplayer
- Enter a callsign and select **Create room** in-game. Share the generated six-character code with other pilots.
- Friends open the same game server URL, enter the code, and select **Join room**. Rooms support up to eight pilots.
- Player positions, facing direction, and selected suits are synchronized in real time. Room state is held in memory and disappears when everyone leaves or the server restarts.
- To play over the internet, deploy `npm start` on a publicly reachable Node.js 18+ host that supports WebSocket upgrades, and serve the game from that same origin. HTTPS deployments must proxy `/multiplayer` as a secure WebSocket (`wss://`).
- The server is a room/presence relay; enemy state, damage, and world physics are still local to each player's browser.

## Gameplay Controls

### Keyboard & Mouse
| Action | Input |
| ------ | ----- |
| Toggle GUI & UI overlay | `G` |
| Toggle first/third-person view | `V` |
| Move | `W` `A` `S` `D` (or arrow keys) |
| Run / Sprint | Hold `Shift` while moving |
| Jump | `Space` |
| Look | Mouse (requires pointer lock; click canvas) |
| Fire Active Weapon | Mouse Left Click |
| Switch Weapon | `1` (Beam Saber), `2` (Energy Gun), `3` (Light Bazooka) or `T` |
| Reload Weapon | `R` |
| Quick Melee Strike | `F` |
| Zoom in/out (third person) | Mouse scroll wheel |

Additional behaviors:
- Falling below Y = -25 automatically teleports you back to the spawn point.
- Projectiles and weapons inherit momentum and apply dynamic kinetic impulse.
- Mobility suits modify movement speed (RX-68 base 20, ALYSNES 30, NOVAX 40).
- Suit selection is configured in `Select.html` or via the in-game HUD link and persisted in `localStorage`.

### GUI Controls
The lil-gui panel (toggled alongside the UI overlay with `G`) provides:
- Drag the settings panel by its title bar; drag HUD panels by their labeled headers.
- **Visibility** – Show/hide the overlay and panel together.
- **Controls → Camera View** – Switch between `Third Person` and `First Person` (mirrors `V`).
- **Fog distance, model scale, camera far plane** – immediately reflected in scene.
- All settings persist via `localStorage` under the `visibilitySettings` key.

## Systems Overview

### Scene Setup
File: [`js/core/sceneSetup.js`](js/core/sceneSetup.js)
- Creates `THREE.Scene` with fog+sky color.
- Configures `PerspectiveCamera` (FOV 70°, near 0.1, far configurable).
- Adds hemisphere + directional lights, enabling VSM shadows.
- Sets up `WebGLRenderer` with ACES tone mapping.
- Exposes the shared `Stats` instance for FPS monitoring.

### Player Controller
File: [`js/core/player.js`](js/core/player.js)
- **Collider & Physics Sync** – Uses `THREE.Capsule` to represent the player body; integrates gravity and clamps collisions via the world octree.
- **Third/First Person Camera** – Smooth follow with configurable offsets, dynamic clamp of yaw/pitch per view, scroll wheel zoom in third person.
- **Pointer Lock Input** – Mouse movements rotate the camera; V toggles view, scroll zooms, Shift triggers run state.
- **Animation FSM** – Mixamo Idle/Walk/Run clips loaded from the Soldier GLB. Cross-fades mimic the template behavior: run only when Shift + movement, walk otherwise, idle when stationary.
- **Throwing Mechanic** – Shares sphere pool with physics system, adding player velocity to thrown spheres.

### Physics & Collisions
File: [`js/physics/physics.js`](js/physics/physics.js)
- Defines constants: `GRAVITY = 30`, 100 spheres with radius 0.2.
- Builds `Octree` from the loaded environment.
- Handles sphere-world collision, sphere-sphere collision, and sphere-player interactions (basic impulse resolution).
- Updates positions each frame, applying damping and shadow casting toggles.

### Asset Loading & UI
File: [`js/utils/loader.js`](js/utils/loader.js)
- Shows animated loading screen with progress percentage while streaming `low_poly_industrial_zone.glb`.
- Traverses loaded meshes to enable shadows, set anisotropy, etc.
- Builds octree from geometry for physics.
- Configures lil-gui folders (Visibility, Controls) and saves toggles to `localStorage`.
- Handles UI wrapper visibility state (`showUI`) and far-plane/fog adjustments.

`index.html` ties everything together:
- Defines the loading screen markup, info overlay, and import map for CDN modules.
- Imports `js/main.js`, which initializes subsystems, registers resize handlers, and orchestrates the animation loop.

## Animation Pipeline
- Source model: Mixamo “Soldier” GLB (fetched from Three.js examples CDN).
- Actions: `Idle`, `Walk`, `Run` extracted by name.
- `setAction()` emulates the template’s synchronization logic: if transitioning between non-idle clips, aligns animation time proportionally to preserve gait rhythm before fading.
- Editor-friendly: to swap characters, update the GLB URL and ensure clip names (Idle/Walk/Run) exist or are remapped.

## Configuration & Persistence
- GUI toggles update `visibilitySettings` and immediately persist to `localStorage`. Relevant keys:
  ```json
  {
    "fogNear": 0,
    "fogFar": 500,
    "modelScale": 0.7,
    "cameraFar": 1000,
    "showGUI": true,
    "showUI": true,
    "viewMode": "third"
  }
  ```
- On load, `loader.js` reads existing settings, reapplies them to the scene, and re-opens GUI folders for quick iteration.

## Assets
- `assets/low_poly_industrial_zone.glb` – Default environment. Ensure textures are embedded or co-located.
- `assets/uploads_files_4359726_city+2.glb` – Alternative level (unused by default).
- Character model served via CDN: `https://threejs.org/examples/models/gltf/Soldier.glb`. Replace with local assets for offline use.

## Extending the Template
- **Swap Environments:** Update the GLB path in `loader.js` or use `initial.html` to programmatically build geometry.
- **Add Weapons/Abilities:** Hook into `updatePlayer` or `main.js` loop for additional mechanics; reuse sphere pool or create new instanced meshes.
- **UI Enhancements:** Extend `css/style.css` and UI overlays. Use the `ui-wrapper` to inject new panels or controllers.
- **Multiplayer/Networking:** `js/core/multiplayer.js` synchronizes room presence, pilot suits, and movement through the WebSocket server in `server.js`.
- **Post-Processing:** Introduce `EffectComposer` in `sceneSetup` if you need bloom, DOF, etc.

## Troubleshooting
| Issue | Fix |
| ----- | --- |
| **Character invisible** | Ensure the Soldier GLB loads (check DevTools Network tab). If offline, host the GLB locally and update the URL in `player.js`. |
| **CORS errors** | Serve via HTTP (see [Local Development](#local-development)). |
| **Pointer lock denied** | The browser requires user interaction. Click the canvas; if pointer lock exits immediately, check console for security errors and retry. |
| **Lag spikes** | Reduce sphere count or disable stats via GUI. Ensure GPU drivers are up to date. |
| **GUI missing** | Press `G` to toggle. If still missing, set `visibilitySettings.showGUI = true` in `localStorage` and reload. |
| **Zoom not working** | Scroll zoom only applies in third-person view. Use `V` or GUI to switch modes first. |

## License
This template is provided as-is without a specific license. Please add your organization’s preferred license if you plan to distribute it. Mixamo character assets remain subject to Mixamo’s terms of use.
