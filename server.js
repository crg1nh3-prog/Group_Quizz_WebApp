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
    options: ['Electrostatic Discharge', 'Electronic Software Design', 'Electrical Safety Device', 'Energy Storage Drive'],
    answer: 0,
    explanation: 'ESD means Electrostatic Discharge. It can damage sensitive electronic components if not controlled using wrist straps, ESD flooring, ionizers, and proper handling practices.'
  },
  {
    question: 'Which action is best before handling an electronic PCB?',
    options: ['Touch the PCB directly', 'Wear an ESD wrist strap and verify grounding', 'Keep the PCB on normal plastic cover', 'Use cotton gloves only'],
    answer: 1,
    explanation: 'The safest practice is to wear a verified ESD wrist strap and ensure proper grounding before handling sensitive electronic assemblies.'
  },
  {
    question: 'What is the purpose of Daily Layered Review in manufacturing?',
    options: ['Only attendance tracking', 'Structured review of SQCD topics at different leadership layers', 'Replacing quality audits', 'Only machine cleaning'],
    answer: 1,
    explanation: 'Daily Layered Review supports structured escalation and review of Safety, Quality, Cost, and Delivery topics across levels.'
  },
{
    question: 'What does OEE stand for?',
    options: ['Overall Equipment Effectiveness', 'Operational Engineering Efficiency', 'Overall Employee Evaluation', 'Output Efficiency Estimation'],
    answer: 0,
    explanation: 'OEE measures manufacturing productivity by considering Availability, Performance, and Quality.'
},

{
    question: 'What does PDF stand for?',
    options: ['Portable Data File', 'Personal Document Format', 'Portable Document Format', 'Public DOcument File'],
    answer: 2,
    explanation: 'PDF stands for Portable Document Format.'
},

{
    question: 'If a rooster lays an egg on a rooftop, which side does it roll down?',
    options: ['Left', 'Right', 'North', 'None'],
    answer: 3,
    explanation: 'Roosters do not lay eggs.'
},
{
    question: 'Which country originated the 5S workplace organization methodology?',
    options: ['Germany', 'Japan', 'United States', 'India'],
    answer: 1,
    explanation: '5S originated in Japan as part of the Toyota Production System. The five principles are Sort, Set in Order, Shine, Standardize, and Sustain.'
},
  {
question: 'What is the largest ocean on Earth?',
options: ['Atlantic Ocean', 'Indian Ocean', 'Pacific Ocean', 'Arctic Ocean'],
answer: 2,
explanation: 'The Pacific Ocean is the largest and deepest ocean on Earth.'
},

{
    question: 'Which country is widely recognized as the birthplace of Lean Manufacturing?',
    options: ['China', 'Japan', 'Germany', 'Sweden'],
    answer: 1,
    explanation: 'Lean Manufacturing evolved from the Toyota Production System developed in Japan.'
},
{
question: 'The more you take away from me, the bigger I become. What am I?',
options: ['Mountain', 'Hole', 'River', 'Cloud'],
answer: 1,
explanation: 'The more you dig from a hole, the larger it becomes.'
},
{
    question: 'Which country invented the modern assembly line concept used in mass production?',
    options: ['Germany', 'Japan', 'USA', 'Italy'],
    answer: 2,
    explanation: 'Henry Ford popularized the moving assembly line in the United States, revolutionizing manufacturing.'
},
{
question: 'Which of these is considered as a good meeting etiquette?',
options: ['Interrupting others', 'Keeping your microphone muted when not speaking', 'Joining 10 minutes late and giving convincible reasons', 'None'],
answer: 1,
explanation: 'Whenever we attend any meeting, we must make sure we keep our microphone muted when not speaking, so that we donot disturb others'
},
{
    question: 'Which country has the highest number of time zones?',
    options: ['Russia', 'USA', 'France', 'China'],
    answer: 2,
    explanation: 'Due to its overseas territories, France spans 12 official time zones.'
},
  
