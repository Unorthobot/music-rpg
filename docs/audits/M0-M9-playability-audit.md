# M0–M9 Playability Audit

**Audited commit:** `8d88fbc` (`main` = `origin/main` = `m9-final^{}`), working tree clean.
**Method:** blind playthrough of two fresh careers through the real interface, followed by a
forensic pass against the database.
**Question:** not *does it simulate correctly* — that is proven — but **is living a career in
SAIFA compelling?**

---

## 1. Executive finding

SAIFA has a **real game in it**, and it is not the one the milestones were built around.

The compelling thing is not the audience simulation. It is **the world coming at you**: a connector
who introduces you, three producers who will not make the same record, a promoter who upgrades you
from opening to carrying the room, a rival who calls you out because your name is travelling, and a
night where three judges explain why you lost. Every one of those moments made me want another day.

The weak thing is the loop the game spends most of its time in: **advance a day, read a number that
grew, dismiss an offer that looks like the last one.** By in-world day 4 the record panel had
stopped changing its sentence, and it did not change again for eleven more days.

The gap between those two experiences has one cause, and it is not a missing system. **The systems
are built. They do not reach the player.** In 26 in-world days the simulation wrote 364 reception
events, 29 relationship changes, resolved 3 performances with computed attendances of 36, 85 and
137 people, and grew a producer relationship to chemistry 100 / respect 100. The player-facing game
reported: one sentence repeated for fifteen days, a balance that changed without explanation, and
nothing at all about the producer.

**The single most important sentence in this audit:** my first live show — 36 people in a
120-capacity rooftop room in Braamfontein — happened, was simulated, paid me R120, **triggered my
career's transition into The Come Up**, and the game never told me it occurred. I inferred it from
my bank balance.

**Verdict:** compelling in bursts, inert in between, and currently spending most of its
sophistication where the player cannot see it.

---

## 2. Method

Two careers, played through the browser at 1280×900 against a locally-seeded world.

**Player mode was enforced.** During both playthroughs I used no World Control, no database access,
no progression internals, no test helpers, no knowledge of golden paths A–F, and did not steer
toward `RECEPTION` / `PEER` / `PUBLIC_RECORD`. Decisions were made from what the interface said.
Where the interface did not tell me enough to decide, that is recorded as evidence rather than
patched with implementation knowledge.

The forensic pass (§22 onward) came strictly after both playthroughs ended.

### One deviation, declared

I could not start the game as a player. Diagnosing that required implementation knowledge, and I
used it. **This is recorded as a P0 finding, not waved away** — see §32. The playthrough proper
began only after the environment was corrected; no game code, test, or coefficient was changed at
any point.

---

## 3. Primary career — VELD RADIO

| | |
|---|---|
| Identity | VELD RADIO · **THE PURIST** · solo · origin "Soweto" |
| Sound | Dark, raw, classicist — introspection, texture, imperfection |
| Philosophy | *"…recognise the street they grew up on and wish they didn't"* |
| Traits | Crate Digger · Perfectionist · Headstrong |
| Producer | **MO** (R2,200 — the expensive one, chosen for aesthetic fit) |
| Records | **THEY TOOK THE ROOF** (09 Jan, Single, Tease) · **TAXI RANK GOSPEL** (24 Jan, Single) |
| Shows | 16 Jan Naledi opening · 17 Jan Naledi carrying · 20 Jan Tumi carrying |
| Battles | 24 Jan vs KGOSI — **lost 3–0** · 31 Jan vs KGOSI — **lost 3–0** |
| The Come Up | **16 January**, day 12 of the career |
| Ended | 31 January 2026 — Fame 28, Respect 100, Heat 82, Legacy 0, R820, 2 tracks, ~1,000 listeners |

**Why I stopped:** condition (C), a genuine wall. The record panel had repeated the same sentence
for fifteen days, the offer stream had become four promoters rotating one template, and the
rematch I actively wanted returned a **word-for-word identical result screen** to the first battle
despite a changed strategy and R450 of preparation. Continuing would have produced more numbers,
not more evidence.

---

## 4. Secondary career comparison — PANEL VAN CHOIR

Deliberately opposite: a **group**, different answers throughout, the cheap producer.

| | VELD RADIO | PANEL VAN CHOIR |
|---|---|---|
| Form | Solo | Group (SIS B, RIOT, VELA) |
| Archetype | **THE PURIST** | **THE PERFORMER** |
| Sound | Dark, raw, classicist | Anthemic, rhythm-led, immediate |
| Identity line | *"Do it properly or don't."* | *"The room is the instrument."* |
| Onboarding | 4 steps, 5 questions | **5 steps, 7 questions** — incl. group-only questions |
| Producer | MO — *"Patient, asks a lot of questions"* | ZERO — *"Fast, agreeable, high energy"* |
| Producer behaviour | Pushed back; one proposal **HE DISAGREES** | Agreeable; two proposals **HE'LL DO IT** |
| Record | *"Sparse, intimate, dark"* | *"Anthemic, immediate, polished"* |
| Day-3 reception | 78 listeners · 6 fans | **49 listeners · 0 fans** |
| Cohort verdict | **Scene heads** responding strongly | **Tastemakers** responding strongly |
| Day-3 headline | *"finding its people"* | *"out and moving… without a clear shape to it yet"* |

**Careers diverge; records within a career do not.** This is the crucial distinction.

Across careers the difference is real and causally satisfying: an unknown group making polished
anthemic music gets *heard* and converts nobody; a purist making a dark scene record converts scene
heads immediately. Different archetype, different producer behaviour, different cohort, different
headline, different fan curve.

Within one career, I made two deliberately opposite records — record 1 *Tell a story / tense /
melancholic / energy 32 / risk 72 / for the scene*; record 2 *Make something strange / aggressive /
warm / energy 88 / risk 95 / for general listeners* — and both returned the **identical** verdict:

> *"Scene heads are responding much more strongly than casual listeners."*

**Interpretation:** reception is dominated by the artist's fixed Sound DNA, set once during
onboarding. **Hypothesis:** per-record creative choices are being applied, but their effect is
small relative to the DNA term and is then flattened by a verdict sentence that reports only cohort
*ranking*, not magnitude. Either way, the player-visible answer is that the five onboarding
questions matter enormously and everything you do in the studio afterwards does not.

