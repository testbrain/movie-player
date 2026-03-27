const express = require('express');
const mongoose = require('mongoose');
const app = express();

// Connection string with proper options for cloud deployment
const MONGODB_URI = 'mongodb+srv://testbraindev_db_user:3F55WkdFLf6BhNhK@movie-player-cluster.jnsnb6u.mongodb.net/movie-player?retryWrites=true&w=majority&appName=movie-player-cluster&connectTimeoutMS=30000&socketTimeoutMS=30000';

// Connection options
const options = {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 30000,
  connectTimeoutMS: 30000,
};

// Connect to MongoDB
mongoose.connect(MONGODB_URI, options);

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ MongoDB connection error:'));
db.once('open', () => {
  console.log('✅ Connected to MongoDB Atlas');
  console.log('📁 Database: movie-player');
});

// Movie Schema
const movieSchema = new mongoose.Schema({
  name: { type: String, required: true },
  link: { type: String, required: true },
  year: Number,
  rating: String
}, { collection: 'movies' });

const Movie = mongoose.model('Movie', movieSchema);

app.set('view engine', 'ejs');

// Home route with better error handling
app.get('/', async (req, res) => {
  try {
    // Check connection state
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Waiting for database connection...');
    }
    
    const movies = await Movie.find().sort({ name: 1 }).maxTimeMS(30000);
    res.render('index', { movies, error: null });
  } catch (err) {
    console.error('Error fetching movies:', err.message);
    res.render('index', { 
      movies: [], 
      error: 'Database connection issue. Please check if MongoDB Atlas IP whitelist includes Render.com IP ranges.' 
    });
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  res.json({ 
    status: 'ok', 
    database: states[dbState],
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});