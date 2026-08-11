# M7 — The player experience

**Baseline:** tag `m7-headless` (commit `659f607`). The director, its lifecycle,
its conflicts and its causal record all exist and are proven. Nothing in this
document requires a new domain capability; where the build needs a capability that
exists but has never been used from this direction, it says so explicitly.

This is the UX acceptance specification. It is not a wishlist.

## The principle

> **Opportunities are world events, not tasks.**

A career does not receive quests. People with something to gain get in touch, on
their own schedule, about a specific night or a specific room, and they stop
waiting when it suits them. Everything below follows from that, and from one
further constraint the headless system already imposes: **the world creates, the
screens reveal.** No interface in this specification may cause an opportunity to
exist, expire, or change its mind.

Each surface answers exactly one question, which is what keeps the model coherent
as more opportunity types arrive:

| Surface | The question it answers |
|---|---|
| **Messages** | Somebody wants something from me. |
| **Home — "On the table"** | What requires my attention now. |
| **Offer detail** | What exactly am I being asked to decide? |
| **Calendar** | What I committed to. |
| **Studio** | What I agreed to make. |
| **Career** | What eventually became history. |
| **World** | What became publicly observable. |

## There is no Missions screen, and the architecture says so

The question was whether the existing system demonstrates that a generic
Missions/Quest Log is necessary. It demonstrates the opposite, on five counts.

1. **`MAX_LIVE_OPPORTUNITIES = 3`.** There is no backlog and cannot be one. A
   dedicated list screen for at most three items is a screen that is empty or
   nearly empty every time it is opened.
2. **Every opportunity has a source character.** `source_entity_type` is
   `CHARACTER` for all three types, and `trigger_reason` is already written in
   that person's terms. Every offer in this system is *somebody asking*. The
   surface for somebody asking already exists and is called Messages.
3. **Every opportunity has a date and an expiry in game time.** These are things
   happening on a schedule, not entries awaiting a tick.
4. **Accepting already produces a calendar item.** `acceptOpportunity` writes a
   `PERFORMANCE` row with `related_entity_type = 'OPPORTUNITY'`. The post-decision
   home of a showcase is the Calendar, which exists.
5. **The authored precedent already works this way.** Thabo's producer
   introduction has arrived as an NPC message since M2, with the offer reachable
   from the message. Nobody has ever needed a quest log to find it.

What the player *does* need is a single place to see **what is currently being
asked of them**, because a support slot with three days on it must not be
missable, and because two offers competing for the same night have to be seeable
side by side before a decision. Home's "Right now" already exists for the first
need. The second needs one new section, described below — a set of live offers,
never a log of tasks.

**Decision: no Missions route, no Missions nav item, no quest vocabulary.** The
word "opportunity" never appears in player-facing copy; `/opportunities/*` remains
the URL space because it already is one and URLs are not copy.

## Surface map

| Surface | Role for offers | Status |
|---|---|---|
| **Notifications** | First awareness when the player is not looking. | Exists; needs offer entries |
| **Messages** | Where an offer arrives, in the voice of the person offering. Where the player's answer is recorded afterwards. | Exists; needs the director to write messages |
| **Home** | "Right now" points at the most pressing thing. "On the table" — the live set, at most three, conflicts visible — appears only while offers exist. | Exists; needs one conditional section |
| **Offer detail** | The full terms, the clash, the decision. | **New screen** |
| **Calendar** | Where an accepted night lives afterwards. | Exists; needs `PERFORMANCE` rendering |
| **Studio** | Where an accepted session invite goes. | Exists |
| **Career** | Remembered history: taken, turned down, lapsed, lost to a clash. | Exists; needs offer entries in the story |
| **World** | The scene, and the people in it who book rooms. | Exists; small addition |
| **Crew** | Unchanged. Crew is a standing arrangement, not an offer. | No change |
| **World Control** | The machinery. Already built and already complete. | No change |

**No new navigation item.** Awareness arrives through the Messages badge, which
already exists and already counts unread NPC messages.

## The player/internal boundary

Everything in the left column exists in the data and **must never reach a
player**. The right column is what the same fact sounds like in the fiction.

