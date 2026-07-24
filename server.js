const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.get('/health', (_, res) => res.send('OK'));

const defaultQuestions = [
  {
    question: 'What does ESD stand for in electronics manufacturing?',
    options: [
      'Electrostatic Discharge',
      'Electronic Software Design',
      'Electrical Safety Device',
      'Energy Storage Drive'
    ],
    answer: 0,
    explanation:
      'ESD means Electrostatic Discharge. It can damage sensitive electronic components if proper protection is not followed.'
  },
  {
    question: 'Which action is best before handling an electronic PCB?',
    options: [
      'Touch the PCB directly',
      'Wear an ESD wrist strap and verify grounding',
      'Keep the PCB on normal plastic cover',
      'Use cotton gloves only'
    ],
    answer: 1,
    explanation:
      'The safest practice is to wear a verified ESD wrist strap and ensure proper grounding before handling sensitive electronic assemblies.'
  },
  {
    question: 'What is the purpose of Daily Layered Review in manufacturing?',
    options: [
      'Only attendance tracking',
      'Structured review of Safety, Quality, Cost, and Delivery topics',
      'Replacing quality audits',
      'Only machine cleaning'
    ],
    answer: 1,
    explanation:
      'Daily Layered Review helps teams review and escalate Safety, Quality, Cost, and Delivery topics in a structured way.'
  }
];

const rooms = new Map();

function cloneQuestions(qs) {
  return JSON.parse(JSON.stringify(qs));
}

function createRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function sanitizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  return questions
    .map(q => {
      const options = Array.isArray(q.options)
        ? q.options.map(x => String(x || '').trim()).filter(Boolean)
        : [];

      return {
        question: String(q.question || '').trim(),
        options,
        answer: Number(q.answer),
        explanation: String(q.explanation || '').trim()
      };
    })
    .filter(q => {
      return (
        q.question &&
        q.options.length >= 2 &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < q.options.length
      );
    });
}

function newRoom(hostSocketId) {
  let roomId = createRoomId();

  while (rooms.has(roomId)) {
    roomId = createRoomId();
  }

  rooms.set(roomId, {
    roomId,
    hostSocketId,
    questions: cloneQuestions(defaultQuestions),
    currentIndex: 0,
    started: false,
    revealed: false,
    participants: {},
    responses: {}
  });

  return rooms.get(roomId);
}

function roomSummary(room) {
  const q = room.questions[room.currentIndex] || {
    question: 'No question available',
    options: [],
    answer: 0,
    explanation: ''
  };

  const counts = q.options.map((_, i) =>
    Object.values(room.responses).filter(v => v === i).length
  );

  return {
    roomId: room.roomId,
    currentIndex: room.currentIndex,
    totalQuestions: room.questions.length,
    questions: room.questions,
    started: room.started,
    revealed: room.revealed,
    question: q,
    responses: room.responses,
    counts,
    participants: Object.values(room.participants)
  };
}

async function qrForRoom(req, roomId) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const joinUrl = `${baseUrl}/?room=${roomId}&role=player`;
  const dataUrl = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 320
  });

  return { joinUrl, dataUrl };
}

app.get('/api/room/:roomId/qr', async (req, res) => {
  try {
    const room = rooms.get(String(req.params.roomId || '').toUpperCase());

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const qr = await qrForRoom(req, room.roomId);
    res.json(qr);
  } catch (err) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

io.on('connection', socket => {
  socket.on('host:create', async (_, cb) => {
    const room = newRoom(socket.id);
    socket.join(room.roomId);

    cb?.({ ok: true, summary: roomSummary(room) });
    io.to(room.roomId).emit('room:update', roomSummary(room));
  });

  socket.on('host:loadQuestions', ({ roomId, questions }, cb) => {
    const room = rooms.get(String(roomId || '').toUpperCase());

    if (!room || room.hostSocketId !== socket.id) {
      return cb?.({ ok: false, error: 'Host room not found' });
    }

    const cleanQuestions = sanitizeQuestions(questions);

    if (!cleanQuestions.length) {
      return cb?.({
        ok: false,
        error: 'Please add at least one valid question.'
      });
    }

    room.questions = cleanQuestions;
    room.currentIndex = Math.min(room.currentIndex, room.questions.length - 1);
    room.started = false;
    room.revealed = false;
    room.responses = {};

    cb?.({ ok: true, summary: roomSummary(room) });
    io.to(room.roomId).emit('room:update', roomSummary(room));
  });

  socket.on('player:join', ({ roomId, name }, cb) => {
    const room = rooms.get(String(roomId || '').toUpperCase());

    if (!room) {
      return cb?.({
        ok: false,
        error: 'Quiz room not found. Please check the QR code or room code.'
      });
    }

    socket.join(room.roomId);

    room.participants[socket.id] = {
      id: socket.id,
      name: String(name || 'Guest').slice(0, 30)
    };

    cb?.({
      ok: true,
      participantId: socket.id,
      summary: roomSummary(room)
    });

    io.to(room.roomId).emit('room:update', roomSummary(room));
  });

  socket.on('player:answer', ({ roomId, optionIndex }, cb) => {
    const room = rooms.get(String(roomId || '').toUpperCase());

    if (!room || !room.started || room.revealed) {
      return cb?.({ ok: false });
    }

    const q = room.questions[room.currentIndex];
    const selected = Number(optionIndex);

    if (!q || selected < 0 || selected >= q.options.length) {
      return cb?.({ ok: false });
    }

    if (!room.participants[socket.id]) {
      room.participants[socket.id] = {
        id: socket.id,
        name: 'Guest'
      };
    }

    room.responses[socket.id] = selected;

    cb?.({ ok: true });
    io.to(room.roomId).emit('room:update', roomSummary(room));
  });

  socket.on('host:start', ({ roomId }, cb) => {
    const room = rooms.get(String(roomId || '').toUpperCase());

    if (!room || room.hostSocketId !== socket.id) {
      return cb?.({ ok: false });
    }

    room.started = true;
    room.revealed = false;
    room.responses = {};

    cb?.({ ok: true });
    io.to(room.roomId).emit('room:update', roomSummary(room));
  });

  socket.on('host:reveal', ({ roomId }, cb) => {
    const room = rooms.get(String(roomId || '').toUpperCase());

    if (!room || room.hostSocketId !== socket.id) {
      return cb?.({ ok: false });
    }

    room.revealed = true;

    cb?.({ ok: true });
    io.to(room.roomId).emit('room:update', roomSummary(room));
  });

  socket.on('host:next', ({ roomId }, cb) => {
    const room = rooms.get(String(roomId || '').toUpperCase());

   