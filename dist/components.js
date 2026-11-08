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
    target;
    dot_size;
    spacing;
    border_pos;
    svg;
    paths = [];
    observer;
    _base_colors;
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
        this._base_colors = colors;
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
export const ESCArrMemberTypeListTypeMap = {
    ent: HTMLInputElement,
    bttn: HTMLButtonElement,
    channels: Channel,
    sequences: Sequence,
    settings: UserSettings,
    dnabars: HTMLElement,
};
export class EntrySettingsCorrespond {
    master;
    standard_settings;
    dnabars_base_width;
    dnabars_space_width;
    dnabars_baseblock_classes;
    _ent;
    _bttn;
    _channels;
    _sequences;
    _settings;
    _dnabars;
    dnabars;
    get_raw(array) {
        return array.map((esc) => esc.el);
    }
    get ent() { return this.get_raw(this._ent); }
    get bttn() { return this.get_raw(this._bttn); }
    get channels() { return this.get_raw(this._channels); }
    get sequences() { return this.get_raw(this._sequences); }
    get settings() { return this.get_raw(this._settings); }
    get total_duration() {
        return Math.max(...this.sequences.map((seq) => seq.total_duration));
    }
    set_settings(idx_id, settings, ref_by = "idx") {
        if (ref_by === "idx") {
            if (this._settings.length < idx_id) {
                throw new Error(`index ${idx_id} is out of bounds`);
            }
            this._settings[idx_id] = {
                "el": settings,
                "id": this._settings[idx_id].id
            };
            return;
        }
        let found = false;
        this._settings.forEach((sttg, i) => {
            if (sttg.id === idx_id) {
                this._settings[i] = {
                    "el": settings,
                    "id": sttg.id
                };
                found = true;
            }
        });
        if (!found) {
            throw new Error(`id ${idx_id} not found`);
        }
    }
    escarray_get(selector) {
        return this[`_${selector}`];
    }
    // push_el<K extends ESCArrTypeList>(selector: K, el: any) {
    //     const intendedtype = ESCArrMemberTypeListTypeMap[selector];
    //     function pesky_typescript(el: any): el is typeof intendedtype {
    //         if (!(el instanceof intendedtype)) {
    //             throw new Error(`Pushed element type missmatch (${typeof selector}) with type of ${selector} (${intendedtype})`);
    //         }
    //         return true;
    //     }
    //     if (pesky_typescript(el)) {
    //         this.els_to_escarray(el)
    //         this[`_${selector}`].push()
    //     }
    // }
    validate_escs(...escs) {
        if (escs.length === 0) {
            escs = ["ent", "bttn", "channels", "sequences", "settings", "dnabars"];
        }
        escs.forEach((escprop) => {
            const am_escprop = this[`_${escprop}`];
            if (am_escprop.length === 0) {
                throw new Error(`${escprop} isn't defined or constructed yet. Did you call .construct() before?`);
            }
            escs.forEach((esccomp) => {
                const am_esccomp = this[`_${esccomp}`];
                if (am_escprop.length !== am_esccomp.length) {
                    throw new Error(`${escprop} length (${am_escprop.length}) mismattched from ${esccomp} length (${am_esccomp.length})`);
                    '';
                }
            });
            this[`_${escprop}`].sort((a, b) => a.id - b.id);
        });
        this[`_${escs[0]}`].forEach((am_escprop, idx) => {
            const id = am_escprop.id;
            escs.forEach((esccomp) => {
                const am_esccomp = this[`_${esccomp}`];
                if (id !== am_esccomp[idx].id) {
                    throw new Error(`ids at index ${idx} aren't synced.`);
                }
            });
        });
    }
    els_to_escarray(els) {
        return els.map((el) => {
            const seqid = el.dataset.seqid;
            if (seqid === undefined) {
                throw new Error(`${el} doesn't have data-seqid property.`);
            }
            return {
                "id": Number(seqid),
                "el": el
            };
        });
    }
    constructor(master, standard_settings, entries, settings_buttons, dnabars, dnabars_base_width, dnabars_space_width, dnabars_baseblock_classes) {
        this.master = master;
        this.standard_settings = standard_settings;
        this.dnabars_base_width = dnabars_base_width;
        this.dnabars_space_width = dnabars_space_width;
        this.dnabars_baseblock_classes = dnabars_baseblock_classes;
        this._ent = this.els_to_escarray(entries);
        this._bttn = this.els_to_escarray(settings_buttons);
        this._dnabars = this.els_to_escarray(dnabars);
        this._channels = [];
        this._sequences = [];
        this._settings = [];
        this.dnabars = [];
        this.validate_escs("ent", "bttn", "dnabars");
    }
    push_entry(ent, bttn, reconstruct = false) {
        this._ent.push(...this.els_to_escarray([ent]));
        this._bttn.push(...this.els_to_escarray([bttn]));
        if (reconstruct) {
            this.construct();
        }
    }
    remove_entry(ent_idx, bttn_idx, reconstruct = false) {
        delete this._ent[ent_idx];
        delete this._bttn[bttn_idx];
        if (reconstruct) {
            this.construct();
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
    dnabars_update_baseblocks() {
        this.dnabars.forEach((dnabar) => {
            dnabar.update_baseblocks();
        });
    }
    construct() {
        this.validate_escs("ent", "bttn");
        this.dnabars.forEach((dnabar) => { dnabar.terminate(); });
        this.channels.forEach((ch) => { ch.terminate(); });
        this.sequences.forEach((seq) => { seq.clear(); });
        this._sequences.length = 0;
        this._channels.length = 0;
        this.dnabars.length = 0;
        this.ent.map((_, i) => {
            const id = this._ent[i].id;
            this._settings[i] ??= {
                "el": new UserSettings(null, this.standard_settings.bpm, this.standard_settings.default_gain, this.standard_settings.ir, this.standard_settings.chord_size, this.standard_settings.periodic_waves, this.standard_settings.wet, this.standard_settings.goofy_mode),
                "id": id
            };
            const ch = new Channel(this.master, null, null);
            ch.apply_settings(this.settings[i]);
            const seq = {
                "el": new Sequence(this.master, ch),
                "id": id
            };
            const dnabar = new DNABar(this._dnabars[i].el, this.dnabars_base_width, this.dnabars_space_width, this.dnabars_baseblock_classes);
            this._channels.push({ "id": id, "el": ch });
            this._sequences.push(seq);
            this.dnabars.push(dnabar);
        });
    }
    button_addEventListener(event, listener) {
        this.validate_escs();
        this._bttn.forEach((bttn, i) => {
            bttn.el.addEventListener(event, () => {
                listener(this.ent[i], bttn.el, this.channels[i], this.settings[i], this.dnabars[i], i, bttn.id);
            });
        });
    }
    entry_addEventListener(event, listener) {
        this.validate_escs();
        this._ent.forEach((ent, i) => {
            ent.el.addEventListener(event, () => {
                listener(ent.el, this.bttn[i], this.channels[i], this.settings[i], this.dnabars[i], i, ent.id);
            });
        });
    }
    silence() {
        this.channels.forEach((ch) => { ch.silence(); });
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
    playbar;
    master;
    correspond;
    lookahead;
    tick_interval;
    origin = 0;
    next_pass = 0;
    start_frac = 0;
    dragging = false;
    active = false;
    constructor(playbar, master, correspond, lookahead = 1.0, tick_interval = 50) {
        this.playbar = playbar;
        this.master = master;
        this.correspond = correspond;
        this.lookahead = lookahead;
        this.tick_interval = tick_interval;
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
        if (this.playbar.parentElement) {
            this.playbar.parentElement.style.setProperty("--progress", prog + "%");
        }
        else {
            this.playbar.style.setProperty("--progress", prog + "%");
        }
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
    baseblock_classes;
    bar;
    bases;
    bases_limit;
    baseblocks;
    _space_width;
    _base_width;
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
    terminate(atomic = false) {
        this.bases.length = 0;
        this.baseblocks.forEach((baseblock) => {
            // this.bar.removeChild(baseblock);
            baseblock.remove();
        });
        if (atomic) {
            this.bar.remove();
        }
    }
}
