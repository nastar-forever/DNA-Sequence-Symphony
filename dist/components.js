import { STANDARD_BASE_COLORS, to_singular_bases } from "./dna.js";
import { Channel, Sequence } from "./symphoner.js";
import { UserSettings } from "./settings_container.js";
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
const SVG_NS = "http://www.w3.org/2000/svg";
export class StandardDotBorder {
    init_paths() {
        this.paths.forEach((path) => {
            this.svg.removeChild(path);
            path.remove();
        });
        this.paths.length = 0;
        this._base_colors.forEach((color, index) => {
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", color);
            path.setAttribute("stroke-width", String(this.dot_size));
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("stroke-dasharray", `0.001 ${this._base_colors.length}`);
            path.setAttribute("stroke-dashoffset", String(-index));
            this.svg.appendChild(path);
            this.paths.push(path);
        });
    }
    constructor(target, dot_size = 4, spacing = 4, border_pos = "in", base_colors = STANDARD_BASE_COLORS, svg_class = "dot-border-svg") {
        this.target = target;
        this.dot_size = dot_size;
        this.spacing = spacing;
        this.border_pos = border_pos;
        this.paths = [];
        this.svg = document.createElementNS(SVG_NS, "svg");
        this.target.appendChild(this.svg);
        const compstyle = getComputedStyle(target);
        if (compstyle.position === 'static') {
            target.style.setProperty("position", "relative");
        }
        this.svg.classList.add(svg_class);
        this._base_colors = base_colors;
        this.init_paths();
        this.observer = new ResizeObserver(() => {
            this.render();
        });
        this.observer.observe(target);
    }
    get base_colors() {
        return this._base_colors;
    }
    set base_colors(colors) {
        this.base_colors = colors;
        this.init_paths();
    }
    arc_command(radii, endx, endy) {
        return `A ${radii} ${radii} 0 0 1 ${endx} ${endy}`;
    }
    render() {
        const shrink_factor = this.dot_size / 2 * (this.border_pos === "out" ? -1 : this.border_pos === "mid" ? 0 : 1);
        const bordersize = this.target.getBoundingClientRect();
        const width = bordersize.width - shrink_factor * 2;
        const height = bordersize.height - shrink_factor * 2;
        if (width <= 0 || height <= 0) {
            return;
        }
        const cornersmap = ["top-left", "top-right", "bottom-left", "bottom-right"];
        const compstyle = getComputedStyle(this.target);
        const [tl, tr, bl, br] = cornersmap.map((cname) => {
            const retraw = compstyle.getPropertyValue("border-" + cname + "-radius");
            let ret = parseFloat(retraw);
            ret = retraw.endsWith("%") ? ret / 100 * Math.min(bordersize.width, bordersize.height) : ret;
            return Math.max(0, ret - shrink_factor);
        });
        const [rw_top, rw_bottom] = [width - tl - tr, width - bl - br];
        const [rh_left, rh_right] = [height - tl - bl, height - tr - br];
        const dstring = `M ${tl} 0 h ${rw_top} ${this.arc_command(tr, width, tr)}`
            + `v ${rh_right} ${this.arc_command(br, width - br, height)}`
            + `h ${-rw_bottom} ${this.arc_command(bl, 0, height - bl)}`
            + `v ${-rh_left} ${this.arc_command(tl, tl, 0)}`;
        this.paths.forEach((path) => {
            path.setAttribute("d", dstring);
            path.setAttribute("transform", `translate(${shrink_factor}, ${shrink_factor})`);
        });
        const len = this._base_colors.length;
        const perim_units = String(Math.max(len, Math.floor(this.paths[0].getTotalLength() / this.spacing / len) * len));
        this.paths.forEach((path) => {
            path.setAttribute("pathLength", perim_units);
        });
    }
}
export class EntrySettingsCorrespond {
    constructor(master, standard_settings) {
        this.master = master;
        this.standard_settings = standard_settings;
        this.ent = [];
        this.bttn = [];
        this.channels = [];
        this.sequences = [];
        this.settings = [];
    }
    validate(extra_cond = true) {
        if (this.ent.length != this.bttn.length) {
            throw new Error(`ent length (${this.ent.length}) mismatched from bttn length (${this.bttn.length})`);
        }
        if (!extra_cond) {
            throw new Error("extra_cond not met");
        }
    }
    master_apply() {
        this.channels.forEach((ch, idx) => {
            ch.apply_settings(this.settings[idx]);
        });
    }
    master_apply_override(settings) {
        this.channels.forEach((ch) => {
            ch.apply_settings(settings);
        });
    }
    construct_channels() {
        this.validate();
        this.channels.forEach((ch) => ch.terminate());
        this.channels = Array.from({ length: this.ent.length }, (_, i) => {
            var _a;
            (_a = this.settings)[i] ?? (_a[i] = new UserSettings(null, this.standard_settings.bpm, this.standard_settings.default_gain, this.standard_settings.ir, this.standard_settings.chord_size, this.standard_settings.periodic_waves, this.standard_settings.wet, this.standard_settings.goofy_mode));
            const ch = new Channel(this.master, null, null);
            ch.apply_settings(this.settings[i]);
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
                listener(this.ent[i], bttn, this.channels[i], this.settings[i], i);
            });
        });
    }
    entry_addEventListener(event, listener) {
        this.validate();
        this.ent.forEach((ent, i) => {
            ent.addEventListener(event, () => {
                listener(ent, this.bttn[i], this.channels[i], this.settings[i], i);
            });
        });
    }
    silence() {
        this.channels.forEach((ch) => { ch.silence(); });
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
        while (this.baseblocks.length < this.bases_limit) {
            const baseblock = document.createElement("div");
            baseblock.classList.add(...this.baseblock_classes.disabled);
            this.bar.appendChild(baseblock);
            this.baseblocks.push(baseblock);
        }
        while (this.baseblocks.length > this.bases_limit) {
            this.baseblocks.pop().remove();
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
