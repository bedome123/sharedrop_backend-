// ⚠️ استبدل هذا الرابط برابط الـ Backend الخاص بك على Render بعد رفعه
const BACKEND_URL = "https://your-project-name.onrender.com"; 

const socket = io(BACKEND_URL);
const peersList = document.getElementById('peersList');
const fileInput = document.getElementById('fileInput');
const statusDiv = document.getElementById('status');

let peerConnections = {};
let dataChannels = {};
let selectedPeerId = null;

socket.on('connect', () => {
    statusDiv.innerText = "متصل بالشبكة بنجاح. في انتظار أجهزة أخرى...";
});

// عرض الأجهزة المتاحة
socket.on('all-peers', (peerIds) => {
    peersList.innerHTML = '';
    peerIds.forEach(id => addPeerCard(id));
});

socket.on('user-connected', (id) => {
    addPeerCard(id);
});

socket.on('user-disconnected', (id) => {
    const card = document.getElementById(id);
    if(card) card.remove();
    if(peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }
});

function addPeerCard(id) {
    if(document.getElementById(id)) return;
    const card = document.createElement('div');
    card.className = 'peer-card';
    card.id = id;
    card.innerText = `جهاز محلي (${id.substring(0,4)})`;
    card.onclick = () => {
        selectedPeerId = id;
        fileInput.click();
    };
    peersList.appendChild(card);
}

// التعامل مع اختيار ملف لإرساله
fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file || !selectedPeerId) return;

    statusDiv.innerText = `جاري تحضير إرسال: ${file.name}...`;
    
    // إنشاء اتصال WebRTC وتجهيز قناة البيانات لإرسال الملف
    const pc = createPeerConnection(selectedPeerId);
    const dc = pc.createDataChannel("file-transfer");
    dataChannels[selectedPeerId] = dc;

    dc.onopen = () => sendFile(dc, file);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { to: selectedPeerId, signal: offer });
};

// استقبال إشارات الاتصال من الأجهزة الأخرى
socket.on('signal', async (data) => {
    let pc = peerConnections[data.from] || createPeerConnection(data.from);

    if (data.signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: data.from, signal: answer });
    } else if (data.signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.signal));
    }
});

function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // خادم مجاني من جوجل لمعرفة العناوين خارجية
    });

    peerConnections[peerId] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { to: peerId, signal: event.candidate });
        }
    };

    // عند استقبال المستلم لقناة البيانات
    pc.ondatachannel = (event) => {
        const dc = event.channel;
        let receivedChunks = [];

        dc.onmessage = (e) => {
            if (e.data === 'DONE') {
                // تجميع الملف وتحميله عند الانتهاء
                const blob = new Blob(receivedChunks);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "تم_استلام_الملف";
                a.click();
                statusDiv.innerText = "تم استلام وتحميل الملف بنجاح!";
                receivedChunks = [];
            } else {
                receivedChunks.push(e.data);
                statusDiv.innerText = `جاري استلام أجزاء من الملف...`;
            }
        };
    };

    return pc;
}

// دالة تقطيع الملف وإرساله (Chunking)
function sendFile(dc, file) {
    const chunkSize = 16384; // 16 كيلوبايت لكل جزء
    const reader = new FileReader();
    let offset = 0;

    reader.onload = (e) => {
        dc.send(e.target.result);
        offset += e.target.result.byteLength;

        if (offset < file.size) {
            statusDiv.innerText = `جاري إرسال الملف: ${Math.round((offset / file.size) * 100)}%`;
            readNextChunk();
        } else {
            dc.send('DONE');
            statusDiv.innerText = "تم إرسال الملف بنجاح!";
        }
    };

    const readNextChunk = () => {
        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
    };

    readNextChunk();
}