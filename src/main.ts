import {Master, Channel, Sequence, load_gcl_wavetable, create_periodic_wave, load_reverb_convolver} from "./symphoner.js"
import {DNABar} from "./dnabar_el.js";
import { ensure_acgt } from "./dna.js";

const LOOKAHEAD = 1.0;
const TICK_INTERVAL = 50;
let origin = 0;
let next_pass = 0;
let dragging = false;
let start_fraction = 0;
let is_started = false;

function $<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
        throw new Error(`Missing element: ${selector}`);
    }
    return element;
}

const playhead = $<HTMLInputElement>("#playhead");
const dnaentry = $<HTMLTextAreaElement>("#dnaentry");
const error_box = $<HTMLElement>("#errbox");
const error_msg = $<HTMLElement>("#errmsg");
const playback_button = $<HTMLButtonElement>("#playback-button");
const dna_bar_el = $<HTMLElement>("#dnabar");

const dna_bar = new DNABar(
    dna_bar_el,
    40
);

function show_error(msg: string) {
    error_box.style.setProperty("display", "flex");
    error_msg.textContent = msg;
}

function hide_error() {
    error_box.style.setProperty("display", "none");
}


const master = new Master(
    undefined,
    undefined,
    240,
    0.2
);

let wtbaseurl = "https://raw.githubusercontent.com/GoogleChromeLabs/web-audio-samples/refs/heads/main/src/demos/wavetable-synth/wave-tables/"

const wavetables = await Promise.all([
    load_gcl_wavetable(wtbaseurl + "Celeste"),
    load_gcl_wavetable(wtbaseurl + "Piano"),
    load_gcl_wavetable(wtbaseurl + "Twelve_OpTines")
])

const periodic_waves = wavetables.map((wavetable) => wavetable ? create_periodic_wave(master.ctx, wavetable.imag, wavetable?.real) : null)

// https://github.com/itsmusician/IR-Library
const ir = await load_reverb_convolver(
    master.ctx,
    "https://raw.githubusercontent.com/itsmusician/IR-Library/refs/heads/main/Rooms/Commercial/Hotels/Ballrooms/Orlando%20Ballroom%20PA%20Mono.wav"
);

if (!wavetables.every((wavetable) => wavetable)) {
    show_error("Failed to load the instrument sound, falling back to a plain tone. Please check internet connection and refresh the page.");
} else if (!ir) {
    show_error("Failed to load reverb, playing without it. Please check internet connection and refresh the page.");
}


const channel = new Channel(master, ir, periodic_waves);
channel.reverb_enabled = true;
const sequence = new Sequence(master, channel);


function set_button_form(playing: boolean): void {
    playback_button.classList.toggle("stopform", playing);
    playback_button.classList.toggle("playform", !playing);
}


function start_at(fraction: number): void {
    const offset = fraction * sequence.total_duration;
    const timestart = master.ctx.currentTime + 0.05;
    sequence.schedule_play(timestart, offset);
    origin = timestart - offset;
    next_pass = origin + sequence.total_duration;
}


function stop_playback(): void {
    if (!is_started) {
        return;
    }

    const total = sequence.total_duration;
    start_fraction = (Math.max(0, master.ctx.currentTime - origin) % total) / total;

    channel.silence();
    sequence.clear();
    set_button_form(false);
    is_started = false;
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
    return (basesequence.match(/.{1,3}/g) ?? []).join(" ");
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
    start_fraction = value / max;

    if (is_started) {
        channel.silence();
        start_at(start_fraction);
    }
});

dnaentry.addEventListener("input", () => {
    const cleaned = parse_dnaentry(dnaentry.value);

    if (cleaned !== dnaentry.value) {
        dnaentry.value = cleaned;
    }

    stop_playback();
    start_fraction = 0;
    set_playhead(0);

    const no_space = cleaned.replace(/[ ]/g, "");

    if (ensure_acgt(no_space)) {
        dna_bar.implant_bases(no_space);
        dna_bar.update_baseblocks();
    }
});


window.addEventListener("resize", () => {
    const cleaned = parse_dnaentry(dnaentry.value).replace(/[ ]/g, "");

    dna_bar.space_width = window.innerWidth;
    if (ensure_acgt(cleaned)) {
        dna_bar.implant_bases(cleaned);
        dna_bar.update_baseblocks();
    }
})


playhead_update();
playback_button.onclick = async () => {
    if (is_started) {
        stop_playback();
        return;
    }

    await master.ctx.resume();

    let baseseq = parse_dnaentry(dnaentry.value).replace(/[ ]/g, "");
    console.log("Parsing Sequence: " + baseseq)
    let parse_rsult = sequence.parse_sequence(baseseq);

    if (parse_rsult === null) {
        const nearestallowed = Math.max(12, Math.round(baseseq.length / 3) * 3);
        show_error(`The amounts of bases given must be more than twelve and a multiple of three in order for the symphoner to work. Got ${baseseq.length} bases. Why not try ${nearestallowed} bases instead?`);
        return;
    }

    hide_error();
    sequence.bound();

    is_started = true;
    start_at(start_fraction);
    tick();

    set_button_form(true);
};


setInterval(tick, TICK_INTERVAL);