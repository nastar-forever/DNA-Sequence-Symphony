export interface BaseMap {
    readonly C: number,
    readonly A: number,
    readonly G: number,
    readonly T: number
}

export type PatternMap = readonly [
    [number, number, number, number],
    [number, number, number, number],
    [number, number, number, number],
    [number, number, number, number]
];

export interface Wavetable {
    readonly real: number[],
    readonly imag: number[]
}

export const STANDARD_DELTA_MAP: BaseMap = {
    C: -2,
    A: -1,
    G: 1,
    T: 2
}

export const STANDARD_DAMP_MAP: BaseMap = {
    C: 1,
    A: 0.4,
    G: 0.4,
    T: 1
}

export const STANDARD_TIME_MAP: BaseMap = {
    C: 1,
    A: 1,
    G: 2,
    T: 2
}

export const STANDARD_PICK_MAP: BaseMap = {
    C: 0,
    A: 1,
    G: 2,
    T: 3
}

export const STANDARD_TIME_PATTERN: PatternMap = [
    [1, 1, 1, 2],
    [1, 2, 1, 2],
    [1, 1, 2, 2],
    [2, 2, 2, 2]
]


export const C_MAJOR: number[] = [0, 2, 4, 5, 7, 9, 11];

export const START_NOTE = 60;
export const MIN_NOTE = 48;
export const MAX_NOTE = 84;
export const SILENT_GAIN = 0.0001;


///////////////////// HELPERS
export function midi_to_freq(midi_num: number) {
    return 440 * Math.pow(2, (midi_num-69) / 12);
}

export function slide_in_scale(origin: number, delta: number, scale = C_MAJOR): number {
    if (delta === 0) {
        return origin;
    }

    const octave = Math.floor(origin/12);
    const pitch_class = origin - octave * 12;

    let degree = scale.length - 1;
    while (scale[degree] > pitch_class) degree--;

    const onscale = scale[degree] === pitch_class;
    const index = degree + (onscale || delta > 0 ? delta : delta + 1);
    const target_octave = octave + Math.floor(index / scale.length);
    const target_degree = ((index % scale.length) + scale.length) % scale.length;

    return Math.min(MAX_NOTE, Math.max(MIN_NOTE, target_octave * 12 + scale[target_degree]));
}

export function shift_by_scale_step_in_scale(origin: number, steps: number, scale = C_MAJOR): number {
    const degree = scale.indexOf(origin % 12);

    if (degree === -1) {
        throw new RangeError(`Origin (MIDI) note ${origin} is not inside the given scale`);
    }

    const target = degree + steps;
    const octave = Math.floor(origin/12) + Math.floor(target / 7);
    return octave * 12 + scale[target % 7];
}

export function diatonic_chord(origin: number, size = 3, scale = C_MAJOR): number[] {
    return Array.from({length:size}, (_, i) => shift_by_scale_step_in_scale(origin, i*2));
}


// http://github.com/GoogleChromeLabs/web-audio-samples/tree/main/src/demos/wavetable-synth/wave-tables
export async function load_gcl_wavetable(url: string): Promise<Wavetable|null> {
    try {
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error("FAILED TO LOAD WAVETABLE (" + res.status + ")");
            return null;
        }

        
        const txt = await res.text();
        const start = txt.search(/[\[{]/);
        const end = Math.max(txt.lastIndexOf("]"), txt.lastIndexOf("}"));
        const cleantxt = txt.slice(start, end + 1)
            .replace(/'/g, '"')
            .replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
            .replace(/,\s*([\]}])/g, '$1');

        const data = JSON.parse(cleantxt);

        if (Array.isArray(data)) {
            return {real: new Array(data.length).fill(0), imag: data};
        }

        if (Array.isArray(data.real) && Array.isArray(data.imag) && data.real.length === data.imag.length) {
            return {real: data.real, imag: data.imag};
        }

        throw new Error("UNKNOWN WAVETABLE SHAPE");
        return null;

    } catch (error) {
        throw new Error("ERROR (Probable CORS block or bad format) " + error);
        return null;
    }
}

export function create_periodic_wave(ctx: AudioContext, imag: number[], real?: number[]) {
    let realarray: Float32Array;

    if (real) {
        realarray = new Float32Array(real);
    } else {
        realarray = new Float32Array(imag.length)
    }

    return ctx.createPeriodicWave(
        realarray,
        new Float32Array(imag)
    )
}


