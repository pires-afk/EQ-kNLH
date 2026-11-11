const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const rooms = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/rooms", (_req, res) => {
  const room = crypto.randomBytes(24).toString("hex");
  rooms.set(room, { share: null, viewer: null, createdAt: Date.now() });
  res.json({ room, shareUrl: `/session/${room}?role=share`, viewUrl: `/session/${room}?role=view` });
});

app.get("/session/:room", (req, res) => {
  if (!/^[a-f0-9]{48}$/.test(req.params.room) || !rooms.has(req.params.room)) {
    return res.status(404).send("Sessão não encontrada ou expirada.");
  }
  res.sendFile(path.join(__dirname, "public", "session.html"));
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname !== "/signal") return socket.destroy();
  wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request));
});

wss.on("connection", (ws, request) => {
  const url = new URL(request.url, "http://localhost");
  const roomId = url.searchParams.get("room");
  const role = url.searchParams.get("role");
  const room = rooms.get(roomId);
  if (!room || !["share", "view"].includes(role) || room[role]) {
    ws.close(1008, "Sessão inválida ou papel já ocupado");
    return;
  }

  room[role] = ws;
  ws.role = role;
  ws.roomId = roomId;

  const otherRole = role === "share" ? "view" : "share";
  if (room[otherRole]?.readyState === 1) {
    room[otherRole].send(JSON.stringify({ type: "peer-ready" }));
    ws.send(JSON.stringify({ type: "peer-ready" }));
  }

  ws.on("message", raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (!["offer", "answer", "ice", "stop"].includes(message.type)) return;
    const peer = rooms.get(roomId)?.[otherRole];
    if (peer?.readyState === 1) peer.send(JSON.stringify(message));
    if (message.type === "stop") {
      peer?.close(1000, "Transmissão encerrada");
      ws.close(1000, "Transmissão encerrada");
    }
  });

  ws.on("close", () => {
    const current = rooms.get(roomId);
    if (!current) return;
    if (current[role] === ws) current[role] = null;
    const peer = current[otherRole];
    if (peer?.readyState === 1) {
      peer.send(JSON.stringify({ type: "peer-left" }));
      peer.close(1000, "A outra pessoa saiu");
    }
    if (!current.share && !current.viewer) rooms.delete(roomId);
  });
});

// Remove abandoned rooms after 2 hours.
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, room] of rooms) {
    if (room.createdAt < cutoff) {
      room.share?.close(1000, "Sessão expirada");
      room.viewer?.close(1000, "Sessão expirada");
      rooms.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`EQ KNLH listening on port ${port}`));
