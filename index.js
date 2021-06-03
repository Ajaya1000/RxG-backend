const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const socketio = require('socket.io');
const cors = require('cors');
const _ = require('lodash');
require('dotenv').config();

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

const PORT = process.env.PORT || 4000;
const url = process.env.DATABASE;

const giveLobbyData = (room) => ({
  level: room.level,
  users: room.users,
  leaderboard: room.leaderboard,
  code: room.code,
});

const giveRandomAnswer = (level) => {
  if (level === 0) return _.shuffle([1, 2, 3]);
  else return _.shuffle([1, 2, 3, 4, 5]);
};

const giveMove = (level) => {
  if (level === 0) return 6;
  else if (level === 1) return 15;
  else return 10;
};

const giveInitAnswer = (level) => {
  if (level == 0) return ['?', '?', '?'];
  else return ['?', '?', '?', '?', '?'];
};

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
        if (!data) {
          socket.emit('error', {
            type: 'sessionError',
            val: 'Cannot create/join with null data',
            from: 'joinRoom',
          });
        } else {
          RoomModel.find({ code: data.room }, (err, docs) => {
            let existingRoom = docs ? docs[0] : undefined;
            if (existingRoom === undefined && data.type === 'create') {
              const answer = giveRandomAnswer(data.level);
              let newRoom = new RoomModel({
                code: data.room,
                answer,
                users: [
                  {
                    name: data.username,
                    remainingMove: giveMove(data.level),
                    isAdmin: true,
                    status: 'not ready',
                    socketId: socket.id,
                    answer: giveInitAnswer(data.level),
                    log: [],
                  },
                ],
                level: data.level,
                leaderboard: [],
              });

              newRoom
                .save()
                .then((room) => {
                  socket.join(room.code);
                  console.log('save complete', room);
                  io.to(room.code).emit('update', giveLobbyData(room));
                  socket.emit('currentUser', {
                    name: data.username,
                    remainingMove: giveMove(data.level),
                    isAdmin: true,
                    status: 'not ready',
                    socketId: socket.id,
                    answer: giveInitAnswer(data.level),
                    log: [],
                  });
                })
                .catch((err) => {
                  console.error(err);
                });
            } else if (existingRoom !== undefined && data.type === 'join') {
              existingRoom.users.push({
                name: data.username,
                remainingMove: giveMove(existingRoom.level),
                isAdmin: false,
                status: 'not ready',
                socketId: socket.id,
                answer: giveInitAnswer(existingRoom.level),
                log: [],
              });

              existingRoom
                .save()
                .then((room) => {
                  socket.join(room.code);
                  console.log('save complete', room);
                  io.to(room.code).emit('update', giveLobbyData(room));
                  socket.emit('currentUser', {
                    name: data.username,
                    remainingMove: giveMove(existingRoom.level),
                    isAdmin: false,
                    status: 'not ready',
                    socketId: socket.id,
                    answer: giveInitAnswer(existingRoom.level),
                    log: [],
                  });
                })
                .catch((err) => {
                  console.log(err);
                });
            } else if (existingRoom === undefined) {
              socket.emit('error', {
                type: 'sessionError',
                val: "Room doesn't exist",
                from: 'joinRoom',
              });
            } else {
              socket.emit('error', {
                type: 'sessionError',
                val: 'Room already exist',
                from: 'joinRoom',
              });
            }
          });
        }
      });

      socket.on('readytoStartGame', (data) => {
        RoomModel.find({ code: data.room }, (err, docs) => {
          let existingRoom = docs[0];

          if (existingRoom === undefined) {
            socket.emit('error', {
              type: 'unknown',
              value: 'Error while starting game.Room not found',
              from: 'readytoStartGame',
            });
          } else if (data.user.isAdmin) {
            console.log('in ready to start game', existingRoom);
            let canStartGame = true;
            for (let i = 0; i < existingRoom.users.length; i++) {
              canStartGame =
                canStartGame &&
                (existingRoom.users[i].status === 'ready' ||
                  existingRoom.users[i].socketId === data.user.socketId);
            }

            if (canStartGame) {
              for (let i = 0; i < existingRoom.users.length; i++) {
                existingRoom.users[i].status = 'in game';
              }
              existingRoom
                .save()
                .then((savedRoom) => {
                  // io.to(room.code).emit('update', giveLobbyData(savedRoom));
                  io.to(savedRoom.code).emit('readytoStartGame');
                })
                .catch((err) => console.error('error while saving', err));
            } else {
              socket.emit('error', {
                type: 'notReady',
                value: "Someone in your room isn't ready",
                from: 'readytoStartGame',
              });
            }
          } else {
            const userIndex = existingRoom.users.findIndex(
              (item) => item.socketId === socket.id
            );
            if (userIndex < 0) {
              socket.emit('error', {
                type: 'userNotExist',
                value: 'User does not exist',
                from: 'readytoStartGame',
              });
            } else {
              existingRoom.users[userIndex].status = 'ready';

              existingRoom
                .save()
                .then((savedRoom) => {
                  io.to(savedRoom.code).emit(
                    'update',
                    giveLobbyData(savedRoom)
                  );
                })
                .catch((err) => console.error('error while saving', err));
            }
          }
        });
      });
      socket.on('currentUser', (roomCode) => {
        RoomModel.find({ code: roomCode }, (err, docs) => {
          let existingRoom = docs[0];
          console.log('cuurent user catch', docs);

          if (existingRoom === undefined) {
            console.log('existing room inside currentUser', roomCode);
            console.log('docs', docs);
            socket.emit('error', {
              type: 'unknown',
              value: 'Error.Room for current user can not be found',
              from: 'currentUser',
            });
          } else {
            const userIndex = existingRoom.users.findIndex(
              (item) => item.socketId === socket.id
            );
            if (userIndex < 0) {
              socket.emit('error', {
                type: 'userNotExist',
                value: 'User does not exist,inside current user',
                from: 'currentUser',
              });
            }
            socket.emit('currentUser', existingRoom.users[userIndex]);
            console.log('Current user emited', existingRoom);
            console.log('scoket id', socket.id);
          }
        });
      });
      socket.on('update', (roomCode) => {
        RoomModel.find({ code: roomCode }, (err, docs) => {
          let existingRoom = docs[0];

          if (existingRoom === undefined) {
            socket.emit('error', {
              type: 'unknown',
              value: 'Error while update.Room not found',
            });
          } else {
            socket.emit('update', giveLobbyData(existingRoom));
          }
        });
      });
      socket.on('exitGame', (room) => {
        RoomModel.find({ code: room }, (err, docs) => {
          let existingRoom = docs[0];

          if (existingRoom === undefined) {
            socket.emit('error', {
              type: 'unknown',
              value: 'Error while Exiting game.Room not found',
            });
          } else {
            const userIndex = existingRoom.users.findIndex(
              (item) => item.socketId === socket.id
            );
            if (userIndex < 0) {
              socket.emit('error', {
                type: 'userNotExist',
                value: 'User does not exist',
              });
            } else {
              existingRoom.users[userIndex].status = 'not ready';

              existingRoom
                .save()
                .then((savedRoom) => {
                  io.to(savedRoom.code).emit(
                    'update',
                    giveLobbyData(savedRoom)
                  );
                })
                .catch((err) => console.error('error while saving', err));
            }
          }
        });
      });
      socket.on('move', (data) => {
        RoomModel.find({ code: data.room }, (err, docs) => {
          let existingRoom = docs[0];

          if (existingRoom === undefined) {
            socket.emit('error', {
              type: 'unknown',
              value: 'Error while Exiting game.Room not found',
            });
          } else {
            const userIndex = existingRoom.users.findIndex(
              (item) => item.socketId === socket.id
            );
            if (userIndex < 0) {
              socket.emit('error', {
                type: 'userNotExist',
                value: 'User does not exist',
              });
            } else {
              if (existingRoom.users[userIndex].remainingMove < 1) {
                socket.emit('error', {
                  type: 'info',
                  value: 'Cannot make any furthure Move',
                });
              } else {
                existingRoom.users[userIndex].remainingMove -= 1;
                console.log('Before', existingRoom.users[userIndex].answer);
                let result;
                if (existingRoom.answer[data.index] === data.value) {
                  let newAnsArray = [];
                  for (
                    let i = 0;
                    i < existingRoom.users[userIndex].answer.length;
                    i++
                  ) {
                    newAnsArray.push(existingRoom.users[userIndex].answer[i]);
                  }
                  newAnsArray[data.index] = data.value;
                  existingRoom.users[userIndex].answer = newAnsArray;
                  result = 0;
                } else {
                  let trueIndex = existingRoom.answer.findIndex(
                    (item) => item === data.value
                  );
                  if (trueIndex > data.index) result = 1;
                  else result = -1;
                }
                console.log('after', existingRoom.users[userIndex].answer);
                existingRoom.users[userIndex].log.push({
                  index: data.index,
                  value: data.value,
                  result,
                });

                existingRoom
                  .save()
                  .then((savedRoom) => {
                    const newUserIndex = savedRoom.users.findIndex(
                      (item) => item.socketId === socket.id
                    );
                    socket.emit('currentUser', savedRoom.users[newUserIndex]);
                  })
                  .catch((err) => console.error('error while saving', err));
              }
            }
          }
        });
      });
      socket.on('disconnect', () => {
        RoomModel.find({ 'users.socketId': socket.id }, (err, docs) => {
          let existingRoom = docs ? docs[0] : undefined;
          console.log('inside  dsconect');
          if (existingRoom) {
            const userIndex = existingRoom.users.findIndex(
              (item) => item.socketId === socket.id
            );
            if (userIndex < 0) {
              socket.emit('error', {
                type: 'userNotExist',
                value: 'User does not exist',
              });
            }
            existingRoom.users.pull(existingRoom.users[userIndex]._id);

            console.log('socket id', socket.id);
            console.log('inside if dsconect');
            existingRoom
              .save()
              .then((room) => {
                console.log('after disconnect', room);
                io.to(room.code).emit('update', giveLobbyData(room));
              })
              .catch((err) => {
                console.log(err);
              });
          }
        });
      });
    });
  }
);

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