export async function load_reverb_convolver(ctx: AudioContext, url: string): Promise<ConvolverNode|null> {
    try {
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error("FAILED TO LOAD REVERB (" + res.status + ")")
            return null;
        }

        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        const convolver = ctx.createConvolver();

        convolver.buffer = buf;
        return convolver;
    } catch (error) {
        console.log("ERROR (Probable CORS block) " + error);
        return null;
    }
}


export function damp_delta (delta: number, damper: number): number {
    return Math.round(delta * damper);
}
///////////////////// HELPERS END


export class Master {
    readonly beattime: number;
    public gain: GainNode;

    constructor (
        readonly ctx = new AudioContext(),
        gain?: GainNode,
        bpm = 120,
        public default_gain = 1,
        readonly max_delta_change = 2,
        readonly delta_map = STANDARD_DELTA_MAP,
        readonly damp_map = STANDARD_DAMP_MAP,
        readonly time_map = STANDARD_TIME_MAP,
        readonly pick_map = STANDARD_PICK_MAP,
        readonly time_pattern = STANDARD_TIME_PATTERN
    ) {
        this.beattime = 60 / bpm;
        this.gain = gain ?? ctx.createGain();
        this.gain.connect(this.ctx.destination);
    }
}


export class TransToken {
    constructor (
        readonly ramptype: "exp" | "lin",
        readonly fromvalue: number,
        readonly tovalue: number,
        readonly duration: number,
        readonly param?: AudioParam
    ) {}

    execute(execttime: number, param?: AudioParam) {
        param = param ?? this.param;

        if (!param) {
            throw Error("TransToken param is undefined.");
        }

        param.setValueAtTime(this.fromvalue, execttime);

        if (this.ramptype === "exp") {
            param.exponentialRampToValueAtTime(this.tovalue, execttime + this.duration);
        } else {
            param.linearRampToValueAtTime(this.tovalue, execttime + this.duration);
        }
    }
}


export class Channel {
    readonly oscs: [OscillatorNode, OscillatorNode, OscillatorNode];
    readonly gain: GainNode;
    private _wet: GainNode;
    private dry: GainNode;
    private _reverb_enabled: boolean;

    connect_oscs(to: AudioNode) {
        this.oscs.forEach((osc) => {osc.connect(to)});
    }

    start_oscs() {
        this.oscs.forEach((osc) => {osc.start()})
    }

    set_oscs_freqs(freqs: number[], time?: number) {
        time = time ?? this.master.ctx.currentTime;
        freqs.forEach((freq, index) => {
            this.oscs[index].frequency.setValueAtTime(freq, time);
        });
    }

    set_oscs_freq(freq: number, time?: number) {
        time = time ?? this.master.ctx.currentTime;
        this.oscs.forEach((osc) => {
            osc.frequency.setValueAtTime(freq, time);
        });
    }

    trans_oscs(
        ramptype: "lin"|"exp",
        freqs: number[],
        duration: number,
        time?: number
    ) {
        time = time ?? this.master.ctx.currentTime;

        this.oscs.forEach((osc, index) => {
            (new TransToken(
                ramptype,
                osc.frequency.value,
                freqs[index],
                duration,
                osc.frequency
            )).execute(time);
        });
    }


    constructor (
        readonly master: Master,
        readonly ir: ConvolverNode|null,
        periodic_waves: PeriodicWave|[PeriodicWave, PeriodicWave, PeriodicWave]|null,
        wet: number = 0.3,
        readonly trans_duration: number = 0.1
    ) {
        if (wet > 1) {
            throw Error(`Wet value cannot exceeds one. Got ${wet} instead.`);
        }

        this.oscs = [
            master.ctx.createOscillator(),
            master.ctx.createOscillator(),
            master.ctx.createOscillator()
        ]

        if (periodic_waves) {
            if (periodic_waves instanceof Array && periodic_waves.length === 3) {
                periodic_waves.forEach((wave, index) => {this.oscs[index].setPeriodicWave(wave)});
            } else {
                this.oscs.forEach((osc) => {osc.setPeriodicWave(periodic_waves)})
            }
        }

        this.gain = master.ctx.createGain();
        this.gain.gain.value = SILENT_GAIN;

        this._wet = master.ctx.createGain();
        this._wet.gain.value = wet;

        this.dry = master.ctx.createGain();
        this.dry.gain.value = 1;

        this.connect_oscs(this.gain);
        this.gain.connect(this.dry).connect(master.gain);

        if (this.ir) {
            this.ir.connect(this._wet).connect(master.gain);
        }

        this.start_oscs();
        this._reverb_enabled = false;
    }


