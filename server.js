const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// سرویس فایل‌های استاتیک
app.use(express.static(path.join(__dirname, 'public')));

// برای رفع مشکل CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// ذخیره‌سازی داده‌ها
const classes = new Map();
const users = new Map();

io.on('connection', (socket) => {
    console.log('✅ کاربر جدید متصل شد:', socket.id);

    // پیوستن به کلاس
    socket.on('join-class', (data) => {
        const { classId, userData } = data;
        
        console.log(`📚 کاربر ${userData.name} می‌خواهد به کلاس ${classId} بپیوندد`);

        if (!classes.has(classId)) {
            classes.set(classId, {
                students: new Map(),
                teacher: null,
                messages: [],
                attendance: []
            });
            console.log(`🎯 کلاس جدید ایجاد شد: ${classId}`);
        }

        const classRoom = classes.get(classId);
        const user = {
            id: socket.id,
            ...userData,
            joinTime: new Date(),
            socketId: socket.id
        };

        users.set(socket.id, { classId, userData });

        // ثبت بر اساس نقش
        if (userData.role === 'teacher') {
            classRoom.teacher = user;
            console.log(`👨‍🏫 استاد ${userData.name} به کلاس پیوست`);
        } else {
            classRoom.students.set(socket.id, user);
            console.log(`👨‍🎓 دانش‌آموز ${userData.name} به کلاس پیوست`);
            
            // اطلاع به استاد
            if (classRoom.teacher) {
                socket.to(classRoom.teacher.socketId).emit('new-student-waiting', user);
            }
        }

        // ثبت حضور
        classRoom.attendance.push({
            userId: user.id,
            userName: user.name,
            userRole: userData.role,
            action: 'join',
            timestamp: new Date(),
            timeString: new Date().toLocaleTimeString('fa-IR')
        });

        socket.join(classId);
        
        // ارسال تاریخچه پیام‌ها به کاربر جدید
        socket.emit('message-history', classRoom.messages);
        
        // اطلاع به سایر کاربران
        socket.to(classId).emit('user-joined', user);
        socket.to(classId).emit('attendance-update', classRoom.attendance);
        
        // به کاربر جدید هم لیست حضور رو بفرست
        socket.emit('attendance-update', classRoom.attendance);
    });

    // ارسال پیام
    socket.on('send-message', (data) => {
        const user = users.get(socket.id);
        if (!user) return;

        const classRoom = classes.get(user.classId);
        if (!classRoom) return;

        const message = {
            id: Date.now(),
            user: user.userData,
            text: data.text,
            timestamp: new Date(),
            type: 'text'
        };

        classRoom.messages.push(message);
        io.to(user.classId).emit('new-message', message);
        console.log(`💬 پیام جدید از ${user.userData.name}: ${data.text}`);
    });

    // تأیید دانش‌آموز
    socket.on('approve-student', (data) => {
        const user = users.get(socket.id);
        if (!user || user.userData.role !== 'teacher') return;

        const classRoom = classes.get(user.classId);
        const student = classRoom.students.get(data.studentId);
        
        if (student) {
            student.approved = true;
            io.to(data.studentId).emit('student-approved');
            io.to(user.classId).emit('user-approved', student);
            console.log(`✅ دانش‌آموز ${student.name} تأیید شد`);
        }
    });

    // قطع ارتباط
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            const classRoom = classes.get(user.classId);
            if (classRoom) {
                // ثبت خروج
                classRoom.attendance.push({
                    userId: user.userData.id,
                    userName: user.userData.name,
                    userRole: user.userData.role,
                    action: 'leave',
                    timestamp: new Date(),
                    timeString: new Date().toLocaleTimeString('fa-IR')
                });

                // حذف کاربر
                if (user.userData.role === 'teacher') {
                    classRoom.teacher = null;
                } else {
                    classRoom.students.delete(socket.id);
                }

                users.delete(socket.id);
                
                // اطلاع به سایر کاربران
                socket.to(user.classId).emit('user-left', user.userData);
                socket.to(user.classId).emit('attendance-update', classRoom.attendance);
                
                console.log(`❌ کاربر ${user.userData.name} قطع شد`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 سرور کلاس آنلاین روی پورت ${PORT} راه‌اندازی شد`);
    console.log(`📖 برای تست: http://localhost:${PORT}`);
});
