const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  index: Number,
  value: Number,
  result: Number,
});

const UserSchema = new mongoose.Schema({
  name: String,
  remainingMove: Number,
  isAdmin: Boolean,
  status: String,
  socketId: String,
  answer: [String],
  log: [LogSchema],
});

const LeaderboardSchema = new mongoose.Schema({
  user: String,
  bestReveal: Number,
  bestMove: Number,
});

const RoomSchema = new mongoose.Schema({
  code: String,
  answer: [Number],
  users: [UserSchema],
  level: Number,
  leaderboard: [LeaderboardSchema],
});

const RoomModel = mongoose.model('Room', RoomSchema);

module.exports = {
  RoomModel,
};
