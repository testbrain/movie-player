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

// Cloudinary Configuration (Optional - will work without it)
let upload = null;
let cloudinaryConfigured = false;

try {
  cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
  });
  
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'movie-posters',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 500, height: 700, crop: 'limit' }]
    }
  });
  
  upload = multer({ storage: storage });
  cloudinaryConfigured = true;
  console.log('✅ Cloudinary configured');
} catch (err) {
  console.log('⚠️ Cloudinary not configured, using local storage');
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

// Movie Schema
const movieSchema = new mongoose.Schema({
  category: { type: String, required: true },
  movieName: { type: String, required: true },
  movieUrl: { type: String, required: true },
  posterUrl: { type: String, default: '' },
  tag: { type: String, default: '' },
  priority: { type: Number, default: 10, min: 1, max: 10 },
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
    const movies = await Movie.find().sort({ priority: -1, createdAt: -1 });
    
    const groupedMovies = movies.reduce((groups, movie) => {
      const category = movie.category;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(movie);
      return groups;
    }, {});
    
    res.render('index', { groupedMovies, error: null, success: null });
  } catch (err) {
    console.error('Error fetching movies:', err);
    res.render('index', { groupedMovies: {}, error: 'Failed to load movies', success: null });
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
  res.render('add-movie', { error: null, success: null });
});

// Submit new movie (admin only)
app.post('/add-movie', isAuthenticated, isAdmin, upload.single('poster'), async (req, res) => {
  try {
    console.log('Received form data:', req.body);
    console.log('Received file:', req.file);
    
    const { category, movieName, movieUrl, tag, priority } = req.body;
    
    // Validate required fields
    if (!category || !movieName || !movieUrl) {
      return res.render('add-movie', { 
        error: 'Please fill all required fields', 
        success: null 
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
      category,
      movieName,
      movieUrl,
      posterUrl: posterUrl,
      tag: tag || '',
      priority: parseInt(priority) || 10
    });
    
    await newMovie.save();
    console.log('Movie saved successfully:', newMovie);
    
    res.redirect('/');
    
  } catch (err) {
    console.error('Error adding movie:', err);
    console.error('Error stack:', err.stack);
    res.render('add-movie', { 
      error: 'Failed to add movie: ' + err.message, 
      success: null 
    });
  }
});

// Delete movie route (admin only)
app.delete('/movie/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    await Movie.findByIdAndDelete(req.params.id);
    res.redirect('/');
  } catch (err) {
    console.error('Error deleting movie:', err);
    res.redirect('/');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Cloudinary: ${cloudinaryConfigured ? 'Configured' : 'Not configured (using local storage)'}`);
  console.log(`👥 Admin users: Login with admin credentials`);
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