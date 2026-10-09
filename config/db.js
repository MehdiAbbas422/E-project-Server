const mongoose = require('mongoose')

let connectionPromise = null

/**
 * Connects to MongoDB exactly once and caches the promise.
 * On a serverless host (Vercel) several cold-start requests can arrive at the
 * same time — all of them await the same connection instead of opening many.
 */
const connectDB = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose)
  if (!connectionPromise) {
    if (process.env.VERCEL && !process.env.MONGO_URI) {
      return Promise.reject(new Error('MONGO_URI must be set in the Vercel backend environment'))
    }

    connectionPromise = mongoose
      .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventsphere')
      .then(() => {
        console.log('MongoDB connected')
        return mongoose
      })
      .catch((err) => {
        console.error('MongoDB error:', err.message)
        connectionPromise = null // allow a retry on the next request
        throw err
      })
  }
  return connectionPromise
}

module.exports = connectDB
