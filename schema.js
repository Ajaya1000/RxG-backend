const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: String,
  move: Number,
  isAdmin: Boolean,
  status: Boolean,
  socketId: String,
});
const RoomSchema = new mongoose.Schema({
  code: String,
  answer: [Number],
  users: [UserSchema],
  level: Number,
});

const RoomModel = mongoose.model('Room', RoomSchema);

module.exports = {
  RoomModel,
};
