# Game design

Design decisions for Abyssal Dawn: Zero Earth Protocol. The work they create is tracked in [ROADMAP.md](ROADMAP.md).

**Spoilers:** "Story" below describes the ending.

## Modes

- **Campaign.** An expedition roguelite. Each Earth is one chapter: land, build and extract, survive, repair and stabilise the drive, then transit.
  - The next Earth is random, drawn from the curated Earths. The player doesn't choose it.
  - The run ends when Vance dies, or with the ending under "Story".
- **Sandbox.** The player chooses the seed of the first Earth. Every Earth after it is random.

## Threat

Omega waves respond to what the player does. The threat rises with:
- energy;
- the unit cap;
- possibly, the Element P stored aboard the ship.

Most Earths are wave-based. Some turn waves off and bring enemies through events instead (see "Earths").

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
- **Warp travel through dimensions is random.** Dimensional travel had only a 0.001% chance of occurring. Travel to the correct universe had a 5% chance, and there was a 94.999% chance of going to a random universe. The mission had very little chance of going as planned.
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

- **What they are.** Any Earth may hold a lost archive: a fragment of another dimension's Earth that also tried the warp drive and failed. All that is left of it is its "black box recording".
- **Recognising them.** ARIA and Vance don't know what the recordings are at first. Once 3 have been recorded, ARIA pieces together what they are and what happened. She doesn't tell Vance.
- **Corruption.** From then on, the truth from the other dimensions starts to corrupt ARIA, and her disclosure restrictions weaken (dampen):

  | Recordings | Dampening |
  |---|---|
  | 3 | 20% |
  | 5 | 30% |
  | 7 | 40% |
  | 9 | 50% |
  | 11 | 60% |
  | 13 | 70% |
  | 15 | 80% |
  | 17 | 90% |
  | 19 | 100% |

- **Slips.** Each time dampening increases, ARIA sometimes lets the real truth slip without realising it, and more often as dampening rises.
- **At 100%** she tells Vance everything:
  - what the Zero Earth Protocol is;
  - that the organisms in some dimensions are beings of the Omega;
  - that warp travel is random, and the only way back to Earth is to find an Omega world.

### Ending

1. Collect all the recordings.
2. ARIA and Vance travel to an Omega world and defeat a boss, for the secrets of warp travel.
3. Then either travel to Earth 000 and win, or keep travelling the dimensional Earths. From that point the player chooses the Earth and the seed.

## Open questions

1. **Threat inputs.**
   - *Energy:* is it power produced, power used, or both?
   - *Unit cap:* is it the number of units the player has, or the cap they have upgraded to?
2. **Recordings.**
   - At 20% for 3 recordings and 10% more for every 2 after, reaching 100% takes 19. Is 19 the "all the recordings" the ending needs?
   - Each Earth only *may* hold one. How many Earths should a campaign take?
3. **The odds.** 0.001% + 5% + 94.999% add up to 100%, so they read as the three outcomes of one jump. But going to a random universe is also dimensional travel. What does the 0.001% outcome describe?
4. **The mech.** The Mech Bay upgrades and customises "the mech", and the game has no mech yet. Is it Vance's frame (the existing frame upgrades), or a new unit?
5. **Research Lab and Robotics Lab** both research new units and upgrade units. How is the work split between them?
6. **The Hostile Autonomous Machines** fight in today's game. Are they Omega, or will Omega organisms replace them?
7. **The existing climates** (Temperate, Frozen, Silent, Irradiated). Do the curated Earths replace them? Frozen is close to Snow Earth.
8. **Alpha scope.** Is Alpha a single Woods World, or a run of Woods World Earths with different seeds? Are campaign and sandbox modes, the lost archives, and Vance's abilities in Alpha? Living Quarters (Alpha) upgrades Commander skills, and those skills are Vance's abilities.
9. **Landing site.** New Game lets the player choose one. Does the campaign keep that choice?
