import { ctx, master_reset, Sequence, master_stop } from "./symphoner.js";

let is_started = false
const seq = new Sequence();
seq.parse_codonnote(
  "ATGCGTTTGCGACCATGGAGTCATGGCTACTTAGCACGTACGGATCCATGACGTAACGTT"
);
seq.limit_progression();
await seq.init_reverbs();

console.log(seq.irs)


document.getElementById("startbttn").onclick = () => {
    if (is_started) {
        return;
    }

    is_started = true;
    master_reset();
    seq.schedule_play(ctx.currentTime);
};

document.getElementById("stopbttn").onclick = () => {
    is_started = false;

    master_stop();
}