Both careers also **opened identically** — same Thabo message, same three producers, same R5,000,
same date. The first five minutes are fixed.

---

## 5. The actual player loop

Not the intended design; what I observed myself doing.

```
CORE LOOP (repeated ~20 times)
  open Home
  → read one sentence about the record (unchanged since day 4)
  → glance at three numbers that grew
  → skim 3 offers that differ only in name, date, capacity and fee
  → accept or ignore
  → press "Let a day pass"
  → repeat
```

```
META LOOP (3 times in 26 days)
  a commitment lands on the calendar
  → days now have a destination
  → the event resolves silently
  → find out by opening the calendar, or by noticing the balance changed
```

```
EMOTIONAL LOOP
  onboarding → producer choice → first release  ...strong
  first offer → first show booked               ...strong
  the battle callout → prep → result            ...strongest
  everything between those                      ...flat
```

**There is a clear emotional loop, and it is entirely event-driven.** It has no relationship to the
day-advance loop, which is the thing the player actually spends their time doing. The two loops are
not connected: the day advance is the *transport* to events, not a source of interest itself.

---

## 6. Agency

**Real agency, confirmed:**

- **Producer choice.** Three producers, three prices, three aesthetics, three trade-offs, one
  affordable. Thabo explicitly warns *"don't take the cheapest one just because it's the
  cheapest."* Career 2 proved the choice matters: MO argued with me, ZERO agreed with me, and the
  records differed accordingly.
- **The 21 January collision.** Tumi's R600 show and MO's R2,200 session on the same night, with
  *"Taking one means letting the other go"*, a **Compare them** affordance, and a confirmation
  dialog. I hesitated. I chose. The consequence was then shown honestly as *"NO LONGER POSSIBLE —
  You took Another session the same night."* This is the best-designed decision in the game.
- **Battle preparation.** *"Another session is a day in the studio and R450. That's a day a record
  could have had."* Cost stated in money **and** opportunity, and optional.
- **Group composition.** Adding RIOT moved chemistry 70 → 96 with real consequence text: *"Enough
  overlap to agree, enough difference to argue usefully / Low collective patience. Expect fast
  decisions, some regretted."*

**Button variety, not agency:**

- **The producer's three proposals.** Record 1 returned LATE WITNESS and QUIET DISTANCE with the
  same stance, near-identical adjectives, the **same producer quote**, and the **same** technical
  line. Two of three options were indistinguishable to me.
- **Release strategy.** Tease vs Drop changed nothing I could perceive. (Forensically: Tease stored
  `{reach:10, anticipation:25}`, Drop stored zeros — so a difference exists, and none of it
  surfaced.)
- **Battle strategy.** I changed approach between battles and paid to prepare both times; the
  results were identical, including the closing paragraph verbatim.

**Can I regret a decision?** Yes — losing Tumi's R600 to book MO. **Can I form a plan?** Yes — I
planned "play the 16th and 17th, bank R520, then decide on MO by the 18th," and the deadlines
supported it exactly. **Can the world disrupt it?** Yes — the 21 January collision. **Do I feel I
authored this career?** Partly: I authored the *artist*, strongly. I did not author the *music*.

---

## 7. Tension

**Where it exists:**

- **R5,000 against one R2,200 session**, with *"One session is all you can afford right now. It
  comes out of your balance the moment you choose."*
- **Deadlines that sharpen** — "ANSWER BY 14 JANUARY" → "2 DAYS TO ANSWER" → "ANSWER BY TOMORROW".
- **The night before a booked show**, when the rail says *"Next: Rooftop hours — Braamfontein — 16
  Jan."*
- **The seven days before a battle**, holding a committed strategy I could not change.

**Where nothing is at stake:**

- **Every day advance after day 3.** No risk, no cost, no possibility of loss. The button cannot
  hurt me.
- **Declining anything.** Naledi *"does not chase anybody twice"* — she chased me five times.
  Lapsing an offer produced *"Naledi stopped waiting"* and a fresh Naledi offer in the same screen.
- **Money after the first week.** Shows pay, sessions cost, and the balance drifted upward without
  ever constraining me again.
- **The metrics.** Nothing I could do would make Respect fall.

**Obvious-optimum moments:** accept every show (free money, no downside); always prepare for a
battle (R450 against nothing); never keep a track private.

---

## 8. Attachment

**To the artist: strong.** The reveal screen — THE PURIST, "Do it properly or don't", three named
traits, my own sentence quoted back — created genuine ownership in about ninety seconds. Skills
reading **"Untested"** rather than fake numbers is exactly right.

**To the music: weak, and it degraded.**

- I chose **LATE WITNESS** and received a track called **NO TRAFFIC**. The title I picked partly
  *for* its title was silently replaced.
- Revision **destroyed my song's subject**. v1's THEME was *"My uncle's house in Soweto after they
  took the roof…"*. I sent a production note — *"Take the hook out if it is trying too hard"* — and
  v2's THEME became that note. The thing that made the record mine was overwritten by an
  instruction to the producer.
- **The Play button does nothing.** `<audio>` has an empty `src`. There is a waveform, a transport,
  previous/next, and a `—:—` timecode wrapped around silence. The caption is honest; the affordance
  is not. Pressing play on my first ever song and hearing nothing was the most deflating moment of
  the playthrough.

I named my track **THEY TOOK THE ROOF** to recover the theme the game had deleted. That is
attachment fighting the system, not supported by it.

**To people — a player-memory log, written blind:**

| Person | How I met them | What I think they want | What happened | How I feel | Legible? |
|---|---|---|---|---|---|
| **Thabo** (Connector) | Reached out day one | To be the one who introduced you; takes no credit | Gave me three producers, told me not to cheap out | Warm, useful | **Yes** — *"I don't make music. I make the phone ring."* |
| **MO** (Producer) | Booked at R2,200 | To make you say the honest version | Made both my records; asked me back | Should be my closest ally | **Faded** — said nothing after session one |
| **Naledi** (Promoter) | Offered a rooftop after my record landed | People worth standing up for | Five offers; upgraded me; then "stopped waiting" repeatedly | Started vivid, became spam | **Contradicted** |
| **Tumi** (Promoter) | Newtown, house band | A real room, done properly | Two shows | Mild | Partly |
| **KGOSI** (Rival) | Called me out | To settle it publicly | Beat me 3–0 twice | The one I care about | **Yes** — then reset |

