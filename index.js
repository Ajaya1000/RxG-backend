const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const socketio = require('socket.io');
const cors = require('cors');
const { RoomModel } = require('./schema');

const app = express();
app.use(cors());

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', 'YOUR-DOMAIN.TLD'); // update to match the domain you will make the request from
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  next();
});

const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

const PORT = 4000 || process.env.PORT;
const url = 'mongodb://localhost:27017/rxg';

mongoose.connect(
  url,
  { useNewUrlParser: true, useUnifiedTopology: true },
  (err, db) => {
    if (err) {
      throw err;
    }
    console.log('Connected to mongodb', db);

    io.on('connection', (socket) => {
      socket.on('joinRoom', (data) => {
        console.log('JoinRoom Called', data);

        RoomModel.find({ code: data.room }, (err, docs) => {
          let existingRoom = docs[0];
          if (existingRoom === undefined && data.type === 'create') {
            const answer = [1, 2, 3, 4, 5];
            let newRoom = new RoomModel({
              code: data.room,
              answer,
              users: [
                {
                  name: data.username,
                  move: 10,
                  isAdmin: true,
                  status: false,
                  socketId: socket.id,
                },
              ],
              level: data.level,
            });

            newRoom
              .save()
              .then((room) => {
                socket.join(room.code);
                console.log('save complete', room);
                io.to(room.code).emit('joined', room);
                socket.emit('currentUser', {
                  name: data.username,
                  move: 10,
                  isAdmin: true,
                  status: false,
                  socketId: socket.id,
                });
              })
              .catch((err) => {
                console.log('error occured while creating new room');
              });
          } else if (existingRoom !== undefined && data.type === 'join') {
            existingRoom.users.push({
              name: data.username,
              move: 10,
              isAdmin: false,
              status: false,
              socketId: socket.id,
            });

            existingRoom
              .save()
              .then((room) => {
                socket.join(room.code);
                console.log('save complete', room);
                io.to(room.code).emit('joined', room);
                socket.emit('currentUser', {
                  name: data.username,
                  move: 10,
                  isAdmin: false,
                  status: false,
                  socketId: socket.id,
                });
              })
              .catch((err) => {
                console.log('error occured while creating new room');
              });
          } else if (existingRoom === undefined) {
            socket.emit('error', "Room doesn't exist");
          } else {
            socket.emit('error', 'Room already exist');
          }
        });
      });
    });
  }
);

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
