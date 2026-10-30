import {Base, DNAString, to_singular_bases} from "./dna.js"
import {BulkTransToken, Channel, Master, Sequence} from "./symphoner.js";
import {UserSettings} from "./settings_container.js";

export interface BaseBlockClasses {
    disabled: string[];
    A: string[];
    C: string[];
    G: string[];
    T: string[];
}

export const STANDARD_BASEBLOCK_CLASSES: BaseBlockClasses = {
    disabled: ["dis-base"],
    A: ["base", "adenine"],
    C: ["base", "cytosine"],
    G: ["base", "guanine"],
    T: ["base", "thymine"]
}


export function retrieve<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);

    if (!element) {
        throw new Error(`Missing element: ${selector}`);
    }

    return element;
}

export function retrieve_all<T extends Element>(
    selector: string,
    buffer?: T[]
): NodeList {
    const elements = document.querySelectorAll<T>(selector);

    if (elements.length <= 0) {
        throw new Error(`Missing element(s): ${selector}`);
    }

    if (buffer) {
        elements.forEach((el) => {
            buffer.push(el);
        })
    }

    return elements;
}


export interface ESCListener{
    (ent: HTMLInputElement,
    btn: HTMLButtonElement,
    channel: Channel): void;
}

export interface ESCValSetFunction<T extends HTMLElement>{
    (element: T): string;
}

export class EntrySettingsCorrespond {
    public ent: HTMLInputElement[];
    public bttn: HTMLButtonElement[];
    public channels: Channel[];
    public sequences: Sequence[];

    constructor(
        public master: Master,
        public standard_settings: UserSettings
    ) {
        this.ent = [];
        this.bttn = [];
        this.channels = [];
        this.sequences = [];
    }

    private validate(extra_cond = true) {
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
        })

        this.channels = Array.from({length:this.ent.length}, () => {
            const ch = new Channel(
                this.master,
                null,
                null
            )

            ch.apply_settings(this.standard_settings);
            return ch;
        })
    }

    construct_sequences() {
        // this.validate(this.channels.length === this.ent.length);
        this.sequences.forEach((seq) => {
            seq.clear();
        })

        this.sequences = Array.from({length:this.ent.length}, (_, index) => {
            return new Sequence(this.master, this.channels[index]);
        })
    }

    button_addEventListener(
        event: keyof HTMLElementEventMap,
        listener: ESCListener
    ) {
        this.validate();

        this.bttn.forEach((bttn, i) => {
            bttn.addEventListener(event, () => {
                listener(this.ent[i], bttn, this.channels[i]);
            })
        })
    }

    entry_addEventListener(
        event: keyof HTMLElementEventMap,
        listener: ESCListener
    ) {
        this.validate();

        this.ent.forEach((ent, i) => {
            ent.addEventListener(event, () => {
                listener(ent, this.bttn[i], this.channels[i])
            })
        })
    }

    silence() {
        this.channels.forEach((ch) => {ch.silence()});
    }

    get total_duration(): number {
        return Math.max(...this.sequences.map((seq) => seq.total_duration));
    }

    schedule_play(starttime: number, offset = 0) {
        this.sequences.forEach((seq) => {seq.schedule_play(starttime, offset)});
    }

    set_entries_val_func(func: ESCValSetFunction<HTMLInputElement>) {
        this.ent.forEach((entry) => {
            entry.value = func(entry);
        })
    }

    set_entries_val_str(str: string) {
        this.ent.forEach((entry) => {entry.value = str});
    }
}


export class Playbar {
    private origin = 0;
    private next_pass = 0;
    public start_frac = 0;
    public dragging = false;
    public active = false;

    constructor (
        readonly playbar: HTMLInputElement,
        readonly master: Master,
        public correspond: EntrySettingsCorrespond,
        readonly lookahead = 1.0,
        readonly tick_interval = 50,
    ) {}

    start_at(frac: number) {
        const seqs = this.correspond.sequences;
        const offset = frac * this.correspond.total_duration;
        const timestart = this.master.ctx.currentTime + 0.05;
        seqs.forEach((seq) => {seq.schedule_play(timestart, offset)})
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
        seqs.forEach((seq) => {seq.clear()});
        this.active = false;
    }

    update() {
        const max = Number(this.playbar.max);
        const min = Number(this.playbar.min);
        const value = Number(this.playbar.value);
        const prog = (value - min) / (max - min) * 100;
        this.playbar.style.setProperty("--progress", prog + "%");
    }
    
    set(frac: number) {
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
            this.set(
                (Math.max(0, this.master.ctx.currentTime - this.origin) % total) / total
            );
        }
    }
}


export class DNABar {
    readonly bar: HTMLElement;
    private bases: Base[];
    private bases_limit: number;
    private baseblocks: HTMLElement[];
    private _space_width: number;
    private _base_width: number;

    init_baseblocks() {
        for (let i = 0; i < this.bases_limit; i++) {
            const baseblock = document.createElement("div");
            baseblock.classList.add(...[...this.baseblock_classes.disabled]);

            this.bar.appendChild(baseblock);

            this.baseblocks.push(baseblock);
        }
    }

    constructor(
        bar?: HTMLElement,
        base_width = 40,
        space_width = window.innerWidth,
        readonly baseblock_classes: BaseBlockClasses = STANDARD_BASEBLOCK_CLASSES
    ) {
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

    set space_width(value: number) {
        this._space_width = value
        this.bases_limit = Math.ceil(this._space_width / this._base_width);
        this.bases = this.bases.slice(-this.bases_limit);
        this.init_baseblocks();
        this.update_baseblocks();
    }

    get base_width() {
        return this._base_width;
    }

    set base_width(value: number) {
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
            } else {
                baseblock.style.setProperty("display", "none");
                return;
            }

            // baseblock.style.animation = "none";
            // void baseblock.offsetWidth;
            // baseblock.style.animation = "";
            
            baseblock.classList.remove(...baseblock.classList);
            baseblock.classList.add(...this.baseblock_classes[this.bases[i]])
            
        });
    }

    append_base(base: Base) {
        this.bases.push(base);
        
        if (this.bases.length > this.bases_limit) {
            this.bases.shift();
        }
    }

    implant_bases(bases: DNAString) {
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