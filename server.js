const express = require('express');
const path = require('path');
const http = require('http');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const socketio = require('socket.io');
const formatMessage = require('./models/messages');
const {
    joinUser,
    getCurrentUser,
    userLeaveChat,
    roomUsers,
} = require('./models/users');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const PORT = process.env.PORT || 3002;

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/my_database', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// Models
const User = require('./models/User');



// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});



// Serve chatroom.html
app.get('/chatroom', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chatroom.html'));
});



// Signup
app.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const user = new User({ username, email, password });
        await user.save();
        res.status(201).send('User created successfully');
    } catch (error) {
        if (error.code === 11000) {
            if (error.keyPattern.username) {
                return res.status(400).send('Username already exists');
            } else if (error.keyPattern.email) {
                return res.status(400).send('Email already exists');
            }
        }
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Login
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (user) {
            res.redirect('/chatroom');
        } else {
            res.status(401).send('Invalid credentials');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


//set up socket.io
const botName = "StudySphereBot";
io.on("connection", (socket) => {
    socket.on("joinRoom", ({ userName, room }) => {
        const user = joinUser(socket.id, userName, room);

        socket.join(user.room);
        //welcome current user
        socket.emit(
            "message",
            formatMessage(botName, `${user.username}, welcome to ${user.room}!`)
        );

        //broadcast when a user connect
        socket.broadcast
            .to(user.room)
            .emit(
                "message",
                formatMessage(botName, `${user.username} has joined the chat`)
            );

        //send users and room info
        io.to(user.room).emit("roomUsers", {
            room: user.room,
            users: roomUsers(user.room),
        });
    });

    //listen to chatMessage from client
    socket.on("chatMessage", (msg) => {
        const user = getCurrentUser(socket.id);
        io.to(user.room).emit("message", formatMessage(`${user.username}`, msg));
    });

    //listen when a user is typing
    socket.on("typing", (typing) => {
        const user = getCurrentUser(socket.id);
        io.to(user.room).emit("message", formatMessage(`${user.username}`, typing));
    });

    //run when a client disconnect
    socket.on("disconnect", () => {
        const user = userLeaveChat(socket.id);
        if (user) {
            io.to(user.room).emit(
                "message",
                formatMessage(botName, `${user.username} has left the chat`)
            );

            //send users and room info
            io.to(user.room).emit("roomUsers", {
                room: user.room,
                users: roomUsers(user.room),
            });
        }
    });
});





// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});