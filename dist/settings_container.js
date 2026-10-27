export class PrimaryUserSettings {
    constructor(bound_to, bpm, default_gain, ir, chord_size, periodic_waves, wet) {
        this.bound_to = bound_to;
        this.bpm = bpm;
        this.default_gain = default_gain;
        this.ir = ir;
        this.chord_size = chord_size;
        this.periodic_waves = periodic_waves;
        this.wet = wet;
    }
    validate() {
        return (this.periodic_waves === null ?
            this.ir === null :
            Array.isArray(this.periodic_waves) ?
                this.chord_size === this.periodic_waves.length :
                this.chord_size === 1);
    }
}
export class SecondaryUserSettings {
    constructor(bound_to, goofy_mode = false) {
        this.bound_to = bound_to;
        this.goofy_mode = goofy_mode;
    }
    validate() {
        return true;
    }
}
export class UserSettings {
    constructor(bound_to, bpm, default_gain, ir = null, chord_size = 1, periodic_waves = null, wet = 0.3, goofy_mode = false) {
        this.bound_to = bound_to;
        this.bpm = bpm;
        this.default_gain = default_gain;
        this.ir = ir;
        this.chord_size = chord_size;
        this.periodic_waves = periodic_waves;
        this.wet = wet;
        this.goofy_mode = goofy_mode;
    }
    static from_primaries(primaries) {
        return new UserSettings(primaries.bound_to, primaries.bpm, primaries.default_gain, primaries.ir, primaries.chord_size, primaries.periodic_waves, primaries.wet, false);
    }
    extract_primaries() {
        return new PrimaryUserSettings(this.bound_to, this.bpm, this.default_gain, this.ir, this.chord_size, this.periodic_waves, this.wet);
    }
    extract_secondaries() {
        return new SecondaryUserSettings(this.bound_to, this.goofy_mode);
    }
    validate() {
        return this.extract_primaries().validate()
            && this.extract_secondaries().validate();
    }
}
