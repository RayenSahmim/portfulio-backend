import express from "express";
import dotenv from "dotenv";
import { Server } from "socket.io";
import http from "http";
dotenv.config();

// Player data structure
interface Player {
  id: string;
  username: string;
  color: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  isMovingForward: boolean;
  timestamp: number;
}

// Store active players (only those who chose to play)
const activePlayers = new Map<string, Player>();
const connectedUsers = new Map<string, { id: string; timestamp: number }>();

const app = express();
app.use(express.json());
//execution mta3 serveur 
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.get("/check-health", (req, res) => {
  res.json({ status: "ok" });
});
// API endpoint to get current player statistics
app.get("/stats", (req, res) => {
  res.json({
    totalPlayers: activePlayers.size,
    connectedUsers: connectedUsers.size,
    players: Array.from(activePlayers.values()).map(player => ({
      id: player.id,
      username: player.username,
      color: player.color,
      timestamp: player.timestamp
    }))
  });
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
      origin: process.env.FRONT_END_URL,
      credentials: true,
    },
  });

io.on("connection", (socket) => {
  console.log(`User ${socket.id} connected`);
  
  // Track connected users (not yet players)
  connectedUsers.set(socket.id, {
    id: socket.id,
    timestamp: Date.now()
  });

  // Send current player count to the newly connected user
  socket.emit("player-count-update", {
    totalPlayers: activePlayers.size,
    connectedUsers: connectedUsers.size
  });

  // Notify all other users about the new connection
  socket.broadcast.emit("player-count-update", {
    totalPlayers: activePlayers.size,
    connectedUsers: connectedUsers.size
  });
  
  // Handle player joining space explorer (only when they choose to play)
  socket.on("join-space-explorer", (playerInfo: { username: string; color: string; timestamp: number }) => {
    console.log(`Player ${socket.id} (${playerInfo.username}) joined space explorer`);
    
    // Create new player only when they choose to join
    const newPlayer: Player = {
      id: socket.id,
      username: playerInfo.username,
      color: playerInfo.color,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      isMovingForward: false,
      timestamp: Date.now()
    };
    
    activePlayers.set(socket.id, newPlayer);
    socket.join("space-explorer");
    
    // Send current players to the new player
    socket.emit("players-update", Array.from(activePlayers.values()));
    
    // Notify other players about the new player
    socket.broadcast.to("space-explorer").emit("player-joined", newPlayer);
    
    // Send updated player count to all users
    io.emit("player-count-update", {
      totalPlayers: activePlayers.size,
      connectedUsers: connectedUsers.size
    });
  });
  
  // Handle player leaving space explorer
  socket.on("leave-space-explorer", (playerInfo?: { username: string; timestamp: number }) => {
    const username = playerInfo?.username || "Unknown Player";
    console.log(`Player ${socket.id} (${username}) left space explorer`);
    
    // Remove from active players
    activePlayers.delete(socket.id);
    socket.leave("space-explorer");
    
    // Notify other players
    socket.to("space-explorer").emit("player-left", socket.id);
    
    // Send updated player count to all users
    io.emit("player-count-update", {
      totalPlayers: activePlayers.size,
      connectedUsers: connectedUsers.size
    });
  });
  
  // Handle player position updates (only for active players)
  socket.on("player-update", (playerData: Partial<Player>) => {
    const player = activePlayers.get(socket.id);
    if (player) {
      // Update player data
      Object.assign(player, playerData, { 
        id: socket.id, 
        timestamp: Date.now() 
      });
      
      // Broadcast to all other players in space explorer
      socket.broadcast.to("space-explorer").emit("player-moved", player);
    }
  });
  
  socket.on("disconnect", () => {
    console.log(`User ${socket.id} disconnected`);
    
    // Remove from connected users
    connectedUsers.delete(socket.id);
    
    // Remove player from active players if they were playing
    const wasPlaying = activePlayers.has(socket.id);
    if (wasPlaying) {
      activePlayers.delete(socket.id);
      // Notify other players
      socket.broadcast.to("space-explorer").emit("player-left", socket.id);
    }
    
    // Send updated counts to all users
    io.emit("player-count-update", {
      totalPlayers: activePlayers.size,
      connectedUsers: connectedUsers.size
    });
  });
});



server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

export default app;
