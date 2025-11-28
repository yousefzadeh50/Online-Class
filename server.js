const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// سرویس فایل‌های استاتیک
app.use(express.static(path.join(__dirname, 'public')));

// برای روت اصلی
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ذخیره‌سازی داده‌ها
const rooms = new Map();
const users = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-class', (data) => {
        const { roomId, userData } = data;
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                users: new Map(),
                messages: [],
                attendance: []
            });
        }

        const room = rooms.get(roomId);
        const user = {
            id: socket.id,
            ...userData,
            joinTime: new Date(),
            socketId: socket.id
        };

        users.set(socket.id, { roomId, userData: user });

        if (userData.role === 'teacher') {
            room.teacher = user;
        } else {
            room.users.set(socket.id, user);
            
            // اطلاع به استاد
            if (room.teacher) {
                io.to(room.teacher.socketId).emit('new-student-waiting', user);
            }
        }

        // ثبت حضور
        room.attendance.push({
            userId: user.id,
            userName: user.name,
            action: 'join',
            timestamp: new Date()
        });

        socket.join(roomId);
        
        // ارسال تاریخچه پیام‌ها
        socket.emit('message-history', room.messages);
        
        // اطلاع به سایرین
        socket.to(roomId).emit('user-joined', user);
        
        console.log(`User ${user.name} joined class ${roomId}`);
    });

    // ارسال پیام
    socket.on('send-message', (data) => {
        const user = users.get(socket.id);
        if (!user) return;

        const room = rooms.get(user.roomId);
        if (!room) return;

        const message = {
            id: Date.now(),
            user: user.userData,
            text: data.text,
            timestamp: new Date()
        };

        room.messages.push(message);
        io.to(user.roomId).emit('new-message', message);
    });

    // تأیید دانش‌آموز
    socket.on('approve-student', (data) => {
        const user = users.get(socket.id);
        if (!user || user.userData.role !== 'teacher') return;

        const room = rooms.get(user.roomId);
        const student = room.users.get(data.studentId);
        
        if (student) {
            student.approved = true;
            io.to(data.studentId).emit('student-approved');
            io.to(user.roomId).emit('user-approved', student);
        }
    });

    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            const room = rooms.get(user.roomId);
            if (room) {
                // ثبت خروج
                room.attendance.push({
                    userId: user.userData.id,
                    userName: user.userData.name,
                    action: 'leave',
                    timestamp: new Date()
                });

                if (user.userData.role === 'teacher') {
                    room.teacher = null;
                } else {
                    room.users.delete(socket.id);
                }

                users.delete(socket.id);
                socket.to(user.roomId).emit('user-left', user.userData);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
