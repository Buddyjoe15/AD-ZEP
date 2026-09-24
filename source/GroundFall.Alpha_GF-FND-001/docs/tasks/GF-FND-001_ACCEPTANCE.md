# GF-FND-001 Acceptance Mapping

Task: GF-FND-001 — Platform Foundation and Reproducible Development Harness  
Project: GroundFall.Alpha  
Task revision: P09 assignment received 2026-09-22  
Pinned baseline: GF-A-P01-R2 / Groundfall_Master_v0_7_0.html / 0.7.0  
Expected SHA-256: `5b05ff60123caa372ce05625c0716ebe90bfcfe4a7cfece9ac829d67317f299f`

This mapping was created before modification of the canonical game source. The implementation strategy is to keep the canonical HTML byte-identical to the approved master and add the harness around it.

| # | Acceptance criterion | Observable check | Evidence target |
|---|---|---|---|
| 1 | Pinned checksum matches before work | SHA-256 of baseline artifact equals expected hash | `evidence/baseline-verification.json` |
| 2 | Development build launches | Headless Chromium opens canonical `src` artifact and reaches `mainMenu` | `evidence/browser-smoke-dev.json` |
| 3 | Delivered build reproducible | Two clean builds produce identical artifact + manifest hashes | `evidence/reproducible-build.json` |
| 4 | JavaScript/static validation passes | Parse every inline classic script with Node VM; run invariant/static tests | `evidence/static-tests.txt` |
| 5 | Main menu reaches game | Browser clicks New Game → Slot 1 → Character → Skip Intro and observes `gameplay` | browser smoke evidence |
| 6 | Fixed-step scheduling remains | Source invariant checks `FIXED_DT:1/30` and fixed-step accumulator loop; runtime time advances in fixed increments | static + browser evidence |
| 7 | Rendering does not intentionally advance simulation | In gameplay, invoke render repeatedly with simulation paused and confirm simulation time unchanged | browser smoke evidence |
| 8 | 512×512 remains intact | Static and runtime checks for 512 columns/rows and 48 world-pixel tiles | static + browser evidence |
| 9 | Saves not deliberately invalidated | Canonical game HTML remains byte-identical, including save prefixes/version behavior | source checksum + static tests |
| 10 | Isolated second checkout works | Create disposable Git worktree and verify primary tracked tree unchanged | `evidence/worktree-isolation.txt` |
| 11 | Contract/conformance locations usable without private imports | Import executable foundation contract + fake conformance tests; boundary checker rejects private imports | contract/static test output |

Browser automation in this harness is Chromium headless. It is not physical-device evidence and cannot establish touch quality.
