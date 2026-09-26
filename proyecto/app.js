// ==========================================
// CONFIGURACIÓN DE FIREBASE (contieco-9b001)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDzsjya62EubtHoP9TQbFXhkWtx0ZIuRhw",
  authDomain: "contieco-9b001.firebaseapp.com",
  projectId: "contieco-9b001",
  storageBucket: "contieco-9b001.firebasestorage.app",
  messagingSenderId: "678521481603",
  appId: "1:678521481603:web:06b892324d9af3bfa82eb6",
  measurementId: "G-XJGJECERHG"
};

// Inicialización de Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// ==========================================
// FORMATEADOR GENERAL: MAPEADOR DE TACHOS
// ==========================================
function formatScanResult(rawLabel, confidence) {
  const cleanLabel = (rawLabel || '').toLowerCase().replace(/_/g, ' ');

  let binName = "Tacho Gris";
  let materialCategory = "Residuos Generales";
  let icon = "🗑️";

  if (cleanLabel.includes('carton') || cleanLabel.includes('papel') || cleanLabel.includes('azul')) {
    binName = "Tacho Azul";
    materialCategory = "Cartón/Papel";
    icon = "📦";
  } 
  else if (cleanLabel.includes('plastico') || cleanLabel.includes('metal') || cleanLabel.includes('lata') || cleanLabel.includes('pet') || cleanLabel.includes('amarillo')) {
    binName = "Tacho Amarillo";
    materialCategory = "Plásticos/Metales";
    icon = "🍾";
  } 
  else if (cleanLabel.includes('vidrio') || cleanLabel.includes('botella') || cleanLabel.includes('verde')) {
    binName = "Tacho Verde";
    materialCategory = "Vidrio";
    icon = "🍾";
  } 
  else if (cleanLabel.includes('organico') || cleanLabel.includes('comida') || cleanLabel.includes('fruta') || cleanLabel.includes('cascara') || cleanLabel.includes('marron')) {
    binName = "Tacho Marrón";
    materialCategory = "Orgánicos";
    icon = "🍎";
  } 
  else {
    // Caso de Residuos_Generales u otros no clasificados
    binName = "Tacho Gris";
    materialCategory = "Residuos Generales";
    icon = "🗑️";
  }

  return {
    binName: binName,
    materialCategory: materialCategory,
    icon: icon,
    formattedText: `${binName} - ${materialCategory} (${confidence}% certeza)`
  };
}

// ==========================================
// AUTENTICACIÓN
// ==========================================
async function loginUser(email, password) {
  try {
    await auth.signInWithEmailAndPassword(email, password);
    window.location.href = 'dashboard.html';
  } catch (error) {
    console.error("Error en Login:", error);
    alert("⚠️ Correo o contraseña incorrectos.");
  }
}

async function registerUser(name, email, password) {
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    if (user.updateProfile) {
      await user.updateProfile({ displayName: name });
    }

    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      name: name,
      email: email,
      points: 100, // Bono de bienvenida
      co2Saved: 0.0,
      scanCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("¡Cuenta creada exitosamente! Ganaste +100 EcoPuntos 🎉");
    window.location.href = 'dashboard.html';
  } catch (error) {
    console.error("Error en Registro:", error);
    alert("⚠️ Error de registro: " + error.message);
  }
}

async function logoutUser() {
  try {
    await auth.signOut();
    window.location.href = 'index.html';
  } catch (error) {
    alert("Error al cerrar sesión: " + error.message);
  }
}

function checkAuth(onAuthenticatedCallback) {
  auth.onAuthStateChanged((user) => {
    const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/') || window.location.pathname === '';

    if (user) {
      if (isLoginPage) {
        window.location.href = 'dashboard.html';
      } else if (onAuthenticatedCallback) {
        onAuthenticatedCallback(user);
      }
    } else {
      if (!isLoginPage) {
        window.location.href = 'index.html';
      }
    }
  });
}

