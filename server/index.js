const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
 
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
 
app.use(cors());
app.use(express.json());
 
// Make io accessible in routes
app.set('io', io);
 
// Connect MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));
 
// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/bets', require('./routes/bets'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/activematch', require('./routes/activematch')); // ← NEW
 
app.get('/', (req, res) => res.send('LivePoint API running'));
 
// Socket.io
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});
 
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
 
