export const STANDARD_DELTA_MAP = {
    C: -2,
    A: -1,
    G: 1,
    T: 2
};
export const STANDARD_DAMP_MAP = {
    C: 1,
    A: 0.4,
    G: 0.4,
    T: 1
};
export const STANDARD_TIME_MAP = {
    C: 1,
    A: 1,
    G: 2,
    T: 2
};
export const STANDARD_PICK_MAP = {
    C: 0,
    A: 1,
    G: 2,
    T: 3
};
export const STANDARD_TIME_PATTERN = [
    [1, 1, 1, 2],
    [1, 2, 1, 2],
    [1, 1, 2, 2],
    [2, 2, 2, 2]
];
export const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];
export function midi_to_freq(midi_num) {
    return 440 * Math.pow(2, (midi_num - 69) / 12);
}
export function slide_in_scale(origin, delta, scale = C_MAJOR) {
    if (delta === 0) {
        return origin;
    }
    const octave = Math.floor(origin / 12);
    const pitch_class = origin - octave * 12;
    let degree = scale.length - 1;
    while (scale[degree] > pitch_class)
        degree--;
    const onscale = scale[degree] === pitch_class;
    const index = degree + (onscale || delta > 0 ? delta : delta + 1);
    const target_octave = octave + Math.floor(index / 7);
    const target_degree = ((index % 7) + 7) % 7;
    return target_octave * 12 + scale[target_degree];
}
// http://github.com/GoogleChromeLabs/web-audio-samples/tree/main/src/demos/wavetable-synth/wave-tables
export async function load_gcl_wavetable(url) {
    const txt = await (await fetch(url)).text();
    const cleantxt = txt.replace(/'/g, '"').replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleantxt);
}
export function create_periodic_wave(ctx, imag, real) {
    let realarray;
    if (real) {
        realarray = new Float32Array(real);
    }
    else {
        realarray = new Float32Array(imag.length);
    }
    return ctx.createPeriodicWave(realarray, new Float32Array(imag));
}
export async function load_reverb_convolver(ctx, url) {
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error("FAILED TO LOAD REVERB (" + res.status + ")");
            return null;
        }
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        const convolver = ctx.createConvolver();
        convolver.buffer = buf;
        return convolver;
    }
    catch (error) {
        console.log("ERROR (Probable CORS block) " + error);
        return null;
    }
}
export function damp_delta(delta, damper) {
    return Math.round(delta * damper);
}
export class Master {
    constructor(ctx = new AudioContext(), gain, bpm = 120, default_gain = 1, max_delta_change = 2, delta_map = STANDARD_DELTA_MAP, damp_map = STANDARD_DAMP_MAP, time_map = STANDARD_TIME_MAP, pick_map = STANDARD_PICK_MAP, time_pattern = STANDARD_TIME_PATTERN) {
        this.ctx = ctx;
        this.default_gain = default_gain;
        this.max_delta_change = max_delta_change;
        this.delta_map = delta_map;
        this.damp_map = damp_map;
        this.time_map = time_map;
        this.pick_map = pick_map;
        this.time_pattern = time_pattern;
        this.beattime = 60 / bpm;
        this.gain = gain ?? ctx.createGain();
        this.gain.connect(this.ctx.destination);
        this.active_oscs = new Set();
    }
    stop(fadeout = 0.02, stoptime) {
        stoptime = stoptime ?? this.ctx.currentTime;
        const old = this.gain;
        old.gain.cancelScheduledValues(stoptime);
        old.gain.setValueAtTime(old.gain.value, stoptime);
        old.gain.linearRampToValueAtTime(0, stoptime + fadeout);
        this.active_oscs.forEach((osc) => { osc.stop(); });
        this.active_oscs.clear();
        this.gain = this.ctx.createGain();
        this.gain.connect(this.ctx.destination);
        setTimeout(() => old.disconnect(), fadeout * 1000 + 50);
    }
}
export class TransToken {
    constructor(ramptype, tovalue, duration, param) {
        this.ramptype = ramptype;
        this.tovalue = tovalue;
        this.duration = duration;
        this.param = param;
    }
    execute(execttime, param) {
        param = param ?? this.param;
        if (!param) {
            throw Error("TransToken param is undefined.");
        }
        param.setValueAtTime(param.value, execttime);
        if (this.ramptype === "exp") {
            param.exponentialRampToValueAtTime(this.tovalue, execttime + this.duration);
        }
        else {
            param.linearRampToValueAtTime(this.tovalue, execttime + this.duration);
        }
    }
}
export class Channel {
    constructor(master, ir, periodic_wave, wet = 0.3, trans_duration = 0.1) {
        this.master = master;
        this.ir = ir;
        this.trans_duration = trans_duration;
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
    get wet() {
        return this._wet.gain.value;
    }
    set wet(value) {
        if (value > 1) {
            throw Error(`Wet value cannot exceeds one. Got ${value} instead.`);
        }
        this._wet.gain.setValueAtTime(value, this.master.ctx.currentTime);
    }
    set reverb_enabled(value) {
        if (value === this._reverb_enabled) {
            return;
        }
        const to_dry = value ? 1 - this._wet.gain.value : 1;
        (new TransToken("exp", to_dry, this.trans_duration, this.dry.gain)).execute(this.master.ctx.currentTime);
        if (value) {
            this.gain.connect(this.ir);
        }
        else {
            this.gain.disconnect(this.ir);
        }
        this._reverb_enabled = value;
    }
    schedule_play(midinote, starttime, transtoken) {
        this.osc.frequency.setValueAtTime(starttime, midi_to_freq(midinote));
        if (transtoken) {
            transtoken.execute(starttime);
        }
    }
    disconnect(stop = false) {
        this.master.active_oscs.delete(this.osc);
        this.osc.disconnect();
        if (stop) {
            this.osc.stop();
        }
    }
    reconnect(create_new_oscillator = true) {
        if (create_new_oscillator) {
            this.osc = this.master.ctx.createOscillator();
            this.osc.setPeriodicWave(this.periodic_wave);
        }
        this.osc.connect(this.gain);
    }
}
export const BASES = new Set(["A", "C", "G", "T"]);
export function is_codon(bases) {
    return bases.length === 3 && [...bases].every((char) => BASES.has(char));
}
export class PlayableBases {
    constructor(master, initial_note) {
        this.master = master;
        this.initial_note = initial_note;
    }
    bound_delta(prev_delta) { }
    bound_time(pattern) { }
    schedule_play(channel, starttime, trans, nextnote) { }
    get total_duration() { return 0; }
    get last_delta() { return 0; }
    get first_note() { return 0; }
    ;
}
export class CodonNote extends PlayableBases {
    constructor(master, codon, initial_note = 60) {
        super(master, initial_note);
        this.codon = codon;
        [this.first, this.middle, this.last] = [...codon];
        this.delta = damp_delta(master.delta_map[this.first], master.damp_map[this.last]);
        this.duration = master.time_map[this.middle] * master.beattime;
        this.osc = master.ctx.createOscillator();
    }
    get last_delta() {
        return this.delta;
    }
    bound_delta(prev_delta) {
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
    schedule_play(channel, starttime, transtoken) {
        const note = this.note;
        channel.schedule_play(note, starttime, transtoken);
    }
}
export function is_codon_cluster(codons) {
    return codons.length === 4 && codons.every((codon) => codon instanceof CodonNote);
}
export class CodonCluster extends PlayableBases {
    constructor(master, codons, initial_note = 60) {
        super(master, initial_note);
        this.codons = codons;
    }
    get last_delta() {
        return this.codons[3].delta;
    }
    get first_note() {
        return this.codons[0].note;
    }
    bound_delta(prev_delta) {
        for (const [index, codon] of this.codons.entries()) {
            const prev_codon_delta = index ? this.codons[index - 1].delta : prev_delta;
            codon.bound_delta(prev_codon_delta);
        }
    }
    bound_time(pattern) {
        if (!pattern) {
            const average_pick = Math.round(this.codons.map((codon) => this.master.pick_map[codon.middle]).reduce((acc, dur) => acc + dur, 0) / this.codons.length);
            pattern = this.master.time_pattern[average_pick];
        }
        for (const [index, codon] of this.codons.entries()) {
            codon.duration = this.master.beattime * pattern[index];
        }
    }
    get total_duration() {
        return this.codons.map((codon) => codon.total_duration).reduce((acc, dur) => acc + dur, 0);
    }
    schedule_play(channel, starttime, _, endnote) {
        let time = starttime;
        for (const [index, codon] of this.codons.entries()) {
            const nextnote = index < 3 ? this.codons[index + 1].note : endnote;
            const freq = midi_to_freq(codon.note);
            const dur10p = codon.total_duration * 0.1; // 10% of duration
            const dur40p = codon.total_duration * 0.4; // 40% of duration
            channel.gain.gain.setValueAtTime(0.0001, time);
            channel.osc.frequency.setValueAtTime(freq, time);
            channel.schedule_play(codon.note, time);
            (new TransToken("exp", this.master.default_gain, dur10p, channel.gain.gain)).execute(time);
            if (nextnote) {
                (new TransToken("lin", midi_to_freq(nextnote), dur40p, channel.osc.frequency)).execute(time + dur40p + dur10p);
            }
            (new TransToken("exp", 0.0001, dur10p, channel.gain.gain)).execute(time + dur40p + dur40p + dur10p);
            time += codon.total_duration;
        }
    }
}
export class Sequence {
    constructor(master, channel) {
        this.master = master;
        this.channel = channel;
        this.codons = [];
    }
    clear() {
        this.codons.length = 0;
    }
    parse_sequence(sequence, implant = true) {
        const codonscount = sequence.length / 3;
        const clusterscount = Math.round(codonscount / 4);
        if (sequence.length % 3) {
            return null;
        }
        const codons = [];
        let i = 0;
        while (i < codonscount) {
            const cod = sequence.slice(i * 3, i * 3 + 3);
            if (!is_codon(cod)) {
                return null;
            }
            codons.push(new CodonNote(this.master, cod, i != 0 ? codons[i].note : undefined));
            i++;
        }
        i = 0;
        const clusters = [];
        while (i < clusterscount) {
            const cluster = codons.slice(i * 4, i * 4 + 4);
            if (!is_codon_cluster(cluster)) {
                return null;
            }
            clusters.push(new CodonCluster(this.master, cluster, i != 0 ? clusters[i].codons[3].note : undefined));
            i++;
        }
        const seq = [];
        seq.concat(clusters);
        seq.concat(codons.slice(clusterscount * 4));
        if (implant) {
            this.codons = seq;
        }
        return seq;
    }
    bound_delta() {
        this.codons.forEach((codon, index) => {
            codon.bound_delta(index
                ? this.codons[index - 1].last_delta
                : 0);
        });
    }
    bound_time() {
        this.codons.forEach((codon) => {
            codon.bound_time();
        });
    }
    bound() {
        this.bound_delta();
        this.bound_time();
    }
    get total_duration() {
        return this.codons.map((codon) => codon.total_duration).reduce((acc, dur) => acc + dur);
    }
    schedule_play(starttime, offset = 0) {
        let time = starttime - offset;
        for (const [index, codon] of this.codons.entries()) {
            if (time >= starttime - 1e-6) {
                codon.schedule_play(this.channel, time, undefined, index < this.codons.length ? this.codons[index + 1].first_note : undefined);
            }
            time += codon.total_duration;
        }
    }
}
