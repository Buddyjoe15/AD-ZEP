# Game design

Design decisions for Abyssal Dawn: Zero Earth Protocol. The work they create is tracked in [ROADMAP.md](ROADMAP.md).

**Spoilers:** "Story" below describes the ending.

## Modes

- **Campaign.** An expedition roguelite. Each Earth is one chapter: land, build and extract, survive, repair and stabilise the drive, then transit.
  - The next Earth is random, drawn from the curated Earths. The player doesn't choose it.
  - The ship lands at the centre of the map, unless an Earth says otherwise.
  - The run ends when Vance dies, or with the ending under "Story".
  - Its length will be set by testing. It could take 10 Earths (one recording on each) or 4 (a player who explores finds several on one Earth).
- **Sandbox.** The player chooses the seed of the first Earth. Every Earth after it is random.
- **Alpha** is a sandbox mode on one Woods World with the Omega: survive the waves. The campaign is not in Alpha.

## Threat

Omega waves respond to what the player does. The threat rises with:
- the power produced;
- the number of friendly units on the map;
- possibly, the Element P stored aboard the ship.

Most Earths are wave-based. Some turn waves off and bring enemies through events instead (see "Earths").

Today's Hostile Autonomous Machines are not Omega. They are a stand-in for testing large numbers of units. The Omega enemies are still to be designed.

## Ship power

- **Element P** is the ship's main fuel, and lasts much longer than Fuel Rods.
- **The siphon is broken.** The part of the Warp Drive that siphons energy off to the power grid is broken at the start of the game.
- **Repairing the siphon** costs 1,000 steel and 1,000 electronics. This is separate from the 100-metal drive repair needed before transit.
- **Until then, Fuel Rods run the ship.** The ship's backup fusion generator burns them. They are also transit fuel.
- **The backup generator still matters after the repair.** Element P is very rare, and the player chooses what to spend it on:
  - energy, through the repaired siphon (this uses the Element P up);
  - boosting the warp (shortening stabilisation);
  - research items, to be added later.
- **Fusion Generator:** a building that also burns Fuel Rods for power.
- **This changes current behaviour:** today the Warp Drive supplies a steady 25 power from the start.

## Troop veterancy

- **Per unit.** Each unit earns XP from its own kills. It has nothing to do with transits.
- **Five levels.** Each adds 5% to every stat (HP, defence, attack, attack speed and so on): 5% at level 1, up to 25% at level 5.
- **Level 5 is the maximum.** After that the unit earns no more veterancy.

## Ship interior

The Robotics Lab researches everything to do with friendly units. The Research Lab researches everything else.

The mech is Vance's frame. The Mech Bay upgrades it, changes its modules and customises it. The frame's upgrades are researched in the Research Lab.

Ship modules and blueprints are in Alpha, so the ship and its upgrades can be tested.

For now, the Command Deck's history of past Earths holds only the current one, Planet 001.

The Storage Room sets the transit cap: how much of each resource crosses to the next Earth. The rest is left behind. Its level 1 caps are today's values:

| Resource | Level 1 cap |
|---|---|
| Metal | 300 |
| Copper | 300 |
| Uranium | 150 |
| Steel | 150 |
| Electronics | 50 |
| Fuel Rods | 60 |
| Missiles | 40 |

## Planet names

Vance doesn't know that the worlds he lands on are Earths, so the game calls them planets: "Planet 001", "Planet 002" and so on. They become "Earth 001" and so on only when Vance learns the truth from ARIA:
- in the campaign, later in the story;
- in Alpha, when all 10 recordings have been found.

## Earths

Each Earth is a divergence: its history went a different way. Every Earth is curated with a purpose.

| Earth | Enemies | Target |
|---|---|---|
| Woods World | Omega waves | **Alpha** (starter / demo build) |
| Medieval Earth | Events | After Alpha |
| Lava World | Omega waves | After Alpha |
| Snow Earth | Omega waves | After Alpha |
| Earth at War | Omega events, and waves of enemy armies | After Alpha |
| Omega World | Omega waves | After Alpha |

