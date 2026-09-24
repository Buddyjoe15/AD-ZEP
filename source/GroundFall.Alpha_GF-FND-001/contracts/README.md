# Public / Executable Contracts

This directory is the public contract boundary established by GF-FND-001.

- Foundation release: `EC-0.1-foundation`.
- Contract modules must be usable by a real provider and by test fakes.
- Contract modules do not import subsystem-private implementation.
- This task does **not** define World, Navigation, Actors/Combat, or Gameplay APIs on those owners' behalf.
- A future contract change must identify producer, consumers, version, migration/compatibility, and conformance tests before implementation depends on it.

`platform-foundation.mjs` records only task-approved foundation facts: 512×512 at 48 world pixels/tile, the observed v0.7.0 update order, coordinate-space terminology, and passive runtime metric expectations.
