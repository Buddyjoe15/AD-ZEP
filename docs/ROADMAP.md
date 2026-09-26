# Roadmap

The to-do list for Abyssal Dawn: Zero Earth Protocol. The design behind it is in [DESIGN.md](DESIGN.md).

Many of these items add saved state. Each one that does is a save format change: follow "Save format rules" in [CLAUDE.md](../CLAUDE.md).

## Required for Alpha

Alpha is the starter / demo build: a sandbox mode on one Woods World, where the player must survive the Omega waves. The campaign is not in Alpha.

### Woods World
- [ ] Woods World as the Alpha Earth:
  - the woods of Northern Canada, built on the `woodlands` map type;
  - abandoned settlements, whose humans the Omega has taken;
  - minimal hazards, resources to mine, and Omega waves.
- [ ] **Sandbox mode:** one Woods World; survive the waves.
- [ ] **Dynamic weather:** wind, rain, changing sunlight and lightning strikes.

### Threat
- [ ] Omega waves that grow with the power produced, the number of friendly units on the map and, possibly, the Element P stored aboard the ship.
- [ ] Omega enemy units. Today's Hostile Autonomous Machines are only a stand-in for testing unit numbers.

### Terrain features
- [ ] **Crystal formations** are where Element P comes from. A Survey Drone studies them.
- [ ] **Steam vents** are sites for a Geothermal Plant (the Field Generator's missing job): steady power, but only on vents.
- [ ] **Mineral outcrops** are small deposits that run out: worth a quick Resource Extractor, then moving on.
- [ ] **Villages and ruins** hold Archive signals, loot chests, and the lore of how the Earth diverged.
- [ ] **Caves** are explored by Vance or a drone: a short, risky trip for a big reward, perhaps with hostiles inside.
- [ ] **Logging camps and log piles** give wood, a cheap early building material, or salvage.
- [ ] **Rivers, cliffs and slopes** make natural chokepoints. Turrets on high ground get more range, and slopes slow units.

### Resource loops
- [ ] **Fuel Rods** power the Warp Drive: transit costs fuel. A **Reactor** burns rods for a lot of power.
- [ ] **Element P** shortens stabilisation. The Expedition log's boost action already does this, but Element P can't be found yet.
- [ ] **Fabricator levels:** upgrading with steel and electronics unlocks new units.
- [ ] **Transit cap as a choice:** the ship's cargo hold is upgraded between Earths (see Storage Room).

### Vance
- [ ] **Vance's abilities.**

### Progression
- [ ] Ship modules.
- [ ] Crew veterancy: units that survive transits earn small bonuses and a name.
- [ ] Blueprints recovered from archives unlock structures for the rest of the run.

### Ship interior
Six sections:
- [ ] **Mech Bay:** upgrade Vance's frame (the mech), change its modules, customise it.
- [ ] **Research Lab:** all research except friendly units: anomalies, frame upgrades, defence upgrades, new buildings and building upgrades.
- [ ] **Living Quarters:** upgrade the Commander's skills, health and speed.
- [ ] **Robotics Lab:** all research for friendly units: new units, unit upgrades and the unit cap.
- [ ] **Command Deck:** upgrade the ship. See the history of past Earths visited, and statistics.
- [ ] **Storage Room:** its size can be upgraded.

## To-do, target not yet set

- [ ] **Lost archives and ARIA's weakening disclosure restrictions** (DESIGN.md, "Lost archives").
- [ ] **Suit hazard upgrades.**

## After Alpha

### Campaign
- [ ] **Campaign mode:** the next Earth is random, from the curated Earths. The ship lands at the centre of the map unless an Earth says otherwise.
- [ ] **Campaign ending** (DESIGN.md, "Ending"):
  - defeat the boss on an Omega world;
  - then Earth 000 and a win, or keep travelling and choose the Earth and seed.
- [ ] **Sandbox across Earths:** choose the first Earth's seed; every Earth after it is random.

### Curated Earths (wish list)
Described in DESIGN.md:
- [ ] **Medieval Earth:** a castle and villages, trading, run by events.
- [ ] **Lava World:** ash, lava flows and steam geysers, heat damage to Vance, Omega waves.
- [ ] **Snow Earth:** an ice age, slow movement and freezing drones, Omega waves.
- [ ] **Earth at War:** a WW2 wasteland, enemy armies from both sides, Omega events, mines and artillery.
- [ ] **Omega World:** infested; survive.

## Known issues

Found while playing `main` at 8fa3c74:
- [ ] **Woodlands landing clearing:** it is drawn as flat, checkered squares with dark blotches. The Woodlands grass art around it is much richer.
- [ ] **Lakes:** deep water meets shallow water in hard, stair-stepped edges.
- [ ] **Testing zone:** one of every structure, and the Hostile Fabricator, appear in normal games.
- [ ] **New Game text:** it says "build a field generator", but the Field Generator is a placeholder with no function.
- [ ] **Departure checklist:** it says "N metal aboard drones", but it counts all cargo, and Utility Spiders carry it.
- [ ] **Stray screenshots:** 24 of them (17.5 MB) sit at the repository root.
- [ ] **`docs/ARCHITECTURE.md`:** it gives the save schema as 5 (it is now 8). Its simulation order leaves out `power`, `shields`, `swarm` and `gates`.

## Last

- [ ] **Existing climates:** decide how the curated Earths relate to today's climates (Temperate, Frozen, Silent, Irradiated). Frozen is close to Snow Earth.
