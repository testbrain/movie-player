const express = require('express');
const mongoose = require('mongoose');
const app = express();

// Corrected connection string with database name
const MONGODB_URI = 'mongodb+srv://testbraindev_db_user:3F55WkdFLf6BhNhK@movie-player-cluster.jnsnb6u.mongodb.net/movie-player?retryWrites=true&w=majority&appName=movie-player-cluster';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    console.log('📁 Database: movie-player');
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
  });

// Movie Schema for 'movies' collection
const movieSchema = new mongoose.Schema({
  name: { type: String, required: true },
  link: { type: String, required: true },
  year: Number,
  rating: String
}, { collection: 'movies' });

const Movie = mongoose.model('Movie', movieSchema);

app.set('view engine', 'ejs');

// Home route - fetch and display movies
app.get('/', async (req, res) => {
  try {
    const movies = await Movie.find().sort({ name: 1 });
    res.render('index', { movies, error: null });
  } catch (err) {
    console.error('Error fetching movies:', err);
    res.render('index', { movies: [], error: 'Failed to load movies. Please try again later.' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).render('index', { movies: [], error: 'Something went wrong on the server.' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('index', { movies: [], error: 'Page not found.' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});