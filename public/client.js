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

// CONNECTION STATUS MONITOR
socket.on('connect', () => {
  console.log('Successfully connected to quiz server!');
  const errEl = $('joinError');
  if (errEl) errEl.textContent = ''; 
});

socket.on('connect_error', (err) => {
  console.error('Socket connection error:', err);
  const errEl = $('joinError');
  if (errEl) {
    errEl.textContent = '🔌 Connecting to server... (Render might be spinning up, please wait)';
  }
});

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
    if (el) {
      el.classList.add('hidden');
      el.style.display = 'none'; 
    }
  });
  const target = $(id);
  if (target) {
    target.classList.remove('hidden');
    target.style.display = 'block'; 
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({
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
  if ($('qmQuestion')) $('qmQuestion').value = '';
  if ($('qmOption0')) $('qmOption0').value = '';
  if ($('qmOption1')) $('qmOption1').value = '';
  if ($('qmOption2')) $('qmOption2').value = '';
  if ($('qmOption3')) $('qmOption3').value = '';
  if ($('qmAnswer')) $('qmAnswer').value = '0';
  if ($('qmExplanation')) $('qmExplanation').value = '';
  editingIndex = null;
  if (\$('saveQuestion')) \$('saveQuestion').textContent = 'Add Question';
  setStatus('');
}

function getFormQuestion() {
  const question = \$('qmQuestion') ? \$('qmQuestion').value.trim() : '';
  const options = [
    \$('qmOption0') ? \$('qmOption0').value.trim() : '',
    \$('qmOption1') ? \$('qmOption1').value.trim() : '',
    \$('qmOption2') ? \$('qmOption2').value.trim() : '',
    \$('qmOption3') ? \$('qmOption3').value.trim() : ''
  ].filter(Boolean);
  const answer = \$('qmAnswer') ? Number(\$('qmAnswer').value) : 0;
  const explanation = \$('qmExplanation') ? \$('qmExplanation').value.trim() : '';

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

// ==================== EVENT HANDLERS ====================

// ==================== EVENT HANDLERS ====================

// 1. HOST ROOM SETUP
const createBtn = $('createRoomBtn') || $('createHost');

if (!createBtn) {

  console.error(
    'Create Host Room button not found. Expected id="createRoomBtn" or id="createHost".'
  );

} else {

  console.log('Create Host Room button found:', createBtn);

  createBtn.addEventListener('click', async () => {

    console.log('Create Host Room clicked');

    // Check Socket.IO connection
    if (!socket.connected) {
      alert(
        '🔌 Still connecting to the server. Please wait a moment and try again.'
      );
      return;
    }

    // Temporarily disable button
    createBtn.disabled = true;
    const originalText = createBtn.textContent;
    createBtn.textContent = 'Creating Room...';

    socket.emit('host:create', {}, async res => {

      console.log('host:create response:', res);

      // Restore button
      createBtn.disabled = false;
      createBtn.textContent = originalText;

      if (!res || !res.ok) {

        console.error(
          'Unable to create host room:',
          res?.error
        );

        alert(
          res?.error || 'Unable to create host room.'
        );

        return;
      }

      // ==========================
      // SAVE HOST SESSION
      // ==========================

      roomId = res.summary.roomId;
      role = 'host';

      sessionStorage.setItem(
        'quiz_roomId',
        roomId
      );

      sessionStorage.setItem(
        'quiz_role',
        'host'
      );

      history.replaceState(
        null,
        '',
        `/?room=${encodeURIComponent(roomId)}&role=host`
      );

      // ==========================
      // SHOW LOBBY
      // ==========================

      show('lobby-screen');

      if ($('roomPill')) {
        $('roomPill').textContent =
          'Room ' + roomId;
      }

      if ($('lobby-room-code')) {
        $('lobby-room-code').textContent =
          roomId;
      }

      if ($('host-controls')) {
        $('host-controls').style.display =
          'block';
      }

      // ==========================
      // LOAD QR CODE
      // ==========================

      try {

        const qrResponse = await fetch(
          '/api/room/' +
          encodeURIComponent(roomId) +
          '/qr'
        );

        if (!qrResponse.ok) {
          throw new Error(
            `QR request failed: ${qrResponse.status}`
          );
        }

        const qr = await qrResponse.json();

        console.log(
          'QR successfully loaded:',
          qr
        );

        if ($('lobby-qr-img')) {
          $('lobby-qr-img').src =
            qr.dataUrl;
        }

        if ($('lobby-join-link')) {

          $('lobby-join-link').href =
            qr.joinUrl;

          $('lobby-join-link').textContent =
            qr.joinUrl;
        }

      } catch (error) {

        console.error(
          'Unable to load QR code:',
          error
        );

      }

      // ==========================
      // LOAD QUESTIONS
      // ==========================

      if (hostQuestions.length > 0) {

        syncQuestionsToServer();

      } else {

        hostQuestions =
          res.summary.questions || [];

        saveQuestionsLocally();

        render(res.summary);

        renderQuestionManager();
      }

    });

  });

}
      // Fetch dynamic QR code
      const qr = await fetch('/api/room/' + roomId + '/qr').then(r => r.json());
      if (\$('lobby-qr-img')) \$('lobby-qr-img').src = qr.dataUrl;
      if ($('lobby-join-link')) {
        $('lobby-join-link').href = qr.joinUrl;
        $('lobby-join-link').textContent = qr.joinUrl;
      }

      if (\$('host-controls')) \$('host-controls').style.display = 'block';

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
}

// 2. Home Screen Manual Input Join (Laptops)
const joinManualBtn = $('joinManual');
if (joinManualBtn) {
  joinManualBtn.onclick = () => {
    const manualInput = $('manualRoom');
    if (manualInput) {
      roomId = manualInput.value.trim().toUpperCase();
      if (roomId) {
        role = 'player';
        sessionStorage.setItem('quiz_roomId', roomId);
        sessionStorage.setItem('quiz_role', role);
        history.replaceState(null, '', `/?room=${roomId}&role=player`);
        show('player-join-screen');
      }
    }
  };
}

// 3. Player Click to Join (Guarded supports BOTH "join-lobby-btn" and "confirmJoin" IDs)
const joinLobbyBtn = \$('join-lobby-btn') || \$('confirmJoin');
if (joinLobbyBtn) {
  joinLobbyBtn.onclick = () => {
    const nameInput = \$('player-name-input') || \$('playerName');
    if (nameInput) {
      const nameVal = nameInput.value.trim();
      if (nameVal) {
        joinPlayer(nameVal);
      }
    }
  };
}

function joinPlayer(nameToRegister) {
  const name = nameToRegister || 'Guest';
  
  if (!socket.connected) {
    alert("🔌 Connecting to server... Please wait.");
    return;
  }

  socket.emit(
    'player:join',
    {
      roomId,
      name
    },
    res => {
      if (!res || !res.ok) {
        const errEl = $('joinError');
        if (errEl) errEl.textContent = res?.error || 'Unable to join quiz.';
        return;
      }
      sessionStorage.setItem('quiz_roomId', roomId);
      sessionStorage.setItem('quiz_role', 'player');
      sessionStorage.setItem('quiz_playerName', name);

      show('playerPanel');
      if (\$('roomPill')) \$('roomPill').textContent = 'Room ' + roomId;
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
  if (\$('roomPill')) \$('roomPill').textContent = 'Room ' + roomId;
  if (\$('lobby-room-code')) \$('lobby-room-code').textContent = roomId;
  if (\$('host-controls')) \$('host-controls').style.display = 'block';
  fetch('/api/room/' + roomId + '/qr').then(r => r.json()).then(qr => {
    if (\$('lobby-qr-img')) \$('lobby-qr-img').src = qr.dataUrl;
    if ($('lobby-join-link')) {
      $('lobby-join-link').href = qr.joinUrl;
      $('lobby-join-link').textContent = qr.joinUrl;
    }
  });
}

// Host starts the game
const startGameBtn = \$('start-game-btn') || \$('startQuiz');
if (startGameBtn) {
  startGameBtn.onclick = () => {
    socket.emit('host:start', { roomId });
  };
}

const startQuizBtn = $('startQuiz');
if (startQuizBtn) {
  startQuizBtn.onclick = () => {
    socket.emit('host:start', { roomId });
  };
}

const revealAnswerBtn = $('revealAnswer');
if (revealAnswerBtn) {
  revealAnswerBtn.onclick = () => {
    if (latest?.quizEnded) {
      showAllCorrectAnswers();
      return;
    }
    socket.emit('host:reveal', { roomId });
  };
}

function showAllCorrectAnswers() {
  const questions =
    latest?.questions?.length > 0
      ? latest.questions
      : hostQuestions;

  if (!questions || questions.length === 0) {
    if ($('hostOptions')) {
      $('hostOptions').innerHTML = '<div class="explanation">No questions available.</div>';
    }
    return;
  }

  const allAnswersHtml = questions
    .map((question, index) => {
      const answerIndex = Number(question.answer);
      return '<div style="border:1px solid #ddd; padding:12px; margin-bottom:12px; border-radius:8px; background:#f8fff8;">' +
        '<b>Q' + (index + 1) + ':</b> ' + esc(question.question) + '<br><br>' +
        '✅ <b>Correct Answer:</b> ' + letter(answerIndex) + '. ' + esc(question.options[answerIndex]) + '<br><br>' +
        '💡 ' + esc(question.explanation || 'No explanation available') +
        '</div>';
    })
    .join('');

  if (\$('hostQuestion')) \$('hostQuestion').textContent = '✅ Complete Answer Key';
  if ($('hostOptions')) {
    $('hostOptions').innerHTML = '<div><h3>All Correct Answers</h3>' + allAnswersHtml + '</div>';
  }
  if (\$('bars')) \$('bars').innerHTML = '';
  if ($('hostExplanation')) {
    $('hostExplanation').classList.add('hidden');
    $('hostExplanation').innerHTML = '';
  }
}

const nextQuestionBtn = $('nextQuestion');
if (nextQuestionBtn) {
  nextQu
