const socket = io();

const \$ = id => document.getElementById(id);

const qs = new URLSearchParams(location.search);

// Persistent Session Recovery: Check sessionStorage first, then fallback to URL query params
let roomId = (sessionStorage.getItem('quiz_roomId') || qs.get('room') || '').toUpperCase();
let role = sessionStorage.getItem('quiz_role') || qs.get('role') || '';
let savedName = sessionStorage.getItem('quiz_playerName') || '';

let selected = null;
let latest = null;

let hostQuestions = JSON.parse(
  localStorage.getItem('quizQuestions') || '[]'
);
let editingIndex = null;

function saveQuestionsLocally() {
  localStorage.setItem(
    'quizQuestions',
    JSON.stringify(hostQuestions)
  );
}

// Clean Screen Visibility Manager
function show(id) {
  ['home', 'lobby-screen', 'player-join-screen', 'hostPanel', 'playerPanel'].forEach(x => {
    const el = $(x);
    if (el) el.classList.add('hidden');
  });
  const target = $(id);
  if (target) {
    target.classList.remove('hidden');
    target.style.display = 'block'; // Ensure block layout renders over 'hidden'
  }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function letter(i) {
  return String.fromCharCode(65 + i);
}

function setStatus(message, type = '') {
  const el = $('qmStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `small-status ${type}`;
}

function cleanForm() {
  $('qmQuestion').value = '';
  $('qmOption0').value = '';
  $('qmOption1').value = '';
  $('qmOption2').value = '';
  $('qmOption3').value = '';
  $('qmAnswer').value = '0';
  $('qmExplanation').value = '';
  editingIndex = null;
  $('saveQuestion').textContent = 'Add Question';
  setStatus('');
}

function getFormQuestion() {
  const question = $('qmQuestion').value.trim();
  const options = [
    $('qmOption0').value.trim(),
    $('qmOption1').value.trim(),
    $('qmOption2').value.trim(),
    $('qmOption3').value.trim()
  ].filter(Boolean);
  const answer = Number($('qmAnswer').value);
  const explanation = $('qmExplanation').value.trim();

  if (!question) {
    setStatus('Please enter a question.', 'error-text');
    return null;
  }
  if (options.length < 2) {
    setStatus('Please enter at least two options.', 'error-text');
    return null;
  }
  if (answer < 0 || answer >= options.length) {
    setStatus('Correct answer must match an available option.', 'error-text');
    return null;
  }
  return {
    question,
    options,
    answer,
    explanation
  };
}

function syncQuestionsToServer() {
  socket.emit(
    'host:loadQuestions',
    {
      roomId,
      questions: hostQuestions
    },
    res => {
      if (!res || !res.ok) {
        setStatus(
          res?.error || 'Unable to save questions.',
          'error-text'
        );
        return;
      }
      setStatus('Questions saved successfully.', 'success-text');
      hostQuestions = res.summary.questions || hostQuestions;
      saveQuestionsLocally();
      renderQuestionManager();
      render(res.summary);
    }
  );
}

// Host Room Setup
$('createRoomBtn').onclick = () => {
  socket.emit('host:create', {}, async res => {
    if (!res || !res.ok) return;
    roomId = res.summary.roomId;
    role = 'host';

    // Store details for browser reload recovery
    sessionStorage.setItem('quiz_roomId', roomId);
    sessionStorage.setItem('quiz_role', role);
    history.replaceState(null, '', `/?room=${roomId}&role=host`);

    show('lobby-screen');
    $('roomPill').textContent = `Room ${roomId}`;
    $('lobby-room-code').textContent = roomId;

    // Fetch dynamic QR & Join URL
    const qr = await fetch(`/api/room/${roomId}/qr`).then(r => r.json());
    $('lobby-qr-img').src = qr.dataUrl;
    
    // Set clickable and copyable join link on lobby screen
    $('lobby-join-link').href = qr.joinUrl;
    $('lobby-join-link').textContent = qr.joinUrl;

    $('host-controls').style.display = 'block';

    if (hostQuestions.length > 0) {
      syncQuestionsToServer();
    } else {
      hostQuestions = res.summary.questions || [];
      saveQuestionsLocally();
      render(res.summary);
      renderQuestionManager();
    }
  });
};

// Home Screen Manual Input Join (Laptops)
$('joinManual').onclick = () => {
  roomId = $('manualRoom').value.trim().toUpperCase();
  if (roomId) {
    role = 'player';
    sessionStorage.setItem('quiz_roomId', roomId);
    sessionStorage.setItem('quiz_role', role);
    history.replaceState(null, '', `/?room=${roomId}&role=player`);
    show('player-join-screen');
  }
};

// Player Click to Sign In
$('join-lobby-btn').onclick = () => {
  const nameInput = $('player-name-input').value.trim();
  if (nameInput) {
    joinPlayer(nameInput);
  }
};

function joinPlayer(nameToRegister) {
  const name = nameToRegister || 'Guest';
  
  socket.emit(
    'player:join',
    {
      roomId,
      name
    },
    res => {
      if (!res || !res.ok) {
        $('joinError').textContent = res?.error || 'Unable to join quiz.';
        return;
      }
      sessionStorage.setItem('quiz_roomId', roomId);
      sessionStorage.setItem('quiz_role', 'player');
      sessionStorage.setItem('quiz_playerName', name);

      show('playerPanel');
      $('roomPill').textContent = `Room ${roomId}`;
      render(res.summary);
    }
  );
}

// Reconnection Lifecycle on Refresh
if (roomId && role === 'player') {
  if (savedName) {
    joinPlayer(savedName);
  } else {
    show('player-join-screen');
  }
} else if (roomId && role === 'host') {
  show('lobby-screen');
  $('roomPill').textContent = `Room ${roomId}`;
  $('lobby-room-code').textContent = roomId;
  $('host-controls').style.display = 'block';
  fetch(`/api/room/${roomId}/qr`).then(r => r.json()).then(qr => {
    $('lobby-qr-img').src = qr.dataUrl;
    $('lobby-join-link').href = qr.joinUrl;
    $('lobby-join-link').textContent = qr.joinUrl;
  });
}

// Host starts the game: transitions out of Lobby into Live Room
$('start-game-btn').onclick = () => {
  socket.emit('host:start', { roomId });
};

$('startQuiz').onclick = () => {
  socket.emit('host:start', { roomId });
};

$('revealAnswer').onclick = () => {
  if (latest?.quizEnded) {
    showAllCorrectAnswers();
    return;
  }
  socket.emit('host:reveal', { roomId });
};

function showAllCorrectAnswers() {
  const questions =
    latest?.questions?.length > 0
      ? latest.questions
      : hostQuestions;

  if (!questions || questions.length === 0) {
    $('hostOptions').innerHTML = `
      <div class="explanation">
        No questions available.
      </div>
    `;
    return;
  }

  const allAnswersHtml = questions
    .map((question, index) => {
      const answerIndex = Number(question.answer);
      return `
        <div style="
          border:1px solid #ddd;
          padding:12px;
          margin-bottom:12px;
          border-radius:8px;
          background:#f8fff8;
        ">
          <b>Q${index + 1}:</b>
          ${esc(question.question)}
          <br><br>
          ✅ <b>Correct Answer:</b>
          ${letter(answerIndex)}.
          ${esc(question.options[answerIndex])}
          <br><br>
          💡 ${esc(question.explanation || 'No explanation available')}
        </div>
      `;
    })
    .join('');

  $('hostQuestion').textContent = '✅ Complete Answer Key';
  $('hostOptions').innerHTML = `
    <div>
      <h3>All Correct Answers</h3>
      ${allAnswersHtml}
    </div>
  `;
  $('bars').innerHTML = '';
  $('hostExplanation').classList.add('hidden');
  $('hostExplanation').innerHTML
