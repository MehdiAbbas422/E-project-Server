const { removeImage } = require('./images')

/**
 * Deletes a previously uploaded image given its public URL.
 *
 * Uploads now live in MongoDB GridFS and are referenced as
 * "/api/images/<id>", so only those URLs are touched. External images
 * (Unsplash etc.) and empty values are ignored.
 */
const removeUpload = (url) => {
  try {
    if (!url || typeof url !== 'string') return
    const marker = '/api/images/'
    const at = url.indexOf(marker)
    if (at === -1) return
    const id = url.slice(at + marker.length).split('?')[0].split('#')[0]
    if (id) removeImage(id).catch(() => {})
  } catch (err) {
    console.error('Could not remove upload:', err.message)
  }
}

module.exports = { removeUpload }
