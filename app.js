/* ═══════════════════════════════════════════════════════════
   DATA MODEL & STORAGE
═══════════════════════════════════════════════════════════ */
const STORE_KEY = 'debtdash_v1';

const defaultData = {
  categories: [],
  slots: [],
  goals: [],
  transactions: [],
  expenseCategories: [],
  expenses: [],
  income: [],
  settings: { darkMode: true }
};

let DB = {};

function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    DB = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(defaultData));
    // ensure all keys
    if (!DB.categories)         DB.categories = defaultData.categories;
    if (!DB.slots)              DB.slots = [];
    if (!DB.goals)              DB.goals = defaultData.goals;
    if (!DB.transactions)       DB.transactions = [];
    if (!DB.expenseCategories)  DB.expenseCategories = defaultData.expenseCategories;
    if (!DB.expenses)           DB.expenses = [];
    if (!DB.income)             DB.income = []; // NEW
    if (!DB.settings)           DB.settings = defaultData.settings;
  } catch(e) { DB = JSON.parse(JSON.stringify(defaultData)); }
}

function saveData() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch(e) {}
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

/* ═══════════════════════════════════════════════════════════
   COMPUTED HELPERS
═══════════════════════════════════════════════════════════ */
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function slotHours(slot) {
  const [sh,sm] = slot.start.split(':').map(Number);
  const [eh,em] = slot.end.split(':').map(Number);
  let mins = (eh*60+em) - (sh*60+sm);
  if (mins < 0) mins += 24*60;
  return mins / 60;
}

function getCat(id) { return DB.categories.find(c=>c.id===id) || { name:'?', color:'#64748b', rate:0, emoji:'?', type:'unpaid' }; }

function slotEarning(slot) {
  const cat = getCat(slot.catId);
  return slotHours(slot) * cat.rate;
}

function weeklyStats() {
  const totals = {}; // catId -> { hours, earn }
  let totalHours = 0, totalEarn = 0;
  DB.slots.forEach(s => {
    const h = slotHours(s);
    const e = slotEarning(s);
    totalHours += h;
    totalEarn += e;
    if (!totals[s.catId]) totals[s.catId] = { hours:0, earn:0 };
    totals[s.catId].hours += h;
    totals[s.catId].earn += e;
  });
  return { totalHours, totalEarn, byCat: totals };
}

// Estimate 7-day "daily" distribution (spread slots across days evenly for demo if no specific dates)
function dailyEarnings7() {
  const days = [0,0,0,0,0,0,0];
  const today = new Date().getDay(); // 0=Sun
  // Map slot.day (0=Mon) to weekday distribution
  DB.slots.forEach(s => {
    const earn = slotEarning(s);
    const dayIdx = (typeof s.day === 'number') ? s.day : 0;
    days[dayIdx] += earn;
  });
  // rotate so today is last
  const todayMon = ((today + 6) % 7); // convert Sun=0 -> Mon=0
  const rotated = [];
  for (let i=6; i>=0; i--) {
    rotated.push(days[(todayMon - i + 7) % 7]);
  }
  return rotated;
}

function fmtMoney(n) {
  if (n >= 1000) return '₺' + (n/1000).toFixed(1).replace('.0','') + 'k';
  return '₺' + Math.round(n).toLocaleString('tr-TR');
}

function fmtMoneyFull(n) {
  return '₺' + Math.round(n).toLocaleString('tr-TR');
}

function fmtHours(h) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs)*60);
  if (mins === 0) return hrs + 'h';
  return hrs + 'h ' + mins + 'm';
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════════ */
let currentPage = 'overview';

function switchPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id)?.classList.add('active');
  document.querySelector(`.nav-btn[data-page="${id}"]`)?.classList.add('active');
  currentPage = id;

  // Update FAB visibility
  const fab = document.getElementById('mainFab');
  fab.style.display = (id === 'schedule' || id === 'goals') ? 'flex' : 'none';

  // Render active page
  if (id === 'overview')   renderOverview();
  if (id === 'schedule')   renderSchedule();
  if (id === 'goals')      renderGoals();
  if (id === 'analytics')  renderAnalytics();
  if (id === 'settings')   renderSettings();
}

