# PASAJEROS DEL FUTURO — Transport Simulator

A Tetris-style game where the puzzle is: **how many people can you pack into a semi truck?**

Each falling piece is a cluster of passengers. Lock them in, clear rows to *load* them, and fill the rig to its capacity quota. When a truck is packed it **drives off** and a fresh rig pulls up (board clears, things speed up). Let the stack hit the roof and the **border patrol busts you** — game over.

## Play

Open `index.html` in any modern browser. No build step.

```bash
# optional local server (recommended so sprites load over http)
python3 -m http.server 8000
# then visit http://localhost:8000
```

### Controls
| Key | Action |
| --- | --- |
| ← → | Move |
| ↑ / Z / X | Rotate |
| ↓ | Soft drop |
| Space | Hard drop |
| C | Hold |
| P | Pause |

## How "filling a truck" works
- Clearing a full row **loads that row of passengers** (`COLS` people) into the current rig.
- Each rig has a capacity quota (`(4 + rig#) × 8` passengers) shown by the capacity bar.
- Reach the quota → the rig rolls out, a new (bigger-quota, faster) rig arrives.
- Topping out (a piece can't be placed) → **¡BUSTED by LA MIGRA!**

## Music / loop
There's a dedicated slot for a looping soundtrack. Drop a file at
`assets/audio/music.mp3` (and/or `music.ogg`) and the in-game **♪ MUSIC**
button will loop it. See `assets/audio/README.txt`. The `<audio id="bgm" loop>`
element in `index.html` is already wired up — no code changes needed.

## Art
All sprites were cut from the two provided source sheets:
- `assets/src/passengers.png` → per-piece passenger cells (`assets/sprites/cell*.png`)
- `assets/src/truck.png` → the rig (`truck.png`), the border-patrol agent (`agent.png`), and props (`crate.png`, `cooler.png`, `trailer.png`)

## Files
```
index.html      layout + music slot
style.css        steel-container / border theme
game.js          tetris engine + truck/migra mechanics
assets/src/      original source images
assets/sprites/  cut-out sprites used by the game
assets/audio/    music loop slot
```
