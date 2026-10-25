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
    const target_octave = octave + Math.floor(index / 7);
    const target_degree = ((index % 7) + 7) % 7;

    return target_octave * 12 + scale[target_degree];
}


// http://github.com/GoogleChromeLabs/web-audio-samples/tree/main/src/demos/wavetable-synth/wave-tables
export async function load_gcl_wavetable(url: string): Promise<number[]> {
    const txt = await (await fetch(url)).text();
    const cleantxt = txt.replace(/'/g, '"').replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleantxt);
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
            console.error("FAILED TO LOAD REVERB (" + res.status + ")")
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

export class Master {
    readonly beattime: number;
    public gain: GainNode;
    public active_oscs: Set<OscillatorNode>;

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

        this.active_oscs = new Set();
    }

    stop(fadeout: number = 0.02, stoptime?: number) {
        stoptime = stoptime ?? this.ctx.currentTime;
        const old = this.gain;
        old.gain.cancelScheduledValues(stoptime);
        old.gain.setValueAtTime(old.gain.value, stoptime);
        old.gain.linearRampToValueAtTime(0, stoptime + fadeout);

        this.active_oscs.forEach((osc) => {osc.stop()});
        this.active_oscs.clear();

        this.gain = this.ctx.createGain();
        this.gain.connect(this.ctx.destination);
        setTimeout(() => old.disconnect(), fadeout * 1000 + 50);
    }
}


export class TransToken {
    constructor (
        readonly ramptype: "exp" | "lin",
        readonly tovalue: number,
        readonly duration: number,
        readonly param?: AudioParam
    ) {}

    execute(execttime: number, param?: AudioParam) {
        param = param ?? this.param;

        if (!param) {
            throw Error("TransToken param is undefined.");
        }

        param.setValueAtTime(param.value, execttime);

        if (this.ramptype === "exp") {
            param.exponentialRampToValueAtTime(this.tovalue, execttime + this.duration);
        } else {
            param.linearRampToValueAtTime(this.tovalue, execttime + this.duration);
        }
    }
}


export class Channel {
    public osc: OscillatorNode;
    readonly gain: GainNode;
    private _wet: GainNode;
    private dry: GainNode;
    readonly periodic_wave: PeriodicWave;
    private _reverb_enabled: boolean;

    constructor (
        readonly master: Master,
        readonly ir: ConvolverNode,
        periodic_wave: PeriodicWave,
        wet: number = 0.3,
        readonly trans_duration: number = 0.1
    ) {
        if (wet > 1) {
            throw Error(`Wet value cannot exceeds one. Got ${wet} instead.`);
        }

        this.osc = master.ctx.createOscillator();
        this.osc.setPeriodicWave(periodic_wave);

        this.gain = master.ctx.createGain();
        this.gain.gain.value = master.default_gain;
        
        this._wet = master.ctx.createGain();
        this._wet.gain.value = wet;

        this.dry = master.ctx.createGain();
        this.dry.gain.value = 1;

        this.osc.connect(this.gain);
        this.gain.connect(this.dry).connect(master.gain);
        this.ir.connect(this._wet).connect(master.gain);

        this._reverb_enabled = false;
        this.periodic_wave = periodic_wave;
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
        if (value === this._reverb_enabled) {
            return;
        }

        const to_dry: number = value? 1 - this._wet.gain.value : 1;
        (new TransToken("exp", to_dry, this.trans_duration, this.dry.gain)).execute(this.master.ctx.currentTime);

        if (value) {
            this.gain.connect(this.ir);
        } else {
            this.gain.disconnect(this.ir);
        }
        
        this._reverb_enabled = value;
    }

    schedule_play(midinote: number, starttime: number, transtoken?: TransToken) {
        this.osc.frequency.setValueAtTime(starttime, midi_to_freq(midinote));

        if (transtoken) {
            transtoken.execute(starttime);
        }
    }

    disconnect(stop=false) {
        this.master.active_oscs.delete(this.osc);
        this.osc.disconnect();

        if (stop) {
            this.osc.stop();
        }
    }

    reconnect(create_new_oscillator=true) {
        if (create_new_oscillator) {
            this.osc = this.master.ctx.createOscillator();
            this.osc.setPeriodicWave(this.periodic_wave);
        }

        this.osc.connect(this.gain);
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
        readonly initial_note: number
    ) {}

    bound_delta(prev_delta: number): void {}
    bound_time(pattern?: [number, number, number, number]): void {}
    schedule_play(channel: Channel, starttime: number, trans?: TransToken, nextnote?: number): void {}
    get total_duration(): number {return 0}
    get last_delta(): number {return 0}
    get first_note(): number {return 0};
}

export class CodonNote extends PlayableBases {
    readonly osc: OscillatorNode;
    public duration: number;
    public delta: number;
    readonly first: "C" | "G" | "A" | "T";
    readonly middle: "C" | "G" | "A" | "T";
    readonly last: "C" | "G" | "A" | "T";

    constructor (
        master: Master,
        readonly codon: Codon,
        initial_note = 60
    ) {
        super(master, initial_note);
        [this.first, this.middle, this.last] = [...codon] as [Base, Base, Base];

        this.delta = damp_delta(
            master.delta_map[this.first],
            master.damp_map[this.last]
        );

        this.duration = master.time_map[this.middle] * master.beattime;
        this.osc = master.ctx.createOscillator();
    }


    get last_delta() {
        return this.delta;
    }


    bound_delta(prev_delta: number): void {
        const distance = Math.abs(prev_delta - this.delta);

        if (distance > this.master.max_delta_change) {
            this.delta += prev_delta < 0 ? 1 : -1;
        }
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

    schedule_play(
        channel: Channel,
        starttime: number,
        transtoken: TransToken
    ): void {
        const note = this.note;
        channel.schedule_play(note, starttime, transtoken);
    }
}

export function is_codon_cluster(codons: CodonNote[]): codons is [CodonNote, CodonNote, CodonNote, CodonNote] {
    return codons.length === 4 && codons.every((codon) => codon instanceof CodonNote);
}

export class CodonCluster extends PlayableBases {
    constructor (
        master: Master,
        readonly codons: [CodonNote, CodonNote, CodonNote, CodonNote],
        initial_note = 60
    ) {
        super(master, initial_note);
    }

    get last_delta() {
        return this.codons[3].delta;
    }

    get first_note() {
        return this.codons[0].note;
    }

    bound_delta(prev_delta: number): void {
        for (const [index, codon] of this.codons.entries()) {
            const prev_codon_delta = index ? this.codons[index-1].delta : prev_delta;
            codon.bound_delta(prev_codon_delta);
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

    get total_duration(): number {
        return this.codons.map((codon) => codon.total_duration).reduce((acc, dur) => acc + dur, 0);
    }

    schedule_play(channel: Channel, starttime: number, _: TransToken, endnote?:number): void { // Ignore TransToken
        let time = starttime;

        for (const [index, codon] of this.codons.entries()) {
            const nextnote = index < 3 ? this.codons[index+1].note : endnote;
            const freq = midi_to_freq(codon.note);
            const dur10p = codon.total_duration * 0.1; // 10% of duration
            const dur40p = codon.total_duration * 0.4; // 40% of duration

            channel.gain.gain.setValueAtTime(0.0001, time);
            channel.osc.frequency.setValueAtTime(freq, time);

            channel.schedule_play(codon.note, time);
            
            (new TransToken(
                "exp",
                this.master.default_gain,
                dur10p,
                channel.gain.gain
            )).execute(time);

            if (nextnote) {
                (new TransToken(
                    "lin",
                    midi_to_freq(nextnote),
                    dur40p,
                    channel.osc.frequency
                )).execute(time + dur40p + dur10p);
            }
            
            (new TransToken(
                "exp",
                0.0001,
                dur10p,
                channel.gain.gain
            )).execute(time + dur40p + dur40p + dur10p);

            time += codon.total_duration;
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

    clear(): void {
        this.codons.length = 0;
    }

    parse_sequence(sequence: string, implant=true): PlayableBases[]|null {
        const codonscount = sequence.length / 3;
        const clusterscount = Math.round(codonscount / 4);

        if (sequence.length % 3) {
            return null;
        }

        const codons: CodonNote[] = [];
        let i = 0;

        while (i < codonscount) {
            const cod = sequence.slice(i*3, i*3 + 3);

            if (!is_codon(cod)) {
                return null;
            }

            codons.push(new CodonNote(this.master, cod, i != 0 ? codons[i].note : undefined));
            i++;
        }

        i = 0;
        const clusters: CodonCluster[] = [];

        while (i < clusterscount) {
            const cluster = codons.slice(i*4, i*4+4);

            if (!is_codon_cluster(cluster)) {
                return null;
            }

            clusters.push(new CodonCluster(
                this.master,
                cluster,
                i != 0 ? clusters[i].codons[3].note : undefined
            ))
            i++;
        }

        const seq: PlayableBases[] = [];
        seq.concat(clusters);
        seq.concat(codons.slice(clusterscount*4));

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

    bound_time() {
        this.codons.forEach(
            (codon) => {
                codon.bound_time();
            }
        )
    }

    bound() {
        this.bound_delta();
        this.bound_time();
    }

    get total_duration(): number {
        return this.codons.map((codon) => codon.total_duration).reduce((acc, dur) => acc + dur);
    }

    schedule_play(starttime: number, offset=0): void {
        let time = starttime - offset;

        for (const [index, codon] of this.codons.entries()) {
            if (time >= starttime - 1e-6) {
                codon.schedule_play(
                    this.channel,
                    time,
                    undefined,
                    index < this.codons.length ? this.codons[index+1].first_note : undefined
                );
            }

            time += codon.total_duration;
        }
    }
}