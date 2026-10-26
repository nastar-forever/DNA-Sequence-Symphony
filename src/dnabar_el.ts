import {Base, DNAString, to_singular_bases} from "./dna.js"

export interface BaseBlockClasses {
    general: string[];
    A: string[];
    C: string[];
    G: string[];
    T: string[];
}

export const STANDARD_BASEBLOCK_CLASSES: BaseBlockClasses = {
    general: ["base"],
    A: ["adenine"],
    C: ["cytosine"],
    G: ["guanine"],
    T: ["thymine"]
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
            baseblock.classList.add(...[...this.baseblock_classes.general]);
            baseblock.style.setProperty("display", "none");

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
            baseblock.classList.add(...[
                ...this.baseblock_classes.general,
                ...this.baseblock_classes[this.bases[i]]
            ])
            
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
            baseblock.classList.add(...[
                ...this.baseblock_classes.general,
                ...this.baseblock_classes[s_bases[i] ?? []]
            ]);

            baseblock.style.setProperty("display", "flex");
        });

        this.bases = s_bases.slice(-this.bases_limit);
    }
}