// ==========================================
// FIRESTORE: REGISTRAR ESCANEO
// ==========================================
async function registerRecyclable(type, points, co2, name, icon) {
  const user = auth.currentUser;
  if (!user) throw new Error("No hay usuario autenticado.");

  const batch = db.batch();

  const logRef = db.collection('recycling_logs').doc();
  batch.set(logRef, {
    uid: user.uid,
    type: type,
    name: name,
    points: points,
    co2: co2,
    icon: icon,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  const userRef = db.collection('users').doc(user.uid);
  batch.set(userRef, {
    points: firebase.firestore.FieldValue.increment(points),
    co2Saved: firebase.firestore.FieldValue.increment(co2),
    scanCount: firebase.firestore.FieldValue.increment(1)
  }, { merge: true });

  await batch.commit();
}

// ==========================================
// FIRESTORE: CARGAR PANEL PRINCIPAL
// ==========================================
function loadDashboardData(user) {
  db.collection('users').doc(user.uid).onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      const name = data.name || user.displayName || (user.email ? user.email.split('@')[0] : 'Estudiante');
      
      const nameEl = document.getElementById('dash-username');
      if (nameEl) nameEl.textContent = name;

      const pointsEl = document.getElementById('dash-points');
      if (pointsEl) pointsEl.textContent = data.points || 0;

      const co2El = document.getElementById('dash-co2');
      if (co2El) co2El.textContent = (data.co2Saved || 0).toFixed(1);

      const divertedEl = document.getElementById('dash-diverted');
      if (divertedEl) divertedEl.textContent = (data.co2Saved || 0).toFixed(1);

      const itemsEl = document.getElementById('dash-items');
      if (itemsEl) itemsEl.textContent = data.scanCount || 0;
    }
  });

  db.collection('recycling_logs')
    .where('uid', '==', user.uid)
    .onSnapshot((snapshot) => {
      const logsList = document.getElementById('recent-logs-list');
      const chartTotalEl = document.getElementById('dash-chart-total');
      const legendEl = document.getElementById('materials-legend');
      const donutChart = document.getElementById('donut-chart');

      if (snapshot.empty) {
        if (logsList) logsList.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">Aún no has registrado residuos.</p>';
        if (chartTotalEl) chartTotalEl.textContent = '0';
        if (legendEl) legendEl.innerHTML = '<p class="text-xs text-slate-400 col-span-2">Sin datos de materiales</p>';
        if (donutChart) donutChart.style.background = '#e2e8f0';
        return;
      }

      let logs = [];
      snapshot.forEach(doc => logs.push(doc.data()));
      logs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

      const totalItems = logs.length;
      if (chartTotalEl) chartTotalEl.textContent = totalItems;

      const counts = {};
      logs.forEach(item => {
        const binInfo = formatScanResult(item.type, 100);
        const cat = binInfo.materialCategory;
        counts[cat] = (counts[cat] || 0) + 1;
      });

      const categoryColors = {
        'Plásticos/Metales': '#059669',
        'Cartón/Papel': '#38bdf8',
        'Vidrio': '#0284c7',
        'Orgánicos': '#78350f',
        'Residuos Generales': '#94a3b8'
      };

      let gradientParts = [];
      let currentPct = 0;
      let legendHtml = '';

      Object.keys(counts).forEach(cat => {
        const count = counts[cat];
        const pct = Math.round((count / totalItems) * 100);
        const color = categoryColors[cat] || '#94a3b8';

        const nextPct = currentPct + pct;
        gradientParts.push(`${color} ${currentPct}% ${nextPct}%`);
        currentPct = nextPct;

        legendHtml += `
          <div class="flex items-start gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style="background-color: ${color}"></span>
            <div>
              <p class="font-bold text-slate-800 text-[11px]">${cat} (${pct}%)</p>
              <p class="text-[10px] text-slate-400">${count} objeto${count > 1 ? 's' : ''}</p>
            </div>
          </div>
        `;
      });

      if (donutChart) donutChart.style.background = `conic-gradient(${gradientParts.join(', ')})`;
      if (legendEl) legendEl.innerHTML = legendHtml;

      if (logsList) {
        logsList.innerHTML = '';
        logs.slice(0, 3).forEach((item) => {
          const binInfo = formatScanResult(item.type, 100);
          logsList.innerHTML += `
            <div class="bg-white p-3 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-xl">
                  ${item.icon || '📦'}
                </div>
                <div>
                  <p class="font-bold text-xs text-slate-800">${item.name || 'Residuo'}</p>
                  <p class="text-[10px] text-slate-400 font-semibold">${binInfo.binName} • ${item.type || 'Reciclable'}</p>
                </div>
              </div>
              <span class="font-bold text-emerald-600 text-xs">+${item.points || 0} pts</span>
            </div>
          `;
        });
      }
    });
}

// ==========================================
// FIRESTORE: MÓDULO DE RECOMPENSAS UC
// ==========================================
function loadRecompensasData(user) {
  db.collection('users').doc(user.uid).onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      const pointsEl = document.getElementById('user-points');
      if (pointsEl) pointsEl.textContent = data.points || 0;
    }
  });

  db.collection('redemptions')
    .where('uid', '==', user.uid)
    .onSnapshot((snapshot) => {
      const listContainer = document.getElementById('redemptions-list');
      if (!listContainer) return;

      if (snapshot.empty) {
        listContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">Aún no has realizado canjes.</p>';
        return;
      }

      let redemptions = [];
      snapshot.forEach(doc => redemptions.push(doc.data()));
      redemptions.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

      listContainer.innerHTML = '';
      redemptions.forEach(item => {
        const code = item.code || Math.random().toString(36).substring(2, 8).toUpperCase();
        listContainer.innerHTML += `
          <div class="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex justify-between items-center shadow-sm">
            <div>
              <p class="font-bold text-xs text-amber-950">${item.title}</p>
              <p class="text-[10px] text-amber-800 font-mono">CÓDIGO UC: <span class="font-extrabold">${code}</span></p>
            </div>
            <span class="bg-amber-200 text-amber-900 text-[10px] font-extrabold px-2.5 py-1 rounded-lg">
              -${item.cost} pts
            </span>
          </div>
        `;
      });
    });
}

async function processRedemption(title, cost) {
  const user = auth.currentUser;
  if (!user) return false;

  const userRef = db.collection('users').doc(user.uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) return false;

  const currentPoints = userDoc.data().points || 0;

  if (currentPoints < cost) {
    alert(`⚠️ EcoPuntos insuficientes. Esta recompensa requiere ${cost} pts y tienes ${currentPoints} pts.`);
    return false;
  }

  try {
    const batch = db.batch();
    const generatedCode = "UC-" + Math.random().toString(36).substring(2, 7).toUpperCase();

    batch.update(userRef, {
      points: firebase.firestore.FieldValue.increment(-cost)
    });

    const redemptionRef = db.collection('redemptions').doc();
    batch.set(redemptionRef, {
      uid: user.uid,
      title: title,
      cost: cost,
      code: generatedCode,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    return true;
  } catch (error) {
    console.error("Error al canjear:", error);
    alert("Error al canjear: " + error.message);
    return false;
  }
}