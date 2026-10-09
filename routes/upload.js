const router = require('express').Router()
const multer = require('multer')
const { auth } = require('../middleware/auth')
const { saveImage } = require('../utils/images')

// Purpose: Accepts only image uploads - JPG/JPEG and PNG - up to 4 MB.
// (Kept under 4 MB so uploads also fit Vercel's serverless request-size limit.)
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/jpg']
  if (allowed.includes(file.mimetype)) return cb(null, true)
  cb(new Error('Only JPG and PNG images are allowed'))
}

// Files are buffered in memory and then written to MongoDB GridFS, so uploads
// keep working on serverless hosts (Vercel) that have no persistent disk.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 4 * 1024 * 1024 }
})

// POST /api/upload
// Purpose: Stores an uploaded JPG/PNG image (logo, cover photo, ...) in the
// database and returns its public URL so the client can save that URL instead
// of a raw image link.
router.post('/', auth, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed' })
    if (!req.file) return res.status(400).json({ message: 'No image file provided' })

    try {
      const id = await saveImage(req.file)
      res.status(201).json({ url: `/api/images/${id}` })
    } catch {
      res.status(500).json({ message: 'Could not store the image' })
    }
  })
})

module.exports = router
