import { EntrySettingsCorrespond, Playbar, retrieve, retrieve_all } from "./components.js";
import { ensure_acgt } from "./dna.js";
import { UserSettings } from "./settings_container.js";
import { create_periodic_wave, load_gcl_wavetable, load_reverb_convolver, Master } from "./symphoner.js";
const el_errbox = retrieve(".error");
const el_errbox_close = retrieve(".error button");
const el_errmsg = retrieve(".error .notification-msg");
const el_playbar = retrieve(".playbar");
const el_playbttn = retrieve(".playback-button");
const el_add_sequence_button = retrieve(".add-sequence-button");
const el_mastersttg_bpm = retrieve("#mastersttg-bpm-field");
const el_mastersttg_gain_field = retrieve("#mastersttg-gain-field");
const el_mastersttg_gain_slider = retrieve("#mastersttg-gain-slider");
const els_dnaentry_input = [];
const els_dnaentry_settings = [];
const els_dnabars_parent = [];
const els_slider_wrappers = [];
const els_sliders = [];
const els_standard_number_field = [];
retrieve_all(".dnaentry-input", els_dnaentry_input);
retrieve_all(".dnaentry-settings", els_dnaentry_settings);
retrieve_all(".dnabars-parent", els_dnabars_parent);
retrieve_all(".slider-wrapper", els_slider_wrappers);
retrieve_all(".slider-wrapper input", els_sliders);
retrieve_all(".standard-number-field", els_standard_number_field);
const master = new Master();
const standard_settings = new UserSettings(null, 240, 0.2, null, 3);
const entset = new EntrySettingsCorrespond(master, standard_settings, els_dnaentry_input, els_dnaentry_settings, els_dnabars_parent, 1.32, 66);
const playbar = new Playbar(el_playbar, master, entset);
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
if (!pwaves.every((wave) => wave)) {
    show_error("Failed to load some (or all of the) instruments sound. Playing with replacement instead. Please check internet connection.");
}
else if (!irs.every((ir) => ir)) {
    show_error("Some reverbs (or all of it) failed to load. Playing with replacement/without one.");
}
entset.construct();
// DOM manips
function clean_dnaentry(dnaentry) {
    dnaentry = dnaentry.toUpperCase();
    dnaentry = dnaentry.replace(/[^ACGT]/g, "");
    dnaentry = (dnaentry.match(/.{1,3}/g) ?? []).join(" ");
    return dnaentry;
}
function show_error(msg) {
    el_errbox.style.setProperty("display", "flex");
    el_errbox.classList.remove("notification-panel-shake");
    void el_errbox.offsetWidth;
    el_errbox.classList.add("notification-panel-shake");
    el_errmsg.textContent = msg;
}
function hide_error() {
    el_errbox.style.setProperty("display", "none");
}
function set_playbttn_form(playing) {
    el_playbttn.classList.toggle("playbttn", !playing);
    el_playbttn.classList.toggle("pausebttn", playing);
}
function update_slider(slider, wrapper) {
    const max = Number(slider.max);
    const min = Number(slider.min);
    const value = Number(slider.value);
    const prog = (value - min) / (max - min) * 100;
    wrapper.style.setProperty("--progress", prog + "%");
}
els_sliders.forEach((slider, idx) => {
    const wrapper = els_slider_wrappers[idx];
    update_slider(slider, wrapper);
    slider.addEventListener("input", () => {
        update_slider(slider, wrapper);
    });
});
// Listeners link
// playbar.update();
// el_playbar.addEventListener("input", () => {playbar.update()});
el_errbox_close.onclick = hide_error;
el_add_sequence_button.onclick = () => {
    show_error("Sorry, but that button is under construction!");
};
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
entset.entry_addEventListener("input", (ent, _, __, ___, dnabar) => {
    const cleaned = clean_dnaentry(ent.value);
    const cleaned2 = cleaned.replace(/[ ]/g, "");
    if (cleaned !== ent.value) {
        ent.value = cleaned;
    }
    if (playbar.active) {
        playbar.stop();
        playbar.start_frac = 0;
        playbar.set(0);
        set_playbttn_form(false);
    }
    if (ensure_acgt(cleaned2)) {
        dnabar.implant_bases(cleaned2);
        dnabar.update_baseblocks();
    }
});
window.addEventListener("resize", () => {
    const cleaned = clean_dnaentry(entset.ent[0].value).replace(/[ ]/g, "");
    entset.dnabars.forEach((dnabar) => {
        dnabar.space_width = window.innerWidth;
        if (ensure_acgt(cleaned)) {
            dnabar.implant_bases(cleaned);
            dnabar.update_baseblocks();
        }
    });
});
setInterval(() => { playbar.tick(); }, playbar.tick_interval);
el_playbttn.onclick = async () => {
    if (playbar.active) {
        playbar.stop();
        set_playbttn_form(false);
        return;
    }
    await master.ctx.resume();
    entset.construct();
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
els_standard_number_field.forEach((field) => {
    const isDecimal = field.classList.contains("decimal-field");
    field.addEventListener("change", () => {
        const n = isDecimal ? parseFloat(field.value) : parseInt(field.value, 10);
        if (Number.isNaN(n))
            return;
        const min = field.min === "" ? -Infinity : Number(field.min);
        const max = field.max === "" ? Infinity : Number(field.max);
        field.value = String(Math.min(max, Math.max(min, n)));
    });
    field.addEventListener("beforeinput", (event) => {
        if (!event.data)
            return;
        const allowed = isDecimal ? /[^0-9.]/ : /[^0-9]/;
        if (allowed.test(event.data)) {
            event.preventDefault();
            return;
        }
        if (isDecimal && event.data.includes(".") && field.value.includes(".")) {
            event.preventDefault();
        }
    });
});
const map = (x, inMin, inMax, outMin, outMax) => {
    return (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
};
const syncRange = (from, to) => map(Number(from.value), Number(from.min), Number(from.max), Number(to.min), Number(to.max));
const clamp = (x, lo, hi) => {
    return Math.min(Math.max(x, lo), hi);
};
el_mastersttg_gain_field.addEventListener("change", () => {
    const min = Number(el_mastersttg_gain_field.min);
    const max = Number(el_mastersttg_gain_field.max);
    const x = clamp(Number(el_mastersttg_gain_field.value) || 0, min, max);
    el_mastersttg_gain_field.value = String(x);
    el_mastersttg_gain_slider.value = String(syncRange(el_mastersttg_gain_field, el_mastersttg_gain_slider));
    master.default_gain = x;
    if (el_mastersttg_gain_slider.parentElement) {
        update_slider(el_mastersttg_gain_slider, el_mastersttg_gain_slider.parentElement);
    }
});
el_mastersttg_gain_slider.addEventListener("input", () => {
    const mapped = Number(syncRange(el_mastersttg_gain_slider, el_mastersttg_gain_field).toFixed(3));
    el_mastersttg_gain_field.value = String(mapped);
    master.default_gain = mapped;
});
el_mastersttg_bpm.addEventListener("change", () => {
    master.beattime = 60 / Number(el_mastersttg_bpm.value);
});
