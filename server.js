const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

let users = {};
let roomMessages = {}; // { roomId: [ { ...msg, timestamp } ] }

// Prune messages older than 5 minutes every minute
function pruneMessages() {
  const now = Date.now();
  for (const room in roomMessages) {
    roomMessages[room] = roomMessages[room].filter(
      (msg) => now - msg.timestamp < 5 * 60 * 1000
    );
  }
}
setInterval(pruneMessages, 60 * 1000);

io.on("connection", (socket) => {
  socket.on("user info", ({ nickname, gender, age }) => {
    // Check for duplicate nickname
    const taken = Object.values(users).some(
      (u) => u.name.toLowerCase() === nickname.trim().toLowerCase()
    );
    if (taken) {
      socket.emit("nickname taken");
      return;
    }
    users[socket.id] = {
      name: nickname || "Guest",
      gender: gender || "male",
      age: age || "",
    };
    io.emit(
      "user list",
      Object.keys(users).map((id) => ({
        id,
        name: users[id].name,
        gender: users[id].gender,
        age: users[id].age,
      }))
    );
  });

  socket.join("public");

  socket.on("join room", (roomId) => {
    socket.join(roomId);
    // Send last 5 min messages for this room
    const msgs = (roomMessages[roomId] || []).map((msg) => {
      const { timestamp, ...rest } = msg;
      return rest;
    });
    socket.emit("room history", msgs);
  });

  socket.on("chat message", ({ room, text }) => {
    const user = users[socket.id] || { name: "Guest", gender: "male", age: "" };
    const msg = {
      id: socket.id,
      name: user.name,
      gender: user.gender,
      age: user.age,
      text,
      room,
      timestamp: Date.now(),
    };
    // If private, add 'to' field for notification
    if (room !== "public") {
      const ids = room.split("-");
      msg.to = ids.find((id) => id !== socket.id);
    }
    // Store message
    if (!roomMessages[room]) roomMessages[room] = [];
    roomMessages[room].push(msg);
    io.to(room).emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit(
      "user list",
      Object.keys(users).map((id) => ({
        id,
        name: users[id]?.name,
        gender: users[id]?.gender,
        age: users[id]?.age,
      }))
    );
  });
});

http.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
