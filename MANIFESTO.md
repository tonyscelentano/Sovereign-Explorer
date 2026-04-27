# The Sovereign Explorer Manifesto

> *"A File Explorer that rules them all."*

---

## The Problem

Windows File Explorer has barely evolved in a decade. It is slow, opaque, and dumb. It does not know what your files mean, what you are working on, or what your system is doing underneath. Meanwhile, "premium" alternatives are either bloated Electron wrappers or niche power-user tools too hostile for everyday use.

---

## What We Are Building

**Sovereign Explorer** is a GPU-accelerated, telemetry-aware, fully customizable file explorer for Windows. It is built with Tauri (Rust + WebView), a Python sidecar for system intelligence, and a modular ES6 frontend with zero bundler overhead.

It is not trying to be an OS. It is trying to be the best possible version of one single, humble thing: **a file browser** — and to do that one thing so well, so reliably, and so elegantly, that nobody needs anything else.

---

## Core Principles

### 1. Lean Engineering, Zero Bloat
Every feature must earn its place. If it does not make the user faster or smarter, it is cut. We do not ship convenience wrappers. We ship precision tools.

### 2. GPU Where It Counts
The GPU exists in every machine that runs this app. We use it for semantic search (vector similarity over your files), icon rendering, and spatial layout. Not for gimmicks. The user should barely feel it running — but they will *feel* the results.

### 3. Python for Intelligence, Rust for Speed
The Python sidecar is the live nervous system: disk I/O metabolism, diff tracking, file system events, deep metadata extraction. Rust is the skeleton: fast, safe, and in total control of the OS surface. They communicate over a low-latency JSON pipe. The frontend never blocks.

### 4. Moddable to the Bone
Inspired by Foobar2000's snap-grid layout philosophy: every panel is a widget, every widget is toggleable, every column is configurable. The layout is yours. Power users can go deep. Daily users get sensible defaults.

### 5. Open Source, Always
No licensing. No telemetry phoning home. No dark patterns. The code is the product. The community is the roadmap.

---

## The Target User

There are two of them, and we serve both without compromise.

**The Power User** — Wants disk I/O rates in their toolbar. Wants to see Git-style diffs on their files in real time. Wants snap-grid panel layouts and custom column configurations. Wants to never touch the mouse when keyboard shortcuts exist.

**The Daily User** — Wants something that opens fast, looks good, doesn't crash, and just gets out of the way. Wants to drag files, see thumbnails, and know when something was last modified without hunting through Properties dialogs.

These two users are not in conflict. They are the same person at different hours of the day.

---

## The North Star

> A File Explorer that is neither bloated nor underdeveloped.
>
> Perfectly, leanly engineered. Highly modular. Deeply moddable.
>
> A workspace that knows your files — not just where they live, but what they are.
>
> That is the Sovereign Explorer.

---

*Open source. Built with Tauri, Rust, Python, and vanilla JS.*
*No Electron. No npm bloat. No subscriptions.*
*Just a really, really good file explorer.*

---

**Version:** Pre-Alpha  
**Started:** April 2026  
**License:** MIT (TBD)
