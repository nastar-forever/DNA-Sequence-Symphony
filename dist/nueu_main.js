import { DNABar, EntrySettingsCorrespond, Playbar, retrieve, retrieve_all } from "./components.js";
import { ensure_acgt } from "./dna.js";
import { UserSettings } from "./settings_container.js";
import { Master, load_gcl_wavetable, create_periodic_wave, load_reverb_convolver } from "./symphoner.js";
const errbox = retrieve("#errbox");
const errmsg = retrieve("#errmsg");
const el_playbar = retrieve("#playhead");
const playbttn = retrieve("#playback-button");
const temp_el_dnabar = retrieve("#dnabar");
const master = new Master();
const standard_settings = new UserSettings(null, 240, 0.2, null, 3);
const entset = new EntrySettingsCorrespond(master, standard_settings);
const playbar = new Playbar(el_playbar, master, entset);
const temp_dnabar = new DNABar(temp_el_dnabar, 40);
// Planning to have an "orchestra" feature (lol)
retrieve_all(".dna-entries", entset.ent);
retrieve_all(".entry-settings", entset.bttn);
const wtbaseurl = "https://raw.githubusercontent.com/GoogleChromeLabs/web-audio-samples/refs/heads/main/src/demos/wavetable-synth/wave-tables/";
const wtexturls = ["Celeste", "Piano", "Twelve_OpTines"];
const irbaseurl = "https://raw.githubusercontent.com/itsmusician/IR-Library/refs/heads/main/";
const irexturls = [
    "Rooms/Commercial/Hotels/Ballrooms/Orlando%20Ballroom%20PA%20Mono.wav"
];
const wtables = await Promise.all(wtexturls.map((eurl) => load_gcl_wavetable(wtbaseurl + eurl)));
const pwaves = wtables.map((table) => table ? create_periodic_wave(master.ctx, table.imag, table.real) : null);
const irs = await Promise.all(irexturls.map((url) => load_reverb_convolver(master.ctx, irbaseurl + url)));
standard_settings.ir = irs.length > 0 ? irs[0] : null;
standard_settings.periodic_waves = pwaves.length > 1 ? pwaves.slice(0, 3) : pwaves.length > 0 ? pwaves[0] : null;
// entset.construct_channels();
// entset.construct_sequences();
// DOM manipulators
function clean_dnaentry(dnaentry) {
    dnaentry = dnaentry.toUpperCase();
    dnaentry = dnaentry.replace(/[^ACGT]/g, "");
    dnaentry = (dnaentry.match(/.{1,3}/g) ?? []).join(" ");
    return dnaentry;
}
function show_error(msg) {
    errbox.style.setProperty("display", "flex");
    errmsg.textContent = msg;
}
function hide_error() {
    errbox.style.setProperty("display", "none");
}
function toggler_playbttn_form(playing) {
    playbttn.classList.toggle("stopform", playing);
    playbttn.classList.toggle("playform", !playing);
}
if (!pwaves.every((wave) => wave)) {
    show_error("Failed to load some (or all of the) instruments sound. Playing with replacement instead. Please check internet connection.");
}
else if (!irs.every((ir) => ir)) {
    show_error("Some reverbs (or all of it) failed to load. Playing with replacement/without one.");
}
// Listeners link
playbar.update();
el_playbar.addEventListener("input", () => { playbar.update(); });
el_playbar.addEventListener("pointerdown", () => { playbar.dragging = true; });
el_playbar.addEventListener("pointerup", () => { playbar.dragging = false; });
el_playbar.addEventListener("change", () => {
    const value = Number(el_playbar.value);
    const max = Number(el_playbar.max);
    playbar.dragging = false;
    playbar.start_frac = value / max;
    if (playbar.active) {
        entset.silence();
        playbar.start_at(playbar.start_frac);
    }
});
entset.entry_addEventListener("input", (ent) => {
    const cleaned = clean_dnaentry(ent.value);
    if (cleaned !== ent.value) {
        ent.value = cleaned;
    }
    if (playbar.active) {
        playbar.stop();
        playbar.start_frac = 0;
        playbar.set(0);
    }
});
entset.ent[0].addEventListener("input", () => {
    const cleaned = clean_dnaentry(entset.ent[0].value).replace(/[ ]/g, "");
    if (ensure_acgt(cleaned)) {
        temp_dnabar.implant_bases(cleaned);
        temp_dnabar.update_baseblocks();
    }
});
window.addEventListener("resize", () => {
    const cleaned = clean_dnaentry(entset.ent[0].value).replace(/[ ]/g, "");
    temp_dnabar.space_width = window.innerWidth;
    if (ensure_acgt(cleaned)) {
        temp_dnabar.implant_bases(cleaned);
        temp_dnabar.update_baseblocks();
    }
});
setInterval(() => { playbar.tick(); }, playbar.tick_interval);
playbttn.onclick = async () => {
    if (playbar.active) {
        playbar.stop();
        toggler_playbttn_form(false);
        return;
    }
    await master.ctx.resume();
    let parse_rsult = true;
    entset.construct_channels();
    entset.construct_sequences();
    entset.sequences.forEach((seq, idx) => {
        let baseseq = clean_dnaentry(entset.ent[idx].value).replace(/[ ]/g, "");
        console.log(`Parsing sequence ${idx}: ${baseseq}`);
        parse_rsult = seq.parse_sequence(baseseq) !== null && parse_rsult;
        if (!parse_rsult) {
            return;
        }
        seq.bound();
    });
    playbar.active = true;
    playbar.start_at(playbar.start_frac);
    playbar.tick();
    toggler_playbttn_form(true);
};
