const router = require('express').Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { auth } = require('../middleware/auth')

const uploadDir = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `image-${unique}${ext}`)
  }
})

// Purpose: Accepts only image uploads - JPG/JPEG and PNG - up to 5 MB.
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/jpg']
  if (allowed.includes(file.mimetype)) return cb(null, true)
  cb(new Error('Only JPG and PNG images are allowed'))
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } })

// POST /api/upload
// Purpose: Stores an uploaded JPG/PNG image (logo, cover photo, ...) in the
// server /uploads folder and returns its public URL so the client can save
// that URL instead of a raw image link.
router.post('/', auth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed' })
    if (!req.file) return res.status(400).json({ message: 'No image file provided' })
    res.status(201).json({ url: `/uploads/${req.file.filename}` })
  })
})

module.exports = router
