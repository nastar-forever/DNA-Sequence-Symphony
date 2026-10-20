import { ctx, CodonNote, Sequence, master_stop } from "./symphoner";

let is_started = false
const seq = new Sequence();
seq.parse_codonnote("ATGCGTTTGCGA");
seq.limit_progression();


document.getElementById("startbttn").onclick = () => {
    if (is_started) {
        return;
    }

    seq.schedule_play(ctx.currentTime);
};

document.getElementById("stopbttn").onclick = () => {
    is_started = false;

    master_stop();
}