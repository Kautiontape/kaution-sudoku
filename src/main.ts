import { renderBoard } from "./ui/board";

const app = document.getElementById("app")!;
const title = document.createElement("h1");
title.textContent = "Cage Coach";
app.appendChild(title);
renderBoard(app);
