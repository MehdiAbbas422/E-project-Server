const fs = require('fs')
const path = require('path')

// Folder where multer stores uploaded JPG/PNG files
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')

/**
 * Deletes a previously uploaded file given its public URL (e.g.
 * "/uploads/image-123.jpg"). Only files inside the uploads folder are touched,
 * and only local uploads — external URLs (Unsplash etc.) are ignored.
 */
const removeUpload = (url) => {
  try {
    if (!url || typeof url !== 'string') return
    if (!url.startsWith('/uploads/')) return
    const name = path.basename(url) // prevents path traversal
    const filePath = path.join(UPLOAD_DIR, name)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (err) {
    console.error('Could not remove upload:', err.message)
  }
}

module.exports = { removeUpload, UPLOAD_DIR }