**Compare belief with truth (§22): MO and I reached trust 70, respect 100, chemistry 100, and had
an open moment waiting. I experienced none of it.** The relationship I would have cared most about
was the one the game never mentioned.

**To releases:** THEY TOOK THE ROOF is *"that record that got me noticed by the scene"* — it earned
that. TAXI RANK GOSPEL is *"release #2, bigger numbers."*

---

## 9. Surprise

**Good surprise — unexpected, retrospectively understandable:**

1. **Naledi's first offer**, one day after release. I had not asked for a show. The record found
   scene heads; a promoter noticed. Perfectly legible.
2. **MO asking for another session.** The producer came back.
3. **Naledi upgrading** me from *opening the night* to *carrying the room*.
4. **KGOSI's callout** — *"You've been getting mentioned in rooms I'm in."* This is the world
   reacting to my actual state, and it pays off a promise made during character creation: *"Someone
   challenges you publicly. Not hypothetically. This will happen in the Underground."*
5. **The 21 January collision.**

**Not surprise — unpredictable output:**

- The 3–0 battle losses. I could form no theory about why I lost, twice, with different strategies.
- The Come Up arriving on a quiet-looking day.

**Anti-surprise:** by day 8 I could predict each morning exactly — one record sentence, two or three
promoter offers, a lapse notice.

---

## 10. Desire — "one more day"

