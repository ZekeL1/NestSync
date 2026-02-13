const http = require('http');
const { Server } = require("socket.io");

const httpServer = http.createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
  }
});

io.on('connection', (socket) => {
    console.log('New user :',socket.id);
    socket.on('create-room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        socket.join(roomId);
        console.log(`User ${socket.id} creates the room: ${roomId}`);
        //emit message to front end
        socket.emit('room-created', roomId);
    })

    socket.on('join-room', (roomId) =>{
        socket.join(roomId);
        console.log(`User ${socket.id} joined the room : ${roomId}`);
        //emit message to front end 
        socket.emit('room-joined', roomId);
        
        socket.to(roomId).emit('user-connected', socket.id);

    })

    socket.on('disconnect', () => {
        console.log('user disconnected: ', socket.id);
    })
})

httpServer.listen(3000, ()=>{
    console.log('Server launched, listen to port 3000');
})