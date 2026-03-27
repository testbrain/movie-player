const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const methodOverride = require('method-override');
const session = require('express-session');
const path = require('path');
const app = express();
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB error:', err));

// Session Configuration
app.use(session({
  secret: 'movie-player-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Make user available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Cloudinary Configuration
let upload = null;
let cloudinaryConfigured = false;

try {
  cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
  });
  
  // Just use the already imported CloudinaryStorage
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'movie-posters',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 500, heinpmght: 700, crop: 'limit' }]
    }
  });
  
  upload = multer({ storage: storage });
  cloudinaryConfigured = true;
  console.log('✅ Cloudinary configured');
} catch (err) {
  console.log('⚠️ Cloudinary not configured, using local storage');
  console.log(err.message);
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname))
    }
  });
  upload = multer({ storage: storage });
}

// Admin User Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }
}, { collection: 'admins' });

const Admin = mongoose.model('Admin', adminSchema);

// Movie Schema - Updated to support multiple categories
const movieSchema = new mongoose.Schema({
  category: { type: String, required: true }, // For backward compatibility
  categories: { type: [String], default: [] }, // New field for multiple categories
  movieName: { type: String, required: true },
  movieUrl: { type: String, required: true },
  posterUrl: { type: String, default: '' },
  tag: { type: String, default: '' },
  priority: { type: Number, default: 10, min: 1, max: 10 },
  views: { type: Number, default: 0 }, // Track views for trending
  createdAt: { type: Date, default: Date.now }
}, { collection: 'movies' });

const Movie = mongoose.model('Movie', movieSchema);

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// ============= COMPLETE CATEGORY LIST =============
const ALL_CATEGORIES = [
  "Action", "Adventure", "Sci-Fi", "Thriller", "Horror", "Comedy", "Drama", "Romance", "Fantasy",
  "Netflix Originals", "Amazon Prime Exclusive", "Apple TV+", "HBO Max Originals", "Hulu Picks",
  "Bollywood", "South Indian Cinema", "Punjabi Films", "Indian Indie", "Anime", "Korean Drama", "K-Movie",
  "European Cinema", "Spanish Thriller", "French New Wave", "Documentary", "Biopic", "Crime", "Mystery",
  "Superhero", "Marvel/DC", "Animation", "Family", "Musical", "Western", "Cult Classics", "Oscar Winners",
  "Film Noir", "Psychological Thriller", "Sitcom", "Stand-up Special", "Reality TV", "War", "History",
  "Sports", "Teen Drama", "Coming of Age", "LGBTQ+", "Experimental", "Zombie", "Vampire",
  "Cyberpunk", "Steampunk", "Apocalyptic", "Kaiju", "Wuxia", "Martial Arts", "Gangster", "Heist",
  "Courtroom Drama", "Political Thriller", "Rom-Com", "Dark Comedy", "Mockumentary", "Road Movie",
  "Holiday", "Christmas Special", "Nature", "Space Opera", "Time Travel", "Alternate History",
  "Streaming Exclusive", "Trending Now", "Binge-Worthy", "Critics' Pick", "Audience Favorite"
];

// ============= AUTH MIDDLEWARE =============
// Check if user is logged in
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

// Check if user is admin
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  res.status(403).send('Access denied. Admin only.');
}

// ============= ROUTES =============

// Home route - Group movies by category (public)
app.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    
    let movies;
    let selectedCategory = null;
    
    if (category) {
      // Filter movies by category (checks both old category field and new categories array)
      movies = await Movie.find({
        $or: [
          { category: category },
          { categories: category }
        ]
      }).sort({ priority: -1, views: -1, createdAt: -1 });
      selectedCategory = category;
    } else {
      movies = await Movie.find().sort({ priority: -1, views: -1, createdAt: -1 });
    }
    
    // Get trending videos (latest 10 with most views or highest priority)
    const trendingMovies = await Movie.find()
      .sort({ views: -1, priority: -1, createdAt: -1 })
      .limit(10);
    
    // Group movies by category for the category section
    const groupedMovies = movies.reduce((groups, movie) => {
      // Use categories array if available, otherwise use single category
      const movieCategories = movie.categories && movie.categories.length > 0 
        ? movie.categories 
        : [movie.category];
      
      movieCategories.forEach(cat => {
        if (!groups[cat]) {
          groups[cat] = [];
        }
        groups[cat].push(movie);
      });
      return groups;
    }, {});
    
    // Sort categories alphabetically
    const sortedGroupedMovies = {};
    Object.keys(groupedMovies).sort().forEach(key => {
      sortedGroupedMovies[key] = groupedMovies[key];
    });
    
    res.render('index', { 
      groupedMovies: sortedGroupedMovies, 
      trendingMovies,
      allCategories: ALL_CATEGORIES,
      selectedCategory,
      error: null, 
      success: null 
    });
  } catch (err) {
    console.error('Error fetching movies:', err);
    res.render('index', { 
      groupedMovies: {}, 
      trendingMovies: [],
      allCategories: ALL_CATEGORIES,
      selectedCategory: null,
      error: 'Failed to load movies', 
      success: null 
    });
  }
});

