const mongoose = require('mongoose')

// Reuse the MongoDB driver bundled with Mongoose so no extra dependency is
// needed. GridFS stores uploaded JPG/PNG files inside MongoDB itself, which is
// what lets uploads survive on serverless hosts (Vercel) that have no disk.
const { GridFSBucket, ObjectId } = mongoose.mongo

const bucket = () => new GridFSBucket(mongoose.connection.db, { bucketName: 'images' })

/**
 * Saves an uploaded image buffer (from multer memory storage) into GridFS and
 * resolves with its id as a string.
 */
const saveImage = (file) =>
  new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(file.originalname || 'image', {
      contentType: file.mimetype || 'image/jpeg'
    })
    stream.on('error', reject)
    stream.on('finish', () => resolve(String(stream.id)))
    stream.end(file.buffer)
  })

/**
 * Deletes an image from GridFS by its id. Unknown ids (external URLs, already
 * removed files) are ignored.
 */
const removeImage = async (id) => {
  if (!ObjectId.isValid(id)) return
  try {
    await bucket().delete(new ObjectId(id))
  } catch {
    /* already gone — nothing to do */
  }
}

module.exports = { bucket, saveImage, removeImage }
