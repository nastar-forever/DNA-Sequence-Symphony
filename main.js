import { ctx, master_reset, Sequence, master_stop } from "./symphoner.js";

let is_started = false
const seq = new Sequence();
ctx.resume();
seq.limit_progression();
await seq.init_reverbs();

console.log(seq.irs)

const playhead = document.getElementById("playhead");
function playhead_update() {
    const prog = (Number(playhead.value) - Number(playhead.min)) / (Number(playhead.max) - Number(playhead.min)) * 100;
    playhead.style.setProperty("--progress", prog + "%");
    console.log(playhead.style.getPropertyValue("--progress"));
}

playhead_update();
playhead.addEventListener("input", playhead_update);

const playback_button = document.getElementById("playback-button");
const dnaentry = document.getElementById("dnaentry");

function parse_dnaentry(basesequence) {
    basesequence = basesequence.toUpperCase();
    basesequence = basesequence.replace(/[^ACGT ]/g, '');
    basesequence = basesequence.replace("   ", "  ");

    return basesequence;
}


dnaentry.addEventListener("input", () => {
    dnaentry.value = parse_dnaentry(dnaentry.value);
})

const error_box = document.getElementById("errbox");
const error_msg = document.getElementById("errmsg");


playback_button.onclick = () => {
    if (is_started) {
        console.log("MASTER STOP");
        master_stop();
        master_reset();
        playback_button.classList.remove("stop_appr");
        playback_button.classList.add("playform");
        seq.base_sequence.length = 0;
        is_started = false;
        return;
    }

    
    let baseseq = parse_dnaentry(dnaentry.value.replace(/[ ]/g, ""));
    console.log("Parsing Sequence: " + baseseq)
    let parse_rsult = seq.parse_codonnote(baseseq);

    if (parse_rsult === null) {
        error_box.style.setProperty("display", "flex");
        error_msg.textContent = `The amounts of bases given must be more than five and a multiple of six in order for the symphoner to work. Got ${baseseq.length} bases instead.`
        return;
    } else {
        error_box.style.setProperty("display", "none");
    }

    seq.schedule_play(ctx.currentTime);
    
    playback_button.classList.remove("playform");
    playback_button.classList.add("stopform");
    is_started = true;
};