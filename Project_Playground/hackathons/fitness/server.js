require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✓ MongoDB Connected'))
  .catch(err => console.log('✗ MongoDB Connection Error:', err));

// ============= MODELS =============

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  goal: { type: String, enum: ['strength', 'endurance', 'flexibility', 'weight_loss'], default: 'strength' },
  availableTime: { type: Number, default: 30 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Progress Schema
const progressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completedSessions: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastWorkoutDate: { type: Date },
  history: [{
    date: { type: Date, default: Date.now },
    workoutType: String,
    duration: Number,
    energyLevel: String
  }],
  totalMinutes: { type: Number, default: 0 }
});

const Progress = mongoose.model('Progress', progressSchema);

// ============= STATIC WORKOUT DATA =============

const workoutPlans = {
  strength: {
    high: [
      { name: 'Push-ups', duration: 3, sets: 3, reps: 15 },
      { name: 'Squats', duration: 3, sets: 3, reps: 20 },
      { name: 'Plank', duration: 2, sets: 3, reps: '60 sec' }
    ],
    medium: [
      { name: 'Push-ups', duration: 2, sets: 2, reps: 10 },
      { name: 'Squats', duration: 2, sets: 2, reps: 15 }
    ],
    low: [
      { name: 'Wall Push-ups', duration: 2, sets: 2, reps: 8 }
    ]
  },
  endurance: {
    high: [
      { name: 'Jumping Jacks', duration: 3, sets: 3, reps: 30 }
    ],
    medium: [
      { name: 'Jumping Jacks', duration: 2, sets: 2, reps: 20 }
    ],
    low: [
      { name: 'March in Place', duration: 3, sets: 2, reps: '60 sec' }
    ]
  },
  flexibility: {
    high: [
      { name: 'Deep Lunges', duration: 3, sets: 3, reps: '45 sec hold' }
    ],
    medium: [
      { name: 'Standing Quad Stretch', duration: 2, sets: 2, reps: '30 sec each' }
    ],
    low: [
      { name: 'Neck Rolls', duration: 2, sets: 2, reps: 10 }
    ]
  },
  weight_loss: {
    high: [
      { name: 'Burpees', duration: 3, sets: 3, reps: 12 }
    ],
    medium: [
      { name: 'Squats', duration: 2, sets: 3, reps: 15 }
    ],
    low: [
      { name: 'Walking in Place', duration: 3, sets: 2, reps: '90 sec' }
    ]
  }
};

// ============= AUTH MIDDLEWARE =============

const authMiddleware = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) return res.redirect('/login');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.clearCookie('token');
    res.redirect('/login');
  }
};

// ============= HELPERS =============

function generateAIWorkout(goal, timeAvailable, energyLevel) {
  if (!workoutPlans[goal] || !workoutPlans[goal][energyLevel]) {
    return [];
  }

  const baseWorkout = workoutPlans[goal][energyLevel];
  let totalTime = baseWorkout.reduce((a, e) => a + (e.duration * e.sets), 0);

  let workout = [...baseWorkout];

  if (totalTime > timeAvailable) {
    const ratio = timeAvailable / totalTime;
    workout = workout.map(ex => ({
      ...ex,
      sets: Math.max(1, Math.round(ex.sets * ratio))
    }));
  }

  return workout;
}

// ============= ROUTES =============

app.get('/', (req, res) => {
  if (req.cookies.token) return res.redirect('/dashboard');
  res.render('index');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.render('login', { error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.render('login', { error: 'Invalid credentials' });

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true });

  res.redirect('/dashboard');
});

app.get('/dashboard', authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  const progress = await Progress.findOne({ userId: req.userId });
  res.render('dashboard', { user, progress });
});

app.post('/workout/generate', authMiddleware, async (req, res) => {
  const { energyLevel } = req.body;
  if (!['high', 'medium', 'low'].includes(energyLevel)) {
    return res.redirect('/workout');
  }

  const user = await User.findById(req.userId);
  const workout = generateAIWorkout(user.goal, user.availableTime, energyLevel);

  const totalDuration = workout.reduce((a, e) => a + (e.duration * e.sets), 0);

  res.render('workout-plan', { user, workout, energyLevel, totalDuration });
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

// Start Server
app.listen(PORT, () => {
  console.log(`🏜️ Desert Pulse Fitness running on http://localhost:${PORT}`);
});