{
    question: 'What was the first product manufactured by Bosch?',
    options: ['Spark Plug', 'Low-voltage Magneto', 'Headlamp', 'Starter Motor'],
    answer: 1,
    explanation: 'Robert Bosch founded his workshop in 1886 and became successful with the low-voltage magneto for gas engines.'
},

{
question: 'Before Mount Everest was discovered, what was the highest mountain in the world?',
options: ['K2', 'Kangchenjunga', 'Mount Everest', 'Makalu'],
answer: 2,
explanation: 'Mount Everest was still the highest mountain even before it was discovered.'
},
{
    question: 'What does a barcode primarily provide?',
    options: ['Decoration', 'Traceability', 'Security Camera Feed', 'Machine Speed'],
    answer: 1,
    explanation: 'Barcodes allow products and materials to be tracked throughout the manufacturing process.'
},

{
    question: 'Which famous scientist worked as a patent examiner before becoming world-famous?',
    options: ['Newton', 'Einstein', 'Tesla', 'Galileo'],
    answer: 1,
    explanation: 'Albert Einstein worked at the Swiss Patent Office before publishing his groundbreaking theories.'
},

{
question: 'How many birthdays does the average person have?',
options: ['One per year', '10', '50', 'One'],
answer: 3,
explanation: 'A person is only born once, so they have one birthday.'
},

 {
question: 'Which English word contains all five vowels in alphabetical order?',
options: ['Education', 'Beautiful', 'Question', 'Facetious'],
answer: 3,
explanation: 'Facetious contains all five vowels (a, e, i, o, u) in alphabetical order.'
},
  {
question: 'A plane crashes on the border between India and Nepal. Where do you bury the survivors?',
options: ['India', 'Nepal', 'Both Countries', 'Nowhere'],
answer: 3,
explanation: 'You do not bury survivors. They survived.'
},
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
    quizEnded: false,
    participants: {},
    responses: {},
    scores: {}
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
    quizEnded: room.quizEnded,
    scores: room.scores,
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
    room.currentIndex = 0;
    room.started = false;
    room.revealed = false;
    room.quizEnded = false;
    room.responses = {};
    room.scores = {};

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

    if (
      !room ||
      !room.started ||
      room.revealed ||
      room.quizEnded
    ) {
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

    room.currentIndex = 0;
    room.started = true;
    room.revealed = false;
    room.quizEnded = false;
    room.responses = {};
    room.scores = {};

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

    if (!room || room.hostSocketId !== socket.id) {
      return cb?.({ ok: false });
    }

    if (room.quizEnded) {
      return cb?.({ ok: false });
    }

    const q = room.questions[room.currentIndex];

    Object.entries(room.responses).forEach(([playerId, answer]) => {
      if (answer === q.answer) {
        room.scores[playerId] =
          (room.scores[playerId] || 0) + 1;
      }
    });

if (room.currentIndex < room.questions.length - 1) {

  room.currentIndex += 1;

  room.started = true;
  room.revealed = false;
  room.responses = {};

} else {

  room.revealed = true;

  setTimeout(() => {
    room.quizEnded = true;
    io.to(room.roomId).emit(
      'room:update',
      roomSummary(room)
    );
  }, 3000);

}

    cb?.({ ok: true });
    io.to(room.roomId).emit('room:update', roomSummary(room));
  });

  socket.on('player:retake', ({ roomId }, cb) => {
    const room = rooms.get(String(roomId || '').toUpperCase());

    if (!room) {
      return cb?.({ ok: false });
    }

    room.currentIndex = 0;
    room.started = true;
    room.quizEnded = false;
    room.revealed = false;
    room.responses = {};
    room.scores = {};

    cb?.({ ok: true });
    io.to(room.roomId).emit('room:update', roomSummary(room));
  });

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      if (room.participants[socket.id]) {
        delete room.participants[socket.id];
        delete room.responses[socket.id];
        delete room.scores[socket.id];

        io.to(room.roomId).emit('room:update', roomSummary(room));
      }

      if (room.hostSocketId === socket.id) {
        room.hostSocketId = null;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Quiz app running on port ${PORT}`);
});
