const STORAGE_KEY = 'mechaPanelPositions';
const initializedPanels = new WeakSet();

let savedPositions;

function getSavedPositions() {
    if (savedPositions) return savedPositions;

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : {};
        savedPositions = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        console.warn('Failed to load panel positions:', error);
        savedPositions = {};
    }

    return savedPositions;
}

function savePositions() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(getSavedPositions()));
    } catch (error) {
        console.warn('Failed to save panel positions:', error);
    }
}

function clampPosition(element, position) {
    const rect = element.getBoundingClientRect();
    const baseLeft = rect.left - position.x;
    const baseTop = rect.top - position.y;
    const minX = -baseLeft;
    const minY = -baseTop;
    const maxX = window.innerWidth - baseLeft - rect.width;
    const maxY = window.innerHeight - baseTop - rect.height;

    return {
        x: Math.min(Math.max(position.x, minX), Math.max(minX, maxX)),
        y: Math.min(Math.max(position.y, minY), Math.max(minY, maxY))
    };
}

function applyPosition(element, position) {
    element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
}

export function makeDraggable(element, handle, key) {
    if (!element || !handle || initializedPanels.has(element)) return;
    initializedPanels.add(element);

    const positions = getSavedPositions();
    const storedPosition = positions[key];
    let position = {
        x: Number.isFinite(storedPosition?.x) ? storedPosition.x : 0,
        y: Number.isFinite(storedPosition?.y) ? storedPosition.y : 0
    };

    position = clampPosition(element, position);
    applyPosition(element, position);

    handle.classList.add('drag-handle');
    handle.setAttribute('aria-label', `Drag ${key.replace(/-/g, ' ')} panel`);

    let dragState = null;
    let suppressClick = false;

    handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest('a, button, input, select, textarea'))) return;

        dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startPosition: { ...position },
            moved: false
        };
        handle.setPointerCapture(event.pointerId);
        event.stopPropagation();
    });

    handle.addEventListener('pointermove', event => {
        if (!dragState || event.pointerId !== dragState.pointerId) return;

        const deltaX = event.clientX - dragState.startX;
        const deltaY = event.clientY - dragState.startY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 3) dragState.moved = true;
        if (!dragState.moved) return;

        position = clampPosition(element, {
            x: dragState.startPosition.x + deltaX,
            y: dragState.startPosition.y + deltaY
        });
        applyPosition(element, position);
        event.preventDefault();
        event.stopPropagation();
    });

    const finishDrag = event => {
        if (!dragState || event.pointerId !== dragState.pointerId) return;

        if (dragState.moved) {
            positions[key] = position;
            savePositions();
            suppressClick = true;
            setTimeout(() => {
                suppressClick = false;
            }, 0);
        }

        dragState = null;
        if (handle.hasPointerCapture(event.pointerId)) {
            handle.releasePointerCapture(event.pointerId);
        }
        event.stopPropagation();
    };

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
    handle.addEventListener('click', event => {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
    }, true);

    window.addEventListener('resize', () => {
        position = clampPosition(element, position);
        applyPosition(element, position);
        positions[key] = position;
        savePositions();
    });

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
            position = clampPosition(element, position);
            applyPosition(element, position);
            positions[key] = position;
            savePositions();
        }).observe(element);
    }
}

export function initializeDraggablePanels() {
    [
        ['#suit-hud', '.hud-header', 'suit-hud'],
        ['#multiplayer-panel', '.multiplayer-heading', 'multiplayer'],
        ['#weapon-hud', '.panel-tab', 'weapons'],
        ['#info', '.panel-tab', 'controls'],
        ['#hud-coords', '.panel-tab', 'coordinates'],
        ['#stats-container', '.panel-tab', 'performance']
    ].forEach(([panelSelector, handleSelector, key]) => {
        const panel = document.querySelector(panelSelector);
        makeDraggable(panel, panel?.querySelector(handleSelector), key);
    });
}