| Internal | Player-facing |
|---|---|
| `ranking.score = 42.93` | *nothing* — score decides ordering, never wording |
| `ranking.contributions[].term/weight` | *nothing* |
| `rank`, `liveCap`, `suppressedBy`, `OUTRANKED_BY_CAP` | *nothing*; suppressed candidates do not exist to the player |
| `sceneStanding = 6.4005` | "Braamfontein has started to notice you" (via the promoter's own line) |
| `promoterStandard`, `promoterSupportStandard` | *nothing* — expressed only as which end of the bill was offered |
| `SCENE_KNOWS_YOU`, `RECORD_IS_MOVING`, rule names | *nothing* |
| `NOT_ALREADY_OFFERED`, `SOURCE_NOT_ALREADY_WAITING` | *nothing* — these are reasons an offer is absent, and absence is silent |
| `idempotency_key`, `director_version`, `trigger_state` | *nothing* |
| `opportunity_conflicts.kind = CALENDAR_SLOT` | "Both want Friday the 19th" |
| `status = WITHDRAWN` | "No longer possible — you took the rooftop instead" |
| `status = EXPIRED` | "Naledi filled the slot" |
| `billing = HEADLINE` | "Headlining" |
| `billing = SUPPORT` | "Opening the night" |
| `payout_minor` | formatted money |
| `expires_at_game_time` | "Answer by 14 January" / "2 days to answer" |
| `capacity` | "a 120-capacity room" |
| `momentum`, `heat`, pressure decimals | *nothing new* — already handled by M5's existing state words |

**The rule for absence:** when the world has nothing to offer, the interface says
nothing. It must never render "no showcase available because your scene standing
is too low", or a greyed-out offer, or a locked row. BRIGHT has no session invite;
BRIGHT is told nothing about session invites.

**One finding for the build.** `trigger_reason` strings were written for the
inspector and one of them reads slightly meta to a player — *"…room on the bill
for somebody the scene is still learning."* Player-facing copy should come from the
promoter's own `offer_line` and `terms_line`, with the reason rewritten in a
player register. Recommendation: add a player-facing reason line to the seeded
promoter profile rather than reusing the diagnostic string. This is copy, not a new
capability.

## The complete journey

```
world state
  │   reception, relationships, moments, calendar, the people in the scene
  ▼
opportunity generated                    ← DAY ADVANCE ONLY. Never a render.
  │   persisted with its reasoning
  ▼
communicated                             ← separate, idempotent, retryable
  │   the source character writes a message about the offer that now exists
  ▼
awareness
  │   notification · Messages badge · Home "On the table" · "Right now"
  ▼
consideration
  │   offer detail: terms, the night, the fee, what it clashes with
  ▼
decision
  │   accept → booking + the loser withdrawn, named
  │   decline → recorded, a reply in the thread
  │   neither → the world passes the date and it lapses on a later day advance
  ▼
calendar / world consequence
  │   PERFORMANCE on the Calendar, or a session in the Studio
  ▼
remembered history
      Career story · the Messages thread · World Control
```

Two properties of that chain are acceptance criteria, not implementation details:

- **Opening any screen at any point must not advance it.** Ten visits to Home
  before letting a day pass show the same world ten times.
- **Every arrow after "generated" is reversible in the reading direction.** From a
  calendar entry the player can reach the offer; from the offer, the message; from
  the message, the person. Causality reads backwards.

---

# Per-type specification

## 1. `SHOWCASE_SLOT` — a promoter with a night

The primary generated type. Both golden careers receive these.

**Awareness.** On the day advance that generated it: a notification, an unread
message, and a card in Home's "On the table". Never on render.

**Who communicates it.** The promoter, by name — Naledi, Dineo, Tumi or Sizwe —
in a new or existing conversation with that character. This is the first time the
world will hold conversations with people other than Thabo, which is a
straightforward use of `npc_conversations` (already unique per career+character)
and `npc_messages` (already carries `payload.opportunityId`). **The director does
not currently write messages; the player-facing build must add that.**

**The message is presentation, and must not be part of the offer's transaction.**
The offer is the world fact; the message is how a person tells you about it. A
separate, idempotent, deterministic step reads persisted offers and writes the
communication for any that lack one. Three properties follow, and all three matter:

- **A failed message never costs an offer.** If the communication cannot be
  written, the offer still exists and Home still surfaces it. The world does not
  lose a promoter's night because a conversation row failed.
- **It is retryable without inventing anything.** Re-running it produces the same
  message from the same persisted facts, keyed per opportunity, so it can safely
  run again on the next day advance.
- **It does not violate the constitutional rule.** It creates no opportunity and
  decides nothing. But it is still a *write*, so it belongs to the day advance
  alongside the director — never to a render path. A screen must not conjure a
  message any more than it may conjure an offer.

**Initially revealed.** The promoter's own line, the room, the scene, the night,
which end of the bill, and how long there is to answer. Nothing about why the
world thinks the player qualifies beyond what the promoter would actually say.

> **Naledi** · Braamfontein · 2 days ago
> I've got a rooftop in a week and a half-hour I'd give you.
> **Rooftop hours** — Fri 16 Jan · opening the night · answer by 14 Jan

**Full offer.** `/opportunities/[id]`. Promoter, room and capacity, scene, date and
time, billing, fee, terms, answer-by date, and — when one exists — the clash.

**Accept.** From the offer detail. If it clashes with another live offer, a
confirmation step names what will be lost (see §4). On success: the night appears
on the Calendar, Home moves the offer from "On the table" to the next thing, the
thread gains the player's answer and the promoter's acknowledgement, and Career's
story gains an entry.

**Visible change on accept.** A `PERFORMANCE` entry on the Calendar at the night's
date, titled with the room and the scene. Home's "Next" line in career context
picks it up automatically — that already reads `nextCalendarItem`. Nothing about
Fame, Respect or Heat moves, and the interface must not imply it has: the night
has been *booked*, not performed.

**Visible change on decline.** The card leaves "On the table". The thread records
that it was turned down. Career's story shows it as turned down. **No penalty is
shown**, because none is computed — M7 writes no relationship state on decline.
The promoter's acknowledgement is short and neutral in tone.

**Expiry.** Happens on a day advance after the answer-by date passes. The player
learns *afterwards*, from the promoter: "Filled the slot. Next time." A
notification, a message, the card gone from "On the table", and an entry in
Career's story reading **lapsed** — distinct from turned down.

**Withdrawal.** See §4.

**Afterwards.** Messages keeps the thread. Home shows the booking via "Next".
Calendar holds the night. Career's story holds the decision. World's scene page may
list the promoter as somebody who has booked you.

## 2. `SESSION_INVITE` — somebody wants to make another record

KXMO receives one from LEX. BRIGHT receives none, and is told nothing about it.

**Awareness.** Notification, unread message, "On the table" card.

**Who communicates it.** The producer the career actually worked with. For KXMO
that is LEX, who already has a relationship, a history of specific creative
decisions, and — in the golden run — an open `WANTS_TO_TALK` moment. The invitation
and the moment are different things and must stay visibly different: the moment
belongs to Crew and asks *how do you answer him*; the invitation belongs here and
asks *do you want to make another record*.

**Initially revealed.** Who, what it follows, the fee, roughly when.

> **LEX** · yesterday
> That one worked. I've got time next week if you want to go again.
> **Another session** — from 22 Jan · R1,500 · answer by 19 Jan

**Full offer.** `/opportunities/[id]`. Producer, what the last record was, the fee
against the current balance, the proposed date, answer-by date.

**Accept.** Charges the fee and books the session, exactly as `selectProducer`
does today, and lands the player in the Studio. **If the balance will not cover
it, the offer is still shown and the accept action explains the shortfall** — the
world offering something a career cannot afford is a real situation, and hiding it
would be dishonest about what the world thinks of them.

**Visible change on accept.** A `STUDIO` calendar entry, a session the player can
walk into, the balance reduced with a ledger entry, and Home's "Right now"
switching to the session. This reuses the entire M3 path.

**Visible change on decline.** Removed from "On the table", recorded in the thread
and in Career's story. Again no penalty shown.

**Expiry.** "Filled the week. Another time." Recorded as lapsed.

**Afterwards.** The thread; the session in the Studio and on the Calendar; the
track in the Catalogue if it is finished.

## 3. `PRODUCER_INTRO` — the authored introduction

Already works and **must keep working exactly as it does.** It arrives from Thabo
on entering The Underground, the message links to `/opportunities/producers`, and
choosing a producer resolves it.

The only change: it should render inside the same "On the table" section as
everything else, so the player cannot tell an authored offer from a generated one
— which is the brief's requirement. Its card links to the existing producer
screen rather than the generic offer detail, because choosing between three
producers is a different interaction from accepting one night.

## 4. Competing offers — the same night

The scenario, taken from the proven headless behaviour: after declining what was
on the table and letting a day pass, KXMO is offered **Naledi's rooftop** and
**Dineo's basement**, both on Friday 19 January, both headlining. A
`CALENDAR_SLOT` conflict is recorded. Accepting one withdraws the other.

**Before the decision.** The conflict is visible without opening anything. Both
cards sit in "On the table" joined by a marker on the shared date.

```
ON THE TABLE                                          2 offers

┌─ Friday 19 January ──────── both of these want this night ─┐
│  Naledi · Rooftop hours · Braamfontein                     │
│  Headlining · 120-capacity · R400 · answer by 17 Jan        │
│                                            [ Look at it ]  │
│ ·········································································· │
│  Dineo · Basement sessions · Braamfontein                  │
│  Headlining · 80-capacity · R250 · answer by 16 Jan         │
│                                            [ Look at it ]  │
└─ Taking one means letting the other go. ───────────────────┘
```

**On the offer detail.** The clash is stated in the offer's own terms, with the
competing offer reachable and comparable.

**At the moment of accepting.** A confirmation, because the consequence reaches
beyond the thing being accepted. The language is a person's, not a system's — what
is being decided is an availability, not a conflict resolution:

> **This means turning down Dineo's offer.**
> Both shows are Friday night. If you take Naledi's rooftop slot, you won't be
> available for Dineo's.
> [ Take Naledi's slot ] [ Not yet ]

The primary action names what is being taken. It never says "Confirm", "Resolve"
or anything that describes the machinery rather than the choice.

**Immediately after.** The rooftop is on the Calendar. Dineo's card is **replaced
in place** — not silently removed — with an explicit resolution, then drops out of
"On the table" on the next navigation:

> **Dineo · Basement sessions**
> No longer possible — you took Naledi's rooftop the same night.

And Dineo sends a short message, so the person who offered is the one who tells
the player it is over. Career's story records it as **lost to a clash**, which
reads differently from turned down and from lapsed.

**Acceptance criterion.** The four endings must be distinguishable to a player
without any internal vocabulary:

| What happened | How the player sees it |
|---|---|
| `RESOLVED` | It happened |
| `DECLINED` | You turned it down |
| `EXPIRED` | They stopped waiting |
| `WITHDRAWN` | You chose something else that night |

---

# The golden careers as scenarios

## KXMO — a record the scene took seriously

State after three days: a released single that found the scene heads and the
tastemakers, Braamfontein and Newtown both aware, LEX with high respect and real
tension, and an open moment.

**Day 1.** Nothing but reception. Home leads with the record.

**Day 2.** Naledi gets in touch. Notification, one unread message, Home gains "On
the table" with a single card: *Rooftop hours, opening the night, Friday 16
January.* "Right now" points at the message because it is unread.

**Day 3.** Tumi gets in touch — Newtown, the live room, **headlining**. LEX gets in
touch about another session. Three cards on the table. The player can see, without
being told any numbers, that one promoter wants them to open and another wants
them to carry a night — which is the entire story of where this career stands.

What KXMO must never see: that Dineo was also willing and lost on ranking; that
Sizwe's Soweto night was out of reach; any score; any threshold.

**A plausible path.** Accept Tumi's headline slot → `PERFORMANCE` on 20 January.
Accept LEX → session booked, fee charged, Studio waiting. Let Naledi's rooftop
lapse → on the day after 14 January, Naledi says she filled it, and Career's story
records a lapse. Three offers, three different endings, all legible.

## BRIGHT — a record that reached fewer people and asked less of them

State after three days: a bright, immediate single aimed at everybody, which in a
city where casual listeners discover almost nothing reached fewer people; the scene
barely registers it; ZERO has neither the chemistry nor an open moment.

**Day 3.** Naledi and Tumi both get in touch, and **both offer the opening slot.**
Two cards, no conflict (different nights), no session invite.

The design requirement here is restraint. BRIGHT is not shown a locked headline
slot, a "you need more scene credibility" hint, a progress bar toward Dineo's
standard, or any acknowledgement that a session invite was considered and refused.
The world simply offered two opening slots. **The difference between KXMO and
BRIGHT is expressed entirely through what arrives, and never through what is
withheld.**

This is what makes the pair a good UX test: an interface that leaks the director
will look almost identical for both careers with different numbers attached. An
interface that respects the boundary will feel like two different careers.

---

# Screens and states

Wireframes are structural. Copy is indicative and should be treated as tone
direction, not final strings.

## S1. Home — modified

One new section, and it is **contextual, not structural**. Home does not have an
offers area that is sometimes full. Home *gains* a section when the career has live
offers and *loses* it when it does not.

So the shape of the page changes with the career:

```
nothing live      Your record → Right now → Standing → Your story
offers live       Your record → Right now → ON THE TABLE → Standing → Your story
```

"Right now" stays first because it is the single most pressing thing; "On the
table" follows because it is everything that is waiting. A career with nothing
waiting has a shorter Home, not an emptier one.

**There is no empty state.** The section is not rendered, and the words
"Nothing right now", "No offers" or any equivalent must never appear. Rendering an
empty offers area is the same violation as greying out a locked one: it tells the
player the world has a slot for something it has not offered them.

```
┌──────────────────────────────────────────────────────────────┐
│ KXMO                                    The Underground      │
├──────────────────────────────────────────────────────────────┤
│ YOUR RECORD                                                  │
│ SCENE FIRST is finding its people.                           │
│ 76 unique listeners · 5 new fans · 3 days out                │
│                        [ Let a day pass ]  See how it's …    │
├──────────────────────────────────────────────────────────────┤
│ RIGHT NOW                                                    │
│ Tumi sent you a message.                                     │
│ Somebody in Newtown wants you on a bill.                     │
│                                            [ Read it ]       │
├──────────────────────────────────────────────────────────────┤
│ ON THE TABLE                                       3 offers  │  ← new,
│                                                              │     conditional
│  Tumi · The live room · Newtown                              │
│  Headlining · Tue 20 Jan · answer by 16 Jan                   │
│                                            [ Look at it ]    │
│                                                              │
│  Naledi · Rooftop hours · Braamfontein                       │
│  Opening the night · Fri 16 Jan · answer by 14 Jan            │
│                                            [ Look at it ]    │
│                                                              │
│  LEX · Another session                                       │
│  From 22 Jan · R1,500 · answer by 19 Jan                      │
│                                            [ Look at it ]    │
└──────────────────────────────────────────────────────────────┘
```

- **Ordering** follows the director's ranking, unlabelled. The player sees a
  sensible order and is never shown that it is an order.
- **Count** is "3 offers", never "3 of 3" — the cap is not player-facing.
- **Answer-by** switches to a relative form inside two days: "answer by tomorrow",
  "last day to answer".
- **"Right now"** gains offer cases, prioritised beneath an active session and
  above the release: an unread offer message, then the live offer whose answer-by
  is soonest.
- **Conflicts** render as the grouped treatment from §4.

## S2. Messages list — modified

```
MESSAGES
┌──────────────────────────────────────────────────────────────┐
│ ● Tumi            The live room, Newtown        2 min ago    │
│   I've got a slot on a bill in Newtown. House band…          │
│                                          ⟡ offer waiting     │
├──────────────────────────────────────────────────────────────┤
│ ● Naledi          Braamfontein                  yesterday    │
│   I've got a rooftop in a week and a half-hour…              │
│                                          ⟡ offer waiting     │
├──────────────────────────────────────────────────────────────┤
│ ● LEX             Producer                      yesterday    │
│   That one worked. I've got time next week…                  │
│                                          ⟡ offer waiting     │
├──────────────────────────────────────────────────────────────┤
│   Thabo           Connector                     6 days ago   │
│   MO, then. Session's booked — don't waste it.               │
└──────────────────────────────────────────────────────────────┘
```

The marker reads "offer waiting" and disappears once answered. Multiple
conversations now exist per career, which the schema already supports.

## S3. Message thread — modified

The offer appears as a card inside the conversation, in place, and the answer is
recorded in the thread afterwards so the fiction closes.

```
NALEDI                                             Braamfontein
────────────────────────────────────────────────────────────────
  Naledi                                              yesterday
  I've got a rooftop in a week and a half-hour I'd give you.

  ┌────────────────────────────────────────────────────────┐
  │ ROOFTOP HOURS · BRAAMFONTEIN                           │
  │ Friday 16 January · opening the night                  │
  │ 120-capacity · R400 · answer by 14 January             │
  │ Thirty minutes, paid on the night, bring your own      │
  │ people.                                                │
  │                                     [ Look at it ]     │
  └────────────────────────────────────────────────────────┘
────────────────────────────────────────────────────────────────
```

After a decision the card collapses to its outcome and the reply is appended:

```
  You                                                     today
  Taking it.

  Naledi                                                  today
  Good. Don't make me regret the slot.

  ┌ ROOFTOP HOURS — taken · Friday 16 January ─────────────┐
  │                                    [ On your calendar ]│
  └────────────────────────────────────────────────────────┘
```

## S4. Offer detail — new

Route `/opportunities/[id]`. Desktop: two columns, terms left, context right.
Mobile: single column, sticky action bar.

```
← Naledi

OPENING THE NIGHT
Rooftop hours · Braamfontein

"I've got a rooftop in a week and a half-hour I'd give you."
                                                      — Naledi

┌─ THE NIGHT ──────────────────────────────────────────────────┐
│ Friday 16 January, evening                                   │
│ A 120-capacity rooftop on Juta Street                        │
│ You'd be opening                                             │
└──────────────────────────────────────────────────────────────┘

┌─ THE TERMS ──────────────────────────────────────────────────┐
│ R400, paid on the night                                      │
│ Thirty minutes, bring your own people                        │
└──────────────────────────────────────────────────────────────┘

┌─ WHAT ELSE IS THAT WEEK ─────────────────────────────────────┐
│ Nothing. The night is free.                                  │
└──────────────────────────────────────────────────────────────┘

You have until 14 January to answer.

[ Take it ]   [ Turn it down ]
```

- **"What else is that week"** is read from the Calendar. When another live offer
  wants the same night it becomes the clash panel (S5).
- **No** score, standing, rule, threshold or reasoning beyond the character's line.
- **Terminal states** replace the actions with the outcome and a route onward:
  taken → Calendar; turned down → the thread; lapsed → the thread; withdrawn → the
  offer that displaced it.

## S5. Offer detail, competing — new state

```
┌─ SOMETHING ELSE WANTS THAT NIGHT ────────────────────────────┐
│ Dineo has a basement session the same Friday.                │
│ Taking this one ends that one.                               │
│                                    [ Compare them ]          │
└──────────────────────────────────────────────────────────────┘

[ Take it ]   [ Turn it down ]
```

"Compare them" opens a side-by-side on desktop (a drawer) and a stacked comparison
on mobile, showing only what differs: room, capacity, fee, terms, billing,
answer-by. No scores. The player compares a 120-capacity rooftop paying R400
against an 80-capacity basement paying R250 and decides which they would rather
play — which is the actual decision.

## S6. Accept confirmation — new, conditional

Shown **only** when accepting will withdraw another live offer, because that is
the one case where the consequence exceeds the action.

```
        ┌──────────────────────────────────────────────────┐
        │ This means turning down Dineo's offer.           │
        │                                                 │
        │ Both shows are Friday night. If you take         │
        │ Naledi's rooftop slot, you won't be available    │
        │ for Dineo's.                                     │
        │                                                 │
        │        [ Not yet ]   [ Take Naledi's slot ]      │
        └──────────────────────────────────────────────────┘
```

Accepting with no clash needs no confirmation. Declining never needs one — it is
recorded, not destructive, and a promoter may come back with a different night.

## S7. Withdrawal — new state

Rendered in place where the offer was, on Home and in the thread, before it leaves
the live set.

```
  Dineo · Basement sessions · Braamfontein
  ┌──────────────────────────────────────────────────────────┐
  │ NO LONGER POSSIBLE                                       │
  │ You took Naledi's rooftop the same night.                │
  │                              [ See what you took ]       │
  └──────────────────────────────────────────────────────────┘
```

## S8. Expiry — new state

Arrives with a day advance and is reported by the person, never by the system.

```
  Naledi                                                  today
  Filled the slot. Next time.

  ┌ ROOFTOP HOURS — lapsed · Friday 16 January ────────────┐
  └────────────────────────────────────────────────────────┘
```

The day-advance result already returns `expired`; Home may surface a single line
on the advance — "Naledi filled her slot." — in the same place the day's other
consequences are reported.

## S9. Calendar — modified

`PERFORMANCE` entries from accepted showcases, distinguished from `STUDIO`, and
linking back to the offer they came from.

```
JANUARY

  Tue 6    STUDIO      Session with LEX                completed
  Fri 9    RELEASE     SCENE FIRST                     out
  Fri 16   PERFORMANCE Rooftop hours · Braamfontein     booked
                       Opening · 30 minutes · R400
                                              [ The offer ]
  Tue 20   PERFORMANCE The live room · Newtown          booked
```

## S10. Career — modified

The story gains offer history, with the four endings kept distinct.

```
YOUR STORY

  OFFER      Took a headline slot at The live room, Newtown    20 Jan
  OFFER      Turned down Basement sessions, Braamfontein       13 Jan
  OFFER      Rooftop hours lapsed — Naledi filled the slot     14 Jan
  OFFER      Basement sessions ended — you took the rooftop    13 Jan
  RELEASE    SCENE FIRST is out                                 9 Jan
```

## S11. World — modified, small

The scene page lists the people who book rooms there, as world knowledge rather
than as an offer surface. Naledi and Dineo under Braamfontein, Tumi under Newtown,
Sizwe under Soweto. Nothing here is actionable and nothing here reveals whether an
offer is possible — that would be a locked door, which the boundary forbids.

## S12. Notifications — modified

```
  ⟡  Tumi has a slot on a bill in Newtown              2 min ago
  ⟡  LEX wants to make another record                  yesterday
  ⟡  Naledi filled her rooftop slot                    yesterday
  ✓  You took the live room, Newtown                   yesterday
```

---

# Desktop and mobile

**Desktop.** The offer detail is a route with the existing `AppShell` two-column
layout: terms and actions in the main column, the night and what else is that week
in the context rail. Comparison of competing offers opens in the context drawer,
so both offers stay on screen at once. "On the table" renders as up to three
cards in a row on wide viewports, stacked below 1024px.

**Mobile.** Offer detail is a full-screen route with a **sticky action bar**
carrying "Take it" / "Turn it down", because the terms will scroll past the fold.
Comparison is a stacked view with the shared night pinned to the top so the reason
for the comparison stays visible while scrolling. "On the table" cards stack;
conflicting offers keep their shared-night header as a single grouped block that
cannot be visually separated by scroll position. Existing mobile bottom navigation
is unchanged, and Messages carries the unread badge that drives awareness.

**Both.** Every card is a full-width tap target with a minimum 44px action height,
consistent with the existing release and crew paths.

# Navigation and information-architecture changes

Deliberately minimal. Only these are necessary:

1. **New route** `/opportunities/[id]` — the offer detail. `/opportunities/producers`
   stays exactly as it is.
2. **New Home section** "On the table", conditional on live offers.
3. **"Right now" gains offer cases**, prioritised beneath an active session.
4. **Messages becomes genuinely multi-conversation** in the interface. The schema
   already is; the list has only ever had Thabo in it.
5. **Calendar renders `PERFORMANCE`** and links back to the originating offer.
6. **Career's story admits offer entries** with four distinct endings.

**Explicitly not needed:** a Missions route, a Missions nav item, an offers
inbox separate from Messages, a badge on Home, a new bottom-nav slot, or any
progress/quest metaphor.

# Implementation order

None of this is new domain capability; all of it is existing capability used from a
new direction. The order is deliberate — each step is the precondition for the
next, and the first exists to make the boundary unbreakable before anything is
rendered.

## 1. The player-facing read model — before any screen

This is the product boundary, and it should be enforced structurally rather than by
discipline. Build a projection that takes an `OpportunityRow` and returns only the
fields named in this document, with no path by which `eligibility`, `ranking`,
`trigger_state`, `director_version`, `idempotency_key`, scene-standing figures,
rule names or suppression reasons can reach a component.

```
internal opportunity  →  player opportunity projection  →  UI
```

Not "query everything and promise not to render some of it". The
`queries/relationships.ts` / `queries/relationship-view.ts` split is the precedent
M6 established and it worked. If a screen needs a field the projection does not
expose, that is a conversation about the boundary — not a reason to reach around
it.

## 2. Character messaging as a separate presentation step

The director creates the opportunity. A distinct, deterministic, idempotent step
reads persisted offers and writes the corresponding communication from the source
character.

**The message must not be what creates the offer, and must not share its
transaction.** If the communication fails, the offer still exists and Home still
surfaces it; the message is retried on its own on a later day advance. It is still
a write, so it belongs to the day advance and never to a render path.

## 3. Deterministic character copy

No model, in this milestone or the next. Fixtures on the seeded profile,
conditioned on the two axes already in the data:

- **billing** — `SUPPORT` / `HEADLINE`
- **moment** — offer / accepted / declined / expired / withdrawn

Plus session-invite copy for the producers. Voice should stay recognisable — Naledi
direct, Dineo particular, Sizwe unhurried, LEX saying as little as possible —
**without becoming theatrical.** These are people sending short messages about a
Friday, not delivering monologues.

## 4. `SESSION_INVITE` acceptance creates a real Studio session

The most important gameplay consequence in the milestone. Accepting must charge the
fee through the ledger, create the `creative_session`, seat the participants and
land the player in the room — reusing `selectProducer`'s shape rather than building
a parallel path.

**This is what finally allows a second record.** Booking a session has always been
gated on the one-time producer introduction, so the whole game to date has been a
beautifully simulated *first* record. M7 is where a career can keep building a
catalogue, and it does so through emergent opportunity rather than a menu: somebody
who rated the last one asks for another.

## 5. Career-history projection

All four outcomes surviving in history, built from canonical events that already
exist. A year of career should read like a year:

```
JANUARY
  Headlined The live room, Newtown
  Turned down Naledi's rooftop slot
  Dineo's basement became unavailable after booking another show
  Back in the studio with LEX
```

That is what the persistent-career architecture was built for.

# Acceptance criteria

The player-facing build is done when:

1. No screen creates, expires or alters an opportunity. Opening everything
   repeatedly leaves the world identical.
2. An offer's first appearance is a message from a named person, with a
   notification and a Home card, on the day advance that generated it.
3. KXMO and BRIGHT feel like different careers, and the difference is carried
   entirely by what arrives — never by locked, greyed, or explained-away absence.
4. Two offers wanting the same night are visibly grouped before any decision, and
   accepting one ends the other in place, naming what displaced it.
5. Taken, turned down, lapsed and ended-by-a-clash are four distinguishable
   outcomes in Career, in Messages and in the offer detail.
6. No score, rank, weight, threshold, rule name, scene-standing figure, trigger
   state, identity key, cap or suppression reason appears anywhere outside World
   Control. A grep of the player-facing bundle for those field names returns
   nothing.
7. Accepting a night produces a Calendar entry and moves no metric.
8. Every consequence reads backwards: calendar → offer → message → person.

## The cross-surface causality test

The leakage test above protects the boundary. This one protects against drift —
the failure simulation-heavy products are most prone to, where each surface quietly
grows its own idea of what the offer was.

For a single offer, followed end to end:

```
director creates opportunity
  ↓
message created
  ↓
Home displays it
  ↓
Messages contains it
  ↓
offer detail shows the same terms and the same date
  ↓
accept
  ↓
Home no longer treats it as pending
  ↓
Calendar contains the booking
  ↓
the message thread reflects the acceptance
  ↓
Career reflects the outcome
```

**Every one of those surfaces must resolve to the same opportunity id, and no
surface may construct its own representation of the offer.** The night shown on
Home, in the thread, on the detail screen and on the Calendar is one date from one
row — not four independently formatted readings of it. The same applies to the
billing, the fee and the answer-by date.

This is an integration test, not a unit test, and it should walk the real surfaces
in the real order. It is the test that would catch a calendar entry titled from a
stale payload, a Home card showing a fee the detail screen disagrees with, or an
accepted offer that Home still thinks is waiting.

---

# What this settles beyond M7

The product consequence is larger than the milestone.

**Music RPG does not need missions in the conventional RPG sense, and should not
acquire them later.** What a player pursues can be, permanently:

- people calling,
- doors opening,
- things happening,
- deadlines approaching,
- commitments colliding,
- and consequences becoming history.

Every one of those is already a real behaviour of the system rather than a
metaphor laid over it. Battles, collaborations, labels and tours can each arrive
through the surface that already suits them — a challenge, an artist's message, a
meeting, a routing — while remaining one kind of world fact underneath.

The test for any future opportunity type is therefore not "where does this go in
the mission list", but **"who would tell the player, and where would the
consequence live".** If neither has an answer, the type is not ready.