| Moment | Answer | What was pulling |
|---|---|---|
| After the reveal | **YES** | I want to see what this artist makes |
| *"It exists, it's yours, and nobody has heard it yet"* | **YES** | Strongest pull in the game |
| Day 1 reception + Naledi's offer | **YES** | The world answered |
| Days 2–3 | **YES** | Offers, collisions, a show booked |
| Days 4–7 | **MAYBE** | Only the 16 Jan show; the record panel had gone static |
| Day 8 (KGOSI's callout) | **YES** | A named rival and a date |
| Days 9–15 | **MAYBE** | Purely transport to the battle |
| After battle 1 (lost 3–0) | **YES** | *"it isn't finished"* — I wanted revenge |
| After battle 2 (identical) | **NO** | My agency demonstrably changed nothing |

**Every YES was caused by a person or an event. No YES was ever caused by a number.**

---

## 11. Dead time

**Advance Day audit — 20 presses, classified:**

| Motivation | Count |
|---|---|
| Progressing toward a known commitment | 11 |
| Curious what happens | 4 |
| Nothing else to do | 4 |
| Recovering / other | 1 |

**Consecutive days with no meaningful player-facing change: 11 of 20.** Days 4, 5, 6, 9, 10, 11,
12, 13, 14, 15 and 22 delivered an identical headline, an identical cohort sentence, an identical
"RIGHT NOW" card, and larger numbers.

The record headline **"THEY TOOK THE ROOF is finding its people / One audience has taken it up, and
they're staying"** and the line **"Scene heads are responding much more strongly than casual
listeners"** were displayed **unchanged for fifteen consecutive in-world days.**

**Anticipation vs dead time:** the game *does* generate anticipation — a booked show, a scheduled
release, a battle seven days out — and the rail surfaces *"Next: …"*. But the days between
commitments contain nothing except the button. Waiting for Friday is tension; the six presses to
reach Friday are dead time, because none of them can go differently.

**The dominant loop did become: advance day → inspect numbers → advance day.** Explicitly called
out, as instructed.

---

## 12. Music-making

**What works.** The direction screen is substantial and expressive — intention, multi-select moods,
energy and risk sliders, target audience, and a free-text note prompting *"A picture, a place, a
feeling — whatever you'd actually say out loud."* The framing *"Tell them the idea, not the
settings"* is exactly right. Producers behave differently and audibly so. Versions are never
overwritten. Naming the master returns authorship.

**What does not.**

- **Two of three proposals were indistinguishable** on the first record.
- **The free text is stored but not interpreted.** I asked to remove the hook; the structure still
  read `Intro · Verse · Hook · Verse`.
- **Revision overwrote my theme** with a production note.
- **Titles churn** — NO TRAFFIC → LOW RECEPTION → QUIET SIGNAL across three versions of one song,
  and "LOW RECEPTION" was later reused as a proposal title on a different record.
- **No audio.**

**Can two players make aesthetically different careers?** Yes — decisively, at the *artist* level.
**Can one player develop a sound across records?** Not perceptibly; the DNA is fixed at onboarding
and every record reports the same audience relationship.

**Do I remember why I made a particular record?** For record 1 yes, because I wrote the reason
myself — and then the game deleted it.

---

## 13. Release experience

**Before:** genuine. Format choice with honest locks, four strategies with stated lead times, and
strategies gated on things I did not have (*"needs venue"*, *"needs contacts"*) — which made me
want to go and get them. Scheduling produced *"Scheduled for Friday, 09 January."*

**Release day:** did not exist as an experience. There was no day on which the record came out;
there was a button I pressed.

**After:** the strongest data surface in the game. Day trail (*"People are starting to find it"* →
*"It's being passed around"*), four separate measures, and a cohort breakdown naming Scene heads /
Tastemakers / Casual listeners with verdicts. Legible and satisfying **on first read.**

**Weak vs strong release:** across careers the difference was real and story-shaped — *"finding its
people"* and 6 fans by day 3, versus *"out and moving… without a clear shape to it yet"* and **0
fans** by day 3. That is a genuine qualitative difference, not just a smaller number. Credit where
due.

**Three real defects:**

1. **Home ignored my scheduled release entirely** — the biggest pending event in my career, absent
   from the surface called "RIGHT NOW".
2. **I could not reach my own release date.** The day-advance control does not exist until a record
   is published, so a 3-day tease is unreachable: the clock is gated behind the event being
   scheduled. My only option was to publish immediately.
3. **A scheduled release never publishes itself.** TAXI RANK GOSPEL sat under "COMING UP" dated 21
   January while the world clock read 24 January.

---

## 14. People and relationships

The **member-selection screen is the best content in the game** — nine candidates, each with a
distinct voice, two strengths, a sound, and a live chemistry meter under *"Talent is not the only
thing that matters; how these people handle each other decides how long the group lasts."*

Everything after first contact decays.

- **Character voice does not evolve.** Naledi's second, third and fourth offers reuse her first
  quote verbatim — *"I've got a rooftop in a week and a half-hour I'd give you"* — while offering a
  different, larger slot.
- **MO has no voice outside the studio.** His "come back and work again" offer carries no line at
  all, while both promoters have one.
- **KGOSI forgets the battle.** His rematch callout is identical to his first, two days after
  beating me 3–0, and after the game itself wrote *"Whatever this is between you and KGOSI, it
  isn't finished."*
- **Scouting contradicts history.** Before the rematch it reported *"You two have crossed paths
  before, without much coming of it"* and *"KGOSI has been in rooms like this before, and not
  always come out on top."* He had beaten me 3–0 in public; it was his only battle.
- **The Crew screen was never surfaced.** In 26 days, "RIGHT NOW" pointed at Studio, Catalogue,
  Messages and offers — never once at Crew, where an open moment was waiting.

---

## 15. Opportunities

**"The world wants something from me"** for roughly the first three. **"The game generated another
card"** from about day 4.

Observed: 21 opportunities created across 25 director runs in 26 days — roughly one a day, from a
cast of four promoters, all sharing one template (role label · date · capacity · fee · deadline).

- **Repetition:** Naledi alone made five offers in six days.
- **Stakes:** R120–R600 against a R5,000 starting balance. Trivial after week one.
- **Opportunity cost:** genuinely present, and the collision UI is excellent.
- **Timing:** deadlines are well-tuned and create real pressure.
- **Declining:** *meaningless.* "X stopped waiting" is immediately followed by a fresh offer from X.
  I lapsed at least seven offers and suffered nothing.

The director's cadence actively destroys the characterisation the writing establishes. Naledi is
introduced as someone who *does not chase anybody twice*, and then chases.

---

## 16. Calendar and time

**The calendar is a genuine success.** It held three booked performances, a release and completed
items, and the offer screens showed *"WHAT ELSE IS IN THAT WEEK"* with the adjacent commitment
named. I thought *"I have a show Friday"*, not *"advance three more times"*. Collisions are
detected, explained, and confirmed before they cost you something.

**But time is not honoured.**

- A session booked for Wednesday 21 January was playable on the 16th (*"Nothing happens until you
  walk in"*).
- A release scheduled for 09 January could be published on the 6th.
- Battle prep says *"a day in the studio and R450"* and the clock does not move.
- A scheduled release passed its own date and stayed "BOOKED".

So dates are decoration on everything except performances and battles, which are the two things the
game resolves on the clock — and those it resolves invisibly.

---

## 17. Battles

**The strongest system in the game, and the one that broke fastest.**

Buildup is excellent: a callout motivated by my actual standing, seven days of anticipation,
optional scouting framed honestly (*"It won't change what happens in the room. It might change how
you go into it"*), three legible strategies, a commitment lock, and optional paid preparation with
stated opportunity cost.

The result screen is the best-written screen in SAIFA — three named judges each explaining their
verdict, my chosen strategy referenced and shown to have failed (*"You went in to say something
they could not answer. It did not come out the way you described it"*), and a closing that stings:
*"You lost it, in front of everybody who was there. Nobody who was there is calling it close."*

Then I fought him again with a different strategy and paid to prepare, and got **3–0 again with a
verbatim-identical closing paragraph**, including the same *"it isn't finished."*

**Would I seek another battle because battles are interesting?** After the first: emphatically yes.
After the second: no. Not because I lost — losing was good — but because the screen proved my
choices did not reach the simulation in any way I could perceive.

Minor: "KGOSI" appears eight times in the result text and I am referred to as *"the other one"*;
*"four hundred people decide"* in a 220-capacity room.

---

## 18. Live performance

**The largest experiential hole in the game.**

I played three shows. Each was simulated, resolved on its date, and paid me. Forensically they
recorded attendances of **36**, **85** and **137**.

What the game told me: **nothing.**

- No notification (`performance.resolved` is not in `NOTIFIED` — known, deferred).
- No Home moment before, during, or after.
- No attendance, no room reaction, no story beat.
- One generic line in the World feed: **"You played a room."**
- The only signal was my balance changing by R120.

My third show drew 137 people into a 180-capacity room — nearly full, a genuinely good night for an
artist twenty days into a career. **I never knew.** The number existed. It was computed. It was
never shown.

**Does playing live feel different from releasing music? It should — and it does: it feels like
less.** A release gets a dedicated Home panel, a daily trail, four measures, a cohort breakdown and
a public page. A show gets four words.

---

## 19. Economy

**Week one: a real economy.** R5,000, one affordable producer at R2,200, an explicit warning not to
optimise for price, and a sidebar stating the cost lands immediately. I felt the R2,200. Later, the
R2,200-session-versus-R600-show collision was a genuine financial decision, and R450 battle prep
was priced against *"a day a record could have had."*

**After that: decorative.** Shows pay R120–R600, sessions cost R2,200, and the balance oscillated
between R670 and R2,920 without ever blocking anything I wanted. I ended on R820 having never once
been unable to act.

- **Do I know how much I have?** Yes, on every screen.
- **Does spending hurt?** Once.
- **Can I make a financially bad decision?** Not really; income is riskless.
- **Can success change what I can attempt?** Not observed.

**Career page states, falsely: "Starting capital. Nothing has spent it and nothing has grown it."**
I had spent R4,850 and earned R1,120.

---

## 20. Fame / Respect / Heat

**Can I explain the difference from what happened in my career?** Partly, and the good half is
real: after my first record, **Respect rose and Fame did not** — I made a scene record, and the
scene noticed while the public didn't. That is the promised strategy space, legible without
explanation. The movement labels (*Unchanged / Rising / Climbing / Emerging*) and descriptors
(*Unknown → Emerging → Widely known*; *Cold → Flickering → Warm → On fire*) do real work, and
Legacy reported as **"Not written · Unchanged"** rather than hidden is exactly the right restraint.

**But the calibration is broken.** After 26 days, two singles, three support slots in small rooms
and **two 3–0 battle defeats**, I finished at:

> **Respect 100 — "Untouchable"** · Heat 82 — "On fire" · Fame 28 — "Widely known"

"Untouchable" respect for an artist who has lost every battle he has ever been in, and "Widely
known" for one with 1,000 lifetime listeners, makes the vocabulary meaningless and the ceiling
arrive in under a month.

**Do they influence decisions?** No. I never once chose an action to move a metric — nor could I
have said which action would.

---

## 21. The Come Up — blind experience

Recorded before any inspection.

> **THE COME UP**
> *"Your name is starting to travel."*
> *"The name is starting to travel."*

- **Did I expect it?** No. No signal preceded it.
- **Premature?** **Yes.** One track out, 147 listeners, 14 fans, Fame 1, and — as far as I knew —
  zero shows played. My first gig was *that evening* and I did not know it had happened.
- **Earned?** Partially. Two promoters and a producer had come to me, so the world clearly was
  treating me differently. But I could not point at a cause.
- **Could I explain it narratively?** Weakly: *"my record found the scene and people started
  offering me things."*
- **Did the world already feel different beforehand?** **Yes** — and this is the design working.
  The label lagged a change I had already felt, which is exactly what "something they notice"
  should mean.
- **Did the transition add meaning?** Barely. Two near-identical sentences stacked read as a
  stutter.
- **Home treatment?** Present, quiet, competing with the record panel and three offers.
- **Career?** The chapter and *"Began 2026/01/16"* live in the right rail — but beside *"Started
  2026/09/04"*, so my career visibly began eight months **after** its second chapter.
- **World?** Yes — *"The name is starting to travel"* sits in the public feed. Good.
- **Projects?** **The best consequence, and I noticed it organically.** EP/Mixtape/Album moved from
  *"Not at this stage of your career"* to *"You need at least 4 tracks."* A door shut for a reason
  I could not act on became one I could.
- **Reach?** Felt, never explained — exactly as intended. Record 2 reached **680 listeners by day
  7** where record 1 reached 147. I attributed that to the world knowing my name, which is the
  correct reading, and no multiplier was ever shown.
- **Did I want to see what The Come Up would bring?** Yes — but nothing arrived that was
  identifiably *of* The Come Up except the Projects change.

**"If I did not know the evaluator existed, would this transition make sense?"** — **Yes, loosely.
It would have made complete sense if the game had told me my first show happened.**

---

## 22. Player belief vs simulation truth

The forensic pass, run only after both careers ended.

| # | What I believed | What actually happened | Class |
|---|---|---|---|
| 1 | The Come Up fired on a quiet day for no visible reason | It fired because **RECEPTION and PUBLIC_RECORD were first reached at the same timestamp — 16 Jan 15:00**, the moment my first show resolved. Payload descriptors: `WORK_LANDED_ONCE`, `A_SCENE_THAT_KNOWS_YOU`, `THINGS_THE_SCENE_SAW` | **Opaque → fully explicable.** The missing link was the show the game never reported |
| 2 | MO and I had drifted apart | trust 70 · respect 100 · **chemistry 100** · familiarity 54, and **one OPEN moment (`WANTS_ANOTHER_SESSION`)** waiting on Crew | **Opaque** — the richest relationship in my career was invisible |
| 3 | My shows were minor | Attendances **36 / 85 / 137**, all computed and stored | **Opaque** |
| 4 | Tease vs Drop made no difference | Tease stored `{reach:10, credibility:0, anticipation:25}`; Drop stored zeros | **Opaque** |
| 5 | KGOSI's member bio referenced *my* battle | His biography is **static seed text** written before I played | **Misleading by coincidence** — I inferred a memory the world does not have |
| 6 | Scouting told me KGOSI sometimes loses | He had one battle and won it 3–0 | **Misleading** |
| 7 | My career started 04 Sept and came up 16 Jan | Career-start events carry wall-clock dates; everything else is in-world | **Misleading** |
| 8 | "Nothing has spent it and nothing has grown it" | R4,850 spent, R1,120 earned | **Misleading** |
| 9 | PEER recognition never happened | PEER *was* reached — on **21 January**, five days *after* the transition | Neutral; correctly irrelevant |

**The headline of this table:** the simulation is richer and more coherent than the experience. Not
one of items 1–4 is a simulation failure. All four are the same reporting failure.

---

## 23. Causal legibility

**LEGIBLE** — Respect rising while Fame stayed flat after a scene-aimed record · cohort verdicts on
the record page · the day trail · the 21 Jan collision and its consequence · Projects unlocking at
The Come Up · record 2 reaching further than record 1 · producer behaviour differing by producer.

**MYSTERIOUS BUT PLAUSIBLE** — why Naledi upgraded me from opening to carrying · why KGOSI called
me out when he did · why The Come Up landed on the 16th (plausible in hindsight, unexplainable at
the time).

**OPAQUE** — why I lost 3–0 twice · what my shows achieved · what changed between record 1 and
record 2 in the world's eyes · what the difference between two "meet you halfway" proposals was ·
what any relationship was doing.

**MISLEADING** — scouting contradicting the battle it followed · the two date systems · "Starting
capital…" · "needs venue / needs contacts" reading as locks when the options are selectable · a
waveform and transport implying audio · "Your **first** studio session" on my second.

The game does not need perfect transparency, and its uncertainty is often good. But **opacity is
currently concentrated exactly where the player made effortful choices** — strategy, preparation,
performance, relationships — which converts effort into noise.

---

## 24. Systems operating but not felt

Measured through play, then confirmed forensically.

| System | Activity in 26 days | What reached me |
|---|---|---|
| **Relationships (M6)** | 29 `relationship.changed`, 3 relationships, chemistry to 100, 1 open moment | **Nothing.** Crew never surfaced |
| **Live performance (M8.5)** | 3 resolved, attendance 36 / 85 / 137 | Four words and a balance change |
| **Reception cohorts (M5)** | 364 reception events; 96 exposure, 96 engagement, 61 word-of-mouth, 47 conversions | One sentence, unchanged for 15 days |
| **Release strategy (M4)** | Modifiers recorded and consumed | Nothing perceptible |
| **Scene standing / promoter profiles (M7)** | 25 director runs, 4 distinct promoters with sceneprofiles | Offers indistinguishable except name and fee |
| **Battle simulation (M8)** | 2 resolved with per-judge reasoning | Excellent once; identical twice |
| **Act reach (M9)** | ×1.6 applied | **Felt correctly and silently** — the one system whose invisibility is right |
| **Money** | Ledgered accurately | Real for one week |
| **Calendar (M4/M7)** | Collisions detected and confirmed | **Felt well** |

**Reception is the starkest ratio: 364 events produced one repeated sentence.** The engine is
generating a fine-grained story every single day and the interface is reporting a category label.

---

## 25. Player desires without systems

Recorded as they occurred, as desires rather than features.

- *"I want to know how the show went."* — the strongest and most repeated. Underlying need: **the
  events I commit to must report back.**
- *"I want to tell MO what I actually meant."* — the free-text box implies conversation and does not
  deliver one. Need: **to be understood by a collaborator.**
- *"I want to hear it."* — need: **the work must exist as an artefact**, not only as a description.
- *"I want to know why I lost."* — need: **effortful choices must produce differentiated,
  explainable outcomes.**
- *"I want to say no and have it cost something."* — need: **refusal as a real act.**
- *"I want to develop a sound over records."* — need: **a career-length creative arc**, not a fixed
  DNA plus per-record cosmetics.
- *"I want to spend money on something that changes what I can do."* — need: **investment.**
- *"I want to go and get a venue / contacts."* — the release screen advertises these as things I
  lack; nothing lets me pursue them. Need: **advertised prerequisites should be reachable.**
- *"I want somebody to mention the battle."* — need: **the world should carry recent public facts
  into conversation.**

---

## 26. Emotional timeline — primary career

| Day | What happened | Emotion | Decision | Unresolved question | Pulled forward? |
|---|---|---|---|---|---|
| — | Reveal: THE PURIST | **Pride** | Accept the artist | What does he make? | **Yes** |
| 05 Jan | Thabo; three producers | **Curiosity** | Take MO at R2,200 | Was the expensive one right? | **Yes** |
| 06 Jan | Proposals; two identical | **Mild deflation** | LATE WITNESS | — | Neutral |
| 06 Jan | Revision ate my theme | **Loss** | Master it anyway | — | No |
| 06 Jan | *"nobody has heard it yet"* | **Anticipation** | Release it | Who finds it? | **Yes** |
| 06 Jan | Play button silent | **Deflation** | — | — | No |
| 09 Jan | Out | **Anticipation** | Let a day pass | — | **Yes** |
| 10 Jan | 28 listeners; scene heads; **Naledi** | **Excitement, validation** | Take the slot | Will she come back? | **Yes** |
| 11 Jan | 3 offers; MO returns | **Excitement, overwhelm** | Plan the week | Which night? | **Yes** |
| 12 Jan | The 21 Jan collision | **Deliberation** | MO over Tumi | Right call? | **Yes** |
| 13–15 Jan | Identical days | **Indifference** | Advance | — | No |
| 16 Jan | **THE COME UP** | **Surprise, then puzzlement** | Read it twice | Why now? | Slightly |
| 16 Jan | *(my first show — unreported)* | **—** | — | — | — |
| 17 Jan | **KGOSI calls me out** | **Excitement** | Take it; scout; prepare | Can I take him? | **Yes** |
| 18–23 Jan | Transport | **Indifference** | Advance ×6 | — | No |
| 24 Jan | **Lost 3–0** | **Sting, then resolve** | Take the rematch | Can I beat him? | **Yes** |
| 25–30 Jan | Transport | **Indifference** | Advance ×5 | — | No |
| 31 Jan | **Lost 3–0, identical text** | **Deflation → disengagement** | Stop | Does anything I choose matter here? | **No** |

Six genuine YES moments, all event-driven. Eleven days of indifference between them.

---

## 27. Career story, from memory

*Written before the forensic pass.*

> I started as VELD RADIO, a purist from Soweto who wanted people to recognise the street they grew
> up on and wish they hadn't. Thabo found me first and told me not to take the cheap producer, so I
> spent nearly half of everything I had on MO because he was the one who said *"tell me what
> actually happened."* We made a record about my uncle's house after they took the roof — though
> the game lost that somewhere between the first version and the second, and I had to put it back
> in the title. **THEY TOOK THE ROOF** went out on the 9th.
>
> Then the scene answered. Scene heads took it up; the general public never heard it. Naledi
> offered me thirty minutes on a Braamfontein rooftop, then a bigger slot, then more than I could
> answer. Tumi wanted me in Newtown with a house band. MO wanted to work again. I took three
> nights, and on the 21st I had to choose between Tumi's stage and MO's studio; I chose the studio,
> and the game made me confirm that I was letting Tumi go.
>
> Somewhere in there my name apparently started travelling. I didn't feel it happen.
>
> Then KGOSI called me out, because I'd been getting mentioned in rooms he was in. I asked around,
> learned almost nothing, committed to outwriting him, and paid for a day of preparation. He beat me
> 3–0 in front of everybody, and nobody called it close. I wanted him again, changed my approach
> entirely, paid again — and lost 3–0 again, in exactly the same words.
>
> I never played a note anybody could hear, and I never found out how any of my three shows went.

**Simulation memory vs player memory.** The database also holds: 364 reception events, three
resolved performances with attendances, 29 relationship changes, a chemistry-100 partnership with
MO, an unanswered moment, and PEER recognition arriving on 21 January.

**What I remember is exactly what the game narrated to me.** Nothing I remember is absent from the
database; a great deal in the database is absent from my memory. **Experiential salience in SAIFA
is currently identical to "was it written into a sentence on a screen."**

---

## 28. Friction map

**GOOD FRICTION — protect it.** One affordable producer · the collision confirmation dialog ·
battle strategy locked before preparation · paid preparation with stated opportunity cost ·
offer deadlines · "You can't change it once your identity exists" · the honest empty scouting
report.

**BAD FRICTION — costs effort, returns nothing.** Home → Studio → Messages → producers to make a
first track · pressing Advance Day eleven times through unchanging days · finding out a show or a
battle happened by opening the calendar · a Play button that does nothing · offers that must be
dismissed daily and cost nothing to ignore · "needs venue/contacts" labels that are not locks.

**MISSING FRICTION — too easy.** Declining costs nothing · money stops constraining after week one
· no action ever fails · no relationship can be damaged · metrics only rise · every show is
riskless income.

---

## 29. Pacing map

| Milestone | In-world day | Interactions |
|---|---|---|
| First meaningful choice (solo vs group) | 0 | ~4 |
| Artist identity complete | 0 | ~12 |
| First named person (Thabo) | 0 | 13 |
| First real decision with cost (producer) | 1 | ~18 |
| Track finished | 2 | ~32 |
| First release | 5 (published day 2) | ~40 |
| **First audience reaction** | **6** | **~45** |
| First opportunity (Naledi) | 6 | 46 |
| First commitment booked | 6 | 49 |
| First surprise (MO returns / upgrade) | 7 | ~55 |
| First real trade-off (21 Jan collision) | 8 | ~60 |
| First moment of attachment | 6–8 | — |
| **First public event felt** | 8 (KGOSI callout) | ~75 |
| **THE COME UP** | **12** | **~85** |
| First consequence of my own choice | 13 | ~90 |
| Wall reached | 26 | ~130 |

**The experience wakes up at in-world day 6 / ~45 interactions**, when the record lands and the
world answers. Everything before that is well-paced setup. Everything after day 17 is repetition.

**The good window is roughly ten in-world days wide.**

---

## 30. Surface redundancy

| Surface | Distinct job? | Assessment |
|---|---|---|
| **Home** | Yes — "what is being asked of me now" | Good, but it under-reports: it ignored a scheduled release, three shows and two battles |
| **Career** | Partly | Metrics + DNA + traits are distinct; **YOUR STORY duplicates Home's and is worse** |
| **World** | **Yes — the best surface** | Public history in the scene's voice; the only place my show appeared |
| **Notifications** | Weakly | 12 of 13 entries were offer noise; recency feed is correct in principle |
| **Calendar** | **Yes** | Genuine temporal structure; the only reliable record of what resolved |
| **Catalogue → track** | **Yes** | The reception detail page is excellent |
| **Fame/Respect/Heat** | Duplicated across Home, Career and the rail | Three copies, one meaning |
| **Career story** | **Broken** | 17 entries, all dated 04 SEPT, 7 of them "lapsed — X filled the slot" (Naledi's four times), omitting **both releases, both battles and The Come Up** |

The redundancy is not primarily duplication — it is that **the same world fact is shown as a number
in three places and as a story in none.**

---

## 31. Strengths to protect

**CORE STRENGTHS**

1. **Sound discovery and the reveal.** Five questions to a coherent, named, quotable artist in
   ninety seconds. Nothing else in the game creates ownership this fast.
2. **The producer-choice screen.** Three prices, three aesthetics, three trade-offs, one
   affordable, plus an in-world warning not to optimise on price.
3. **The battle arc — callout, scouting, commitment, paid preparation, per-judge verdict.** The
   first one is the best twenty minutes SAIFA has.
4. **The calendar and its collisions.** Real commitments, real conflicts, honest confirmation.
5. **The World feed.** The scene's public memory, in the scene's register.
6. **The reception detail page.** Cohorts, day trail, four separate measures.
7. **Honesty as a design stance.** "Untested" skills, "Not written" legacy, "structured work, not
   audio", scouting that reports what you cannot know, no fabricated numbers anywhere.

**EMERGING STRENGTHS**

- **Group chemistry** — the member screen is superb; the chemistry model itself is low-variance.
- **Cross-career divergence** — archetypes genuinely produce different careers.
- **Act reach** — the one system correctly felt without being explained.

---

## 32. Problems by severity

### P0 — prevents meaningful play

1. **A fresh install cannot be played.** `PGLITE_DATA_DIR=.pglite/dev` is *relative*, and
   `npm run dev` executes with `cwd=apps/web` while `db:seed` / `db:migrate` / `db:reset` execute
   from the repo root. They address **two different databases**. The app served an unmigrated,
   unseeded database ten migrations behind, and `npm run db:seed` could never reach it.
2. **First contact fails silently and permanently.** `completeOnboarding` calls
   `createFirstContact` and discards the result. With no `thabo` in the world it returns an error,
   nothing is logged, and the career is created with **no path forward at all**: Home offers only
   "Open the studio", Studio offers only "Open messages", Messages is empty, and no day-advance
   control exists. There is no retry on any later day. My first two careers were permanently
   unplayable.

### P1 — materially damages the core experience

3. **Performances resolve invisibly.** Three shows, attendances 36/85/137 computed, zero reported.
   Includes the show that **caused The Come Up**.
4. **The reception headline and cohort sentence never change** — fifteen consecutive days identical.
5. **Battles do not differentiate.** Changed strategy + paid preparation → identical 3–0 and
   verbatim-identical closing text.
6. **Per-record creative choices do not alter perceived reception.** Two opposite records, one
   verdict.
7. **The relationship system is entirely invisible** — chemistry 100 with MO and an open moment,
   never surfaced; Crew never linked from Home.
8. **Declining has no consequence.** Lapse notices are immediately followed by fresh offers from the
   same person; Naledi "does not chase anybody twice" chased five times.
9. **Revision overwrites the song's theme** with the production note.
10. **Time is not honoured** — sessions and releases are actionable before their dates; a scheduled
    release never auto-publishes and sits past its own date under "COMING UP".
11. **Home ignores scheduled releases**, the largest pending event a player can have.
12. **The day-advance control is gated behind publishing**, making every pre-release lead time
    unreachable.

### P2 — meaningful weakness, game still works

13. **YOUR STORY is broken** — all entries wall-clock dated, dominated by lapse noise, omitting
    releases, battles and the transition.
14. **Metric calibration** — Respect 100 "Untouchable" after 26 days and two defeats.
15. **Character voice does not evolve**; promoters and rivals reuse their introduction verbatim.
16. **Scouting contradicts battle history.**
17. **Opportunity volume without variety** — ~1/day from 4 promoters on one template.
18. **The Come Up's two lines read as a stutter** ("Your name is starting to travel." / "The name is
    starting to travel.").
19. **Two date systems** visible side by side; career "Started 2026/09/04" after chapter "Began
    2026/01/16".
20. **Money stops mattering** after week one.

### P3 — polish

21. Play button, waveform and transport imply audio that does not exist.
22. *"Starting capital. Nothing has spent it and nothing has grown it."* — false.
23. *"Your **first** studio session is ready"* on the second.
24. Group discovery says "Five questions" and asks seven; step counter goes "3 of 5" → "3 of 4".
25. Track titles churn across versions; titles reused across records.
26. Direction defaults to *"Introduce myself — Nobody knows who you are yet"* deep into The Come Up.
27. `"37 unread messages"` on a brand-new career — counts leak across careers.
28. Option cards expose no accessible name.
29. "needs venue" / "needs contacts" read as locks but are selectable.
30. Landing page still uses "ACT I/II/III" and imperative act lines, contradicting the chapter
    grammar M9 established.
31. Origin ("Soweto") did not determine home scene (Alexandra) despite *"It shapes which scene
    notices you first."*
32. "four hundred people decide" in a 220-capacity room.

---

## 33. The largest experiential constraint

Derived, not assumed.

```
Strongest loop            a world event arrives → I decide → it resolves → the world changes
Strongest source of       being reacted to by named people: Naledi's offer, MO's return,
desire                    KGOSI's callout, the 3–0 verdict
Largest break in          the resolution step. Events I commit to resolve invisibly, and
that loop                 repeated events resolve identically
Underlying player need    "the things I choose must report back, and must report back
                          differently because of what I chose"
System territory          consequence reporting and event differentiation — not new content,
implicated                and not a new simulation
```

**The constraint is not that SAIFA lacks systems. It is that SAIFA's systems do not narrate their
own consequences.** Every P1 finding is one shape: the simulation computed something specific and
the interface reported something generic, or nothing.

The evidence is unusually clean because the simulation is unusually good. The Come Up was
*perfectly* justified — RECEPTION and PUBLIC_RECORD reached in the same tick, the second domain
supplied by a live performance — and it felt arbitrary **solely** because the performance that
caused it was never mentioned. Fix the reporting and that transition becomes one of the best
moments in the game without touching the evaluator.

---

## 34. M10 candidates, ranked

Derived from the evidence. **No specification is written here.**

### 1. Consequence reporting — make resolved events narrate themselves

**Evidence:** three performances with attendances 36/85/137 reported as *"You played a room"* and a
balance change · the show that caused The Come Up never mentioned · the battle result reachable only
via the calendar · 364 reception events reported as one repeated sentence · chemistry 100 with MO
never surfaced · The Come Up feeling arbitrary purely for want of its cause.

**Underlying need:** *what I committed to must come back and tell me what happened.*

**Why this outranks the others:** it is the only candidate that improves every strong system at
once — performances, battles, reception, relationships and the transition all fail in the same
place. It adds no new simulation; the facts already exist and are already correct. It is also the
prerequisite for judging anything else: I cannot tell whether battle strategy or release strategy
matter until the game reports outcomes in enough detail to compare them.

**What NOT to build:** a new screen. The surfaces exist. Also not more numbers — 36-of-120 needs to
arrive as a night that happened, not as a statistic.

**Question the milestone should answer:** *when something I chose resolves, does the game tell me
what happened, in words that could only describe that event?*

### 2. Differentiated outcomes — make repeated events diverge

**Evidence:** two battles, different strategies, R900 of preparation, identical 3–0 and
verbatim-identical closing prose · two opposite records, one cohort verdict · Tease vs Drop
imperceptible · fifteen identical reception headlines · offers from four promoters that differ only
in name, date and fee.

**Underlying need:** *my choices must produce visibly different futures.*

**Why second:** it matters enormously, but it is partly untestable until (1) lands — some of this
divergence may already exist in the simulation and simply not be reported. Sequencing it second
avoids rebuilding models that are already working.

**What NOT to build:** randomness. Unpredictable output is not surprise; the audit distinguishes
these and the game currently has the wrong one in battles.

**Question:** *if I make the same commitment twice with different preparation, can I tell from the
outcome which one I chose?*

### 3. Refusal and cost — make "no" mean something

**Evidence:** seven lapsed offers, zero consequences · *"Naledi stopped waiting"* immediately
followed by a new Naledi offer · a promoter introduced as never chasing twice who chased five times
· money ceasing to constrain after week one · no action that can fail.

**Underlying need:** *the world's patience must be finite, so that saying yes means something.*

**Why third:** it deepens tension considerably, but with (1) and (2) unfixed a player would simply
be punished by systems they still cannot read.

**What NOT to build:** punishment for its own sake, or a scarcity economy. The need is that
declining is *remembered*, not that the player is squeezed.

**Question:** *can I lose access to something by not answering it?*

---

## 35. Open questions

1. Does per-record creative direction measurably move reception in the simulation, and is it merely
   unreported — or is the Sound DNA term genuinely dominant? This changes whether the fix is
   reporting or modelling.
2. Did my two battles differ at all internally, or did strategy genuinely not reach the resolver?
3. Is the ~1-offer-per-day cadence intended, and should promoter patience be finite?
4. Should the day-advance control exist before the first release — and if it does, what happens on
   an empty day?
5. Is Respect 100 in 26 days a calibration bug or an intended early ceiling?
6. Should origin actually determine home scene, or should the onboarding copy stop promising it?
7. Is silent audio a permanent stance? If so, the transport and waveform are actively misleading and
   the record page needs a different metaphor.
8. Does the Crew screen need surfacing from Home, or do relationships need to generate their own
   events?
9. Is the two-database defect the reason no one has played a fresh career recently — and are there
   other findings here that a seeded developer would never hit?

---

## Answer to the closing question

> *If all implementation knowledge disappeared and this were simply a game you discovered on the
> internet, what would make you come back tomorrow?*

**KGOSI.**

Not the numbers, not the fans, not the chapter. A named rival who called me out *because my name
had started travelling*, whom I prepared for and lost to 3–0 in front of everybody, with three
judges who each explained exactly why, and a closing line that said *"whatever this is between you
and KGOSI, it isn't finished."*

I came back for that. I would have come back a third time.

I stopped because the second fight returned the same words as the first — which tells you both what
SAIFA already has, and precisely what it is missing.
