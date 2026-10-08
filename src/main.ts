import "@fontsource-variable/outfit";
import "@fontsource-variable/exo-2";
import "@fontsource-variable/exo-2/wght-italic.css";
import "./ui/style.css";
import { DIFFICULTIES, type Difficulty } from "./engine/types";
import type { Mode } from "./game/packs";
import { App } from "./ui/app";
import { mountToasts, toast } from "./ui/components/toast";
import { Background } from "./ui/fx/background";
import { mountCallouts } from "./ui/fx/callout";
import { Fx } from "./ui/fx/particles";
import { createHome } from "./ui/screens/home";
import { createQueensPlay } from "./ui/screens/queens-play";
import { createSudokuPlay } from "./ui/screens/sudoku-play";
import { audio } from "./ui/audio/synth";
import { connectSound, sound } from "./ui/sound";

connectSound(audio);

const bgCanvas = Object.assign(document.createElement("canvas"), { id: "bg" });
const fxCanvas = Object.assign(document.createElement("canvas"), { id: "fx" });
bgCanvas.setAttribute("aria-hidden", "true");
fxCanvas.setAttribute("aria-hidden", "true");
document.body.prepend(bgCanvas);
document.body.append(fxCanvas);
mountCallouts(document.body);
mountToasts(document.body);

const app = new App(document.getElementById("app")!, new Fx(fxCanvas), new Background(bgCanvas));
app.register({
  home: createHome,
  play: (a, mode, difficulty, resume, avoid) =>
    mode === "queens" ? createQueensPlay(a, difficulty, resume, avoid) : createSudokuPlay(a, mode, difficulty, resume, avoid),
});
app.onError = (message) => toast(message, "bad");

// Browsers only allow audio after a gesture: unlock on the first touch anywhere.
addEventListener("pointerdown", () => sound.unlock(), { capture: true, once: true });

// ?play=killer-medium jumps straight into a game (handy for sharing and for tests).
const play = new URLSearchParams(location.search).get("play");
const [mode, difficulty] = (play ?? "").split("-") as [Mode, Difficulty];
if (["classic", "killer", "queens"].includes(mode) && DIFFICULTIES.includes(difficulty)) void app.play(mode, difficulty);
else void app.home();
