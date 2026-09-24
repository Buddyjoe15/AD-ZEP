# Persistence ownership boundary

Platform owns save storage/orchestration and the versioned outer envelope. Subsystems own their payload meaning, validation, and migrations.

GF-FND-001 does not change the v0.7.0 save format, localStorage keys, or load behavior. Future extraction must stage and validate loads before active-state replacement and must preserve the original save on failure.
