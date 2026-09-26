const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// إعداد الـ Socket.io مع السماح لجميع الروابط بالاتصال (CORS) لسهولة الربط مع كلاود فلير
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// تتبع الأجهزة المتصلة وغرف الـ IP
const clients = {};

io.on('connection', (socket) => {
    // الحصول على الـ IP الخاص بالمستخدم (ريندر يمرر الـ IP الحقيقي عبر x-forwarded-for)
    const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    
    // وضع المستخدم في غرفة خاصة بالـ IP بتاعه
    socket.join(ip);
    clients[socket.id] = { id: socket.id, ip: ip };

    // إرسال تحديث لجميع الأجهزة في نفس الشبكة بوجود جهاز جديد
    socket.to(ip).emit('user-connected', socket.id);

    // إرسال قائمة الأجهزة الحالية المتاحة على نفس الشبكة للمستخدم الجديد نفسه
    io.in(ip).fetchSockets().then(sockets => {
        const peerIds = sockets.map(s => s.id).filter(id => id !== socket.id);
        socket.emit('all-peers', peerIds);
    });

    // تمرير إشارات WebRTC (Offer, Answer, ICE Candidates) بين الأجهزة
    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal
        });
    });

    // عند خروج جهاز (إغلاق الصفحة)
    socket.on('disconnect', () => {
        socket.to(ip).emit('user-disconnected', socket.id);
        delete clients[socket.id];
    });
});

// المنفذ الديناميكي المطلوب من ريندر
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});