    get reverb_enabled() {
        return this._reverb_enabled;
    }

    get wet(): number {
        return this._wet.gain.value;
    }

    set wet(value: number) {
        if (value > 1) {
            throw Error(`Wet value cannot exceeds one. Got ${value} instead.`);
        }

        this._wet.gain.setValueAtTime(value, this.master.ctx.currentTime);
    }

    set reverb_enabled(value: boolean) {
        if (!this.ir || value === this._reverb_enabled) {
            return;
        }

        const to_dry: number = value? 1 - this._wet.gain.value : 1;
        (new TransToken("exp", this.dry.gain.value, to_dry, this.trans_duration, this.dry.gain)).execute(this.master.ctx.currentTime);

        if (value) {
            this.gain.connect(this.ir);
        } else {
            this.gain.disconnect(this.ir);
        }

        this._reverb_enabled = value;
    }

    play_note(midinote: number, starttime: number, duration: number, nextnote?: number) {
        const dur10p = duration * 0.1; // 10% of duration
        const dur40p = duration * 0.4; // 40% of duration

        /// Make sure typescript is happy
        let chord = diatonic_chord(midinote);
        let freqchord = chord.map((note) => midi_to_freq(note));

        this.set_oscs_freqs(freqchord, starttime);

        (new TransToken(
            "exp",
            SILENT_GAIN,
            this.master.default_gain,
            dur10p,
            this.gain.gain
        )).execute(starttime);

        // NOPE, NVM
        // if (nextnote !== undefined) {
        //     this.trans_oscs(
        //         "lin",

        //     )
        // }

        (new TransToken(
            "exp",
            this.master.default_gain,
            SILENT_GAIN,
            dur10p,
            this.gain.gain
        )).execute(starttime + dur40p + dur40p + dur10p);
    }

    silence(fadeout: number = 0.02) {
        const now = this.master.ctx.currentTime;

        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(Math.max(this.gain.gain.value, SILENT_GAIN), now);
        this.gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, now + fadeout);

        this.oscs.forEach((osc) => osc.frequency.cancelScheduledValues(now));
    }
}


export const BASES = new Set(["A", "C", "G", "T"]);
export type Base = "A" | "C" | "G" | "T";
export type Codon = `${Base}${Base}${Base}`;


export function is_codon(bases: string): bases is Codon {
    return bases.length === 3 && [...bases].every((char) => BASES.has(char));
}


export class PlayableBases {
    constructor(
        readonly master: Master,
        public initial_note: number
    ) {}

    bound_delta(prev_delta: number): void {}
    bound_note(prev_note: number): void {}
    bound_time(pattern?: [number, number, number, number]): void {}
    schedule_play(channel: Channel, starttime: number, nextnote?: number, skip = 0): void {}
    get total_duration(): number {return 0}
    get last_delta(): number {return 0}
    get first_note(): number {return 0}
    get last_note(): number {return 0}
}


export class CodonNote extends PlayableBases {
    public duration: number;
    public delta: number;
    readonly first: Base;
    readonly middle: Base;
    readonly last: Base;

    constructor (
        master: Master,
        readonly codon: Codon,
        initial_note = START_NOTE
    ) {
        super(master, initial_note);
        [this.first, this.middle, this.last] = [...codon] as [Base, Base, Base];

        this.delta = damp_delta(
            master.delta_map[this.first],
            master.damp_map[this.last]
        );

        this.duration = master.time_map[this.middle] * master.beattime;
    }


    get last_delta() {
        return this.delta;
    }


    bound_delta(prev_delta: number): void {
        const max = this.master.max_delta_change;
        this.delta = prev_delta + Math.max(-max, Math.min(max, this.delta - prev_delta));
    }

    bound_note(prev_note: number): void {
        this.initial_note = prev_note;
    }


    get total_duration() {
        return this.duration;
    }

    get note() {
        return slide_in_scale(this.initial_note, this.delta);
    }

    get first_note() {
        return this.note;
    }

    get last_note() {
        return this.note;
    }


    schedule_play(
        channel: Channel,
        starttime: number,
        nextnote?: number,
        skip = 0
    ): void {
        channel.play_note(this.note, starttime, this.duration - skip, nextnote);
    }
}


export function is_codon_cluster(codons: CodonNote[]): codons is [CodonNote, CodonNote, CodonNote, CodonNote] {
    return codons.length === 4 && codons.every((codon) => codon instanceof CodonNote);
}


