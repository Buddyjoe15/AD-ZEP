# Abyssal Dawn: Earth Zero Protocol — v0.5

Open `output/Abyssal_Dawn_Earth_Zero_Protocol_v0_5.html` in a browser. Choose New Game → Save Slot → Launch expedition. The HTML is self-contained and works offline.

## Current changes

Ship selection opens a compact Fabrication window immediately. It stays near the ship while the camera moves. On a narrow screen it attaches above or below the ship, and its contents scroll. The opening tap cannot activate a fabrication option by accident.

The procedurally placed Element P discoveries, chests, loose items, and world buildings have been cleared from newly generated Earths. A small testing zone to the left of the ship contains one of each current item (Field Cap and Simple Backpack) and one of each buildable (Chest, Wall, Field Generator, Repair Station, Sensor Station). The testing structures are functional. Archive signals and scrap deposits remain available for exploration and resource collection.

The Expedition log retains its departure controls. Select a Utility Spider and press Build for field construction. Fabrication stays with the ship. The Objectives system is absent.

## Play and controls

Desktop: click the ship to fabricate; click another unit to select it; right-click terrain to move. Wheel to zoom, WASD/arrows to pan, H to center the ship, Space to pause, I for inventory. Touch: tap the ship or a unit to select; tap terrain to move, drag empty terrain to pan and pinch to zoom.

Utility Spiders mine finite metal and unload it at the ship. Repair the drive for 100 metal, wait for stabilization, and recall living crew and carried cargo. Clear the fabrication queue and finish field work or recall to cancel/refund it, then choose Transit in the Expedition log. Existing schema-1 saves remain supported. The map cleanup and testing zone are generated for new worlds; imported earlier expedition saves preserve their recorded world objects.

## Build and test

Run `python3 build.py` to compose the immutable GroundFall source with `extension.js` and `unit-visuals.js`. The produced HTML requires no runtime dependencies. Install Playwright and Chromium for `npm test`; `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can select existing installations.

Tests cover the full expedition and transit, save and departure guards, procedural route checks, desktop and emulated touch input, fabrication, testing-zone inventory, and the touch opening guard. Browser results and screenshots are in `evidence/`. Physical mobile devices, Safari and Firefox were not tested.
