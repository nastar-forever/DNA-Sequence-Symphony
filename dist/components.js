import { to_singular_bases } from "./dna.js";
import { Channel, Sequence } from "./symphoner.js";
export const STANDARD_BASEBLOCK_CLASSES = {
    disabled: ["dis-base"],
    A: ["base", "adenine"],
    C: ["base", "cytosine"],
    G: ["base", "guanine"],
    T: ["base", "thymine"]
};
export function retrieve(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Missing element: ${selector}`);
    }
    return element;
}
export function retrieve_all(selector, buffer) {
    const elements = document.querySelectorAll(selector);
    if (elements.length <= 0) {
        throw new Error(`Missing element(s): ${selector}`);
    }
    if (buffer) {
        elements.forEach((el) => {
            buffer.push(el);
        });
    }
    return elements;
}
export class EntrySettingsCorrespond {
    constructor(master, standard_settings) {
        this.master = master;
        this.standard_settings = standard_settings;
        this.ent = [];
        this.bttn = [];
        this.channels = [];
        this.sequences = [];
    }
    validate(extra_cond = true) {
        if (this.ent.length != this.bttn.length) {
            throw new Error(`ent length (${this.ent.length}) mismatched from bttn length (${this.bttn.length})`);
        }
        if (!extra_cond) {
            throw new Error("extra_cond not met");
        }
    }
    construct_channels() {
        this.validate();
        this.channels.forEach((ch) => {
            ch.terminate();
        });
        this.channels = Array.from({ length: this.ent.length }, () => {
            const ch = new Channel(this.master, null, null);
            ch.apply_settings(this.standard_settings);
            return ch;
        });
    }
    construct_sequences() {
        // this.validate(this.channels.length === this.ent.length);
        this.sequences.forEach((seq) => {
            seq.clear();
        });
        this.sequences = Array.from({ length: this.ent.length }, (_, index) => {
            return new Sequence(this.master, this.channels[index]);
        });
    }
    button_addEventListener(event, listener) {
        this.validate();
        this.bttn.forEach((bttn, i) => {
            bttn.addEventListener(event, () => {
                listener(this.ent[i], bttn, this.channels[i]);
            });
        });
    }
    entry_addEventListener(event, listener) {
        this.validate();
        this.ent.forEach((ent, i) => {
            ent.addEventListener(event, () => {
                listener(ent, this.bttn[i], this.channels[i]);
            });
        });
    }
    silence() {
        this.channels.forEach((ch) => { ch.silence; });
    }
    get total_duration() {
        return Math.max(...this.sequences.map((seq) => seq.total_duration));
    }
    schedule_play(starttime, offset = 0) {
        this.sequences.forEach((seq) => { seq.schedule_play(starttime, offset); });
    }
    set_entries_val_func(func) {
        this.ent.forEach((entry) => {
            entry.value = func(entry);
        });
    }
    set_entries_val_str(str) {
        this.ent.forEach((entry) => { entry.value = str; });
    }
}
export class Playbar {
    constructor(playbar, master, correspond, lookahead = 1.0, tick_interval = 50) {
        this.playbar = playbar;
        this.master = master;
        this.correspond = correspond;
        this.lookahead = lookahead;
        this.tick_interval = tick_interval;
        this.origin = 0;
        this.next_pass = 0;
        this.start_frac = 0;
        this.dragging = false;
        this.active = false;
    }
    set button_form(playing) {
        this.playbar.classList.toggle("stopform", playing);
        this.playbar.classList.toggle("playform", !playing);
    }
    get button_form() {
        return this.playbar.classList.contains("playform");
    }
    start_at(frac) {
        const seqs = this.correspond.sequences;
        const offset = frac * this.correspond.total_duration;
        const timestart = this.master.ctx.currentTime + 0.05;
        seqs.forEach((seq) => { seq.schedule_play(timestart, offset); });
        this.origin = timestart - offset;
        this.next_pass = this.origin + this.correspond.total_duration;
    }
    stop() {
        if (!this.active) {
            return;
        }
        const seqs = this.correspond.sequences;
        const total_duration = this.correspond.total_duration;
        this.start_frac = (Math.max(0, this.master.ctx.currentTime - this.origin) % total_duration) / total_duration;
        this.correspond.silence();
        seqs.forEach((seq) => { seq.clear(); });
        this.button_form = false;
        this.active = false;
    }
    update() {
        const max = Number(this.playbar.max);
        const min = Number(this.playbar.min);
        const value = Number(this.playbar.value);
        const prog = (value - min) / (max - min) * 100;
        this.playbar.style.setProperty("--progress", prog + "%");
    }
    set(frac) {
        this.playbar.value = (frac * Number(this.playbar.max)).toString();
        this.update();
    }
    tick() {
        if (!this.active) {
            return;
        }
        const total = this.correspond.total_duration;
        while (this.master.ctx.currentTime + this.lookahead > this.next_pass) {
            this.correspond.schedule_play(this.next_pass);
            this.next_pass += total;
        }
        if (!this.dragging) {
            this.set((Math.max(0, this.master.ctx.currentTime - this.origin) % total) / total);
        }
    }
}
export class DNABar {
    init_baseblocks() {
        for (let i = 0; i < this.bases_limit; i++) {
            const baseblock = document.createElement("div");
            baseblock.classList.add(...[...this.baseblock_classes.disabled]);
            this.bar.appendChild(baseblock);
            this.baseblocks.push(baseblock);
        }
    }
    constructor(bar, base_width = 40, space_width = window.innerWidth, baseblock_classes = STANDARD_BASEBLOCK_CLASSES) {
        this.baseblock_classes = baseblock_classes;
        if (!bar) {
            bar = document.createElement("div");
            document.body.appendChild(bar);
        }
        this.bases_limit = Math.ceil(space_width / base_width);
        this.baseblocks = [];
        this.bar = bar;
        this.init_baseblocks();
        this.bar = bar;
        this.bases = [];
        this._space_width = space_width;
        this._base_width = base_width;
    }
    get space_width() {
        return this._space_width;
    }
    set space_width(value) {
        this._space_width = value;
        this.bases_limit = Math.ceil(this._space_width / this._base_width);
        this.bases = this.bases.slice(-this.bases_limit);
        this.init_baseblocks();
        this.update_baseblocks();
    }
    get base_width() {
        return this._base_width;
    }
    set base_width(value) {
        this._base_width = value;
        this.bases_limit = Math.ceil(this._space_width / this.base_width);
        this.bases = this.bases.slice(-this.bases_limit);
        this.init_baseblocks();
        this.update_baseblocks();
    }
    update_baseblocks() {
        this.baseblocks.forEach((baseblock, i) => {
            if (i < this.bases.length) {
                baseblock.style.setProperty("display", "flex");
            }
            else {
                baseblock.style.setProperty("display", "none");
                return;
            }
            // baseblock.style.animation = "none";
            // void baseblock.offsetWidth;
            // baseblock.style.animation = "";
            baseblock.classList.remove(...baseblock.classList);
            baseblock.classList.add(...this.baseblock_classes[this.bases[i]]);
        });
    }
    append_base(base) {
        this.bases.push(base);
        if (this.bases.length > this.bases_limit) {
            this.bases.shift();
        }
    }
    implant_bases(bases) {
        let s_bases = to_singular_bases(bases);
        if (s_bases === null) {
            s_bases = [];
        }
        // console.log(s_bases);
        // console.log(this.baseblock_classes);
        this.baseblocks.forEach((baseblock, i) => {
            if (i >= s_bases.length) {
                baseblock.style.setProperty("display", "none");
                return;
            }
            // console.log("index: ", i)
            // console.log("s_bases[i-1]: ", s_bases[i-1]);
            // console.log(this.baseblock_classes[s_bases[i-1]]);
            // console.log(JSON.stringify(s_bases[i]), s_bases);
            baseblock.style.setProperty("display", "flex");
            baseblock.classList.remove(...baseblock.classList);
            baseblock.classList.add(...this.baseblock_classes[s_bases[i] ?? []]);
            baseblock.style.setProperty("display", "flex");
        });
        this.bases = s_bases.slice(-this.bases_limit);
    }
}
