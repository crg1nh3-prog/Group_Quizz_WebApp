const socket = io();

const $ = id => document.getElementById(id);

const qs = new URLSearchParams(location.search);

// Persistent Session Recovery: Check sessionStorage first, then fallback to URL
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

// Clean Screen Visibility Manager (Updated to handle new Lobby and Player Join UI)
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

// Host Creation Setup (Stays in the Lobby Screen instead of jumping straight to panels)
$('createRoomBtn').onclick = () => {
  socket.emit('host:create', {}, async res => {
    if (!res || !res.ok) return;
    roomId = res.summary.roomId;
    role = 'host';

    // Set persistence details
    sessionStorage.setItem('quiz_roomId', roomId);
    sessionStorage.setItem('quiz_role', role);
    history.replaceState(null, '', `/?room=${roomId}&role=host`);

    show('lobby-screen');
    $('roomPill').textContent = `Room ${roomId}`;
    $('lobby-room-code').textContent = roomId;

    // Fetch dynamic room joining QR from your server API
    const qr = await fetch(`/api/room/${roomId}/qr`).then(r => r.json());
    $('lobby-qr-img').src = qr.dataUrl;

    // Show starting elements for the host
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

// Player Click to Join
$('join-lobby-btn').onclick = () => {
  const nameInput = $('player-name-input').value.trim();
  if (nameInput) {
    joinPlayer(nameInput);
  }
};

// Join Handler incorporating persistent Session Memory
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

      // Save user credentials on successful sign-in
      sessionStorage.setItem('quiz_roomId', roomId);
      sessionStorage.setItem('quiz_role', 'player');
      sessionStorage.setItem('quiz_playerName', name);

      // Keep them in wait panel until Host starts
      show('playerPanel');
      $('roomPill').textContent = `Room ${roomId}`;
      render(res.summary);
    }
  );
}

