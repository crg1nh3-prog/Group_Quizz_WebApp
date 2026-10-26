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
    'All of the above'
  ],
  answer: 3,
  explanation: 'ChatGPT, NotebookLM, and GitHub Copilot are all examples of Generative AI tools designed to generate content, assist users, or provide intelligent recommendations.'
},
  {
    question: 'Which prompt is likely to produce the best result?',
    options: [
      'Write an email with good content',
      'Help me with this',
      'Create a professional email inviting managers to an AI workshop next Friday at 10 AM',
      'Generate text'
    ],
    answer: 2,
    explanation: 'A prompt normally produces a better result when it clearly describes the task, audience, tone, date, time, and expected output.'
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
      'AI output should be verified by humans',
      'AI eliminates the need for critical thinking',
      'AI understands information exactly like humans'
    ],
    answer: 1,
    explanation: 'AI-generated output should be reviewed and verified, especially when it contains important business, technical, legal, financial, or safety-related information.'
  },
{
  question: 'You need to analyze an Excel file with 50,000 rows and quickly identify trends, outliers, and insights. Which AI tool is most suitable?',
  options: [
    'ChatGPT',
    'Gemini',
    'Copilot',
    'Perplexity'
  ],
  answer: 2,
  explanation: 'Copilot is integrated directly into Excel and can analyze data, identify trends, and generate insights within the workbook.'
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
    question: 'Which of the following is NOT considered Generative AI content?',
    options: [
      'AI-generated image',
      'AI-generated presentation',
      'AI-generated code',
      'Automated sales report dashboard refresh'
    ],
    answer: 3,
    explanation: 'Refreshing a dashboard is primarily an automation or data-processing task. It does not necessarily involve generating new content using Generative AI.'
  },
  {
    question: 'Why do detailed prompts often perform better?',
    options: [
      'They reduce ambiguity',
      'They increase internet speed',
      'They reduce AI processing power',
      'They guarantee perfect answers'
    ],
    answer: 0,
    explanation: 'Detailed prompts reduce ambiguity by giving the AI clearer instructions, context, constraints, audience information, and an expected output format.'
  },
  {
    question: 'Which industry is least likely to benefit from AI?',
    options: [
      'Manufacturing',
      'Healthcare',
      'Finance',
      'None of the above'
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
  {
    question: 'Which task is AI LEAST likely to fully replace?',
    options: [
    'Preparing monthly management reports',
    'Analyzing customer feedback trends',
    'Making high-stakes strategic business decisions',
    'Creating project status updates'
    ],
    answer: 2,
    explanation: 'Strategic decision-making requires accountability, organizational context, judgment, trade-off analysis, and human responsibility. AI can support the process but should not own the final decision.'
  },
{
  question: 'Which of the following tasks would have seemed almost impossible for everyday AI tools 10 years ago?',
  options: [
    'Generating realistic images from a text description',
    'Playing chess',
    'Sorting email inboxes',
    'Spell checking'
  ],
  answer: 0,
  explanation: 'AI image generation from simple text prompts became practical only in recent years thanks to advances in Generative AI.'
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

  // Leaderboard (highest score → lowest score)
  const leaderboard = Object.entries(room.scores)
    .map(([playerId, score]) => ({
      playerId,
      name: room.participants[playerId]?.name || 'Unknown',
      score
    }))
    .sort((a, b) => b.score - a.score);

  // Winner
const winner =
room.quizEnded && leaderboard.length > 0
? leaderboard[0]
: null;

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

  // Calculate scores for the current question
  Object.entries(room.responses).forEach(([playerId, selectedAnswer]) => {
    if (selectedAnswer === q.answer) {
      room.scores[playerId] =
        (room.scores[playerId] || 0) + 1;
    }
  });

  const isLastQuestion =
    room.currentIndex === room.questions.length - 1;

  if (isLastQuestion) {
    // Finish immediately without briefly revealing the answer
    room.quizEnded = true;
    room.started = false;
    room.revealed = false;
  } else {
    // Continue to the next question
    room.currentIndex += 1;
    room.started = true;
    room.revealed = false;
    room.responses = {};
  }

  cb?.({ ok: true });

  // Send only the final state
  io.to(room.roomId).emit(
    'room:update',
    roomSummary(room)
  );
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
       // delete room.participants[socket.id];
        delete room.responses[socket.id];
        //delete room.scores[socket.id];

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
