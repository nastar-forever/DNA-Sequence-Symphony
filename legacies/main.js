import { ctx, Sequence, master_stop } from "./symphoner.js";

const LOOKAHEAD = 1.0;

let origin = 0;
let next_pass = 0;
let dragging = false;
let start_offset = 0;
let is_started = false


const playhead = document.getElementById("playhead");
const playback_button = document.getElementById("playback-button");
const dnaentry = document.getElementById("dnaentry");
const error_box = document.getElementById("errbox");
const error_msg = document.getElementById("errmsg");


function start_at(offset) {
    const timestart = ctx.currentTime + 0.05;
    seq.schedule_play(timestart, offset);
    origin = timestart - offset;
    next_pass = origin + seq.total_duration;
}

function playhead_update() {
    const prog = (Number(playhead.value) - Number(playhead.min)) / (Number(playhead.max) - Number(playhead.min)) * 100;
    playhead.style.setProperty("--progress", prog + "%");

}
function set_playhead(frac) {
    playhead.value = frac * playhead.max;
    playhead_update();
}

function tick() {
    if (!is_started) return;
    const total = seq.total_duration;

    while (ctx.currentTime + LOOKAHEAD > next_pass) {
        seq.schedule_play(next_pass);
        next_pass += total;
    }

    if (!dragging) {
        set_playhead((Math.max(0, ctx.currentTime - origin) % total) / total);
    }

    requestAnimationFrame(tick);
}

function parse_dnaentry(basesequence) {
    basesequence = basesequence.toUpperCase();
    basesequence = basesequence.replace(/[^ACGT ]/g, '');
    basesequence = basesequence.replace("   ", "  ");

    return basesequence;
}

playhead.addEventListener("input", playhead_update);
playhead.addEventListener("pointerdown", () => dragging = true);
playhead.addEventListener("pointerup", () => dragging = false);
playhead.addEventListener("change", () => {
    dragging = false;
    start_offset = (playhead.value / playhead.max) * seq.total_duration;

    if (is_started) {
        master_stop();
        start_at(start_offset);
    }
})

dnaentry.addEventListener("input", () => {
    dnaentry.value = parse_dnaentry(dnaentry.value);
    if (is_started) {
        master_stop();
        playback_button.classList.remove("stopform");
        playback_button.classList.add("playform");
        seq.base_sequence.length = 0;
        is_started = false;
    }
})

playhead_update();

const seq = new Sequence();
await seq.init_reverbs();
ctx.resume();
console.log(seq.irs)


playback_button.onclick = () => {
    if (is_started) {
        master_stop();
        playback_button.classList.remove("stopform");
        playback_button.classList.add("playform");
        seq.base_sequence.length = 0;
        is_started = false;
        return;
    }
    
    
    let baseseq = parse_dnaentry(dnaentry.value.replace(/[ ]/g, ""));
    console.log("Parsing Sequence: " + baseseq)
    let parse_rsult = seq.parse_codonnote(baseseq);
    
    if (parse_rsult === null) {
        const nearestallowed = Math.max(6, Math.round(baseseq.length / 6) * 6);
        error_box.style.setProperty("display", "flex");
        error_msg.textContent = `The amounts of bases given must be more than five and a multiple of six in order for the symphoner to work. Got ${baseseq.length} bases. Why not try ${nearestallowed} bases instead?`
        return;
    } else {
        error_box.style.setProperty("display", "none");
    }
    
    seq.limit_progression();

    is_started = true;
    start_at(start_offset);
    tick();
    
    playback_button.classList.remove("playform");
    playback_button.classList.add("stopform");
};