function handleFab() {
  if (currentPage === 'schedule') openSlotSheet();
  if (currentPage === 'goals') {
    if (goalsActiveTab === 'expenses') openExpSheet();
    else if (goalsActiveTab === 'income') openIncomeSheet();
    else openGoalSheet();
  }
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW PAGE
═══════════════════════════════════════════════════════════ */
function renderOverview() {
  const s = weeklyStats();
  const weekly = s.totalEarn;
  const monthly = weekly * 4.33;
  const daily = weekly / 7;

  document.getElementById('ov-weekly').textContent  = fmtMoneyFull(weekly);
  document.getElementById('ov-hours').textContent   = fmtHours(s.totalHours);
  document.getElementById('ov-daily').textContent   = fmtMoney(daily);
  document.getElementById('ov-monthly').textContent = fmtMoney(monthly);

  // Bar chart
  const chart = document.getElementById('ov-barchart');
  const daily7 = dailyEarnings7();
  const max = Math.max(...daily7, 1);
  const dayNames = [];
  const today = ((new Date().getDay() + 6) % 7);
  for (let i=6; i>=0; i--) { const d = (today-i+7)%7; dayNames.push(DAY_SHORT[d]); }
  chart.innerHTML = daily7.map((v,i) => `
    <div class="bar-col">
      <div class="bar-el ${i===6?'today':''}" style="height:${Math.max(4, (v/max)*100)}%"></div>
      <div class="bar-lbl">${dayNames[i].slice(0,1)}</div>
    </div>
  `).join('');

  // Breakdown by category
  const breakdown = document.getElementById('ov-breakdown');
  const catEntries = Object.entries(s.byCat).filter(([id,v])=>v.earn>0);
  if (catEntries.length === 0) {
    breakdown.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div>Add schedule slots to see breakdown</div></div>';
  } else {
    breakdown.innerHTML = catEntries.map(([id,v]) => {
      const cat = getCat(id);
      const pct = weekly > 0 ? Math.round(v.earn/weekly*100) : 0;
      return `
        <div class="prog-item">
          <div class="prog-head">
            <div class="pg-name"><span>${cat.emoji}</span> ${cat.name}</div>
            <div class="pg-val">${fmtMoneyFull(v.earn)} · ${fmtHours(v.hours)}</div>
          </div>
          <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${cat.color}"></div></div>
        </div>`;
    }).join('');
  }

  // Goals preview
  const gp = document.getElementById('ov-goals-preview');
  gp.innerHTML = DB.goals.slice(0,3).map(g => {
    const pct = Math.min(100, g.target > 0 ? (g.current/g.target*100) : 0);
    return `
      <div class="prog-item">
        <div class="prog-head">
          <div class="pg-name"><span>${g.emoji}</span> ${g.name}</div>
          <div class="pg-val">${Math.round(pct)}%</div>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${g.color}"></div></div>
      </div>`;
  }).join('');

  // Finances this month
  const monthStart = new Date().toISOString().slice(0,8) + '01';
  const monthIncome = DB.income.filter(i => i.date >= monthStart).reduce((a,i) => a+i.amount, 0);
  const monthExp = DB.expenses.filter(e => e.date >= monthStart).reduce((a,e) => a+e.amount, 0);
  const netBalance = monthIncome - monthExp;
  
  document.getElementById('ov-income-total').textContent = fmtMoneyFull(monthIncome);
  document.getElementById('ov-exp-total').textContent = fmtMoneyFull(monthExp);
  const netEl = document.getElementById('ov-net-balance');
  netEl.textContent = (netBalance >= 0 ? '+' : '') + fmtMoneyFull(netBalance);
  netEl.style.color = netBalance >= 0 ? 'var(--green)' : 'var(--red)';

  // Analytics highlights
  const an = document.getElementById('ov-analytics');
  const maxDayIdx = daily7.indexOf(Math.max(...daily7));
  const dayLabels = [];
  for (let i=6; i>=0; i--) { const d = (today-i+7)%7; dayLabels.push(DAYS[d]); }
  const avgRate = s.totalHours > 0 ? s.totalEarn / s.totalHours : 0;
  an.innerHTML = `
    <div class="analytics-chip">
      <div class="ac-label">Avg hourly</div>
      <div class="ac-val">${fmtMoney(avgRate)}</div>
    </div>
    <div class="analytics-chip">
      <div class="ac-label">Best day</div>
      <div class="ac-val" style="font-size:0.85rem">${dayLabels[maxDayIdx] || '—'}</div>
      <div class="ac-sub">${fmtMoney(daily7[maxDayIdx])}</div>
    </div>
    <div class="analytics-chip">
      <div class="ac-label">Work slots</div>
      <div class="ac-val">${DB.slots.length}</div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   SCHEDULE PAGE
═══════════════════════════════════════════════════════════ */
let selectedDay = 0;
let scheduleView = 'list';
let calYear, calMonth;

function setScheduleView(v) {
  scheduleView = v;
  document.getElementById('schedule-list-view').style.display = v==='list' ? '' : 'none';
  document.getElementById('schedule-cal-view').style.display  = v==='cal'  ? '' : 'none';
  document.getElementById('viewListBtn').className = 'btn btn-sm' + (v==='list' ? '' : ' btn-ghost');
  document.getElementById('viewCalBtn').className  = 'btn btn-sm' + (v==='cal'  ? '' : ' btn-ghost');
  if (v === 'cal') renderCalendar();
}

function renderSchedule() {
  if (scheduleView === 'list') renderListView();
  else renderCalendar();
}

function renderListView() {
  // Day tabs
  const tabs = document.getElementById('dayTabs');
  tabs.innerHTML = DAYS.map((d,i) => {
    const count = DB.slots.filter(s=>s.day===i).length;
    return `<div class="day-tab ${i===selectedDay?'active':''}" onclick="selectDay(${i})">
      ${DAY_SHORT[i]}${count>0?` <span style="opacity:0.6">(${count})</span>`:''}
    </div>`;
  }).join('');
  renderSlotList();
}

function selectDay(i) {
  selectedDay = i;
  renderListView();
}

function renderSlotList() {
  const list = document.getElementById('slotList');
  const slots = DB.slots.filter(s => s.day === selectedDay)
    .sort((a,b) => a.start.localeCompare(b.start));

  if (slots.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🗓️</div><div>No slots for ${DAYS[selectedDay]}</div><button class="btn btn-primary btn-sm" onclick="openSlotSheet()">Add slot</button></div>`;
    document.getElementById('day-totals').textContent = '';
    return;
  }

  const dayHours = slots.reduce((a,s) => a+slotHours(s), 0);
  const dayEarn  = slots.reduce((a,s) => a+slotEarning(s), 0);
  document.getElementById('day-totals').textContent = `${fmtHours(dayHours)} · ${fmtMoneyFull(dayEarn)}`;

  list.innerHTML = slots.map(s => {
    const cat = getCat(s.catId);
    const h = slotHours(s);
    const e = slotEarning(s);
    return `
      <div class="slot-card" style="--slot-color:${cat.color}" onclick="openSlotSheet('${s.id}')">
        <div class="slot-time">${s.start}–${s.end}</div>
        <div class="slot-info">
          <div class="slot-name">${cat.emoji} ${cat.name}</div>
          <div class="slot-earn">${fmtHours(h)}${e>0?' · '+fmtMoneyFull(e):''}${s.note?' · '+s.note:''}</div>
        </div>
        <div class="slot-badge">${cat.type==='paid'?fmtMoney(e):'unpaid'}</div>
        <div class="slot-del" onclick="event.stopPropagation();deleteSlot('${s.id}')">🗑</div>
      </div>`;
  }).join('');
}

function deleteSlot(id) {
  if (!confirm('Delete this slot?')) return;
  DB.slots = DB.slots.filter(s=>s.id!==id);
  saveData(); renderSchedule(); renderOverview();
  showToast('Slot deleted');
}

