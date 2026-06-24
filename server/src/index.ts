import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import cors from "cors";
import express from "express";
import { TowerRoom } from "./rooms/TowerRoom.js";

const port = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Colyseus monitor dashboard (dev convenience): http://localhost:2567/colyseus
app.use("/colyseus", monitor());

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("tower", TowerRoom);

gameServer.listen(port).then(() => {
  console.log(`[tower] server listening on ws://localhost:${port}`);
});
