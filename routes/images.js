const router = require('express').Router()
const mongoose = require('mongoose')
const { bucket } = require('../utils/images')

const { ObjectId } = mongoose.mongo

// GET /api/images/:id
// Purpose: Streams an image that was uploaded through /api/upload and stored in
// MongoDB GridFS. Keeping images in the database (instead of local disk) is what
// makes uploads work on serverless hosts such as Vercel.
router.get('/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(404).json({ message: 'Image not found' })

  try {
    const files = await bucket().find({ _id: new ObjectId(req.params.id) }).toArray()
    if (!files.length) return res.status(404).json({ message: 'Image not found' })

    res.set('Content-Type', files[0].contentType || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    bucket()
      .openDownloadStream(new ObjectId(req.params.id))
      .on('error', () => res.status(500).end())
      .pipe(res)
  } catch {
    res.status(500).json({ message: 'Could not load image' })
  }
})

module.exports = router
