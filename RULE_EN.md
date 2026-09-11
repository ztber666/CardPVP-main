# CardPVP 🃏

---

## Overview

| Item | Description |
|------|------|
| **Genre** | Turn-based card battle game |
| **Players** | 2 |
| **Length** | 5 – 20 minutes |
| **Cards** | 45 kinds |
| **Standard HP** | 20 |
| **Standard hand limit** | 10 |

---

## Core Terms

| Term | Definition |
|------|------|
| **Status** | An effect that is not resolved immediately (see the Effects gallery) |
| **Timed status** | A status that lasts for n turns, marked `*n` |
| **Hand** | Cards a player owns that are neither in effect nor equipped |
| **Discard** | A special way to remove a card you own (available during your own play phase) |
| **Turn** | From one player starting to play until the other finishes playing is 1 turn (the two players do not share a single turn) |
| **End turn** | Skip your own play phase and pass to the opponent |

> **Turn note**: Each player has their own independent turn. A's turn runs from A starting to play until B finishes; then B's turn runs from B starting until A finishes, and so on.

---

## Game Flow

### 1. Start

- Both players battle with **standard HP 20** and **standard hand limit 10**
- Play order is assigned at random
- Each player draws **3 cards**
- The **first player** is chosen to play

### 2. Playing

- When it is **your turn**, draw **3 cards** (turn draw)
- Start playing; when you want to stop, you can **End Turn** to pass to the opponent

### 3. Winning

- The game ends when any player's HP reaches 0 or below

---

## Card Categories

### Action Cards 🗡️

Each turn you may play at most **1 attack card + 1 heal card** (counting toward the action/strategy total limit).

| Subtype | Description |
|------|------|
| **Attack** | Play at most 1 per turn; deals damage |
| **Heal** | Play at most 1 per turn; restores HP |

### Strategy Cards 🎯

Tactical support effects, including buffs, debuffs, and events.

| Subtype | Description |
|------|------|
| **Buff** | Applies a beneficial effect to yourself |
| **Debuff** | Applies a harmful effect to the opponent |
| **Event** | A triggered, one-off effect |

> **Play limit**: Each turn you may play up to **5** action and strategy cards in total (attack and heal within action cards are each further limited to 1).

### Equipment Cards 🛡️

When played, if the same type of equipment is already equipped, the old card is discarded and the new one equipped, occupying the matching equipment slot.

| Subtype | Description |
|------|------|
| **Armor** | Occupies the armor slot |
| **Weapon** | Occupies the weapon slot |
| **Field** | Occupies the field slot |

---

## Game Rules

1. **Hand limit** — When the number of cards you own (hand + equipment) reaches the limit (10), any newly drawn cards are **discarded** immediately
2. **Effect order** — When a card has multiple effects, they resolve in order
3. **Discarding does not trigger effects** — Discarding a card does not trigger its ongoing effects
4. **Non-positive amounts** — A damage or heal amount that is not positive counts as 0, yet still counts as one damage/heal event and triggers related effects
5. **No ally/enemy restriction** — Cards may target anyone, friend or foe
6. **Play limit** — Each turn you may play up to 5 action and strategy cards in total

---

## Status System

The game includes a wide variety of statuses (effects not resolved immediately), supporting stackable layers and turn countdowns on timed statuses; see the Effects gallery for details.

---

## Notes & Credits

CardPVP is an original PVP-MC series v8 by Endertrack; the digital edition was developed with AI and is currently at digital version 8.2.1 / paper version 8.2.2.

Thanks to all players for their support and feedback, and special thanks to **ztber666** for technical support and development help.
