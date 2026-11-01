import { DNABar, EntrySettingsCorrespond, Playbar, retrieve, retrieve_all } from "./components.js";
import { ensure_acgt } from "./dna.js";
import { UserSettings } from "./settings_container.js";
import { Master, load_gcl_wavetable, create_periodic_wave, load_reverb_convolver } from "./symphoner.js";
const mainscreen_errbox = retrieve("#mainscreen-errbox");
const mainscreen_errmsg = retrieve("#errmsg");
const el_playbar = retrieve("#playhead");
const playbttn = retrieve("#playback-button");
const temp_el_dnabar = retrieve("#dnabar");
const master = new Master();
const standard_settings = new UserSettings(null, 240, 0.2, null, 3);
const entset = new EntrySettingsCorrespond(master, standard_settings);
const playbar = new Playbar(el_playbar, master, entset);
const temp_dnabar = new DNABar(temp_el_dnabar, 40);
// Planning to have an "orchestra" feature (lol)
retrieve_all(".dna-entry", entset.ent);
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
const loaded_waves = pwaves.filter((w) => w !== null);
standard_settings.periodic_waves = loaded_waves.length >= standard_settings.chord_size ? loaded_waves.slice(0, standard_settings.chord_size) : loaded_waves[0] ?? null;
entset.construct_channels();
entset.construct_sequences();
// DOM manipulators
function clean_dnaentry(dnaentry) {
    dnaentry = dnaentry.toUpperCase();
    dnaentry = dnaentry.replace(/[^ACGT]/g, "");
    dnaentry = (dnaentry.match(/.{1,3}/g) ?? []).join(" ");
    return dnaentry;
}
function show_error(msg) {
    mainscreen_errbox.style.setProperty("display", "flex");
    mainscreen_errmsg.textContent = msg;
}
function hide_error() {
    mainscreen_errbox.style.setProperty("display", "none");
}
function set_playbttn_form(playing) {
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
        set_playbttn_form(false);
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
        set_playbttn_form(false);
        return;
    }
    await master.ctx.resume();
    entset.construct_channels();
    entset.construct_sequences();
    entset.channels.forEach((ch) => { ch.reverb_enabled = true; });
    const zipped = entset.ent.map((ent, idx) => [idx, ent, entset.sequences[idx]]);
    for (const [idx, ent, seq] of zipped) {
        const cleanseq = clean_dnaentry(ent.value).replace(/[ ]/g, "");
        const parse_rsult = seq.parse_sequence(cleanseq);
        const seqlen = cleanseq.length;
        if (parse_rsult === null) {
            const nearestallowed = Math.max(12, Math.round(seqlen / 3) * 3);
            show_error(`The amounts of characters given on a DNA sequence must be more than 12 and a multiple of three in order for the musicalizer to work. Meanwhile, sequence #${idx + 1} got ${seqlen} characters. Why not try ${nearestallowed} characters instead?`);
            return;
        }
        seq.bound();
    }
    hide_error();
    playbar.active = true;
    playbar.start_at(playbar.start_frac);
    playbar.tick();
    set_playbttn_form(true);
};
// SETTINGS SCREEN
const settings_form = retrieve("#settings-form");
const mainscreen_block = retrieve("#mainscreen-blur");
const settings_exit_bttn = retrieve("#settings-exit");
const settings_block = retrieve("#settings-blur");
const settings_block_exit = retrieve("#settings-unsaved-exit");
const settings_block_cancel = retrieve("#settings-unsaved-cancel");
const settingsmap = ["bpm", "default_gain", "wet"];
let new_settings = standard_settings;
let selected_channel = 0;
function parse_settings(form) {
    const data = new FormData(form);
    return {
        bpm: Number(data.get("bpm")),
        default_gain: Number(data.get("default_gain")),
        wet: Number(data.get("wet"))
    };
}
function exit_form() {
    mainscreen_block.style.setProperty("display", "none");
}
function fill_form() {
    for (const s of settingsmap) {
        settings_form.elements.namedItem(s).value = String(new_settings[s]);
    }
}
entset.button_addEventListener("click", (ent, btn, channel, setting, idx) => {
    new_settings = entset.settings[idx];
    selected_channel = idx;
    mainscreen_block.style.setProperty("display", "block");
    fill_form();
});
settings_form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!settings_form.checkValidity()) {
        settings_form.reportValidity();
        return;
    }
    const data = parse_settings(settings_form);
    new_settings.bpm = data.bpm;
    new_settings.default_gain = data.default_gain;
    new_settings.wet = data.wet;
    if (playbar.active) {
        playbar.stop();
        playbar.start_frac = 0;
        playbar.set(0);
        set_playbttn_form(false);
    }
    entset.channels[selected_channel].apply_settings(new_settings);
});
settings_exit_bttn.onclick = () => {
    const data = parse_settings(settings_form);
    let passed = true;
    for (const setting of settingsmap) {
        if (new_settings[setting] != data[setting]) {
            passed = false;
            break;
        }
    }
    if (passed) {
        exit_form();
    }
    else {
        settings_block.style.setProperty("display", "block");
    }
};
settings_block_cancel.onclick = () => {
    settings_block.style.setProperty("display", "none");
};
settings_block_exit.onclick = () => {
    settings_block.style.setProperty("display", "none");
    exit_form();
};
