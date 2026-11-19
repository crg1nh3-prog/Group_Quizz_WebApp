const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);

// Optimized Socket.io configuration for hosting on Render's free tier
const io = new Server(server, {
  cors: {
    origin: "*", // Fix: Wildcard origin for trouble-free CORS connections
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket'], // Fix: Starts with polling to let the Render container wake up, then upgrades
  allowEIO3: true,
  pingTimeout: 60000, // Fix: Increased timeout to 60 seconds to allow Render's cold-start process
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.get('/health', (_, res) => res.send('OK'));

const defaultQuestions = [
  {
    question: 'What is the main difference between Generative AI and Traditional AI?',
    options: [
      'Traditional AI uses machine learning, Generative AI does not',
      'Traditional AI needs data, Generative AI does not',
      'Traditional AI predicts, while Generative AI creates new content',
      'Traditional AI only works offline'
    ],
    answer: 2,
    explanation: 'Traditional AI commonly analyzes data, identifies patterns, classifies information, or makes predictions. Generative AI can create new content such as text, images, code, audio, and presentations.'
  },
  {
    question: 'Which of the following are Generative AI tools?',
    options: [
      'ChatGPT only',
      'ChatGPT and NotebookLM',
      'ChatGPT, NotebookLM and GitHub Copilot',
      'ChatGPT and Google Search'
    ],
    answer: 2,
    explanation: 'ChatGPT, NotebookLM, and GitHub Copilot are all examples of Generative AI tools designed to generate content, assist users, or provide intelligent recommendations.'
  },
{
  question: 'Which statement best describes the relationship between AI and Machine Learning (ML)?',
  options: [
    'AI and ML are exactly the same thing',
    'AI is a part of ML',
    'ML is a part of AI',
    'AI and ML are completely unrelated'
  ],
  answer: 2,
  explanation: 'Machine Learning is a subset of Artificial Intelligence. AI is the broader field, while ML is one approach that enables systems to learn from data.'
},
  {
    question: 'What is an AI hallucination?',
    options: [
      'AI stops working unexpectedly',
      'AI learns without data',
      'AI generates information that sounds correct but is actually false',
      'AI refuses to answer questions'
    ],
    answer: 2,
    explanation: 'An AI hallucination occurs when an AI system produces incorrect or unsupported information that may sound convincing.'
  },
  {
    question: 'Which task would benefit MOST from Generative AI?',
    options: [
      'Calculating monthly salary, and giving a list of how to spend it',
      'Generating a first draft of a project presentation',
      'Measuring room temperature',
      'Asking manager for a hike'
    ],
    answer: 1,
    explanation: 'Generative AI is useful for creating a first draft of presentation content, including an outline, slide titles, key points, and speaker notes.'
  },
  {
    question: 'Which statement is TRUE?',
    options: [
      'AI is always correct',
      'AI can hallucinate and generate incorrect information and it needs to be verified by humans',
      'AI eliminates the need for critical thinking',
      'AI understands information exactly like humans'
    ],
    answer: 1,
    explanation: 'AI-generated output should be reviewed and verified, especially when it contains important business, technical, legal, financial, or safety-related information.'
  },
{
  question: 'What is the full form of GPT?',
  options: [
    'Generative Pre-trained Transformer',
    'General Processing Technology',
    'Generative Predictive Technology',
    'General Pre-trained Transformer'
  ],
  answer: 0,
  explanation: 'GPT stands for Generative Pre-trained Transformer. It refers to a type of AI model trained on large amounts of data to understand and generate content.'
},
  {
    question: 'Which use case is MOST suitable for Copilot?',
    options: [
      'Finding the latest AI research papers with citations',
      'Generating code suggestions inside Visual Studio',
      'Creating a presentation from an existing Word document',
      'Generating AI images from text prompts'
    ],
    answer: 2,
    explanation: 'Copilot is tightly integrated with Microsoft 365 and can create PowerPoint presentations from Word documents and other Microsoft 365 content.'
  },
  {
    question: 'Why do detailed prompts often perform better?',
    options: [
      'They reduce confusion',
      'They increase internet speed',
      'They reduce AI processing power',
      'They guarantee perfect answers'
    ],
    answer: 0,
    explanation: 'Detailed prompts reduce ambiguity by giving the AI clearer instructions, context, constraints, audience information, and an expected output format.'
  },
  {
    question: 'Which industry benefits from AI?',
    options: [
      'All Manufacturing',
      'All Healthcare',
      'All Finance',
      'All of the above'
    ],
    answer: 3,
    explanation: 'Manufacturing, healthcare, and finance can all benefit from appropriate AI applications. The value depends on the specific problem, available data, controls, and implementation.'
  },
  {
    question: 'Your manager asks for a 10-slide presentation tomorrow. What should AI help you with first?',
    options: [
      'Creating the first draft',
      'Making final decisions',
      'Approving the presentation',
      'Presenting to customers'
    ],
    answer: 0,
    explanation: 'AI can quickly help create the first draft, structure the presentation, suggest slide titles, and generate initial content. A person should review and finalize it.'
  },
  {
    question: 'Which action makes AI output MOST reliable?',
    options: [
      'Giving more context and verifying the result',
      'Using fewer words',
      'Avoiding questions',
      'Typing in all capital letters'
    ],
    answer: 0,
    explanation: 'Relevant context helps the AI understand the task. Human verification is still necessary because detailed prompts do not guarantee that every answer will be correct.'
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
    id += chars[Math.floor(Math.random() * chars.length)]; // Fix: Removed escape character before asterisk
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
    scores: {},
    historicalResponses: []
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
  const leaderboard = Object.entries(room.scores)
    .map(([playerId, score]) => ({
      playerId,
      name: room.participants[playerId]?.name || 'Unknown',
      score
    }))
    .sort((a, b) => b.score - a.score);
  const winner = room.quizEnded && leaderboard.length > 0 ? leaderboard[0] : null;
  return {
    roomId: room.roomId,
    currentIndex: room.currentIndex,
    totalQuestions: room.questions.length,
    questions: room.questions,
    started: room.started,
    revealed: room.revealed,
    quizEnded: room.quizEnded,
    scores: room.scores,
    leaderboard: room.quizEnded ? leaderboard : [],
    winner,
    question: q,
    responses: room.responses,
    counts,
    historicalResponses: room.historicalResponses,
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
    room.historicalResponses = [];
    cb?.({ ok: true, summary: roomSummary(room) });
    io.to(room.roomId).emit('room:update', roomSummary(room));
  });

  socket.on('player:join', ({ roomId, name }, cb) => {
    const rId = String(roomId || '').toUpperCase();
    const room = rooms.get(rId);
    if (!room) {
      return cb?.({
        ok: false,
        error: 'Quiz room not found.'
      });
    }
    socket.join(room.roomId);
    let existingPlayerId = Object.keys(room.participants).find(
      id => room.participants[id].name.toLowerCase() === String(name).toLowerCase()
    );
    if (existingPlayerId) {
      if (room.scores[existingPlayerId] !== undefined) {
        room.scores[socket.id] = room.scores[existingPlayerId];
        delete room.scores[existingPlayerId];
      }
      if (room.responses[existingPlayerId] !== undefined) {
        room.responses[socket.id] = room.responses[existingPlayerId];
        delete room.responses[existingPlayerId];
      }
      room.historicalResponses.forEach(step => {
        if (step.responses[existingPlayerId] !== undefined) {
          step.responses[socket.id] = step.responses[existingPlayerId];
          delete step.responses[existingPlayerId];
        }
      });
      delete room.participants[existingPlayerId];
    }
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
    if (!room || !room.started || room.revealed || room.quizEnded) {
      return cb?.({ ok: false });
    }
    const q = room.questions[room.currentIndex];
    const selected = Number(optionIndex);
    if (!q || selected < 0 || selected >= q.options.length) {
      return cb?.({ ok: false });
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
    room.historicalResponses = [];
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
    if (!q) {
      return cb?.({ ok: false });
    }
    room.historicalResponses.push({
      questionIndex: room.currentIndex,
      responses: { ...room.responses }
    });
    Object.entries(room.responses).forEach(([playerId, selectedAnswer]) => {
      if (selectedAnswer === q.answer) {
        room.scores[playerId] = (room.scores[playerId] || 0) + 1;
      }
    });
    const isLastQuestion = room.currentIndex === room.questions.length - 1;
    if (isLastQuestion) {
      room.quizEnded = true;
      room.started = false;
      room.revealed = false;
    } else {
      room.currentIndex += 1;
      room.started = true;
      room.revealed = false;
      room.responses = {};
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
    room.historicalResponses = [];
    cb?.({ ok: true });
    io.to(room.roomId).emit('room:update', roomSummary(room));
  });

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      if (room.participants[socket.id]) {
        delete room.responses[socket.id];
        io.to(room.roomId).emit('room:update', roomSummary(room));
      }
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = null;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log('Quiz app running on port ' + PORT);
});
