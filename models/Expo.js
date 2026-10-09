const mongoose = require('mongoose')

const expoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  // Human readable venue address, filled from the searchable map picker
  location: { type: String, required: true },
  // Map pin coordinates chosen on the map (used by the embedded Leaflet map)
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  // Uploaded cover image (JPG/PNG) served from /uploads/...
  image: { type: String, default: '' },
  description: { type: String, default: '' },
  theme: { type: String, default: '' },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('Expo', expoSchema)