// Auto-Reconnection Lifecycle for Page Refreshes
if (roomId && role === 'player') {
  if (savedName) {
    // Attempt silently joining back
    joinPlayer(savedName);
  } else {
    show('player-join-screen');
  }
} else if (roomId && role === 'host') {
  // Restore Host Lobby State
  show('lobby-screen');
  $('roomPill').textContent = `Room ${roomId}`;
  $('lobby-room-code').textContent = roomId;
  $('host-controls').style.display = 'block';
  fetch(`/api/room/${roomId}/qr`).then(r => r.json()).then(qr => {
    $('lobby-qr-img').src = qr.dataUrl;
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
  $('hostExplanation').innerHTML = '';
}

$('nextQuestion').onclick = () => {
  socket.emit('host:next', { roomId });
};

$('clearForm').onclick = cleanForm;

$('saveQuestion').onclick = () => {
  const q = getFormQuestion();
  if (!q) return;
  if (editingIndex === null) {
    hostQuestions.push(q);
  } else {
    hostQuestions[editingIndex] = q;
  }
  saveQuestionsLocally();
  cleanForm();
  syncQuestionsToServer();
};

socket.on('room:update', summary => {
  latest = summary;
  if (role === 'host') {
    hostQuestions = summary.questions || hostQuestions;
    saveQuestionsLocally();
    renderQuestionManager();
  }
  render(summary);
});

function render(summary) {
  if (!summary) return;
  const q = summary.question;
  selected = summary.responses?.[socket.id] !== undefined ? summary.responses[socket.id] : null;

  if (role === 'host') {
    // If Host starts, transition out of Lobby to Host Panel
    if (summary.started && !summary.quizEnded) {
      show('hostPanel');
    }
    renderHost(summary, q);
  } else {
    // If Player game is started, show Player Panel
    if (summary.started) {
      show('playerPanel');
    }
    renderPlayer(summary, q);
  }
}

function renderHost(summary, q) {
  // Render Joined players in real-time inside the Lobby UI
  if (!summary.started) {
    $('lobby-player-count').textContent = summary.participants.length;
    $('lobby-players-list').innerHTML = summary.participants
      .map(p => `<span class="player-badge">${esc(p.name)}</span>`)
      .join('') || '<p class="muted">Waiting for participants to connect...</p>';
    return;
  }

  if (summary.quizEnded) {
    $('progress').textContent =
      `${summary.totalQuestions}/${summary.totalQuestions}`;
    $('hostQuestion').textContent = '🎉 Quiz Completed!';
    $('hostOptions').innerHTML = `
      <div class="explanation">
        <b>The quiz is completed.</b>
        <br><br>
        Scores are shown below.
        Click <b>Show Answer</b> to display the correct
        answers for all ${summary.totalQuestions} questions.
      </div>
    `;
    $('bars').innerHTML = '';
    $('hostExplanation').classList.add('hidden');
    $('hostExplanation').innerHTML = '';
    
    const leaderboard = summary.leaderboard || [];
    $('participants').innerHTML = `
      <h3>🏆 Final Leaderboard</h3>
      ${
        leaderboard.length > 0
          ? leaderboard
              .map((player, index) => {
                const medal =
                  index === 0
                    ? '🥇'
                    : index === 1
                    ? '🥈'
                    : index === 2
                    ? '🥉'
                    : '🏅';
                return `
                  <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    padding:10px;
                    margin:5px 0;
                    border:1px solid #ddd;
                    border-radius:8px;
                  ">
                    <span>
                      ${medal} ${esc(player.name)}
                    </span>
                    <b>
                      ${player.score}/${summary.totalQuestions}
                    </b>
                  </div>
                `;
              })
              .join('')
          : '<p class="muted">No scores available.</p>'
      }
    `;
    return;
  }

  $('progress').textContent =
    `${summary.currentIndex + 1}/${summary.totalQuestions}`;
  $('hostQuestion').textContent = q.question;
  $('participantCount').textContent =
    `(${summary.participants.length})`;
  $('hostOptions').innerHTML = q.options
    .map((o, i) => {
      const correctClass =
        summary.revealed && i === q.answer ? 'correct' : '';
      return `
        <div class="option ${correctClass}">
          <span class="option-letter">${letter(i)}</span>
          <span>${esc(o)}</span>
        </div>
      `;
    })
    .join('');

  const total =
    Math.max(1, Object.keys(summary.responses).length);
  $('bars').innerHTML = q.options
    .map((o, i) => {
      const count = summary.counts[i] || 0;
      const pct = Math.round((count / total) * 100);
      return `
        <div class="barRow">
          <div class="barLabel">
            <span>${letter(i)}. ${esc(o)}</span>
            <b>${count} (${pct}%)</b>
          </div>
          <div class="bar">
            <div class="barFill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join('');

  $('participants').innerHTML =
    summary.participants
      .map(p => {
        const answered =
          summary.responses[p.id] !== undefined ? ' ✓' : '';
        return `
          <span class="chip">
            ${esc(p.name)}${answered}
          </span>
        `;
      })
      .join('') || '<p class="muted">No participants yet.</p>';

  $('hostExplanation').classList.toggle(
    'hidden',
    !summary.revealed
  );
  $('hostExplanation').innerHTML = summary.revealed
    ? `
      <b>
        Correct answer:
        ${letter(q.answer)}.
        ${esc(q.options[q.answer])}
      </b>
      <br />
      ${esc(q.explanation || 'No explanation added.')}
    `
    : '';
}

function renderPlayer(summary, q) {
  if (summary.quizEnded) {
    const score = summary.scores?.[socket.id] || 0;
    const winner = summary.winner;
    const leaderboardHtml = summary.leaderboard
      .map((player, index) => {
        const medal =
          index === 0 ? '🥇' :
          index === 1 ? '🥈' :
          index === 2 ? '🥉' :
          '🏅';
        return `
          <div style="
            display:flex;
            justify-content:space-between;
            padding:8px;
            border-bottom:1px solid #ddd;
          ">
            <span>${medal} ${esc(player.name)}</span>
            <b>${player.score}</b>
          </div>
        `;
      })
      .join('');

    $('playerRoom').textContent = `Room ${summary.roomId}`;
    $('playerQuestion').innerHTML = '🎉 Quiz Completed!';
    $('playerOptions').innerHTML = `
      <div style="text-align:center;padding:20px;">
        <h2>🏆 Winner</h2>
        <h1 style="color:gold;">
          ${winner ? esc(winner.name) : 'No Winner'}
        </h1>
        <h2>
          ${winner ? winner.score : 0}/${summary.totalQuestions}
        </h2>
        <hr style="margin:20px 0;">
        <h2>Your Score</h2>
        <h1 style="
            font-size:64px;
            color:#0078d4;
            margin:20px 0;
        ">
          ${score}/${summary.totalQuestions}
        </h1>
        <h2>📊 Final Leaderboard</h2>
        <div style="
          text-align:left;
          max-width:500px;
          margin:auto;
        ">
          ${leaderboardHtml}
        </div>
        <br>
        <button id="showAnswersBtn">
          📖 Review Answers
        </button>
        <br><br>
        <button id="retakeQuizBtn">
          Retake Quiz
        </button>
      </div>
    `;
    $('playerExplanation').classList.add('hidden');
    $('playerExplanation').innerHTML = '';

    document
      .getElementById('retakeQuizBtn')
      ?.addEventListener('click', () => {
        selected = null;
        socket.emit('player:retake', { roomId });
      });

    document
      .getElementById('showAnswersBtn')
      ?.addEventListener('click', () => {
        const questions = summary.questions || [];
        const answersHtml = questions
          .map((q, index) => `
            <div style="
              border:1px solid #ddd;
              padding:12px;
              margin-bottom:12px;
              border-radius:8px;
              background:#f8fff8;
              text-align:left;
            ">
              <b>Q${index + 1}:</b> ${q.question}
              <br><br>
              ✅ <b>Correct Answer:</b>
              ${letter(q.answer)}. ${q.options[q.answer]}
              <br><br>
              💡 ${q.explanation || ''}
            </div>
          `)
          .join('');
        $('playerOptions').innerHTML = `
          <h2>✅ Complete Answer Key</h2>
          ${answersHtml}
        `;
      });
    return;
  }

  $('playerRoom').textContent =
    `Room ${summary.roomId} • Question ${
      summary.currentIndex + 1
    }/${summary.totalQuestions}`;
  $('playerQuestion').textContent =
    summary.started
      ? q.question
      : 'Waiting for host to start...';

  if (!summary.started) {
    $('playerOptions').innerHTML = `
       <div style="text-align:center; padding: 40px 10px;">
          <h3>Status: In Lobby ☕</h3>
          <p>You have successfully connected! Wait for the host to click Start.</p>
       </div>
    `;
    $('playerExplanation').classList.add('hidden');
    return;
  }

  $('playerOptions').innerHTML = q.options
    .map((o, i) => {
      const selectedClass =
        selected === i ? 'selected' : '';
      const correctClass =
        summary.revealed && i === q.answer
          ? 'correct'
          : '';
      return `
        <button
          class="playerOption ${selectedClass} ${correctClass}"
          data-i="${i}"
          ${summary.revealed ? 'disabled' : ''}
        >
          <span class="option-letter">${letter(i)}</span>
          <span>${esc(o)}</span>
        </button>
      `;
    })
    .join('');

  document.querySelectorAll('.playerOption').forEach(btn => {
    btn.onclick = () => {
      selected = Number(btn.dataset.i);
      socket.emit('player:answer', {
        roomId,
        optionIndex: selected
      });
      renderPlayer(latest, q);
    };
  });

  $('playerExplanation').classList.toggle(
    'hidden',
    !summary.revealed
  );
  $('playerExplanation').innerHTML = summary.revealed
    ? `
      <b>
        Correct answer:
        ${letter(q.answer)}.
        ${esc(q.options[q.answer])}
      </b>
      <br />
      ${esc(q.explanation || 'No explanation added.')}
    `
    : '';
}

function renderQuestionManager() {
  $('questionCountBadge').textContent =
    `${hostQuestions.length} question${
      hostQuestions.length === 1 ? '' : 's'
    }`;
  if (!hostQuestions.length) {
    $('questionList').innerHTML = `
      <div class="empty-list">
        No questions yet. Add your first question using the form above.
      </div>
    `;
    return;
  }
  $('questionList').innerHTML = hostQuestions
    .map((q, i) => {
      return `
        <div class="question-item">
          <div class="question-item-main">
            <div class="question-number">${i + 1}</div>
            <div>
              <h4>${esc(q.question)}</h4>
              <p>
                Correct:
                <b>${letter(q.answer)}. ${esc(q.options[q.answer])}</b>
              </p>
            </div>
          </div>
          <div class="question-actions">
            <button class="tiny secondary" onclick="moveQuestion(${i}, -1)">
              ↑
            </button>
            <button class="tiny secondary" onclick="moveQuestion(${i}, 1)">
              ↓
            </button>
            <button class="tiny" onclick="editQuestion(${i})">
              Edit
            </button>
            <button class="tiny danger" onclick="deleteQuestion(${i})">
              Delete
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

window.editQuestion = function (index) {
  const q = hostQuestions[index];
  $('qmQuestion').value = q.question;
  $('qmOption0').value = q.options[0] || '';
  $('qmOption1').value = q.options[1] || '';
  $('qmOption2').value = q.options[2] || '';
  $('qmOption3').value = q.options[3] || '';
  $('qmAnswer').value = String(q.answer);
  $('qmExplanation').value = q.explanation || '';
  editingIndex = index;
  $('saveQuestion').textContent = 'Update Question';
  setStatus(`Editing question ${index + 1}`, 'success-text');
  document.querySelector('.manager-card').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
};

window.deleteQuestion = function (index) {
  if (hostQuestions.length === 1) {
    setStatus('At least one question is required.', 'error-text');
    return;
  }
  hostQuestions.splice(index, 1);
  saveQuestionsLocally();
  cleanForm();
  syncQuestionsToServer();
};

window.moveQuestion = function (index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= hostQuestions.length) return;
  const temp = hostQuestions[index];
  hostQuestions[index] = hostQuestions[newIndex];
  hostQuestions[newIndex] = temp;
  saveQuestionsLocally();
  syncQuestionsToServer();
};
