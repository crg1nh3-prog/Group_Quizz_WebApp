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
    if (el) {
      el.classList.add('hidden');
      el.style.display = 'none'; // Explicitly hide
    }
  });
  const target = $(id);
  if (target) {
    target.classList.remove('hidden');
    target.style.display = 'block'; // Explicitly show
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

// ==================== CLICK EVENT HANDLERS (WITH SAFETY CHECKS) ====================

// 1. Create Host Room Button Click
const createRoomBtn = $('createRoomBtn');
if (createRoomBtn) {
  createRoomBtn.onclick = () => {
    if (!socket.connected) {
      alert("🔌 Connecting to server... Please wait a moment for Render to spin up your free service (this takes ~50 seconds on first load)!");
      return;
    }
    socket.emit('host:create', {}, async res => {
      if (!res || !res.ok) return;
      roomId = res.summary.roomId;
      role = 'host';

      // Store details for browser reload recovery
      sessionStorage.setItem('quiz_roomId', roomId);
      sessionStorage.setItem('quiz_role', role);
      history.replaceState(null, '', `/?room=${roomId}&role=host`);

      show('lobby-screen');
      if (\$('roomPill')) \$('roomPill').textContent = `Room ${roomId}`;
      if (\$('lobby-room-code')) \$('lobby-room-code').textContent = roomId;

      // Fetch dynamic QR & Join URL
      const qr = await fetch(`/api/room/${roomId}/qr`).then(r => r.json());
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
    const manualRoomInput = $('manualRoom');
    if (manualRoomInput) {
      roomId = manualRoomInput.value.trim().toUpperCase();
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

// 3. Player Click to Join
const joinLobbyBtn = $('join-lobby-btn');
if (joinLobbyBtn) {
  joinLobbyBtn.onclick = () => {
    const nameInput = $('player-name-input');
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
  
  socket.emit(
    'player:join',
    {
      roomId,
      name
    },
    res => {
      if (!res || !res.ok) {
        if (\$('joinError')) \$('joinError').textContent = res?.error || 'Unable to join quiz.';
        return;
      }
      sessionStorage.setItem('quiz_roomId', roomId);
      sessionStorage.setItem('quiz_role', 'player');
      sessionStorage.setItem('quiz_playerName', name);

      show('playerPanel');
      if (\$('roomPill')) \$('roomPill').textContent = `Room ${roomId}`;
      render(res.summary);
    }
  );
}

// Auto-Reconnection Lifecycle on Refresh
if (roomId && role === 'player') {
  if (savedName) {
    joinPlayer(savedName);
  } else {
    show('player-join-screen');
  }
} else if (roomId && role === 'host') {
  show('lobby-screen');
  if (\$('roomPill')) \$('roomPill').textContent = `Room ${roomId}`;
  if (\$('lobby-room-code')) \$('lobby-room-code').textContent = roomId;
  if (\$('host-controls')) \$('host-controls').style.display = 'block';
  fetch(`/api/room/${roomId}/qr`).then(r => r.json()).then(qr => {
    if (\$('lobby-qr-img')) \$('lobby-qr-img').src = qr.dataUrl;
    if ($('lobby-join-link')) {
      $('lobby-join-link').href = qr.joinUrl;
      $('lobby-join-link').textContent = qr.joinUrl;
    }
  });
}

// Host starts the game
const startGameBtn = $('start-game-btn');
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
      $('hostOptions').innerHTML = `
        <div class="explanation">
          No questions available.
        </div>
      `;
    }
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

  if (\$('hostQuestion')) \$('hostQuestion').textContent = '✅ Complete Answer Key';
  if ($('hostOptions')) {
    $('hostOptions').innerHTML = `
      <div>
        <h3>All Correct Answers</h3>
        ${allAnswersHtml}
      </div>
    `;
  }
  if (\$('bars')) \$('bars').innerHTML = '';
  if ($('hostExplanation')) {
    $('hostExplanation').classList.add('hidden');
    $('hostExplanation').innerHTML = '';
  }
}

const nextQuestionBtn = $('nextQuestion');
if (nextQuestionBtn) {
  nextQuestionBtn.onclick = () => {
    socket.emit('host:next', { roomId });
  };
}

const clearFormBtn = $('clearForm');
if (clearFormBtn) {
  clearFormBtn.onclick = cleanForm;
}

const saveQuestionBtn = $('saveQuestion');
if (saveQuestionBtn) {
  saveQuestionBtn.onclick = () => {
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
}

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
    if (summary.started && !summary.quizEnded) {
      show('hostPanel');
    }
    renderHost(summary, q);
  } else {
    if (summary.started) {
      show('playerPanel');
    }
    renderPlayer(summary, q);
  }
}

function renderHost(summary, q) {
  if (!summary.started) {
    if (\$('lobby-player-count')) \$('lobby-player-count').textContent = summary.participants.length;
    if ($('lobby-players-list')) {
      $('lobby-players-list').innerHTML = summary.participants
        .map(p => `<span class="player-badge">${esc(p.name)}</span>`)
        .join('') || '<p class="muted">Waiting for participants to connect...</p>';
    }
    return;
  }

  if (summary.quizEnded) {
    if (\$('progress')) \$('progress').textContent = `${summary.totalQuestions}/${summary.totalQuestions}`;
    if (\$('hostQuestion')) \$('hostQuestion').textContent = '🎉 Quiz Completed!';
    if ($('hostOptions')) {
      $('hostOptions').innerHTML = `
        <div class="explanation">
          <b>The quiz is completed.</b>
          <br><br>
          Scores are shown below.
          Click <b>Show Answer</b> to display the correct
          answers for all ${summary.totalQuestions} questions.
        </div>
      `;
    }
    if (\$('bars')) \$('bars').innerHTML = '';
    if ($('hostExplanation')) {
      $('hostExplanation').classList.add('hidden');
      $('hostExplanation').innerHTML = '';
    }
    
    const leaderboard = summary.leaderboard || [];
    if ($('participants')) {
      $('participants').innerHTML = `
        <h3>🏆 Final Leaderboard</h3>
        ${
          leaderboard.length > 0
            ? leaderboard
                .map((player, index) => {
                  const medal =
                    index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
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
                        \${medal} \${esc(player.name)}
                      </span>
                      <b>
                        \${player.score}/\${summary.totalQuestions}
                      </b>
                    </div>
                  `;
                })
                .join('')
            : '<p class="muted">No scores available.</p>'
        }
      `;
    }
    return;
  }

  if (\$('progress')) \$('progress').textContent = `${summary.currentIndex + 1}/${summary.totalQuestions}`;
  if (\$('hostQuestion')) \$('hostQuestion').textContent = q.question;
  if (\$('participantCount')) \$('participantCount').textContent = `(${summary.participants.length})`;
  
  if ($('hostOptions')) {
    $('hostOptions').innerHTML = q.options
      .map((o, i) => {
        const correctClass = summary.revealed && i === q.answer ? 'correct' : '';
        return `
          <div class="option ${correctClass}">
            <span class="option-letter">${letter(i)}</span>
            <span>${esc(o)}</span>
          </div>
        `;
      })
      .join('');
  }

  const total = Math.max(1, Object.keys(summary.responses).length);
  if ($('bars')) {
    $('bars').innerHTML = q.options
      .map((o, i) => {
        const count = summary.counts[i] || 0;
        const pct = Math.round((count / total) * 100);
        return `
          <div class="barRow">
            <div class="barLabel">
              <span>\${letter(i)}. \${esc(o)}</span>
              <b>\${count} (\${pct}%)</b>
            </div>
            <div class="bar">
              <div class="barFill" style="width:${pct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  if ($('participants')) {
    $('participants').innerHTML = summary.participants
      .map(p => {
        const answered = summary.responses[p.id] !== undefined ? ' ✓' : '';
        return `
          <span class="chip">
            \${esc(p.name)}\${answered}
          </span>
        `;
      })
      .join('') || '<p class="muted">No participants yet.</p>';
  }

  if ($('hostExplanation')) {
    $('hostExplanation').classList.toggle('hidden', !summary.revealed);
    $('hostExplanation').innerHTML = summary.revealed
      ? `<b>Correct answer: ${letter(q.answer)}. ${esc(q.options[q.answer])}</b><br />${esc(q.explanation || 'No explanation added.')}`
      : '';
  }
}

function renderPlayer(summary, q) {
  if (summary.quizEnded) {
    const score = summary.scores?.[socket.id] || 0;
    const winner = summary.winner;
    const leaderboardHtml = summary.leaderboard
      .map((player, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
        return `
          <div style="
            display:flex;
            justify-content:space-between;
            padding:8px;
            border-bottom:1px solid #ddd;
          ">
            <span>\${medal} \${esc(player.name)}</span>
            <b>${player.score}</b>
          </div>
        `;
      })
      .join('');

    const questions = summary.questions || [];
    const history = summary.historicalResponses || [];

    const detailedReviewCardsHtml = questions
      .map((questionObj, index) => {
        const questionHistory = history.find(item => item.questionIndex === index);
        const playerResponseIndex = questionHistory ? questionHistory.responses[socket.id] : undefined;
        const isCorrect = playerResponseIndex === questionObj.answer;
        
        let playerFeedbackHtml = "";
        let cardBackground = "#f8fff8"; 
        let cardBorder = "2px solid #34a853";

        if (playerResponseIndex === undefined) {
          playerFeedbackHtml = `<p style="color: #7f8c8d; font-weight: bold; margin: 8px 0 0 0;">⚠️ You didn't submit an answer.</p>`;
          cardBackground = "#fdfefe";
          cardBorder = "1px solid #bdc3c7";
        } else if (isCorrect) {
          playerFeedbackHtml = `
            <p style="color: #137333; font-weight: bold; margin: 8px 0 0 0;">
              🎯 Correct! You selected: <span style="background: #e6f4ea; padding: 2px 8px; border-radius: 4px;">\${letter(playerResponseIndex)}. \${esc(questionObj.options[playerResponseIndex])}</span>
            </p>
          `;
        } else {
          playerFeedbackHtml = `
            <p style="color: #c5221f; font-weight: bold; margin: 8px 0 0 0;">
              ❌ Incorrect! You selected: <span style="background: #fce8e6; padding: 2px 8px; border-radius: 4px;">\${letter(playerResponseIndex)}. \${esc(questionObj.options[playerResponseIndex])}</span>
            </p>
          `;
          cardBackground = "#fffbfb"; 
          cardBorder = "2px solid #ea4335";
        }

        const optionsBreakdown = questionObj.options.map((opt, optIndex) => {
          const isThisOptionCorrect = optIndex === questionObj.answer;
          const isThisOptionSelected = optIndex === playerResponseIndex;
          
          let optStyle = "padding: 8px 12px; margin: 6px 0; border-radius: 6px; border: 1px solid #eee; text-align: left;";
          if (isThisOptionCorrect) {
            optStyle += " background-color: #e6f4ea; border-color: #34a853; font-weight: bold; color: #137333;";
          } else if (isThisOptionSelected && !isCorrect) {
            optStyle += " background-color: #fce8e6; border-color: #ea4335; text-decoration: line-through; color: #c5221f;";
          }
          return `<div style="${optStyle}">${letter(optIndex)}. ${esc(opt)}</div>`;
        }).join('');

        return `
          <div style="
            border: ${cardBorder};
            padding: 16px;
            margin-bottom: 16px;
            border-radius: 12px;
            background: ${cardBackground};
            text-align: left;
            box-shadow: 0 2px 8px rgba(0,0,0,0.02);
          ">
            <h4 style="margin: 0 0 10px 0; color: #333; text-align: left;"><b>Q\${index + 1}:</b> \${esc(questionObj.question)}</h4>
            <div style="margin-bottom: 12px;">${optionsBreakdown}</div>
            ${playerFeedbackHtml}
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ddd; font-size: 0.95rem; color: #555;">
              <strong>💡 Explanation:</strong> ${esc(questionObj.explanation || 'No explanation available.')}
            </div>
          </div>
        `;
      })
      .join('');

    if (\$('playerRoom')) \$('playerRoom').textContent = `Room ${summary.roomId}`;
    if (\$('playerQuestion')) \$('playerQuestion').innerHTML = '🎉 Quiz Completed!';
    if ($('playerOptions')) {
      $('playerOptions').innerHTML = `
        <div style="text-align:center; padding:20px;">
          <h2>🏆 Winner</h2>
          <h1 style="color:gold; margin: 5px 0 15px 0;">${winner ? esc(winner.name) : 'No Winner'}</h1>
          <h2>\${winner ? winner.score : 0}/\${summary.totalQuestions}</h2>
          <hr style="margin:20px 0; border: 0; border-top: 1px solid #eee;">
          <h2>Your Score</h2>
          <h1 style="font-size:64px; color:#0078d4; margin:15px 0;">\${score}/\${summary.totalQuestions}</h1>
          <h2>📊 Final Leaderboard</h2>
          <div style="text-align:left; max-width:500px; margin: 15px auto; background: #fafafa; padding: 15px; border-radius: 12px; border: 1px solid #eee;">
            ${leaderboardHtml}
          </div>
          <br>
          <button id="showAnswersBtn" class="btn-primary" style="margin-bottom: 10px;">📖 Review Answers</button>
          <button id="retakeQuizBtn" class="secondary">Retake Quiz</button>
          <div id="detailed-reviews-container" style="margin-top: 30px; display: none;">
            <h2 style="margin-bottom: 20px; text-align: left;">✅ Detailed Answer Review</h2>
            <div style="max-height: 600px; overflow-y: auto; padding-right: 5px;">${detailedReviewCardsHtml}</div>
          </div>
        </div>
      `;
    }
    if ($('playerExplanation')) {
      $('playerExplanation').classList.add('hidden');
      $('playerExplanation').innerHTML = '';
    }

    const retakeBtn = document.getElementById('retakeQuizBtn');
    if (retakeBtn) {
      retakeBtn.addEventListener('click', () => {
        selected = null;
        socket.emit('player:retake', { roomId });
      });
    }

    const showAnsBtn = document.getElementById('showAnswersBtn');
    if (showAnsBtn) {
      showAnsBtn.addEventListener('click', () => {
        const reviewBox = document.getElementById('detailed-reviews-container');
        if (reviewBox) {
          if (reviewBox.style.display === 'none') {
            reviewBox.style.display = 'block';
            reviewBox.scrollIntoView({ behavior: 'smooth' });
          } else {
            reviewBox.style.display = 'none';
          }
        }
      });
    }
    return;
  }

  if (\$('playerRoom')) \$('playerRoom').textContent = `Room ${summary.roomId} • Question ${summary.currentIndex + 1}/${summary.totalQuestions}`;
  if (\$('playerQuestion')) \$('playerQuestion').textContent = summary.started ? q.question : 'Waiting for host to start...';

  if (!summary.started) {
    if ($('playerOptions')) {
      $('playerOptions').innerHTML = `
         <div style="text-align:center; padding: 40px 10px;">
            <h3>Status: In Lobby ☕</h3>
            <p>You have successfully connected! Wait for the host to click Start.</p>
         </div>
      `;
    }
    if (\$('playerExplanation')) \$('playerExplanation').classList.add('hidden');
    return;
  }

  if ($('playerOptions')) {
    $('playerOptions').innerHTML = q.options
      .map((o, i) => {
        const isSelected = selected === i;
        const isCorrectOption = i === q.answer;
        let optionStateClass = "";
        
        if (isSelected) {
          optionStateClass = "selected";
        }
        if (summary.revealed) {
          if (isCorrectOption) {
            optionStateClass = "correct"; 
          } else if (isSelected) {
            optionStateClass = "incorrect"; 
          }
        }

        return `
          <button class="playerOption \${optionStateClass}" data-i="\${i}" ${summary.revealed ? 'disabled' : ''}>
            <span class="option-letter">${letter(i)}</span>
            <span>${esc(o)}</span>
          </button>
        `;
      })
      .join('');
  }

  document.querySelectorAll('.playerOption').forEach(btn => {
    btn.onclick = () => {
      selected = Number(btn.dataset.i);
      socket.emit('player:answer', { roomId, optionIndex: selected });
      renderPlayer(latest, q);
    };
  });

  if ($('playerExplanation')) {
    $('playerExplanation').classList.toggle('hidden', !summary.revealed);
    $('playerExplanation').innerHTML = summary.revealed
      ? `<b>Correct answer: ${letter(q.answer)}. ${esc(q.options[q.answer])}</b><br />${esc(q.explanation || 'No explanation added.')}`
      : '';
  }
}

function renderQuestionManager() {
  const badge = $('questionCountBadge');
  if (badge) badge.textContent = `${hostQuestions.length} question${hostQuestions.length === 1 ? '' : 's'}`;
  if (!hostQuestions.length) {
    if (\$('questionList')) \$('questionList').innerHTML = `<div class="empty-list">No questions yet. Add your first question using the form above.</div>`;
    return;
  }
  if ($('questionList')) {
    $('questionList').innerHTML = hostQuestions
      .map((q, i) => {
        return `
          <div class="question-item">
            <div class="question-item-main">
              <div class="question-number">${i + 1}</div>
              <div>
                <h4>${esc(q.question)}</h4>
                <p>Correct: <b>\${letter(q.answer)}. \${esc(q.options[q.answer])}</b></p>
              </div>
            </div>
            <div class="question-actions">
              <button class="tiny secondary" onclick="moveQuestion(${i}, -1)">↑</button>
              <button class="tiny secondary" o