export class CodonCluster extends PlayableBases {
    constructor (
        master: Master,
        readonly codons: [CodonNote, CodonNote, CodonNote, CodonNote],
        initial_note = START_NOTE
    ) {
        super(master, initial_note);
    }


    get last_delta() {
        return this.codons[3].delta;
    }

    get first_note() {
        return this.codons[0].note;
    }

    get last_note() {
        return this.codons[3].note;
    }
    
    get total_duration(): number {
        return this.codons.map((codon) => codon.total_duration).reduce((acc, dur) => acc + dur, 0);
    }
    

    bound_delta(prev_delta: number): void {
        for (const [index, codon] of this.codons.entries()) {
            const prev_codon_delta = index ? this.codons[index-1].delta : prev_delta;
            codon.bound_delta(prev_codon_delta);
        }
    }

    bound_note(prev_note: number): void {
        this.initial_note = prev_note;
        let note = prev_note;

        for (const codon of this.codons) {
            codon.bound_note(note);
            note = codon.last_note;
        }
    }

    bound_time(pattern? : [number, number, number, number]): void {
        if (!pattern) {
            const average_pick = Math.round(this.codons.map(
                (codon) => this.master.pick_map[codon.middle]
            ).reduce((acc, dur) => acc + dur, 0) / this.codons.length);

            pattern = this.master.time_pattern[average_pick];
        }

        for (const [index, codon] of this.codons.entries()) {
            codon.duration = this.master.beattime * pattern[index];
        }
    }

    schedule_play(channel: Channel, starttime: number, endnote?: number, skip = 0): void {
        let time = starttime;
        let remaining = skip;

        for (const [index, codon] of this.codons.entries()) {
            const duration = codon.total_duration;

            if (remaining >= duration - 1e-6) {
                remaining -= duration;
                continue;
            }

            const nextnote = index < 3 ? this.codons[index+1].note : endnote;
            codon.schedule_play(channel, time, nextnote, remaining);

            time += duration - remaining;
            remaining = 0;
        }
    }
}


export class Sequence {
    public codons: PlayableBases[];

    constructor (
        readonly master: Master,
        readonly channel: Channel
    ) {
        this.codons = [];
    }

    get total_duration(): number {
        return this.codons.map((codon) => codon.total_duration).reduce((acc, dur) => acc + dur, 0);
    }

    
    clear(): void {
        this.codons.length = 0;
    }

    parse_sequence(sequence: string, implant=true): PlayableBases[]|null {
        if (sequence.length < 12 || sequence.length % 3) {
            return null;
        }

        const codonscount = sequence.length / 3;
        const clusterscount = Math.floor(codonscount / 4);

        const codons: CodonNote[] = [];
        let i = 0;

        while (i < codonscount) {
            const cod = sequence.slice(i*3, i*3 + 3);

            if (!is_codon(cod)) {
                return null;
            }

            codons.push(new CodonNote(this.master, cod));
            i++;
        }

        i = 0;
        const clusters: CodonCluster[] = [];

        while (i < clusterscount) {
            const cluster = codons.slice(i*4, i*4+4);

            if (!is_codon_cluster(cluster)) {
                return null;
            }

            clusters.push(new CodonCluster(this.master, cluster));
            i++;
        }

        const seq: PlayableBases[] = [...clusters, ...codons.slice(clusterscount*4)];

        if (implant) {
            this.codons = seq;
        }

        return seq;
    }


    bound_delta() {
        this.codons.forEach(
            (codon, index) => {
                codon.bound_delta(
                    index
                    ? this.codons[index-1].last_delta
                    : 0
                );
            }
        );
    }

    bound_note() {
        let prev_note = START_NOTE;

        this.codons.forEach(
            (codon) => {
                codon.bound_note(prev_note);
                prev_note = codon.last_note;
            }
        );
    }

    bound_time() {
        this.codons.forEach(
            (codon) => {
                codon.bound_time();
            }
        )
    }

    bound() {
        this.bound_delta();
        this.bound_note();
        this.bound_time();
    }



    schedule_play(starttime: number, offset=0): void {
        let time = starttime;
        let remaining = offset;

        for (const [index, codon] of this.codons.entries()) {
            const duration = codon.total_duration;

            if (remaining >= duration - 1e-6) {
                remaining -= duration;
                continue;
            }

            codon.schedule_play(
                this.channel,
                time,
                this.codons[(index + 1) % this.codons.length].first_note,
                remaining
            );

            time += duration - remaining;
            remaining = 0;
        }
    }
}