/* Calendar view */
function renderCalendar() {
  const now = new Date();
  if (calYear === undefined) { calYear = now.getFullYear(); calMonth = now.getMonth(); }
  const title = new Date(calYear, calMonth, 1).toLocaleString('default', { month:'long', year:'numeric' });
  document.getElementById('calMonthTitle').textContent = title;

  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const offset = (firstDay + 6) % 7; // Mon=0

  let html = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="cal-head">${d}</div>`).join('');
  for (let i=0; i<offset; i++) html += `<div class="cal-day empty"></div>`;
  const todayStr = now.toISOString().slice(0,10);
  for (let d=1; d<=daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = (new Date(calYear,calMonth,d).getDay()+6)%7; // Mon=0
    const hasWork = DB.slots.some(s=>s.day===dow || s.date===dateStr);
    const isToday = dateStr===todayStr;
    html += `<div class="cal-day ${isToday?'today':''} ${hasWork?'has-work':''}" onclick="calDayClick(${d},${dow},'${dateStr}')">${d}</div>`;
  }
  document.getElementById('calGrid').innerHTML = html;
  document.getElementById('calDayDetail').style.display = 'none';
}

function changeCalMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth=0; calYear++; }
  if (calMonth < 0)  { calMonth=11; calYear--; }
  renderCalendar();
}

function calDayClick(d, dow, dateStr) {
  const slots = DB.slots.filter(s => s.day===dow || s.date===dateStr).sort((a,b)=>a.start.localeCompare(b.start));
  const detail = document.getElementById('calDayDetail');
  const label  = document.getElementById('calDetailLabel');
  label.textContent = `${DAYS[dow]}, ${d} ${new Date(calYear,calMonth,d).toLocaleString('default',{month:'short'})}`;
  const slotDiv = document.getElementById('calDetailSlots');
  if (slots.length === 0) {
    slotDiv.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div>No slots</div></div>';
  } else {
    slotDiv.innerHTML = slots.map(s => {
      const cat = getCat(s.catId);
      return `<div class="slot-card" style="--slot-color:${cat.color}">
        <div class="slot-time">${s.start}–${s.end}</div>
        <div class="slot-info"><div class="slot-name">${cat.emoji} ${cat.name}</div></div>
        <div class="slot-badge">${fmtMoney(slotEarning(s))}</div>
      </div>`;
    }).join('');
  }
  detail.style.display = '';
}

/* ═══════════════════════════════════════════════════════════
   GOALS + INCOME + EXPENSES PAGE
═══════════════════════════════════════════════════════════ */
let goalsActiveTab = 'expenses'; // DEFAULT TO EXPENSES
let expFilter = 'all';
let incomeFilter = 'all';
let expCatColorSel = '#f87171';

function setGoalsTab(tab) {
  goalsActiveTab = tab;
  document.getElementById('goalsTabContent').style.display   = tab==='goals'    ? '' : 'none';
  document.getElementById('incomeTabContent').style.display  = tab==='income'   ? '' : 'none';
  document.getElementById('expensesTabContent').style.display = tab==='expenses' ? '' : 'none';
  
  document.getElementById('tabGoalsBtn').classList.toggle('active',    tab==='goals');
  document.getElementById('tabIncomeBtn').classList.toggle('active',   tab==='income');
  document.getElementById('tabExpensesBtn').classList.toggle('active', tab==='expenses');
  
  const actionEl = document.getElementById('goalsTabAction');
  if (tab === 'goals') {
    actionEl.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openGoalSheet()">+ Goal</button>`;
  } else if (tab === 'income') {
    actionEl.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openIncomeSheet()">+ Income</button>`;
  } else {
    actionEl.innerHTML = `<div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" onclick="openExpCatOverlay()">+ Cat</button><button class="btn btn-primary btn-sm" onclick="openExpSheet()">+ Expense</button></div>`;
  }
}

