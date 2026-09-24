# Input ownership boundary

Platform owns input infrastructure and gesture arbitration. Pointer sequences must ultimately resolve to UI, selection, panning, pinching, or gameplay-command intent with incompatible pending actions cancelled when the gesture changes.

GF-FND-001 does not redesign existing controls or gestures. The v0.7.0 implementation remains inline and is preserved byte-for-byte.
