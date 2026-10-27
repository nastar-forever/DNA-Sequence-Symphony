# What is this?
Have you ever thinking to hear a **DNA sequence**?
Now you can!

By inputting any DNA sequence into the box, you can hear a symphony made by the DNA sequence!
Any DNA works fine, even when you just inputting a keyboard smash (with _requirements_ though)!

The project aims to explore the endless possibilities of random-things-to-music! (basically, I'm bored).

# How this was built?
This project was first typed in JavaScript, before I decided to migrate to TypeScript. The project was built by using Visual Studio Code with Live Server plugin.
The project utilizes the AudioContext library that every browser come built-in with.

## How this works?
So, each codons you enter are split into three values:

`delta`: (The first base) How much the note will 'jump' on the piano.

`duration_pick`: (The second base) How long a note will last (multiplied by internal BPM setting).

`damper`: (The third base) To damp the delta so the jump wouldn't be too far.

So in MIDI, each note has it's designated number, which every octave adds 12 to the number (I call this MIDI number).
The previous note MIDI number will be added by `delta` to create the current MIDI number.
However, the jump between notes cannot be too dramatic, so a jump is controlled by damper, cannot jump more than two notes at a time, and cannot make a sudden drastic flip of direction from previous note.

Meanwhile, `duration` also needs to be tamed, as a random note duration will make your ears bleed. So, the sequencer will group the codons into `CodonCluster`s with 4 codons each. Then, it'll take the average `duration_pick` inside each cluster.
Based on what is the `duration_pick`, the notes duration inside that group will be limited into 4 different patterns.

# How to **use** it?
Well, just open the page and type a DNA sequence (type only in A, C, G, and T) and hit play!
Furthermore, you can jump around the symphony by sliding the slider!

## The requirements?
Two simple requirements:
1. Your DNA must be at least 12 bases long.
2. The number of bases (letters) you enter must be a multiple of three (in other words, they must be grouped into codons).

# How to **run** it?
Simple! Because this is a static web project, you can directly visit the demo at https://nastar-forever.github.io/DNA-Sequence-Symphony/!

### How to run it locally?
1. Download the source code.
2. Install Node.js (if you haven't).
3. Open command line.
4. Go to the installed folder.
5. Run:
```
npx serve
```
6. Paste the link into your browser.
7. Have fun!
---
This project still on it's early phase, there's still a lot of my plans to be implemented, so stay tuned!