function setExpFilter(el, filter) {
  expFilter = filter;
  document.querySelectorAll('#expensesTabContent .filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderExpenses();
}

function setIncomeFilter(el, filter) {
  incomeFilter = filter;
  document.querySelectorAll('#incomeTabContent .filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderIncome();
}

function renderGoals() {
  setGoalsTab(goalsActiveTab); // refresh action buttons
  const totalSaved = DB.goals.reduce((a,g) => a + g.current, 0);
  document.getElementById('goals-total-saved').textContent = fmtMoneyFull(totalSaved);
  document.getElementById('goals-count').textContent = DB.goals.length;

  const list = document.getElementById('goalsList');
  if (DB.goals.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🎯</div><div>No goals yet. Tap + Goal to add one.</div></div>`;
  } else {
    list.innerHTML = DB.goals.map(g => {
      const pct = g.target > 0 ? Math.min(100, g.current/g.target*100) : 0;
      const rem = Math.max(0, g.target - g.current);
      return `
        <div class="goal-card">
          <div class="goal-header">
            <div class="row" style="gap:10px;align-items:flex-start">
              <div class="goal-icon">${g.emoji}</div>
              <div>
                <div class="goal-title">${g.name}</div>
                <div class="goal-target">Target: ${fmtMoneyFull(g.target)}</div>
              </div>
            </div>
            <div class="goal-actions">
              <button class="goal-pill-btn edit" onclick="openGoalSheet('${g.id}')">✏️</button>
              <button class="goal-pill-btn sub" onclick="deleteGoal('${g.id}')" style="background:rgba(248,113,113,0.1);color:var(--red)">🗑</button>
            </div>
          </div>
          <div class="goal-amounts">
            <div>
              <div class="goal-current" style="color:${g.color}">${fmtMoneyFull(g.current)}</div>
              <div class="goal-remaining">₺${Math.round(rem).toLocaleString('tr-TR')} remaining</div>
            </div>
            <div class="goal-pct" style="color:${g.color}">${Math.round(pct)}%</div>
          </div>
          <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${g.color}"></div></div>
        </div>`;
    }).join('');
  }

  renderIncome();
  renderExpenses();
}

function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  DB.goals = DB.goals.filter(g => g.id !== id);
  saveData(); renderGoals(); showToast('Goal deleted');
}

/* ─── INCOME TAB ─── */
function renderIncome() {
  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
  const monthStart = new Date().toISOString().slice(0,8) + '01';

  // Totals
  const todayTotal = DB.income.filter(i => i.date === today).reduce((a,i) => a+i.amount, 0);
  const monthTotal = DB.income.filter(i => i.date >= monthStart).reduce((a,i) => a+i.amount, 0);
  document.getElementById('income-today').textContent = fmtMoneyFull(todayTotal);
  document.getElementById('income-month').textContent = fmtMoneyFull(monthTotal);

  // Filtered list
  let filtered = [...DB.income];
  if (incomeFilter === 'today') filtered = filtered.filter(i => i.date === today);
  else if (incomeFilter === 'week') filtered = filtered.filter(i => i.date >= weekAgo);
  else if (incomeFilter === 'month') filtered = filtered.filter(i => i.date >= monthStart);
  filtered.sort((a,b) => b.date.localeCompare(a.date));

  // Income list rows
  const incomeList = document.getElementById('incomeList');
  if (filtered.length === 0) {
    incomeList.innerHTML = `<div class="empty-state"><div class="empty-icon">💵</div><div>No income logged yet</div></div>`;
    return;
  }

  let prevDate = '';
  incomeList.innerHTML = filtered.map(i => {
    const dateLabel = i.date === today ? 'Today' : i.date === new Date(Date.now()-86400000).toISOString().slice(0,10) ? 'Yesterday' : i.date;
    const dateHeader = i.date !== prevDate ? `<div style="font-size:0.6rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);padding:8px 2px 4px">${dateLabel}</div>` : '';
    prevDate = i.date;
    const emoji = i.source === 'Salary' ? '💼' : i.source === 'Freelance' ? '💻' : i.source === 'Part-time' ? '🛠️' : i.source === 'Gift' ? '🎁' : '📦';
    return `${dateHeader}
      <div class="exp-row">
        <div class="exp-icon">${emoji}</div>
        <div class="exp-info">
          <div class="exp-desc">${i.desc || i.source}</div>
          <div class="exp-meta">${i.source}</div>
        </div>
        <div class="exp-amount income">+${fmtMoneyFull(i.amount)}</div>
        <div class="exp-del" onclick="deleteIncome('${i.id}')">🗑</div>
      </div>`;
  }).join('');
}

function deleteIncome(id) {
  DB.income = DB.income.filter(i => i.id !== id);
  saveData(); renderIncome(); renderOverview(); showToast('Income deleted');
}

/* ─── EXPENSES TAB ─── */
function renderExpenses() {
  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
  const monthStart = new Date().toISOString().slice(0,8) + '01';

  // Totals
  const todayTotal = DB.expenses.filter(e => e.date === today).reduce((a,e) => a+e.amount, 0);
  const monthTotal = DB.expenses.filter(e => e.date >= monthStart).reduce((a,e) => a+e.amount, 0);
  document.getElementById('exp-today').textContent = fmtMoneyFull(todayTotal);
  document.getElementById('exp-month').textContent = fmtMoneyFull(monthTotal);

  // Filtered list
  let filtered = [...DB.expenses];
  if (expFilter === 'today') filtered = filtered.filter(e => e.date === today);
  else if (expFilter === 'week') filtered = filtered.filter(e => e.date >= weekAgo);
  else if (expFilter === 'month') filtered = filtered.filter(e => e.date >= monthStart);
  filtered.sort((a,b) => b.date.localeCompare(a.date));

  // Category breakdown for visible filter
  const byCat = {};
  filtered.forEach(e => {
    if (!byCat[e.catId]) byCat[e.catId] = 0;
    byCat[e.catId] += e.amount;
  });
  const filtTotal = filtered.reduce((a,e) => a+e.amount, 0);
  const breakdown = document.getElementById('exp-breakdown');
  if (Object.keys(byCat).length === 0) {
    breakdown.innerHTML = '<div class="text-xs" style="text-align:center;padding:8px">No expenses in this period</div>';
  } else {
    breakdown.innerHTML = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([id,amt]) => {
      const cat = DB.expenseCategories.find(c=>c.id===id) || { name:id, emoji:'📦', color:'#64748b' };
      const pct = filtTotal > 0 ? (amt/filtTotal*100) : 0;
      return `
        <div class="prog-item">
          <div class="prog-head">
            <div class="pg-name">${cat.emoji} ${cat.name}</div>
            <div class="pg-val">${fmtMoneyFull(amt)} (${Math.round(pct)}%)</div>
          </div>
          <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${cat.color}"></div></div>
        </div>`;
    }).join('');
  }

  // Expense list rows
  const expList = document.getElementById('expList');
  if (filtered.length === 0) {
    expList.innerHTML = `<div class="empty-state"><div class="empty-icon">🧾</div><div>No expenses logged yet</div></div>`;
    return;
  }

  let prevDate = '';
  expList.innerHTML = filtered.map(e => {
    const cat = DB.expenseCategories.find(c=>c.id===e.catId) || { emoji:'📦', color:'#64748b' };
    const dateLabel = e.date === today ? 'Today' : e.date === new Date(Date.now()-86400000).toISOString().slice(0,10) ? 'Yesterday' : e.date;
    const dateHeader = e.date !== prevDate ? `<div style="font-size:0.6rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);padding:8px 2px 4px">${dateLabel}</div>` : '';
    prevDate = e.date;
    return `${dateHeader}
      <div class="exp-row">
        <div class="exp-icon">${cat.emoji}</div>
        <div class="exp-info">
          <div class="exp-desc">${e.desc || cat.name}</div>
          <div class="exp-meta">${cat.name}</div>
        </div>
        <div class="exp-amount expense">−${fmtMoneyFull(e.amount)}</div>
        <div class="exp-del" onclick="deleteExpense('${e.id}')">🗑</div>
      </div>`;
  }).join('');
}

function deleteExpense(id) {
  DB.expenses = DB.expenses.filter(e => e.id !== id);
  saveData(); renderExpenses(); renderOverview(); showToast('Expense deleted');
}

/* ── Income sheet ── */
function openIncomeSheet(editId) {
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('incomeEditId').value   = editId || '';
  document.getElementById('incomeAmount').value   = '';
  document.getElementById('incomeDesc').value     = '';
  document.getElementById('incomeDate').value     = today;
  document.getElementById('incomeSrcSel').value   = 'Other';
  document.getElementById('incomeSheetTitle').textContent = editId ? 'Edit Income' : 'Add Income';
  
  if (editId) {
    const inc = DB.income.find(i=>i.id===editId);
    if (inc) {
      document.getElementById('incomeAmount').value = inc.amount;
      document.getElementById('incomeDesc').value   = inc.desc;
      document.getElementById('incomeDate').value   = inc.date;
      document.getElementById('incomeSrcSel').value = inc.source;
    }
  }
  openSheet('incomeOverlay');
}

function saveIncome() {
  const editId = document.getElementById('incomeEditId').value;
  const amount = parseFloat(document.getElementById('incomeAmount').value) || 0;
  const desc   = document.getElementById('incomeDesc').value.trim();
  const source = document.getElementById('incomeSrcSel').value;
  const date   = document.getElementById('incomeDate').value || new Date().toISOString().slice(0,10);
  if (amount <= 0) { showToast('⚠ Enter a valid amount'); return; }
  if (editId) {
    const idx = DB.income.findIndex(i=>i.id===editId);
    if (idx > -1) DB.income[idx] = { ...DB.income[idx], amount, desc, source, date };
  } else {
    DB.income.push({ id:uid(), amount, desc, source, date });
  }
  saveData(); closeSheet('incomeOverlay'); renderIncome(); renderOverview(); showToast('✓ Income saved');
}

/* ── Expense sheet ── */
function openExpSheet(editId) {
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('expEditId').value   = editId || '';
  document.getElementById('expAmount').value   = '';
  document.getElementById('expDesc').value     = '';
  document.getElementById('expDate').value     = today;
  document.getElementById('expSheetTitle').textContent = editId ? 'Edit Expense' : 'Add Expense';
  const sel = document.getElementById('expCatSel');
  sel.innerHTML = DB.expenseCategories.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
  if (editId) {
    const exp = DB.expenses.find(e=>e.id===editId);
    if (exp) {
      document.getElementById('expAmount').value = exp.amount;
      document.getElementById('expDesc').value   = exp.desc;
      document.getElementById('expDate').value   = exp.date;
      document.getElementById('expCatSel').value = exp.catId;
    }
  }
  openSheet('expOverlay');
}

function saveExpense() {
  const editId = document.getElementById('expEditId').value;
  const amount = parseFloat(document.getElementById('expAmount').value) || 0;
  const desc   = document.getElementById('expDesc').value.trim();
  const catId  = document.getElementById('expCatSel').value;
  const date   = document.getElementById('expDate').value || new Date().toISOString().slice(0,10);
  if (amount <= 0) { showToast('⚠ Enter a valid amount'); return; }
  if (editId) {
    const idx = DB.expenses.findIndex(e=>e.id===editId);
    if (idx > -1) DB.expenses[idx] = { ...DB.expenses[idx], amount, desc, catId, date };
  } else {
    DB.expenses.push({ id:uid(), amount, desc, catId, date });
  }
  saveData(); closeSheet('expOverlay'); renderExpenses(); renderOverview(); showToast('✓ Expense saved');
}

/* ── Expense category overlay ── */
function openExpCatOverlay() {
  document.getElementById('expCatEditId').value = '';
  document.getElementById('expCatName').value   = '';
  document.getElementById('expCatEmoji').value  = '';
  expCatColorSel = '#f87171';
  document.querySelectorAll('#expCatColorPicker .color-swatch').forEach((el,i)=>el.classList.toggle('selected',i===0));
  openSheet('expCatOverlay');
}

function selectExpCatColor(el) {
  document.querySelectorAll('#expCatColorPicker .color-swatch').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected');
  expCatColorSel = el.dataset.col;
}

function saveExpCat() {
  const name  = document.getElementById('expCatName').value.trim();
  const emoji = document.getElementById('expCatEmoji').value || '📦';
  if (!name) { showToast('⚠ Enter a name'); return; }
  DB.expenseCategories.push({ id:uid(), name, emoji, color:expCatColorSel });
  saveData(); closeSheet('expCatOverlay'); showToast('✓ Category added');
  // refresh expense cat select if open
  const sel = document.getElementById('expCatSel');
  if (sel) sel.innerHTML = DB.expenseCategories.map(c=>`<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
}

/* ═══════════════════════════════════════════════════════════
   ANALYTICS PAGE
═══════════════════════════════════════════════════════════ */
function renderAnalytics() {
  const s = weeklyStats();
  const monthly = s.totalEarn * 4.33;
  const avgRate = s.totalHours > 0 ? s.totalEarn/s.totalHours : 0;
  const daily7 = dailyEarnings7();
  const maxD = Math.max(...daily7);
  const today = ((new Date().getDay()+6)%7);
  const dayLabels7 = [];
  for (let i=6;i>=0;i--) dayLabels7.push(DAYS[(today-i+7)%7]);
  const bestDay = dayLabels7[daily7.indexOf(maxD)];

  document.getElementById('an-metrics').innerHTML = `
    <div class="stat-chip accent-l"><div class="sc-label">Weekly total</div><div class="sc-val mono">${fmtMoneyFull(s.totalEarn)}</div></div>
    <div class="stat-chip teal-l"><div class="sc-label">Monthly est.</div><div class="sc-val mono">${fmtMoney(monthly)}</div></div>
    <div class="stat-chip orange-l"><div class="sc-label">Avg hourly</div><div class="sc-val mono">${fmtMoney(avgRate)}</div></div>
    <div class="stat-chip green-l"><div class="sc-label">Total hours</div><div class="sc-val">${fmtHours(s.totalHours)}</div></div>
  `;

  document.getElementById('an-best-day').innerHTML = `
    <div class="row" style="gap:12px;align-items:center">
      <div style="font-size:2rem">🏆</div>
      <div>
        <div style="font-family:var(--font-disp);font-size:1.2rem;font-weight:700">${bestDay || '—'}</div>
        <div class="text-muted">${maxD>0 ? fmtMoneyFull(maxD) + ' projected' : 'No data yet'}</div>
      </div>
    </div>`;

  // Breakdown
  const catEntries = Object.entries(s.byCat);
  document.getElementById('an-breakdown').innerHTML = catEntries.length === 0
    ? '<div class="empty-state"><div class="empty-icon">📊</div><div>Add slots to see analytics</div></div>'
    : catEntries.map(([id,v]) => {
        const cat = getCat(id);
        const pct = s.totalEarn > 0 ? (v.earn/s.totalEarn*100) : 0;
        return `
          <div class="prog-item">
            <div class="prog-head">
              <div class="pg-name">${cat.emoji} ${cat.name}</div>
              <div class="pg-val">${fmtMoneyFull(v.earn)} (${Math.round(pct)}%)</div>
            </div>
            <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${cat.color}"></div></div>
          </div>`;
      }).join('');

  // Trend chart (using daily7 as proxy)
  const chart = document.getElementById('an-trend-chart');
  const maxV = Math.max(...daily7, 1);
  chart.innerHTML = daily7.map((v,i) => `
    <div class="bar-col">
      <div class="bar-el ${i===6?'today':''}" style="height:${Math.max(4,(v/maxV)*100)}%"></div>
      <div class="bar-lbl">${dayLabels7[i].slice(0,1)}</div>
    </div>`).join('');

  // Goals completion
  const gr = document.getElementById('an-goals-rate');
  gr.innerHTML = DB.goals.length === 0
    ? '<div class="text-xs" style="text-align:center;padding:12px">No goals yet</div>'
    : DB.goals.map(g => {
        const pct = g.target > 0 ? Math.min(100,g.current/g.target*100) : 0;
        return `
          <div class="prog-item">
            <div class="prog-head">
              <div class="pg-name">${g.emoji} ${g.name}</div>
              <div class="pg-val">${Math.round(pct)}% · ${fmtMoneyFull(g.current)} / ${fmtMoneyFull(g.target)}</div>
            </div>
            <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${g.color}"></div></div>
          </div>`;
      }).join('');

  // Finances analytics
  const monthStart = new Date().toISOString().slice(0,8) + '01';
  const monthIncome = DB.income.filter(i => i.date >= monthStart);
  const monthExp = DB.expenses.filter(e => e.date >= monthStart);
  const monthIncomeTotal = monthIncome.reduce((a,i) => a+i.amount, 0);
  const monthExpTotal = monthExp.reduce((a,e) => a+e.amount, 0);
  
  // Income by source
  const incBySrc = {};
  monthIncome.forEach(i => { incBySrc[i.source] = (incBySrc[i.source]||0) + i.amount; });
  
  // Expenses by category
  const expByCat = {};
  monthExp.forEach(e => { expByCat[e.catId] = (expByCat[e.catId]||0) + e.amount; });
  
  const anFin = document.getElementById('an-finances');
  let finHtml = '<div class="card-label">Income by source</div>';
  if (Object.keys(incBySrc).length === 0) {
    finHtml += '<div class="text-xs" style="text-align:center;padding:8px">No income this month</div>';
  } else {
    finHtml += Object.entries(incBySrc).sort((a,b)=>b[1]-a[1]).map(([src,amt]) => {
      const pct = monthIncomeTotal > 0 ? (amt/monthIncomeTotal*100) : 0;
      const emoji = src === 'Salary' ? '💼' : src === 'Freelance' ? '💻' : src === 'Part-time' ? '🛠️' : src === 'Gift' ? '🎁' : '📦';
      return `<div class="prog-item">
        <div class="prog-head"><div class="pg-name">${emoji} ${src}</div><div class="pg-val">${fmtMoneyFull(amt)} (${Math.round(pct)}%)</div></div>
        <div class="prog-track"><div class="prog-fill green" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }
  finHtml += '<div class="divider"></div><div class="card-label">Expenses by category</div>';
  if (Object.keys(expByCat).length === 0) {
    finHtml += '<div class="text-xs" style="text-align:center;padding:8px">No expenses this month</div>';
  } else {
    finHtml += Object.entries(expByCat).sort((a,b)=>b[1]-a[1]).map(([id,amt]) => {
      const cat = DB.expenseCategories.find(c=>c.id===id) || { emoji:'📦', name:id, color:'#64748b' };
      const pct = monthExpTotal > 0 ? (amt/monthExpTotal*100) : 0;
      return `<div class="prog-item">
        <div class="prog-head"><div class="pg-name">${cat.emoji} ${cat.name}</div><div class="pg-val">${fmtMoneyFull(amt)} (${Math.round(pct)}%)</div></div>
        <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${cat.color}"></div></div>
      </div>`;
    }).join('');
  }
  anFin.innerHTML = finHtml;

  // Net balance
  const net = monthIncomeTotal - monthExpTotal;
  const netColor = net >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('an-net').innerHTML = `
    <div class="stat-grid">
      <div class="stat-chip green-l"><div class="sc-label">Income (month)</div><div class="sc-val mono">${fmtMoneyFull(monthIncomeTotal)}</div></div>
      <div class="stat-chip" style="border-color:rgba(248,113,113,0.25);background:rgba(248,113,113,0.06)"><div class="sc-label">Expenses (month)</div><div class="sc-val mono">${fmtMoneyFull(monthExpTotal)}</div></div>
    </div>
    <div class="row-between mt8" style="background:var(--surface2);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
      <span class="fw7">Net balance this month</span>
      <span style="font-family:var(--font-mono);font-weight:700;color:${netColor}">${net>=0?'+':''}${fmtMoneyFull(net)}</span>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS PAGE
═══════════════════════════════════════════════════════════ */
function renderSettings() {
  // Categories
  const catDiv = document.getElementById('catList');
  catDiv.innerHTML = DB.categories.map(c => `
    <div class="cat-row">
      <div class="cat-dot-swatch" style="background:${c.color}"></div>
      <div class="cat-row-name">${c.emoji} ${c.name}</div>
      <div class="cat-row-rate">${c.rate > 0 ? '₺'+c.rate+'/h' : 'unpaid'}</div>
      <div class="cat-row-edit" onclick="openCatSheet('${c.id}')">✏️</div>
      <div class="cat-row-del"  onclick="deleteCat('${c.id}')">🗑</div>
    </div>`).join('');

  // Dark mode sync
  document.getElementById('darkModeToggle').checked = DB.settings.darkMode;

  // Storage size
  const size = JSON.stringify(DB).length;
  document.getElementById('storage-size').textContent = size < 1024 ? size + ' bytes' : (size/1024).toFixed(1) + ' KB';
}

/* ═══════════════════════════════════════════════════════════
   SHEETS (MODALS)
═══════════════════════════════════════════════════════════ */
function openSheet(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSheet(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Slot sheet ── */
function openSlotSheet(editId) {
  const sel = document.getElementById('slotDay');
  sel.innerHTML = DAYS.map((d,i)=>`<option value="${i}" ${i===selectedDay?'selected':''}>${d}</option>`).join('');

  const catSel = document.getElementById('slotCat');
  catSel.innerHTML = DB.categories.map(c=>`<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');

  document.getElementById('slotEditId').value = editId || '';
  document.getElementById('slotNote').value = '';
  document.getElementById('slotDate').value = '';
  document.getElementById('slotStart').value = '09:00';
  document.getElementById('slotEnd').value   = '17:00';
  document.getElementById('slotSheetTitle').textContent = editId ? 'Edit Slot' : 'Add Time Slot';

  if (editId) {
    const slot = DB.slots.find(s=>s.id===editId);
    if (slot) {
      document.getElementById('slotDay').value   = slot.day;
      document.getElementById('slotStart').value = slot.start;
      document.getElementById('slotEnd').value   = slot.end;
      document.getElementById('slotCat').value   = slot.catId;
      document.getElementById('slotNote').value  = slot.note || '';
      document.getElementById('slotDate').value  = slot.date || '';
    }
  }
  openSheet('slotOverlay');
}

function saveSlot() {
  const editId = document.getElementById('slotEditId').value;
  const day   = parseInt(document.getElementById('slotDay').value);
  const start = document.getElementById('slotStart').value;
  const end   = document.getElementById('slotEnd').value;
  const catId = document.getElementById('slotCat').value;
  const note  = document.getElementById('slotNote').value.trim();
  const date  = document.getElementById('slotDate').value;
  if (!start || !end) { showToast('⚠ Set start & end time'); return; }
  if (editId) {
    const idx = DB.slots.findIndex(s=>s.id===editId);
    if (idx > -1) DB.slots[idx] = { ...DB.slots[idx], day, start, end, catId, note, date };
  } else {
    DB.slots.push({ id:uid(), day, start, end, catId, note, date });
  }
  saveData(); closeSheet('slotOverlay'); renderSchedule(); showToast('✓ Slot saved');
}

/* ── Goal sheet ── */
function openGoalSheet(editId) {
  document.getElementById('goalEditId').value = editId || '';
  document.getElementById('goalName').value = '';
  document.getElementById('goalTarget').value = '';
  document.getElementById('goalCurrent').value = '';
  document.getElementById('goalEmoji').value = '🎯';
  document.getElementById('goalSheetTitle').textContent = editId ? 'Edit Goal' : 'New Goal';
  // reset color picker
  document.querySelectorAll('#colorPicker .color-swatch').forEach((el,i) => el.classList.toggle('selected', i===0));
  document.getElementById('colorPicker').dataset.col = '#4f9cf9';
  // reset emoji
  document.querySelectorAll('#emojiPicker span').forEach(el => el.style.opacity='1');

  if (editId) {
    const g = DB.goals.find(x=>x.id===editId);
    if (g) {
      document.getElementById('goalName').value    = g.name;
      document.getElementById('goalTarget').value  = g.target;
      document.getElementById('goalCurrent').value = g.current;
      document.getElementById('goalEmoji').value   = g.emoji;
      const sw = document.querySelector(`#colorPicker [data-col="${g.color}"]`);
      if (sw) { document.querySelectorAll('#colorPicker .color-swatch').forEach(e=>e.classList.remove('selected')); sw.classList.add('selected'); }
    }
  }
  openSheet('goalOverlay');
}

function selectEmoji(el) {
  document.getElementById('goalEmoji').value = el.dataset.em;
  document.querySelectorAll('#emojiPicker span').forEach(e => e.style.border='none');
  el.style.border = '2px solid var(--accent)';
  el.style.borderRadius = '4px';
}

function selectColor(el) {
  document.querySelectorAll('#colorPicker .color-swatch').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected');
}

function saveGoal() {
  const editId   = document.getElementById('goalEditId').value;
  const name     = document.getElementById('goalName').value.trim();
  const target   = parseFloat(document.getElementById('goalTarget').value) || 0;
  const current  = parseFloat(document.getElementById('goalCurrent').value) || 0;
  const emoji    = document.getElementById('goalEmoji').value || '🎯';
  const colorEl  = document.querySelector('#colorPicker .color-swatch.selected');
  const color    = colorEl ? colorEl.dataset.col : '#4f9cf9';
  if (!name) { showToast('⚠ Enter a goal name'); return; }
  if (editId) {
    const idx = DB.goals.findIndex(g=>g.id===editId);
    if (idx > -1) DB.goals[idx] = { ...DB.goals[idx], name, target, current, emoji, color };
  } else {
    DB.goals.push({ id:uid(), name, target, current, emoji, color });
  }
  saveData(); closeSheet('goalOverlay'); renderGoals(); showToast('✓ Goal saved');
}

/* ── Transaction sheet ── */
function openTxSheet(goalId, type='add') {
  document.getElementById('txGoalId').value = goalId;
  document.getElementById('txAmount').value = '';
  document.getElementById('txDesc').value   = '';
  const goal = DB.goals.find(g=>g.id===goalId);
  document.getElementById('txSheetTitle').textContent = `${goal?.emoji} ${goal?.name}`;
  setTxType(type);
  openSheet('txOverlay');
}

function setTxType(type) {
  document.getElementById('txType').value = type;
  const addBtn = document.getElementById('txAddBtn');
  const subBtn = document.getElementById('txSubBtn');
  if (type === 'add') {
    addBtn.style.fontWeight = '800'; addBtn.style.opacity = '1';
    subBtn.style.fontWeight = '600'; subBtn.style.opacity = '0.5';
  } else {
    subBtn.style.fontWeight = '800'; subBtn.style.opacity = '1';
    addBtn.style.fontWeight = '600'; addBtn.style.opacity = '0.5';
  }
}

function saveTx() {
  const goalId = document.getElementById('txGoalId').value;
  const type   = document.getElementById('txType').value;
  const amount = parseFloat(document.getElementById('txAmount').value) || 0;
  const desc   = document.getElementById('txDesc').value.trim();
  if (amount <= 0) { showToast('⚠ Enter a valid amount'); return; }
  const idx = DB.goals.findIndex(g=>g.id===goalId);
  if (idx > -1) {
    DB.goals[idx].current = Math.max(0, DB.goals[idx].current + (type==='add' ? amount : -amount));
  }
  DB.transactions.push({ id:uid(), goalId, type, amount, desc, date: new Date().toISOString() });
  saveData(); closeSheet('txOverlay'); renderGoals(); showToast(type==='add'?'✓ Funds added':'✓ Amount deducted');
}

/* ── Category sheet ── */
let catColorSel = '#4f9cf9';

function openCatSheet(editId) {
  document.getElementById('catEditId').value = editId || '';
  document.getElementById('catName').value  = '';
  document.getElementById('catRate').value  = '';
  document.getElementById('catEmoji').value = '💼';
  document.getElementById('catType').value  = 'paid';
  catColorSel = '#4f9cf9';
  document.querySelectorAll('#catColorPicker .color-swatch').forEach((el,i)=>el.classList.toggle('selected',i===0));
  document.getElementById('catSheetTitle').textContent = editId ? 'Edit Category' : 'Add Category';
  if (editId) {
    const c = DB.categories.find(x=>x.id===editId);
    if (c) {
      document.getElementById('catName').value  = c.name;
      document.getElementById('catRate').value  = c.rate;
      document.getElementById('catEmoji').value = c.emoji;
      document.getElementById('catType').value  = c.type;
      catColorSel = c.color;
      const sw = document.querySelector(`#catColorPicker [data-col="${c.color}"]`);
      if (sw) { document.querySelectorAll('#catColorPicker .color-swatch').forEach(e=>e.classList.remove('selected')); sw.classList.add('selected'); }
    }
  }
  openSheet('catOverlay');
}

function selectCatColor(el) {
  document.querySelectorAll('#catColorPicker .color-swatch').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected');
  catColorSel = el.dataset.col;
}

function saveCat() {
  const editId = document.getElementById('catEditId').value;
  const name  = document.getElementById('catName').value.trim();
  const rate  = parseFloat(document.getElementById('catRate').value) || 0;
  const emoji = document.getElementById('catEmoji').value || '💼';
  const type  = document.getElementById('catType').value;
  if (!name) { showToast('⚠ Enter a category name'); return; }
  if (editId) {
    const idx = DB.categories.findIndex(c=>c.id===editId);
    if (idx > -1) DB.categories[idx] = { ...DB.categories[idx], name, rate, emoji, color:catColorSel, type };
  } else {
    DB.categories.push({ id:uid(), name, rate, emoji, color:catColorSel, type });
  }
  saveData(); closeSheet('catOverlay'); renderSettings(); showToast('✓ Category saved');
}

function deleteCat(id) {
  if (!confirm('Delete this category? Slots using it will lose their type.')) return;
  DB.categories = DB.categories.filter(c=>c.id!==id);
  saveData(); renderSettings(); showToast('Deleted');
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS ACTIONS
═══════════════════════════════════════════════════════════ */
function toggleDarkMode(on) {
  DB.settings.darkMode = on;
  applyTheme();
  saveData();
}

function applyTheme() {
  const isDark = DB.settings.darkMode;
  document.body.classList.toggle('light-mode', !isDark);
  document.getElementById('themeToggleBtn').textContent = isDark ? '🌙' : '☀️';
  document.getElementById('themeColorMeta').content = isDark ? '#0c1117' : '#f0f4fa';
}

function exportData() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `debtdash-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('✓ Data exported');
}

function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!parsed.categories || !parsed.goals) throw new Error('Invalid');
      DB = parsed; saveData(); applyTheme();
      renderSettings(); showToast('✓ Data imported');
    } catch { showToast('⚠ Invalid file'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function resetAll() {
  if (!confirm('Reset ALL data? This cannot be undone.')) return;
  DB = JSON.parse(JSON.stringify(defaultData));
  saveData(); applyTheme(); renderSettings(); switchPage('overview');
  showToast('Data reset');
}

/* ═══════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════ */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ═══════════════════════════════════════════════════════════
   THEME TOGGLE BUTTON (topbar)
═══════════════════════════════════════════════════════════ */
document.getElementById('themeToggleBtn').onclick = () => {
  DB.settings.darkMode = !DB.settings.darkMode;
  applyTheme(); saveData();
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) toggle.checked = DB.settings.darkMode;
};

document.getElementById('exportBtn').onclick = exportData;

/* ═══════════════════════════════════════════════════════════
   PWA SERVICE WORKER (Offline support)
═══════════════════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => {
    console.log('Service Worker registered - app works offline!');
  }).catch((err) => {
    console.log('Service Worker registration failed:', err);
  });
}

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
function init() {
  loadData();
  applyTheme();
  // Populate slot day select
  const slotDay = document.getElementById('slotDay');
  slotDay.innerHTML = DAYS.map((d,i)=>`<option value="${i}">${d}</option>`).join('');
  // Initial page
  switchPage('overview');
}

init();
