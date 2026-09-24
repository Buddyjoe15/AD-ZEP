# Platform ownership boundary

GF-FND-001 establishes this directory as the future home for Platform-owned source: bootstrap, fixed-step scheduler, browser lifecycle, pause/resume, camera, coordinate conversion, settings, audio infrastructure, instrumentation, packaging hooks, and the smallest integration layer.

For v0.7.0 these responsibilities are still embedded in the canonical single HTML artifact. GF-FND-001 deliberately does not extract them because the approved foundation can be created without changing runtime behavior.

Platform may consume public contracts. It must not absorb World, Navigation/Movement, Actors/AI/Combat, or Gameplay/Economy implementations or become a second writer for their runtime state.
