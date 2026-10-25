import {Master, Channel, Sequence, load_gcl_wavetable, create_periodic_wave, load_reverb_convolver} from "./symphoner.js"

const LOOKAHEAD = 1.0;
let origin = 0;
let next_pass = 0;
let dragging = false;
let start_offeset = 0;
let is_started = false;

function $<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
        throw new Error(`Missing element: ${selector}`);
    }
    return element;
}

const playhead = $<HTMLInputElement>("#playhead");
const dnaentry = $<HTMLInputElement>("#dnaentry");
const error_box = $<HTMLInputElement>("#errbox");
const error_msg = $<HTMLInputElement>("#errmsg");
const playback_button = $<HTMLInputElement>("#playback-button");

function show_error(msg: string) {
    error_box.style.setProperty("display", "flex");
    error_msg.textContent = msg;
}

function hide_error() {
    error_box.style.setProperty("display", "none");
}


const master = new Master();

// http://github.com/GoogleChromeLabs/web-audio-samples/tree/main/src/demos/wavetable-synth/wave-tables
const wavetable = await load_gcl_wavetable(
    "https://raw.githubusercontent.com/GoogleChromeLabs/web-audio-samples/refs/heads/main/src/demos/wavetable-synth/wave-tables/Chorus_Strings"
);

const periodic_wave = create_periodic_wave(
    master.ctx,
    wavetable
);

// https://github.com/itsmusician/IR-Library
const ir = await load_reverb_convolver(
    master.ctx,
    "https://raw.githubusercontent.com/itsmusician/IR-Library/refs/heads/main/Rooms/Commercial/Hotels/Ballrooms/Orlando%20Ballroom%20PA%20Mono.wav"
);

if (!ir) {
    show_error("Failed to load reverb, please check internet connection and refresh the page.");
    throw Error("FAILED TO LOAD REVERB");
}

const channel = new Channel(master, ir, periodic_wave);
const sequence = new Sequence(master, channel);

function start_at(offset: number): void {
    const timestart = master.ctx.currentTime + 0.05;
    sequence.schedule_play(timestart, offset);
    origin = timestart - offset;
    next_pass = origin + sequence.total_duration;
}

function playhead_update(): void {
    const max = Number(playhead.max);
    const min = Number(playhead.min);
    const value = Number(playhead.value);
    const prog = (value - min) / (max - min) * 100;
    playhead.style.setProperty("--progress", prog + "%");
}


function set_playhead(fraction: number): void {
    playhead.value = (fraction * Number(playhead.max)).toString();
    playhead_update();
}

function tick(): void {
    if (!is_started) {
        return;
    }

    const total = sequence.total_duration;

    while (master.ctx.currentTime + LOOKAHEAD > next_pass) {
        sequence.schedule_play(next_pass);
        next_pass += total;
    }

    if (!dragging) {
        set_playhead(
            (Math.max(0, master.ctx.currentTime - origin) 
            % total) / total
        );
    }
}

function parse_dnaentry(basesequence: string): string {
    basesequence = basesequence.toUpperCase();
    basesequence = basesequence.replace(/[^ACGT]/g, "");
    basesequence = basesequence.replace("  ", " ");
    return basesequence
}

playhead.addEventListener("input", playhead_update);
playhead.addEventListener("pointerdown", () => {
    dragging = true;
});

playhead.addEventListener("pointerup", () => {
    dragging = false;
});

playhead.addEventListener("change", () => {
    const value = Number(playhead.value);
    const max = Number(playhead.max);

    dragging = false;
    start_offeset = (value / max) * sequence.total_duration;

    if (is_started) {
        master.stop();
        start_at(start_offeset);
    }
});

dnaentry.addEventListener("input", () => {
    dnaentry.value = parse_dnaentry(dnaentry.value);

    if (is_started) {
        master.stop();
        playback_button.classList.remove("stopform");
        playback_button.classList.add("playform");
        sequence.clear();
        is_started = false;
    }
});

playhead_update();
master.ctx.resume();

playback_button.onclick = () => {
    if (is_started) {
        master.stop();
        playback_button.classList.remove("stopform");
        playback_button.classList.add("playform");
        sequence.clear()
        is_started = false;
        return;
    }
    
    
    let baseseq = parse_dnaentry(dnaentry.value.replace(/[ ]/g, ""));
    console.log("Parsing Sequence: " + baseseq)
    let parse_rsult = sequence.parse_sequence(baseseq);
    
    if (parse_rsult === null) {
        const nearestallowed = Math.max(6, Math.round(baseseq.length / 6) * 6);
        error_box.style.setProperty("display", "flex");
        error_msg.textContent = `The amounts of bases given must be more than five and a multiple of six in order for the symphoner to work. Got ${baseseq.length} bases. Why not try ${nearestallowed} bases instead?`
        return;
    } else {
        error_box.style.setProperty("display", "none");
    }
    
    sequence.bound();

    is_started = true;
    start_at(start_offeset);
    tick();
    
    playback_button.classList.remove("playform");
    playback_button.classList.add("stopform");
};