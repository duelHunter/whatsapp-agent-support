// backend/src/socketService.js
const { Server } = require("socket.io");

let io = null;

// shared state (single WA for now)
let waState = {
  connected: false,
  qrDataUrl: null,
  lastError: null,
  updatedAt: Date.now(),
};

function initSocket(server, corsOrigins = "*") {
  io = new Server(server, {
    cors: {
      origin: corsOrigins,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Dashboard socket connected:", socket.id);

    // send latest state immediately
    socket.emit("wa:status", waState);

    socket.on("disconnect", () => {
      console.log("🔴 Dashboard socket disconnected:", socket.id);
    });
  });

  return io;
}

function setWaState(patch) {
  waState = {
    ...waState,
    ...patch,
    updatedAt: Date.now(),
  };

  if (io) io.emit("wa:status", waState);
}

function getWaState() {
  return waState;
}

module.exports = {
  initSocket,
  setWaState,
  getWaState,
};
