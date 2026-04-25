/**
 * NeuralDesk Authentication Service
 * Handles user login, registration, and session persistence.
 */

async function handleLogin() {
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();
  const err = document.getElementById('loginError');

  if (!u || !p) {
    showAuthError(err, 'Please enter all credentials');
    return;
  }

  try {
    const result = await window.electronAPI.login({ username: u, password: p });
    if (result.ok) {
      finalizeAuth(result.user);
    } else {
      showAuthError(err, result.error);
    }
  } catch (e) {
    showAuthError(err, 'Backend connection failed');
  }
}

async function handleSignup() {
  const u = document.getElementById('signupUsername').value.trim();
  const e = document.getElementById('signupEmail').value.trim();
  const p = document.getElementById('signupPassword').value.trim();
  const err = document.getElementById('signupError');

  if (!u || !e || !p) {
    showAuthError(err, 'All fields are required');
    return;
  }

  try {
    const result = await window.electronAPI.signup({ username: u, email: e, password: p });
    if (result.ok) {
      finalizeAuth(result.user);
    } else {
      showAuthError(err, result.error);
    }
  } catch (errObj) {
    showAuthError(err, 'Registration failed');
  }
}

function finalizeAuth(user) {
  window.state.user = user;
  localStorage.setItem('nd_user', JSON.stringify(user));
  document.getElementById('authOverlay').style.display = 'none';
  // Re-boot application with the new user context
  window.location.reload(); 
}

function handleLogout() {
  localStorage.removeItem('nd_user');
  window.location.reload();
}

function toggleAuthView() {
  const lv = document.getElementById('loginView');
  const sv = document.getElementById('signupView');
  const isLogin = lv.style.display !== 'none';
  lv.style.display = isLogin ? 'none' : 'block';
  sv.style.display = isLogin ? 'block' : 'none';
}

function showAuthError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}