**Woods World.** A normal Earth. The ship lands in the woods, in a secluded area of Northern Canada.
- Abandoned settlements. The Omega has taken the humans away as organic material for its army.
- Environmental hazards are minimal. Resources are available to mine.
- Dynamic weather in Alpha: wind, rain, changing sunlight and lightning strikes.
- Builds on the `woodlands` map type.

**Medieval Earth.** Technology never advanced, and the world is stuck in that era.
- A castle and some remote villages.
- Mostly friendly. The player can trade for basic resources.
- Events can change the dynamics.

**Lava World.** A natural disaster: the volcano in America exploded.
- The skies are black and ash covers everything. Most vegetation is burning or destroyed; only parts are still alive.
- Water is very hard to find. There are lava flows and steam geysers.
- Vance is hurt if he stays near heat sources for too long. Upgrades reduce this.
- Environmental hazards are extreme. Resources are available to mine. Events can change the dynamics.

**Snow Earth.** An ice age.
- Water everywhere is frozen, and snow slows unit movement.
- Temperatures sometimes drop to freezing: drones freeze or slow, and Vance takes damage. Upgrades and fuel reduce this.
- Environmental hazards are extreme. Resources are available to mine. Events can change the dynamics.

**Earth at War.** An Earth in the middle of a world war: WW2 weapons and technology, with WW1 tactics and look.
- The ship lands in the middle of an extreme wasteland. Metal and electronics salvage sites are everywhere.
- Enemy waves come from both sides. They are armies with the same drone capability as ARIA.
- Omega enemies land in the middle, through events.
- Environmental hazards: mines, fires and random enemy artillery. Resources are available to mine. Events can change the dynamics.

**Omega World.** Infested. Survive.

## Story

### The Zero Earth Protocol

- **The Omega** can use a warp drive with Element P with no issues.
- **The ship's drive** was built by humans who reverse-engineered the Omega's ability. They believed they could control it, but they were wrong.
- **What the scientists expected.** Dimensional travel had only a 0.001% chance of occurring. A jump had a 5% chance of reaching the correct universe, and a 94.999% chance of reaching a random one. Even on paper, the mission had very little chance of going as planned.
- **What actually happened.** The first warp damaged the ship, and it went to another dimension instead of another universe. The damage made the odds worse. Now every jump has:
  - a 99.9999% chance of going to another dimension;
  - a 0.0001% chance (the rest) of going to another universe within the same dimension;
  - no chance at all of reaching the right destination.

  Warp travel is now effectively random.
- **The only way back to Earth** is to find an Omega world in some universe.
- **ARIA** is part of the protocol. She is Vance's AI companion: she controls the ship and builds and controls the drone armies.
- **The protocol's true purpose** is for ARIA to act on her own:
  - build up the ship's resources;
  - repair the drive;
  - continue from universe to universe until she reaches an Omega world;
  - there, study it and find a way to control the warp.
- **Why ARIA keeps Vance alive:** controlling the warp the way the Omega does is theorised to need an organic sentient host. That host is Vance. This is why the game ends if Vance dies.
- **The reveal is cold.** Vance realises ARIA is much more of a cold-blooded killer than he believed.

### Lost archives

- **What they are.** Any Earth may hold lost archives, sometimes more than one. Each is a fragment of another dimension's Earth that also tried the warp drive and failed. All that is left of it is its "black box recording".
- **The first two.** ARIA and Vance don't know what the recordings are, and they have no effect yet.
- **The third.** ARIA pieces together what the recordings are and what happened. She doesn't tell Vance. The truth from the other dimensions starts to corrupt her, and her disclosure restrictions weaken (dampen) to 30%.
- **The next seven.** Each adds 10%, so 10 recordings reach 100%.
- **Slips.** Each time dampening increases, ARIA sometimes lets the real truth slip without realising it, and more often as dampening rises.
- **At 100%** she tells Vance everything:
  - what the Zero Earth Protocol is;
  - that the organisms in some dimensions are beings of the Omega;
  - that warp travel is random, and the only way back to Earth is to find an Omega world.

### Ending

1. Collect all 10 recordings.
2. ARIA and Vance travel to an Omega world and defeat a boss, for the secrets of warp travel.
3. Then either travel to Earth 000 and win, or keep travelling the dimensional Earths. From that point the player chooses the Earth and the seed.