// API endpoint to get movies by category (for AJAX loading)
app.get('/api/movies/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const movies = await Movie.find({
      $or: [
        { category: category },
        { categories: category }
      ]
    }).sort({ priority: -1, views: -1, createdAt: -1 });
    
    res.json({ success: true, movies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Increment view count when movie is played
app.post('/api/movies/:id/view', async (req, res) => {
  try {
    await Movie.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Login page
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

// Login handler
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Check if admin exists
    const admin = await Admin.findOne({ username });
    
    if (!admin || admin.password !== password) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    
    // Set session
    req.session.user = {
      id: admin._id,
      username: admin.username,
      role: admin.role
    };
    
    // Redirect to original page or home
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
    
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'Login failed. Please try again.' });
  }
});

// Logout handler
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// Add movie form route (admin only)
app.get('/add-movie', isAuthenticated, isAdmin, (req, res) => {
  res.render('add-movie', { 
    error: null, 
    success: null,
    allCategories: ALL_CATEGORIES
  });
});

// Submit new movie (admin only) - Updated to handle multiple categories
app.post('/add-movie', isAuthenticated, isAdmin, upload.single('poster'), async (req, res) => {
  try {
    console.log('Received form data:', req.body);
    console.log('Received file:', req.file);
    
    const { category, categories, movieName, movieUrl, tag, priority } = req.body;
    
    // Handle categories (support both old single category and new multi-category)
    let categoriesArray = [];
    
    if (categories) {
      // If categories is a string, split by comma (from multi-select)
      if (typeof categories === 'string') {
        categoriesArray = categories.split(',').map(c => c.trim()).filter(c => c);
      } else if (Array.isArray(categories)) {
        categoriesArray = categories;
      }
    }
    
    // If no categories in array but single category exists, use that
    if (categoriesArray.length === 0 && category) {
      categoriesArray = [category];
    }
    
    // Validate required fields
    if (categoriesArray.length === 0 || !movieName || !movieUrl) {
      return res.render('add-movie', { 
        error: 'Please fill all required fields and select at least one category', 
        success: null,
        allCategories: ALL_CATEGORIES
      });
    }
    
    let posterUrl = '';
    
    // Check if poster was uploaded
    if (req.file) {
      if (cloudinaryConfigured && req.file.path) {
        posterUrl = req.file.path;
      } else if (req.file.filename) {
        posterUrl = `/uploads/${req.file.filename}`;
      } else {
        posterUrl = req.file.path || '';
      }
      console.log('Poster URL:', posterUrl);
    }
    
    const newMovie = new Movie({
      category: categoriesArray[0], // Keep for backward compatibility
      categories: categoriesArray,
      movieName,
      movieUrl,
      posterUrl: posterUrl,
      tag: tag || '',
      priority: parseInt(priority) || 10,
      views: 0
    });
    
    await newMovie.save();
    console.log('Movie saved successfully:', newMovie);
    
    res.redirect('/');
    
  } catch (err) {
    console.error('Error adding movie:', err);
    console.error('Error stack:', err.stack);
    res.render('add-movie', { 
      error: 'Failed to add movie: ' + err.message, 
      success: null,
      allCategories: ALL_CATEGORIES
    });
  }
});

// Delete movie route (admin only)
app.delete('/movie/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    await Movie.findByIdAndDelete(req.params.id);
    res.redirect('/');
  } catch (err) {
    console.error('Error deleting movie:', err);
    res.redirect('/');
  }
});

// Get all categories API endpoint
app.get('/api/categories', (req, res) => {
  res.json({ categories: ALL_CATEGORIES });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Cloudinary: ${cloudinaryConfigured ? 'Configured' : 'Not configured (using local storage)'}`);
  console.log(`👥 Admin users: Login with admin credentials`);
  console.log(`📚 Total categories available: ${ALL_CATEGORIES.length}`);
});

// ============= CREATE DEFAULT ADMIN (Run once) =============
const createDefaultAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) {
      const defaultAdmin = new Admin({
        username: 'admin',
        password: 'admin123',
        role: 'admin'
      });
      await defaultAdmin.save();
      console.log('✅ Default admin created: username: admin, password: admin123');
    }
  } catch (err) {
    console.error('Error creating admin:', err);
  }
};
createDefaultAdmin();