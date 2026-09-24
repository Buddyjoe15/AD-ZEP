# UI ownership boundary

Platform owns UI infrastructure and presentation/control plumbing here. Simulation state remains owned by its subsystem. UI reads presentation/query state and issues public commands; rendering/UI must not advance simulation.

The v0.7.0 UI remains inline in the canonical HTML for this foundation task.
